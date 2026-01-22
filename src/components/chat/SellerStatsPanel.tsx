import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Clock, MessageCircle, TrendingUp, Users, Loader2, Trophy, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SellerStats {
  seller_id: string;
  seller_name: string;
  total_conversations: number;
  avg_handling_time_minutes: number | null;
  last_activity: string | null;
}

interface SellerStatsPanelProps {
  className?: string;
}

const SellerStatsPanel = ({ className }: SellerStatsPanelProps) => {
  const [stats, setStats] = useState<SellerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');

  useEffect(() => {
    fetchStats();
  }, [period]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Definir período
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

      // Buscar eventos de atribuição
      const { data: events, error } = await supabase
        .from('conversation_events')
        .select('id, phone, ts, payload')
        .eq('type', 'assignment')
        .gte('ts', startDate.toISOString())
        .order('ts', { ascending: true });

      if (error) throw error;

      // Processar estatísticas por vendedor
      const sellerMap = new Map<string, {
        seller_name: string;
        conversations: Set<string>;
        handling_times: number[];
        last_activity: string;
      }>();

      // Rastrear takeovers e releases por telefone para calcular tempo
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
          
          // Registrar início do atendimento
          phoneTimestamps.set(event.phone, { 
            takeover_time: event.ts, 
            seller_id: sellerId 
          });
        }
        
        if (payload.action === 'release') {
          // Calcular tempo de atendimento se temos o takeover
          const takeover = phoneTimestamps.get(event.phone);
          if (takeover && takeover.seller_id === sellerId) {
            const takeoverTime = new Date(takeover.takeover_time).getTime();
            const releaseTime = new Date(event.ts).getTime();
            const handlingMinutes = (releaseTime - takeoverTime) / (1000 * 60);
            
            // Só considerar tempos razoáveis (entre 1 min e 8 horas)
            if (handlingMinutes >= 1 && handlingMinutes <= 480) {
              sellerData.handling_times.push(handlingMinutes);
            }
            
            phoneTimestamps.delete(event.phone);
          }
        }
      });

      // Converter para array de stats
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

      // Ordenar por total de conversas
      statsArray.sort((a, b) => b.total_conversations - a.total_conversations);

      setStats(statsArray);
    } catch (error) {
      console.error('Error fetching seller stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes: number | null) => {
    if (minutes === null) return '-';
    if (minutes < 60) return `${Math.round(minutes)}min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}min`;
  };

  const totalConversations = stats.reduce((sum, s) => sum + s.total_conversations, 0);
  const avgOverallTime = stats.filter(s => s.avg_handling_time_minutes !== null).length > 0
    ? stats
        .filter(s => s.avg_handling_time_minutes !== null)
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
    <Card className={cn('bg-slate-900/50 border-white/10', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2 text-lg">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Estatísticas de Atendimento
          </CardTitle>
        </div>
        
        {/* Period selector */}
        <div className="flex gap-1 mt-2">
          {(['today', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                period === p
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-800'
              )}
            >
              {p === 'today' ? 'Hoje' : p === 'week' ? '7 dias' : '30 dias'}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <MessageCircle className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-white">{totalConversations}</p>
            <p className="text-[10px] text-slate-400 uppercase">Atendimentos</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <Users className="w-4 h-4 text-purple-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-white">{stats.length}</p>
            <p className="text-[10px] text-slate-400 uppercase">Vendedores</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <Timer className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-white">{formatTime(avgOverallTime)}</p>
            <p className="text-[10px] text-slate-400 uppercase">Tempo médio</p>
          </div>
        </div>

        {/* Seller rankings */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-slate-400 uppercase">
              Ranking - {getPeriodLabel()}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            </div>
          ) : stats.length === 0 ? (
            <div className="text-center py-6 text-slate-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sem dados para o período</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[280px]">
              <div className="space-y-2">
                {stats.map((seller, index) => (
                  <div
                    key={seller.seller_id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                      index === 0 
                        ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/30' 
                        : 'bg-slate-800/30 border-transparent hover:border-white/10'
                    )}
                  >
                    {/* Position badge */}
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0',
                      index === 0 ? 'bg-amber-500 text-black' :
                      index === 1 ? 'bg-slate-400 text-black' :
                      index === 2 ? 'bg-amber-700 text-white' :
                      'bg-slate-700 text-slate-300'
                    )}>
                      {index + 1}
                    </div>

                    {/* Seller info */}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'font-medium truncate',
                        index === 0 ? 'text-amber-400' : 'text-white'
                      )}>
                        {seller.seller_name}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {seller.total_conversations} conversas
                        </span>
                        {seller.avg_handling_time_minutes !== null && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(seller.avg_handling_time_minutes)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress bar visual */}
                    <div className="w-16 shrink-0">
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            'h-full rounded-full transition-all',
                            index === 0 ? 'bg-amber-500' : 'bg-emerald-500'
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
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SellerStatsPanel;
