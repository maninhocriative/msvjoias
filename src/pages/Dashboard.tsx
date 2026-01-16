import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Package, MessageSquare, TrendingUp, Users, RefreshCw, Clock, 
  Bot, ShoppingBag, Timer, Send, CheckCircle2, AlertCircle,
  ArrowRight, Phone, BarChart3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/formatters';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

interface DashboardStats {
  totalProducts: number;
  activeConversations: number;
  totalStock: number;
  totalCustomers: number;
  alineOrders: number;
  activeFollowups: number;
}

interface WaitingConversation {
  id: string;
  contact_name: string | null;
  contact_number: string;
  platform: string | null;
  last_message: string | null;
  waiting_since: Date;
  waiting_seconds: number;
}

interface AlineOrder {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  selected_name: string | null;
  selected_sku: string | null;
  total_price: number;
  status: string;
  created_at: string;
}

interface ConversionData {
  followup_count: number;
  total: number;
  converted: number;
  conversionRate: number;
}

interface FollowupConversation {
  id: string;
  phone: string;
  status: string;
  followup_count: number;
  last_message_at: string | null;
  created_at: string | null;
  current_node: string;
}

const FOLLOWUP_INTERVALS = [
  { minutes: 3, label: "3 min" },
  { minutes: 10, label: "10 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 120, label: "2h" },
  { minutes: 360, label: "6h" },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    activeConversations: 0,
    totalStock: 0,
    totalCustomers: 0,
    alineOrders: 0,
    activeFollowups: 0,
  });
  const [waitingConversations, setWaitingConversations] = useState<WaitingConversation[]>([]);
  const [alineOrders, setAlineOrders] = useState<AlineOrder[]>([]);
  const [followupConversations, setFollowupConversations] = useState<FollowupConversation[]>([]);
  const [conversionData, setConversionData] = useState<ConversionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every second for real-time timers
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Execute all queries in parallel for speed
      const [
        productsResult,
        stockResult,
        conversationsResult,
        customersResult,
        alineOrdersResult,
        followupsResult,
        waitingResult,
        allAlineConversations,
        allAlineOrders
      ] = await Promise.all([
        // Products count
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true),
        // Total stock
        supabase.from('product_variants').select('stock'),
        // Conversations count
        supabase.from('conversations').select('*', { count: 'exact', head: true }),
        // Unique customers
        supabase.from('conversations').select('contact_number'),
        // Aline orders (last 20)
        supabase.from('orders').select('id, customer_name, customer_phone, selected_name, selected_sku, total_price, status, created_at')
          .eq('source', 'aline').order('created_at', { ascending: false }).limit(20),
        // Active followups
        supabase.from('aline_conversations').select('*').eq('status', 'active').order('last_message_at', { ascending: false }).limit(50),
        // Waiting conversations (messages where last is from customer)
        supabase.from('conversations').select('id, contact_name, contact_number, platform, last_message, created_at')
          .order('created_at', { ascending: false }).limit(30),
        // All aline conversations for conversion stats
        supabase.from('aline_conversations').select('phone, followup_count'),
        // All aline orders for conversion calculation
        supabase.from('orders').select('customer_phone').eq('source', 'aline')
      ]);

      const totalStock = stockResult.data?.reduce((acc, v) => acc + (v.stock || 0), 0) || 0;
      const uniqueCustomers = new Set(customersResult.data?.map(c => c.contact_number)).size;
      const activeFollowups = followupsResult.data?.filter(f => f.followup_count < 5).length || 0;

      setStats({
        totalProducts: productsResult.count || 0,
        activeConversations: conversationsResult.count || 0,
        totalStock,
        totalCustomers: uniqueCustomers,
        alineOrders: alineOrdersResult.data?.length || 0,
        activeFollowups,
      });

      setAlineOrders(alineOrdersResult.data || []);
      setFollowupConversations(followupsResult.data || []);

      // Calculate conversion data by followup count
      if (allAlineConversations.data && allAlineOrders.data) {
        const orderedPhones = new Set(allAlineOrders.data.map(o => o.customer_phone));
        const byFollowup: Record<number, { total: number; converted: number }> = {};
        
        allAlineConversations.data.forEach(conv => {
          const count = conv.followup_count || 0;
          if (!byFollowup[count]) {
            byFollowup[count] = { total: 0, converted: 0 };
          }
          byFollowup[count].total++;
          if (orderedPhones.has(conv.phone)) {
            byFollowup[count].converted++;
          }
        });

        const conversionStats: ConversionData[] = Object.entries(byFollowup)
          .map(([count, data]) => ({
            followup_count: parseInt(count),
            total: data.total,
            converted: data.converted,
            conversionRate: data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
          }))
          .sort((a, b) => a.followup_count - b.followup_count);

        setConversionData(conversionStats);
      }

      // Process waiting conversations efficiently
      if (waitingResult.data && waitingResult.data.length > 0) {
        const conversationIds = waitingResult.data.map(c => c.id);
        
        // Get last message for each conversation in a single query
        const { data: lastMessages } = await supabase
          .from('messages')
          .select('conversation_id, is_from_me, created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false });

        // Group by conversation and get the last message
        const lastMessageByConv: Record<string, { is_from_me: boolean; created_at: string }> = {};
        lastMessages?.forEach(msg => {
          if (!lastMessageByConv[msg.conversation_id]) {
            lastMessageByConv[msg.conversation_id] = msg;
          }
        });

        const waitingList: WaitingConversation[] = [];
        waitingResult.data.forEach(conv => {
          const lastMsg = lastMessageByConv[conv.id];
          if (lastMsg && !lastMsg.is_from_me) {
            const waitingSince = new Date(lastMsg.created_at);
            waitingList.push({
              id: conv.id,
              contact_name: conv.contact_name,
              contact_number: conv.contact_number,
              platform: conv.platform,
              last_message: conv.last_message,
              waiting_since: waitingSince,
              waiting_seconds: Math.floor((Date.now() - waitingSince.getTime()) / 1000),
            });
          }
        });

        waitingList.sort((a, b) => b.waiting_seconds - a.waiting_seconds);
        setWaitingConversations(waitingList.slice(0, 10));
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  useEffect(() => {
    fetchDashboardData();

    // Real-time subscriptions
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aline_conversations' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aline_messages' }, fetchDashboardData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDashboardData]);

  const formatWaitingTime = useCallback((waitingSince: Date): string => {
    const diffMs = currentTime - waitingSince.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const hours = Math.floor(diffSecs / 3600);
    const mins = Math.floor((diffSecs % 3600) / 60);
    const secs = diffSecs % 60;

    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }, [currentTime]);

  const getWaitingBadgeVariant = (waitingSince: Date): 'default' | 'secondary' | 'destructive' => {
    const diffMins = Math.floor((currentTime - waitingSince.getTime()) / 60000);
    if (diffMins < 5) return 'secondary';
    if (diffMins < 15) return 'default';
    return 'destructive';
  };

  const getFollowupStatus = useCallback((followupCount: number, lastMessageAt: string | null) => {
    if (followupCount >= 5) {
      return { label: "Concluído", color: "bg-muted text-muted-foreground", icon: CheckCircle2 };
    }
    
    const nextFollowup = FOLLOWUP_INTERVALS[followupCount];
    if (!nextFollowup) {
      return { label: "Completo", color: "bg-muted text-muted-foreground", icon: CheckCircle2 };
    }

    if (!lastMessageAt) {
      return { label: `Aguardando`, color: "bg-yellow-500/20 text-yellow-600", icon: Clock };
    }

    const elapsed = (currentTime - new Date(lastMessageAt).getTime()) / 60000;
    
    if (elapsed >= nextFollowup.minutes) {
      return { label: "Pronto", color: "bg-green-500/20 text-green-600", icon: Send };
    }

    const remaining = Math.ceil(nextFollowup.minutes - elapsed);
    return { 
      label: `${remaining}min`, 
      color: "bg-blue-500/20 text-blue-600", 
      icon: Timer 
    };
  }, [currentTime]);

  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 12) {
      return `(${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9, 13)}`;
    }
    return phone;
  };

  const followupStats = useMemo(() => {
    const active = followupConversations.filter(c => c.followup_count < 5);
    const ready = active.filter(c => {
      const status = getFollowupStatus(c.followup_count, c.last_message_at);
      return status.label === "Pronto";
    });
    const waiting = active.filter(c => {
      const status = getFollowupStatus(c.followup_count, c.last_message_at);
      return status.label.includes("min") || status.label === "Aguardando";
    });
    
    return {
      active: active.length,
      ready: ready.length,
      waiting: waiting.length,
      completed: followupConversations.filter(c => c.followup_count >= 5).length,
    };
  }, [followupConversations, getFollowupStatus]);

  const statCards = [
    { label: 'Produtos', value: stats.totalProducts, icon: Package, color: 'text-blue-500' },
    { label: 'Estoque', value: stats.totalStock, icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'Conversas', value: stats.activeConversations, icon: MessageSquare, color: 'text-purple-500' },
    { label: 'Clientes', value: stats.totalCustomers, icon: Users, color: 'text-orange-500' },
  ];

  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Visão geral em tempo real</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold text-foreground">{stat.value.toLocaleString()}</p>
                </div>
                <stat.icon className={`w-8 h-8 ${stat.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Waiting Customers - Full Width */}
      {waitingConversations.length > 0 && (
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                Clientes Aguardando
                <Badge variant="secondary">{waitingConversations.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/chat')}>
                Ver Chat <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-2">
              {waitingConversations.slice(0, 5).map((conv) => (
                <div key={conv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {conv.contact_name || formatPhone(conv.contact_number)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
                    </div>
                  </div>
                  <Badge variant={getWaitingBadgeVariant(conv.waiting_since)} className="shrink-0 ml-2 font-mono">
                    {formatWaitingTime(conv.waiting_since)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Aline Orders */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-emerald-500" />
                Pedidos da Aline
                <Badge variant="secondary">{alineOrders.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/pedidos/pendentes')}>
                Ver Todos <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[320px]">
              {alineOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <ShoppingBag className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Nenhum pedido da Aline</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alineOrders.map((order) => (
                    <div key={order.id} className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {order.selected_name || 'Produto'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground font-mono">
                              {formatPhone(order.customer_phone)}
                            </span>
                            <Badge variant={order.status === 'pending' ? 'default' : 'secondary'} className="text-xs">
                              {order.status === 'pending' ? 'Pendente' : order.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-emerald-500">
                            {formatCurrency(order.total_price)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Follow-up Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-blue-500" />
                Status de Follow-ups
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/ai/followups')}>
                Monitor <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Follow-up Stats */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10 text-center">
                <p className="text-lg font-bold text-blue-600">{followupStats.active}</p>
                <p className="text-xs text-muted-foreground">Ativos</p>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10 text-center">
                <p className="text-lg font-bold text-green-600">{followupStats.ready}</p>
                <p className="text-xs text-muted-foreground">Prontos</p>
              </div>
              <div className="p-2 rounded-lg bg-yellow-500/10 text-center">
                <p className="text-lg font-bold text-yellow-600">{followupStats.waiting}</p>
                <p className="text-xs text-muted-foreground">Aguardando</p>
              </div>
              <div className="p-2 rounded-lg bg-muted text-center">
                <p className="text-lg font-bold text-muted-foreground">{followupStats.completed}</p>
                <p className="text-xs text-muted-foreground">Concluídos</p>
              </div>
            </div>

            <ScrollArea className="h-[240px]">
              {followupConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Nenhum follow-up ativo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {followupConversations.slice(0, 10).map((conv) => {
                    const status = getFollowupStatus(conv.followup_count, conv.last_message_at);
                    const StatusIcon = status.icon;
                    
                    return (
                      <div key={conv.id} className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-mono text-foreground">
                              {formatPhone(conv.phone)}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex gap-0.5">
                                {[...Array(5)].map((_, i) => (
                                  <div
                                    key={i}
                                    className={`w-2 h-2 rounded-full ${
                                      i < conv.followup_count ? 'bg-primary' : 'bg-muted-foreground/30'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {conv.followup_count}/5
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className={`${status.color} text-xs`}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {status.label}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Chart - Full Width */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            Taxa de Conversão por Follow-up
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conversionData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Sem dados de conversão</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Bar Chart */}
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conversionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="followup_count" 
                      tickFormatter={(v) => `${v} FU`}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      labelFormatter={(v) => `${v} Follow-ups`}
                      formatter={(value: number, name: string) => [
                        value,
                        name === 'total' ? 'Total de Leads' : 'Convertidos'
                      ]}
                    />
                    <Bar dataKey="total" name="total" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="converted" name="converted" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Stats Summary */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {conversionData.map((data) => (
                    <div key={data.followup_count} className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground font-medium">
                          {data.followup_count} Follow-ups
                        </span>
                        <Badge 
                          variant="secondary" 
                          className={
                            data.conversionRate >= 20 
                              ? 'bg-emerald-500/20 text-emerald-600' 
                              : data.conversionRate >= 10 
                                ? 'bg-yellow-500/20 text-yellow-600'
                                : 'bg-muted text-muted-foreground'
                          }
                        >
                          {data.conversionRate}%
                        </Badge>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-emerald-500">{data.converted}</span>
                        <span className="text-sm text-muted-foreground">/ {data.total} leads</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${data.conversionRate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total Summary */}
                <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-emerald-500/10 border border-purple-500/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total de Conversões</p>
                      <p className="text-2xl font-bold text-foreground">
                        {conversionData.reduce((acc, d) => acc + d.converted, 0)}
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          de {conversionData.reduce((acc, d) => acc + d.total, 0)} leads
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Taxa Geral</p>
                      <p className="text-2xl font-bold text-emerald-500">
                        {(() => {
                          const total = conversionData.reduce((acc, d) => acc + d.total, 0);
                          const converted = conversionData.reduce((acc, d) => acc + d.converted, 0);
                          return total > 0 ? Math.round((converted / total) * 100) : 0;
                        })()}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
