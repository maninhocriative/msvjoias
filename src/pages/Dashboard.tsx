import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Package, MessageSquare, TrendingUp, Users, RefreshCw, Clock, 
  Bot, ShoppingBag, Timer, Send, CheckCircle2, AlertCircle,
  ArrowRight, Phone, BarChart3, ArrowUpRight, Activity
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow, format, subDays, startOfDay, endOfDay

 } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/formatters';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  CartesianGrid, Legend
} from 'recharts';

interface DashboardStats {
  totalProducts: number;
  activeConversations: number;
  totalStock: number;
  totalCustomers: number;
  alineOrders: number;
  activeFollowups: number;
  ordersForwardedToAcium: number;
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

interface DailyOrderData {
  date: string;
  dateLabel: string;
  total: number;
  aline: number;
  forwarded: number;
}

const FOLLOWUP_INTERVALS = [
  { minutes: 3, label: "3 min" },
  { minutes: 10, label: "10 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 120, label: "2h" },
  { minutes: 360, label: "6h" },
];

const CHART_COLORS = {
  primary: 'hsl(142 76% 36%)',
  secondary: 'hsl(221 83% 53%)',
  tertiary: 'hsl(38 92% 50%)',
  muted: 'hsl(var(--muted-foreground))',
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    activeConversations: 0,
    totalStock: 0,
    totalCustomers: 0,
    alineOrders: 0,
    activeFollowups: 0,
    ordersForwardedToAcium: 0,
  });
  const [waitingConversations, setWaitingConversations] = useState<WaitingConversation[]>([]);
  const [alineOrders, setAlineOrders] = useState<AlineOrder[]>([]);
  const [followupConversations, setFollowupConversations] = useState<FollowupConversation[]>([]);
  const [conversionData, setConversionData] = useState<ConversionData[]>([]);
  const [dailyOrderData, setDailyOrderData] = useState<DailyOrderData[]>([]);
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
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      
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
        allAlineOrders,
        forwardedOrdersResult,
        ordersLast7Days
      ] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('product_variants').select('stock'),
        supabase.from('conversations').select('*', { count: 'exact', head: true }),
        supabase.from('conversations').select('contact_number'),
        supabase.from('orders').select('id, customer_name, customer_phone, selected_name, selected_sku, total_price, status, created_at')
          .eq('source', 'aline').order('created_at', { ascending: false }).limit(20),
        supabase.from('aline_conversations').select('*').eq('status', 'active').order('last_message_at', { ascending: false }).limit(50),
        supabase.from('conversations').select('id, contact_name, contact_number, platform, last_message, created_at')
          .order('created_at', { ascending: false }).limit(30),
        supabase.from('aline_conversations').select('phone, followup_count'),
        supabase.from('orders').select('customer_phone').eq('source', 'aline'),
        // Orders forwarded to Acium (status vendedor or has assigned_to)
        supabase.from('conversations').select('id, lead_status').eq('lead_status', 'vendedor'),
        // Orders from last 7 days for chart
        supabase.from('orders').select('id, source, status, created_at').gte('created_at', sevenDaysAgo)
      ]);

      const totalStock = stockResult.data?.reduce((acc, v) => acc + (v.stock || 0), 0) || 0;
      const uniqueCustomers = new Set(customersResult.data?.map(c => c.contact_number)).size;
      const activeFollowups = followupsResult.data?.filter(f => f.followup_count < 5).length || 0;
      const forwardedToAcium = forwardedOrdersResult.data?.length || 0;

      // Process daily order data for chart
      const dailyData: Record<string, { total: number; aline: number; forwarded: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
        dailyData[date] = { total: 0, aline: 0, forwarded: 0 };
      }

      ordersLast7Days.data?.forEach(order => {
        const date = format(new Date(order.created_at), 'yyyy-MM-dd');
        if (dailyData[date]) {
          dailyData[date].total++;
          if (order.source === 'aline') {
            dailyData[date].aline++;
          }
          // Consider forwarded as those with 'pending' or 'confirmed' status from aline
          if (order.source === 'aline' && (order.status === 'pending' || order.status === 'confirmed')) {
            dailyData[date].forwarded++;
          }
        }
      });

      const chartData: DailyOrderData[] = Object.entries(dailyData).map(([date, data]) => ({
        date,
        dateLabel: format(new Date(date), 'EEE', { locale: ptBR }),
        ...data,
      }));

      setDailyOrderData(chartData);

      setStats({
        totalProducts: productsResult.count || 0,
        activeConversations: conversationsResult.count || 0,
        totalStock,
        totalCustomers: uniqueCustomers,
        alineOrders: alineOrdersResult.data?.length || 0,
        activeFollowups,
        ordersForwardedToAcium: forwardedToAcium,
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
        
        const { data: lastMessages } = await supabase
          .from('messages')
          .select('conversation_id, is_from_me, created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false });

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, fetchDashboardData)
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

  const totalConversionRate = useMemo(() => {
    const total = conversionData.reduce((acc, d) => acc + d.total, 0);
    const converted = conversionData.reduce((acc, d) => acc + d.converted, 0);
    return total > 0 ? Math.round((converted / total) * 100) : 0;
  }, [conversionData]);

  const totalForwarded = useMemo(() => {
    return dailyOrderData.reduce((acc, d) => acc + d.forwarded, 0);
  }, [dailyOrderData]);

  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1920px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1920px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Activity className="w-3 h-3 animate-pulse text-emerald-500" />
            Atualização em tempo real
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Grid - More compact */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-border bg-card hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Package className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Produtos</p>
                <p className="text-xl font-bold text-foreground">{stats.totalProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estoque</p>
                <p className="text-xl font-bold text-foreground">{stats.totalStock.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <MessageSquare className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Conversas</p>
                <p className="text-xl font-bold text-foreground">{stats.activeConversations}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Users className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clientes</p>
                <p className="text-xl font-bold text-foreground">{stats.totalCustomers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-500/10">
                <Bot className="w-5 h-5 text-pink-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pedidos Aline</p>
                <p className="text-xl font-bold text-foreground">{stats.alineOrders}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card hover:shadow-md transition-shadow border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Send className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Encaminhados</p>
                <p className="text-xl font-bold text-foreground">{stats.ordersForwardedToAcium}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Orders Forwarded Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-500" />
                Pedidos Encaminhados para Acium
              </div>
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                {totalForwarded} esta semana
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyOrderData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorForwarded" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(38 92% 50%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(38 92% 50%)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAline" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="dateLabel" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="aline" 
                    name="Pedidos Aline" 
                    stroke="hsl(142 76% 36%)" 
                    fillOpacity={1} 
                    fill="url(#colorAline)" 
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="forwarded" 
                    name="Encaminhados" 
                    stroke="hsl(38 92% 50%)" 
                    fillOpacity={1} 
                    fill="url(#colorForwarded)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Pedidos Aline</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">Encaminhados</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conversion Rate Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-500" />
                Taxa de Conversão por Follow-up
              </div>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                {totalConversionRate}% geral
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {conversionData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">Sem dados de conversão</p>
              </div>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conversionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="followup_count" 
                      tickFormatter={(v) => `${v} FU`}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      labelFormatter={(v) => `${v} Follow-ups`}
                    />
                    <Bar dataKey="total" name="Total Leads" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="converted" name="Convertidos" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex items-center justify-center gap-6 mt-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted-foreground" />
                <span className="text-muted-foreground">Total Leads</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Convertidos</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Waiting Customers Alert */}
      {waitingConversations.length > 0 && (
        <Card className="border-l-4 border-l-orange-500 bg-orange-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-500" />
                Clientes Aguardando Resposta
                <Badge variant="destructive" className="ml-2">{waitingConversations.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/chat')} className="text-xs">
                Abrir Chat <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
              {waitingConversations.slice(0, 5).map((conv) => (
                <div 
                  key={conv.id} 
                  className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-orange-500/50 transition-colors cursor-pointer"
                  onClick={() => navigate('/chat')}
                >
                  <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-orange-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {conv.contact_name || formatPhone(conv.contact_number)}
                    </p>
                    <Badge variant={getWaitingBadgeVariant(conv.waiting_since)} className="text-[10px] font-mono mt-1">
                      {formatWaitingTime(conv.waiting_since)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Three Column Layout */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Aline Orders */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-pink-500" />
                Pedidos Recentes
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/pedidos/pendentes')} className="text-xs h-7 px-2">
                Ver Todos <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[280px]">
              {alineOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <ShoppingBag className="w-6 h-6 mb-2 opacity-50" />
                  <p className="text-xs">Nenhum pedido</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alineOrders.slice(0, 8).map((order) => (
                    <div key={order.id} className="p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">
                            {order.selected_name || 'Produto'}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {formatPhone(order.customer_phone)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-emerald-500">
                            {formatCurrency(order.total_price)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
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
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-blue-500" />
                Follow-ups
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/ai/followups')} className="text-xs h-7 px-2">
                Monitor <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Follow-up Stats Mini */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-center">
                <p className="text-sm font-bold text-blue-600">{followupStats.active}</p>
                <p className="text-[9px] text-muted-foreground">Ativos</p>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10 text-center">
                <p className="text-sm font-bold text-green-600">{followupStats.ready}</p>
                <p className="text-[9px] text-muted-foreground">Prontos</p>
              </div>
              <div className="p-2 rounded-lg bg-yellow-500/10 text-center">
                <p className="text-sm font-bold text-yellow-600">{followupStats.waiting}</p>
                <p className="text-[9px] text-muted-foreground">Aguard.</p>
              </div>
              <div className="p-2 rounded-lg bg-muted text-center">
                <p className="text-sm font-bold text-muted-foreground">{followupStats.completed}</p>
                <p className="text-[9px] text-muted-foreground">Feitos</p>
              </div>
            </div>

            <ScrollArea className="h-[208px]">
              {followupConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <AlertCircle className="w-6 h-6 mb-2 opacity-50" />
                  <p className="text-xs">Nenhum follow-up ativo</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {followupConversations.slice(0, 8).map((conv) => {
                    const status = getFollowupStatus(conv.followup_count, conv.last_message_at);
                    const StatusIcon = status.icon;
                    
                    return (
                      <div key={conv.id} className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono text-foreground truncate">
                              {formatPhone(conv.phone)}
                            </p>
                            <div className="flex gap-0.5 mt-1">
                              {[...Array(5)].map((_, i) => (
                                <div
                                  key={i}
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    i < conv.followup_count ? 'bg-primary' : 'bg-muted-foreground/30'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <Badge className={`${status.color} text-[10px] shrink-0`}>
                            <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                            {status.label}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Conversion Summary */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              Resumo de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {conversionData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                <BarChart3 className="w-6 h-6 mb-2 opacity-50" />
                <p className="text-xs">Sem dados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Main metric */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 text-center">
                  <p className="text-3xl font-bold text-foreground">
                    {totalConversionRate}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Taxa Geral de Conversão</p>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all"
                      style={{ width: `${totalConversionRate}%` }}
                    />
                  </div>
                </div>

                {/* Per followup breakdown */}
                <ScrollArea className="h-[180px]">
                  <div className="space-y-2">
                    {conversionData.map((data) => (
                      <div key={data.followup_count} className="p-2.5 rounded-lg bg-muted/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {data.followup_count} Follow-ups
                          </span>
                          <Badge 
                            variant="secondary" 
                            className={`text-[10px] ${
                              data.conversionRate >= 20 
                                ? 'bg-emerald-500/20 text-emerald-600' 
                                : data.conversionRate >= 10 
                                  ? 'bg-yellow-500/20 text-yellow-600'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {data.conversionRate}%
                          </Badge>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-bold text-emerald-500">{data.converted}</span>
                          <span className="text-[10px] text-muted-foreground">/ {data.total}</span>
                        </div>
                        <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${data.conversionRate}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
