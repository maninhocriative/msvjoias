import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, MessageSquare, TrendingUp, Users, RefreshCw, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface DashboardStats {
  totalProducts: number;
  activeConversations: number;
  totalStock: number;
  totalCustomers: number;
}

interface RecentActivity {
  id: string;
  type: 'message' | 'product' | 'stock';
  description: string;
  time: string;
}

interface PopularProduct {
  id: string;
  name: string;
  stock: number;
}

interface WaitingConversation {
  id: string;
  contact_name: string | null;
  contact_number: string;
  platform: string | null;
  last_message: string | null;
  last_message_time: Date;
  waiting_since: Date;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    activeConversations: 0,
    totalStock: 0,
    totalCustomers: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [popularProducts, setPopularProducts] = useState<PopularProduct[]>([]);
  const [waitingConversations, setWaitingConversations] = useState<WaitingConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0); // For real-time timer updates

  const fetchDashboardData = async () => {
    try {
      // Fetch products count
      const { count: productsCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('active', true);

      // Fetch total stock from variants
      const { data: stockData } = await supabase
        .from('product_variants')
        .select('stock');
      
      const totalStock = stockData?.reduce((acc, v) => acc + (v.stock || 0), 0) || 0;

      // Fetch active conversations (with messages in last 24h)
      const { count: conversationsCount } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });

      // Fetch unique customers count
      const { data: customersData } = await supabase
        .from('conversations')
        .select('contact_number');
      
      const uniqueCustomers = new Set(customersData?.map(c => c.contact_number)).size;

      setStats({
        totalProducts: productsCount || 0,
        activeConversations: conversationsCount || 0,
        totalStock: totalStock,
        totalCustomers: uniqueCustomers,
      });

      // Fetch recent messages for activity
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('id, content, created_at, is_from_me')
        .order('created_at', { ascending: false })
        .limit(5);

      const activities: RecentActivity[] = (recentMessages || []).map(msg => ({
        id: msg.id,
        type: 'message' as const,
        description: msg.is_from_me ? 'Mensagem enviada' : 'Nova mensagem recebida',
        time: formatTimeAgo(new Date(msg.created_at)),
      }));

      setRecentActivity(activities);

      // Fetch conversations waiting for response (last message is from customer)
      const { data: conversations } = await supabase
        .from('conversations')
        .select(`
          id,
          contact_name,
          contact_number,
          platform,
          last_message,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      // For each conversation, check if last message is from customer
      const waitingList: WaitingConversation[] = [];
      
      for (const conv of conversations || []) {
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('is_from_me, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        // If last message is from customer (not from us), they're waiting
        if (lastMsg && !lastMsg.is_from_me) {
          waitingList.push({
            id: conv.id,
            contact_name: conv.contact_name,
            contact_number: conv.contact_number,
            platform: conv.platform,
            last_message: conv.last_message,
            last_message_time: new Date(lastMsg.created_at),
            waiting_since: new Date(lastMsg.created_at),
          });
        }
      }

      // Sort by waiting time (oldest first)
      waitingList.sort((a, b) => a.waiting_since.getTime() - b.waiting_since.getTime());
      setWaitingConversations(waitingList.slice(0, 5));

      // Fetch popular products (with most stock)
      const { data: products } = await supabase
        .from('products')
        .select(`
          id,
          name,
          product_variants (stock)
        `)
        .eq('active', true)
        .limit(5);

      const productsWithStock: PopularProduct[] = (products || [])
        .map(p => ({
          id: p.id,
          name: p.name,
          stock: (p.product_variants as any[])?.reduce((acc, v) => acc + (v.stock || 0), 0) || 0,
        }))
        .sort((a, b) => b.stock - a.stock)
        .slice(0, 4);

      setPopularProducts(productsWithStock);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'agora';
    if (diffMins < 60) return `há ${diffMins} min`;
    if (diffHours < 24) return `há ${diffHours}h`;
    return `há ${diffDays}d`;
  };

  const formatWaitingTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return `${diffSecs}s`;
    if (diffHours < 1) return `${diffMins}min`;
    return `${diffHours}h ${diffMins % 60}min`;
  };

  const getWaitingBadgeVariant = (date: Date): 'default' | 'secondary' | 'destructive' => {
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffMins < 5) return 'secondary';
    if (diffMins < 15) return 'default';
    return 'destructive';
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  useEffect(() => {
    fetchDashboardData();

    // Set up realtime subscription for updates
    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    // Update waiting times every 10 seconds
    const timerInterval = setInterval(() => {
      setTick(t => t + 1);
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timerInterval);
    };
  }, []);

  const statCards = [
    { label: 'Produtos Ativos', value: stats.totalProducts.toString(), icon: Package },
    { label: 'Conversas', value: stats.activeConversations.toString(), icon: MessageSquare },
    { label: 'Estoque Total', value: stats.totalStock.toString(), icon: TrendingUp },
    { label: 'Clientes', value: stats.totalCustomers.toString(), icon: Users },
  ];

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Visão geral do seu sistema</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {statCards.map((stat) => (
          <Card key={stat.label} className="border-border bg-card hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Waiting Conversations Section */}
      {waitingConversations.length > 0 && (
        <div className="mt-6 lg:mt-8">
          <Card className="border-border border-l-4 border-l-orange-500">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                Clientes Aguardando Atendimento
                <Badge variant="secondary" className="ml-2">{waitingConversations.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="space-y-3">
                {waitingConversations.map((conv) => (
                  <div key={conv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {conv.contact_name || conv.contact_number}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {conv.platform || 'whatsapp'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {conv.last_message || 'Sem mensagem'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <Badge variant={getWaitingBadgeVariant(conv.waiting_since)}>
                        {formatWaitingTime(conv.waiting_since)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-6 lg:mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg font-semibold">Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="space-y-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
              ) : recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma atividade recente
                </p>
              ) : (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <div className="w-2 h-2 rounded-full bg-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg font-semibold">Produtos com Estoque</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="space-y-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))
              ) : popularProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum produto cadastrado
                </p>
              ) : (
                popularProducts.map((product) => (
                  <div key={product.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium text-foreground">{product.name}</span>
                    <span className="text-xs text-muted-foreground">{product.stock} unidades</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
