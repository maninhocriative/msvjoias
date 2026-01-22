import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Bell,
  BellRing,
  Users,
  UserCheck,
  UserX,
  Clock,
  MessageCircle,
  Trophy,
  Timer,
  BarChart3,
  Send,
  Loader2,
  RefreshCw,
  Activity,
  TrendingUp,
  Calendar,
  CheckCircle2,
  XCircle,
  Phone,
  AlertTriangle
} from 'lucide-react';

interface SellerPresence {
  id: string;
  user_id: string;
  full_name: string;
  is_online: boolean;
  last_seen_at: string;
  is_chatting?: boolean;
  current_chat_phone?: string | null;
  chat_started_at?: string | null;
}

interface SellerStats {
  seller_id: string;
  seller_name: string;
  total_conversations: number;
  avg_handling_time_minutes: number | null;
  last_activity: string | null;
}

interface AlertLog {
  timestamp: Date;
  offlineSellers: string[];
  success: boolean;
}

const SellerMonitor = () => {
  const [sellers, setSellers] = useState<SellerPresence[]>([]);
  const [stats, setStats] = useState<SellerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [lastAlertSent, setLastAlertSent] = useState<Date | null>(null);
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);

  // Monitored sellers
  const monitoredSellers = ['Kelryanne Moraes', 'Tatiane Nápoles'];

  useEffect(() => {
    fetchSellers();
    fetchStats();
    
    const interval = setInterval(fetchSellers, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [period]);

  const fetchSellers = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      // Get all seller presence
      const { data: presenceData, error: presenceError } = await supabase
        .from('seller_presence')
        .select('*')
        .order('last_seen_at', { ascending: false });

      if (presenceError) throw presenceError;

      // Get profiles for monitored sellers
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .or(monitoredSellers.map(name => `full_name.ilike.%${name.split(' ')[0]}%`).join(','));

      if (profilesError) throw profilesError;

      // Mark who is online
      const enrichedSellers = presenceData?.map(seller => ({
        ...seller,
        is_online: seller.is_online && new Date(seller.last_seen_at) > new Date(fiveMinutesAgo)
      })) || [];

      setSellers(enrichedSellers);
    } catch (error) {
      console.error('Error fetching sellers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const now = new Date();
      let startDate: Date;
      
      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      const { data: events, error } = await supabase
        .from('conversation_events')
        .select('id, phone, ts, payload')
        .eq('type', 'assignment')
        .gte('ts', startDate.toISOString())
        .order('ts', { ascending: true });

      if (error) throw error;

      const sellerMap = new Map<string, {
        seller_name: string;
        conversations: Set<string>;
        handling_times: number[];
        last_activity: string;
      }>();

      const phoneTimestamps = new Map<string, { takeover_time: string; seller_id: string }>();

      events?.forEach(event => {
        const payload = event.payload as any;
        if (!payload?.seller_id) return;

        const sellerId = payload.seller_id;
        const sellerName = payload.seller_name || 'Vendedor';

        if (!sellerMap.has(sellerId)) {
          sellerMap.set(sellerId, {
            seller_name: sellerName,
            conversations: new Set(),
            handling_times: [],
            last_activity: event.ts,
          });
        }

        const sellerData = sellerMap.get(sellerId)!;
        
        if (payload.action === 'takeover' || payload.action === 'auto_forward') {
          sellerData.conversations.add(event.phone);
          sellerData.last_activity = event.ts;
          phoneTimestamps.set(event.phone, { takeover_time: event.ts, seller_id: sellerId });
        }
        
        if (payload.action === 'release') {
          const takeover = phoneTimestamps.get(event.phone);
          if (takeover && takeover.seller_id === sellerId) {
            const takeoverTime = new Date(takeover.takeover_time).getTime();
            const releaseTime = new Date(event.ts).getTime();
            const handlingMinutes = (releaseTime - takeoverTime) / (1000 * 60);
            
            if (handlingMinutes >= 1 && handlingMinutes <= 480) {
              sellerData.handling_times.push(handlingMinutes);
            }
            phoneTimestamps.delete(event.phone);
          }
        }
      });

      const statsArray: SellerStats[] = [];
      sellerMap.forEach((data, sellerId) => {
        const avgTime = data.handling_times.length > 0
          ? data.handling_times.reduce((a, b) => a + b, 0) / data.handling_times.length
          : null;

        statsArray.push({
          seller_id: sellerId,
          seller_name: data.seller_name,
          total_conversations: data.conversations.size,
          avg_handling_time_minutes: avgTime,
          last_activity: data.last_activity,
        });
      });

      statsArray.sort((a, b) => b.total_conversations - a.total_conversations);
      setStats(statsArray);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSendAlert = async () => {
    setSendingAlert(true);
    try {
      const response = await fetch(
        'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/seller-offline-alert',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'manual' }),
        }
      );

      const result = await response.json();
      
      if (result.success) {
        if (result.offline === 0) {
          toast.success('Todas as vendedoras monitoradas estão online!');
        } else {
          toast.success(`Alerta enviado para ${result.results?.length || 0} números`, {
            description: `Vendedoras offline: ${result.offlineSellers?.join(', ')}`,
          });
        }
        
        setLastAlertSent(new Date());
        setAlertLogs(prev => [{
          timestamp: new Date(),
          offlineSellers: result.offlineSellers || [],
          success: true
        }, ...prev.slice(0, 9)]);
      } else {
        throw new Error(result.error || 'Erro ao enviar alerta');
      }
    } catch (error) {
      console.error('Error sending alert:', error);
      toast.error('Erro ao enviar alerta');
      setAlertLogs(prev => [{
        timestamp: new Date(),
        offlineSellers: [],
        success: false
      }, ...prev.slice(0, 9)]);
    } finally {
      setSendingAlert(false);
    }
  };

  const formatTime = (minutes: number | null) => {
    if (minutes === null) return '-';
    if (minutes < 60) return `${Math.round(minutes)}min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}min`;
  };

  const formatLastSeen = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}min atrás`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h atrás`;
    return date.toLocaleDateString('pt-BR');
  };

  const onlineSellers = sellers.filter(s => s.is_online);
  const offlineSellers = sellers.filter(s => !s.is_online);
  const totalConversations = stats.reduce((sum, s) => sum + s.total_conversations, 0);
  const avgOverallTime = stats.filter(s => s.avg_handling_time_minutes !== null).length > 0
    ? stats.filter(s => s.avg_handling_time_minutes !== null)
        .reduce((sum, s) => sum + (s.avg_handling_time_minutes || 0), 0) / 
      stats.filter(s => s.avg_handling_time_minutes !== null).length
    : null;

  const getPeriodLabel = () => {
    switch (period) {
      case 'today': return 'Hoje';
      case 'week': return 'Últimos 7 dias';
      case 'month': return 'Últimos 30 dias';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl">
                <Activity className="w-6 h-6 text-white" />
              </div>
              Monitor de Vendedores
            </h1>
            <p className="text-slate-400 mt-1">
              Acompanhe a presença e desempenho das vendedoras em tempo real
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setRefreshing(true);
                try {
                  await Promise.all([fetchSellers(), fetchStats()]);
                  toast.success('Dados atualizados!');
                } catch (error) {
                  toast.error('Erro ao atualizar dados');
                } finally {
                  setRefreshing(false);
                }
              }}
              disabled={refreshing}
              className="border-white/10 text-white hover:bg-white/10"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")} />
              {refreshing ? 'Atualizando...' : 'Atualizar'}
            </Button>
            
            <Button
              onClick={handleSendAlert}
              disabled={sendingAlert}
              className="bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white shadow-lg shadow-rose-500/25"
            >
              {sendingAlert ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <BellRing className="w-4 h-4 mr-2" />
              )}
              Enviar Alerta Agora
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{onlineSellers.length}</p>
                  <p className="text-xs text-emerald-400">Online agora</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-500/20 rounded-lg">
                  <UserX className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{offlineSellers.length}</p>
                  <p className="text-xs text-rose-400">Offline</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <MessageCircle className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{totalConversations}</p>
                  <p className="text-xs text-cyan-400">Atendimentos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Timer className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{formatTime(avgOverallTime)}</p>
                  <p className="text-xs text-amber-400">Tempo médio</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="presence" className="space-y-4">
          <TabsList className="bg-slate-800/50 border border-white/10">
            <TabsTrigger value="presence" className="data-[state=active]:bg-slate-700">
              <Users className="w-4 h-4 mr-2" />
              Presença
            </TabsTrigger>
            <TabsTrigger value="stats" className="data-[state=active]:bg-slate-700">
              <BarChart3 className="w-4 h-4 mr-2" />
              Estatísticas
            </TabsTrigger>
            <TabsTrigger value="alerts" className="data-[state=active]:bg-slate-700">
              <Bell className="w-4 h-4 mr-2" />
              Alertas
            </TabsTrigger>
          </TabsList>

          {/* Presence Tab */}
          <TabsContent value="presence" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Monitored Sellers */}
              <Card className="bg-slate-900/50 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    Vendedoras Monitoradas
                  </CardTitle>
                  <CardDescription>
                    Alertas automáticos são enviados quando estas vendedoras estão offline
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {monitoredSellers.map((name, idx) => {
                    const seller = sellers.find(s => 
                      s.full_name?.toLowerCase().includes(name.split(' ')[0].toLowerCase())
                    );
                    const isOnline = seller?.is_online || false;
                    const isChatting = seller?.is_chatting || false;
                    
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'flex items-center justify-between p-4 rounded-xl border transition-all',
                          isChatting
                            ? 'bg-cyan-500/10 border-cyan-500/30 animate-pulse'
                            : isOnline 
                              ? 'bg-emerald-500/10 border-emerald-500/30' 
                              : 'bg-rose-500/10 border-rose-500/30'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center font-bold relative',
                            isChatting ? 'bg-cyan-500 text-white' : isOnline ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                          )}>
                            {name.charAt(0)}
                            {isChatting && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-400 rounded-full flex items-center justify-center">
                                <MessageCircle className="w-2.5 h-2.5 text-white" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-white">{name}</p>
                            <p className="text-xs text-slate-400">
                              {isChatting && seller?.current_chat_phone
                                ? `Atendendo: ${seller.current_chat_phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}`
                                : seller ? formatLastSeen(seller.last_seen_at) : 'Nunca acessou'}
                            </p>
                            {isChatting && seller?.chat_started_at && (
                              <p className="text-xs text-cyan-400 flex items-center gap-1 mt-0.5">
                                <Timer className="w-3 h-3" />
                                Em atendimento há {formatLastSeen(seller.chat_started_at).replace(' atrás', '')}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge className={cn(
                          'gap-1',
                          isChatting 
                            ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                            : isOnline 
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                        )}>
                          {isChatting ? (
                            <>
                              <MessageCircle className="w-3 h-3" />
                              Atendendo
                            </>
                          ) : isOnline ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              Online
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" />
                              Offline
                            </>
                          )}
                        </Badge>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* All Sellers */}
              <Card className="bg-slate-900/50 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-cyan-400" />
                    Todos os Vendedores
                  </CardTitle>
                  <CardDescription>
                    Status em tempo real de todos os usuários
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                    </div>
                  ) : sellers.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Nenhum vendedor encontrado</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-2">
                        {sellers.map((seller) => {
                          const isChatting = seller.is_chatting || false;
                          
                          return (
                            <div
                              key={seller.id}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-lg border transition-all",
                                isChatting
                                  ? 'bg-cyan-500/5 border-cyan-500/20'
                                  : 'bg-slate-800/50 border-transparent hover:border-white/10'
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium text-white">
                                    {seller.full_name?.charAt(0) || '?'}
                                  </div>
                                  <div className={cn(
                                    'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900',
                                    isChatting ? 'bg-cyan-500' : seller.is_online ? 'bg-emerald-500' : 'bg-slate-500'
                                  )} />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">
                                    {seller.full_name || 'Sem nome'}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {isChatting && seller.current_chat_phone
                                      ? `Atendendo: ${seller.current_chat_phone.slice(-4)}`
                                      : formatLastSeen(seller.last_seen_at)}
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline" className={cn(
                                'text-[10px]',
                                isChatting 
                                  ? 'border-cyan-500/30 text-cyan-400'
                                  : seller.is_online 
                                    ? 'border-emerald-500/30 text-emerald-400'
                                    : 'border-slate-600 text-slate-400'
                              )}>
                                {isChatting ? (
                                  <span className="flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3" />
                                    Atendendo
                                  </span>
                                ) : seller.is_online ? 'Online' : 'Offline'}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="space-y-4">
            <Card className="bg-slate-900/50 border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-amber-400" />
                      Ranking de Atendimento
                    </CardTitle>
                    <CardDescription>
                      Desempenho dos vendedores por período
                    </CardDescription>
                  </div>
                  
                  <div className="flex gap-1">
                    {(['today', 'week', 'month'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={cn(
                          'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                          period === p
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-800'
                        )}
                      >
                        {p === 'today' ? 'Hoje' : p === 'week' ? '7 dias' : '30 dias'}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {stats.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg">Sem dados para o período</p>
                    <p className="text-sm">Nenhum atendimento registrado em {getPeriodLabel().toLowerCase()}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stats.map((seller, index) => (
                      <div
                        key={seller.seller_id}
                        className={cn(
                          'flex items-center gap-4 p-4 rounded-xl border transition-all',
                          index === 0 
                            ? 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/30' 
                            : 'bg-slate-800/30 border-transparent hover:border-white/10'
                        )}
                      >
                        {/* Position */}
                        <div className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0',
                          index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-lg shadow-amber-500/30' :
                          index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-black' :
                          index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white' :
                          'bg-slate-700 text-slate-300'
                        )}>
                          {index + 1}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'font-semibold text-lg',
                            index === 0 ? 'text-amber-400' : 'text-white'
                          )}>
                            {seller.seller_name}
                          </p>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="text-sm text-slate-400 flex items-center gap-1.5">
                              <MessageCircle className="w-4 h-4 text-cyan-400" />
                              {seller.total_conversations} conversas
                            </span>
                            {seller.avg_handling_time_minutes !== null && (
                              <span className="text-sm text-slate-400 flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-purple-400" />
                                {formatTime(seller.avg_handling_time_minutes)} média
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Progress */}
                        <div className="w-32 shrink-0">
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>Conversas</span>
                            <span>{seller.total_conversations}</span>
                          </div>
                          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                index === 0 
                                  ? 'bg-gradient-to-r from-amber-400 to-amber-600' 
                                  : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                              )}
                              style={{ 
                                width: `${Math.min(100, (seller.total_conversations / Math.max(...stats.map(s => s.total_conversations))) * 100)}%` 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Alert Configuration */}
              <Card className="bg-slate-900/50 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Bell className="w-5 h-5 text-rose-400" />
                    Configuração de Alertas
                  </CardTitle>
                  <CardDescription>
                    Horários de verificação automática
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-cyan-400" />
                        <span className="text-white font-medium">10:00</span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        Ativo
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-cyan-400" />
                        <span className="text-white font-medium">14:00</span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        Ativo
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-cyan-400" />
                        <span className="text-white font-medium">18:00</span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        Ativo
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-cyan-400" />
                        <span className="text-white font-medium">20:00</span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        Ativo
                      </Badge>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <p className="text-sm text-slate-400 mb-3">Números que recebem alertas:</p>
                    <div className="space-y-2">
                      {['92 98408-1434', '92 99114-8946', '92 98407-8295'].map((phone, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-emerald-400" />
                          <span className="text-white">{phone}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Alert History */}
              <Card className="bg-slate-900/50 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-purple-400" />
                    Histórico de Alertas
                  </CardTitle>
                  <CardDescription>
                    Últimos alertas enviados nesta sessão
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {alertLogs.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Nenhum alerta enviado ainda</p>
                      <p className="text-sm mt-1">Use o botão acima para enviar um alerta manual</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-2">
                        {alertLogs.map((log, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              'p-3 rounded-lg border',
                              log.success 
                                ? 'bg-emerald-500/10 border-emerald-500/20'
                                : 'bg-rose-500/10 border-rose-500/20'
                            )}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-white">
                                {log.success ? 'Alerta enviado' : 'Falha no envio'}
                              </span>
                              <span className="text-xs text-slate-400">
                                {log.timestamp.toLocaleTimeString('pt-BR')}
                              </span>
                            </div>
                            {log.offlineSellers.length > 0 && (
                              <p className="text-xs text-slate-400">
                                Offline: {log.offlineSellers.join(', ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SellerMonitor;