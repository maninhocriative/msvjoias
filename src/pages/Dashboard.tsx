import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { formatDistanceToNow, format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/formatters';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Constants ────────────────────────────────────────────────────────────────
const FOLLOWUP_INTERVALS = [
  { minutes: 3 }, { minutes: 10 }, { minutes: 30 }, { minutes: 120 }, { minutes: 360 },
];
const PERIOD_OPTIONS = [
  { value: 7, label: '7d' }, { value: 15, label: '15d' }, { value: 30, label: '30d' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const StatCard = ({
  label, value, icon: Icon, color, bgColor, highlight, onClick
}: {
  label: string; value: number | string; icon: React.ElementType;
  color: string; bgColor: string; highlight?: boolean; onClick?: () => void;
}) => (
  <Card
    className={`border-border bg-card transition-all duration-200 hover:shadow-md ${highlight ? 'ring-1 ring-amber-500/30' : ''} ${onClick ? 'cursor-pointer' : ''}`}
    onClick={onClick}
  >
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-foreground tabular-nums leading-none mt-1">
            {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
          </p>
        </div>
        <div className={`p-2.5 rounded-xl ${bgColor} shrink-0`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

const PeriodSelector = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <div className="flex rounded-md border border-border overflow-hidden">
    {PERIOD_OPTIONS.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
          value === o.value ? 'bg-foreground text-background' : 'bg-transparent text-muted-foreground hover:bg-muted'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0, activeConversations: 0, totalStock: 0,
    totalCustomers: 0, alineOrders: 0, activeFollowups: 0, ordersForwardedToAcium: 0,
  });
  const [waitingConversations, setWaitingConversations] = useState<WaitingConversation[]>([]);
  const [alineOrders, setAlineOrders] = useState<AlineOrder[]>([]);
  const [followupConversations, setFollowupConversations] = useState<FollowupConversation[]>([]);
  const [conversionData, setConversionData] = useState<ConversionData[]>([]);
  const [dailyOrderData, setDailyOrderData] = useState<DailyOrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [chartPeriod, setChartPeriod] = useState(7);
  const [conversionPeriod, setConversionPeriod] = useState(7);

  // Debounce ref: evita re-fetch a cada msg do realtime
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timer de 1s só para os contadores de espera
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      const chartFrom = subDays(new Date(), chartPeriod).toISOString();
      const convFrom = subDays(new Date(), conversionPeriod).toISOString();

      const [
        productsResult, stockResult, conversationsCountResult, customersResult,
        alineOrdersResult, followupsResult, waitingResult,
        allAlineConversations, allAlineOrders, forwardedOrdersResult, ordersForPeriod,
      ] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('product_variants').select('stock'),
        supabase.from('conversations').select('*', { count: 'exact', head: true }),
        supabase.from('conversations').select('contact_number'),
        supabase.from('orders').select('id, customer_name, customer_phone, selected_name, selected_sku, total_price, status, created_at')
          .eq('source', 'aline').order('created_at', { ascending: false }).limit(20),
        supabase.from('aline_conversations').select('id, phone, status, followup_count, last_message_at, created_at, current_node')
          .eq('status', 'active').order('last_message_at', { ascending: false }).limit(50),
        supabase.from('conversations').select('id, contact_name, contact_number, platform, last_message, created_at')
          .order('created_at', { ascending: false }).limit(30),
        supabase.from('aline_conversations').select('phone, followup_count, created_at').gte('created_at', convFrom),
        supabase.from('orders').select('customer_phone, created_at').eq('source', 'aline').gte('created_at', convFrom),
        supabase.from('conversations').select('id, lead_status').eq('lead_status', 'vendedor'),
        supabase.from('orders').select('id, source, status, created_at').gte('created_at', chartFrom),
      ]);

      const totalStock = stockResult.data?.reduce((acc, v) => acc + (v.stock || 0), 0) || 0;
      const uniqueCustomers = new Set(customersResult.data?.map(c => c.contact_number)).size;
      const activeFollowups = followupsResult.data?.filter(f => f.followup_count < 5).length || 0;

      setStats({
        totalProducts: productsResult.count || 0,
        activeConversations: conversationsCountResult.count || 0,
        totalStock,
        totalCustomers: uniqueCustomers,
        alineOrders: alineOrdersResult.data?.length || 0,
        activeFollowups,
        ordersForwardedToAcium: forwardedOrdersResult.data?.length || 0,
      });

      // Chart data
      const dailyData: Record<string, { total: number; aline: number; forwarded: number }> = {};
      for (let i = chartPeriod - 1; i >= 0; i--) {
        dailyData[format(subDays(new Date(), i), 'yyyy-MM-dd')] = { total: 0, aline: 0, forwarded: 0 };
      }
      ordersForPeriod.data?.forEach(order => {
        const d = format(new Date(order.created_at), 'yyyy-MM-dd');
        if (dailyData[d]) {
          dailyData[d].total++;
          if (order.source === 'aline') dailyData[d].aline++;
          if (order.source === 'aline' && (order.status === 'pending' || order.status === 'confirmed')) dailyData[d].forwarded++;
        }
      });
      setDailyOrderData(
        Object.entries(dailyData).map(([date, data]) => ({
          date,
          dateLabel: chartPeriod <= 7
            ? format(new Date(date + 'T12:00:00'), 'EEE', { locale: ptBR })
            : format(new Date(date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
          ...data,
        }))
      );

      setAlineOrders(alineOrdersResult.data || []);
      setFollowupConversations(followupsResult.data || []);

      // Conversion data
      if (allAlineConversations.data && allAlineOrders.data) {
        const orderedPhones = new Set(allAlineOrders.data.map(o => o.customer_phone));
        const byFU: Record<number, { total: number; converted: number }> = {};
        allAlineConversations.data.forEach(conv => {
          const n = conv.followup_count || 0;
          if (!byFU[n]) byFU[n] = { total: 0, converted: 0 };
          byFU[n].total++;
          if (orderedPhones.has(conv.phone)) byFU[n].converted++;
        });
        setConversionData(
          Object.entries(byFU)
            .map(([count, data]) => ({
              followup_count: parseInt(count),
              total: data.total,
              converted: data.converted,
              conversionRate: data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
            }))
            .sort((a, b) => a.followup_count - b.followup_count)
        );
      }

      // Waiting conversations
      if (waitingResult.data?.length) {
        const ids = waitingResult.data.map(c => c.id);
        const { data: lastMessages } = await supabase
          .from('messages').select('conversation_id, is_from_me, created_at')
          .in('conversation_id', ids).order('created_at', { ascending: false });

        const lastMsgMap: Record<string, { is_from_me: boolean; created_at: string }> = {};
        lastMessages?.forEach(msg => {
          if (!lastMsgMap[msg.conversation_id]) lastMsgMap[msg.conversation_id] = msg;
        });

        const waitingList: WaitingConversation[] = [];
        waitingResult.data.forEach(conv => {
          const lastMsg = lastMsgMap[conv.id];
          if (lastMsg && !lastMsg.is_from_me) {
            const waitingSince = new Date(lastMsg.created_at);
            waitingList.push({
              id: conv.id, contact_name: conv.contact_name,
              contact_number: conv.contact_number, platform: conv.platform,
              last_message: conv.last_message, waiting_since: waitingSince,
              waiting_seconds: Math.floor((Date.now() - waitingSince.getTime()) / 1000),
            });
          }
        });
        waitingList.sort((a, b) => b.waiting_seconds - a.waiting_seconds);
        setWaitingConversations(waitingList.slice(0, 10));
      } else {
        setWaitingConversations([]);
      }
    } catch (err) {
      console.error('Erro no dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chartPeriod, conversionPeriod]);

  // Debounced realtime handler — 1.5s de espera antes de re-fetch
  const debouncedFetch = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => fetchDashboardData(), 1500);
  }, [fetchDashboardData]);

  useEffect(() => {
    fetchDashboardData();
    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aline_conversations' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, debouncedFetch)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, [fetchDashboardData, debouncedFetch]);

  // Helpers
  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const c = phone.replace(/\D/g, '');
    if (c.length >= 12) return `(${c.slice(2, 4)}) ${c.slice(4, 9)}-${c.slice(9, 13)}`;
    return phone;
  };

  const formatWaitingTime = useCallback((ws: Date): string => {
    const s = Math.floor((currentTime - ws.getTime()) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }, [currentTime]);

  const getWaitingVariant = (ws: Date): 'default' | 'secondary' | 'destructive' => {
    const m = Math.floor((currentTime - ws.getTime()) / 60000);
    if (m < 5) return 'secondary';
    if (m < 15) return 'default';
    return 'destructive';
  };

  const getFollowupStatus = useCallback((count: number, lastAt: string | null) => {
    if (count >= 5) return { label: 'Concluído', color: 'bg-muted text-muted-foreground', icon: CheckCircle2 };
    const next = FOLLOWUP_INTERVALS[count];
    if (!next) return { label: 'Completo', color: 'bg-muted text-muted-foreground', icon: CheckCircle2 };
    if (!lastAt) return { label: 'Aguardando', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400', icon: Clock };
    const elapsed = (currentTime - new Date(lastAt).getTime()) / 60000;
    if (elapsed >= next.minutes) return { label: 'Pronto', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', icon: Send };
    return { label: `${Math.ceil(next.minutes - elapsed)}min`, color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', icon: Timer };
  }, [currentTime]);

  const followupStats = useMemo(() => {
    const active = followupConversations.filter(c => c.followup_count < 5);
    return {
      active: active.length,
      ready: active.filter(c => getFollowupStatus(c.followup_count, c.last_message_at).label === 'Pronto').length,
      waiting: active.filter(c => {
        const l = getFollowupStatus(c.followup_count, c.last_message_at).label;
        return l.includes('min') || l === 'Aguardando';
      }).length,
      completed: followupConversations.filter(c => c.followup_count >= 5).length,
    };
  }, [followupConversations, getFollowupStatus]);

  const totalConversionRate = useMemo(() => {
    const total = conversionData.reduce((a, d) => a + d.total, 0);
    const conv = conversionData.reduce((a, d) => a + d.converted, 0);
    return total > 0 ? Math.round((conv / total) * 100) : 0;
  }, [conversionData]);

  const totalForwarded = useMemo(() => dailyOrderData.reduce((a, d) => a + d.forwarded, 0), [dailyOrderData]);
  const totalAline = useMemo(() => dailyOrderData.reduce((a, d) => a + d.aline, 0), [dailyOrderData]);

  // Loading
  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1920px] mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="grid lg:grid-cols-5 gap-4">
          <Skeleton className="lg:col-span-3 h-72" />
          <Skeleton className="lg:col-span-2 h-72" />
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-72" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1920px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Atualização em tempo real
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); fetchDashboardData(); }} disabled={refreshing} className="gap-2 h-8">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Alerta: clientes aguardando */}
      {waitingConversations.length > 0 && (
        <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-500/10">
                <Clock className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <span className="text-sm font-medium text-foreground">Aguardando resposta</span>
              <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{waitingConversations.length}</Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/chat')} className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground">
              Abrir Chat <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {waitingConversations.slice(0, 6).map((conv) => (
              <div
                key={conv.id}
                className="flex-none flex items-center gap-2.5 bg-card border border-border rounded-lg px-3 py-2 cursor-pointer hover:border-orange-500/40 transition-colors min-w-[152px]"
                onClick={() => navigate('/chat')}
              >
                <div className="w-7 h-7 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                  <Phone className="w-3 h-3 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {conv.contact_name || formatPhone(conv.contact_number)}
                  </p>
                  <Badge variant={getWaitingVariant(conv.waiting_since)} className="text-[10px] font-mono mt-0.5 h-4 px-1">
                    {formatWaitingTime(conv.waiting_since)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        <StatCard label="Produtos" value={stats.totalProducts} icon={Package} color="text-blue-500" bgColor="bg-blue-500/10" />
        <StatCard label="Estoque" value={stats.totalStock} icon={TrendingUp} color="text-emerald-500" bgColor="bg-emerald-500/10" />
        <StatCard label="Conversas" value={stats.activeConversations} icon={MessageSquare} color="text-purple-500" bgColor="bg-purple-500/10" onClick={() => navigate('/chat')} />
        <StatCard label="Clientes" value={stats.totalCustomers} icon={Users} color="text-orange-500" bgColor="bg-orange-500/10" onClick={() => navigate('/customers')} />
        <StatCard label="Pedidos Aline" value={stats.alineOrders} icon={Bot} color="text-pink-500" bgColor="bg-pink-500/10" onClick={() => navigate('/pedidos/pendentes')} />
        <StatCard label="Follow-ups" value={stats.activeFollowups} icon={Timer} color="text-blue-500" bgColor="bg-blue-500/10" onClick={() => navigate('/ai/followups')} />
        <StatCard label="Encaminhados" value={stats.ordersForwardedToAcium} icon={Send} color="text-amber-500" bgColor="bg-amber-500/10" highlight />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-5 gap-4">
        {/* Area chart: pedidos */}
        <Card className="lg:col-span-3 border-border">
          <CardHeader className="pb-2 px-5 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Send className="w-4 h-4 text-amber-500" />
                  Pedidos no Período
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="text-amber-600 dark:text-amber-400 font-medium">{totalForwarded} encaminhados</span>
                  {' · '}
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{totalAline} via Aline</span>
                </p>
              </div>
              <PeriodSelector value={chartPeriod} onChange={setChartPeriod} />
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyOrderData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAline" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142 76% 36%)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gFwd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(38 92% 50%)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="dateLabel" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="aline" name="Via Aline" stroke="hsl(142 76% 36%)" fill="url(#gAline)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="forwarded" name="Encaminhados" stroke="hsl(38 92% 50%)" fill="url(#gFwd)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-5 justify-center mt-2">
              {[{ color: 'bg-emerald-500', label: 'Via Aline' }, { color: 'bg-amber-500', label: 'Encaminhados' }].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bar chart: conversão */}
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="pb-2 px-5 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-500" />
                  Conversão por Follow-up
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Taxa geral: <span className="text-emerald-600 dark:text-emerald-400 font-medium">{totalConversionRate}%</span>
                </p>
              </div>
              <PeriodSelector value={conversionPeriod} onChange={setConversionPeriod} />
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {conversionData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground gap-2">
                <BarChart3 className="w-7 h-7 opacity-25" />
                <p className="text-xs">Sem dados no período</p>
              </div>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conversionData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="followup_count" tickFormatter={v => `${v}×`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="total" name="Total" fill="hsl(var(--muted-foreground))" opacity={0.35} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="converted" name="Convertidos" fill="hsl(142 76% 36%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail row */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Pedidos recentes */}
        <Card className="border-border">
          <CardHeader className="pb-2 px-5 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bot className="w-4 h-4 text-pink-500" />
                Pedidos Recentes
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/pedidos/pendentes')} className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground">
                Ver todos <ArrowUpRight className="w-3 h-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <ScrollArea className="h-[264px] pr-1">
              {alineOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                  <ShoppingBag className="w-6 h-6 opacity-25" />
                  <p className="text-xs">Nenhum pedido recente</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {alineOrders.slice(0, 10).map((order) => (
                    <div key={order.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{order.selected_name || 'Produto'}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{formatPhone(order.customer_phone)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-emerald-500">{formatCurrency(order.total_price)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Follow-ups */}
        <Card className="border-border">
          <CardHeader className="pb-2 px-5 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Timer className="w-4 h-4 text-blue-500" />
                Follow-ups
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/ai/followups')} className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground">
                Monitor <ArrowUpRight className="w-3 h-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {[
                { v: followupStats.active, l: 'Ativos', c: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
                { v: followupStats.ready, l: 'Prontos', c: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
                { v: followupStats.waiting, l: 'Aguard.', c: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10' },
                { v: followupStats.completed, l: 'Feitos', c: 'text-muted-foreground', bg: 'bg-muted' },
              ].map(({ v, l, c, bg }) => (
                <div key={l} className={`rounded-lg ${bg} p-2 text-center`}>
                  <p className={`text-sm font-bold ${c}`}>{v}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">{l}</p>
                </div>
              ))}
            </div>
            <ScrollArea className="h-[204px] pr-1">
              {followupConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
                  <AlertCircle className="w-5 h-5 opacity-25" />
                  <p className="text-xs">Nenhum follow-up ativo</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {followupConversations.slice(0, 8).map((conv) => {
                    const s = getFollowupStatus(conv.followup_count, conv.last_message_at);
                    const Icon = s.icon;
                    return (
                      <div key={conv.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-mono text-foreground truncate">{formatPhone(conv.phone)}</p>
                          <div className="flex gap-0.5 mt-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < conv.followup_count ? 'bg-foreground' : 'bg-muted-foreground/20'}`} />
                            ))}
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${s.color}`}>
                          <Icon className="w-2.5 h-2.5" />
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Resumo de conversão */}
        <Card className="border-border">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              Resumo de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {conversionData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[264px] gap-2 text-muted-foreground">
                <BarChart3 className="w-6 h-6 opacity-25" />
                <p className="text-xs">Sem dados</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-muted/50 text-center">
                  <p className="text-3xl font-bold text-foreground tabular-nums">{totalConversionRate}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Taxa geral de conversão</p>
                  <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-700"
                      style={{ width: `${totalConversionRate}%` }}
                    />
                  </div>
                </div>
                <ScrollArea className="h-[176px] pr-1">
                  <div className="space-y-2">
                    {conversionData.map((data) => (
                      <div key={data.followup_count} className="p-2.5 rounded-lg bg-muted/40">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] text-muted-foreground">
                            {data.followup_count === 0 ? 'Sem follow-up' : `${data.followup_count}× follow-up`}
                          </span>
                          <span className={`text-[11px] font-semibold tabular-nums ${
                            data.conversionRate >= 20 ? 'text-emerald-600 dark:text-emerald-400'
                              : data.conversionRate >= 10 ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-muted-foreground'
                          }`}>
                            {data.conversionRate}%
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1 mb-1.5">
                          <span className="text-sm font-bold text-emerald-500">{data.converted}</span>
                          <span className="text-[11px] text-muted-foreground">/ {data.total} leads</span>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${data.conversionRate}%` }} />
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
