import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  Area,
  AreaChart,
} from 'recharts';
import { Package, MessageSquare, TrendingUp, Calendar } from 'lucide-react';

interface ProductStock {
  name: string;
  stock: number;
}

interface CategoryStock {
  category: string;
  stock: number;
  count: number;
}

interface PlatformData {
  name: string;
  value: number;
}

interface MessageActivity {
  date: string;
  received: number;
  sent: number;
}

const COLORS = ['hsl(0, 0%, 0%)', 'hsl(0, 0%, 30%)', 'hsl(0, 0%, 50%)', 'hsl(0, 0%, 70%)'];

const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [productStocks, setProductStocks] = useState<ProductStock[]>([]);
  const [categoryStocks, setCategoryStocks] = useState<CategoryStock[]>([]);
  const [platformData, setPlatformData] = useState<PlatformData[]>([]);
  const [messageActivity, setMessageActivity] = useState<MessageActivity[]>([]);
  const [totalStock, setTotalStock] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [totalConversations, setTotalConversations] = useState(0);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      // Fetch products with stock
      const { data: products } = await supabase
        .from('products')
        .select(`
          id,
          name,
          category,
          product_variants (stock)
        `)
        .eq('active', true);

      const productStockData: ProductStock[] = (products || [])
        .map(p => ({
          name: p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name,
          stock: (p.product_variants as any[])?.reduce((acc, v) => acc + (v.stock || 0), 0) || 0,
        }))
        .sort((a, b) => b.stock - a.stock)
        .slice(0, 10);

      setProductStocks(productStockData);

      // Calculate total stock
      const total = productStockData.reduce((acc, p) => acc + p.stock, 0);
      setTotalStock(total);

      // Calculate stock by category
      const categoryMap = new Map<string, { stock: number; count: number }>();
      (products || []).forEach(p => {
        const cat = p.category || 'Sem categoria';
        const stock = (p.product_variants as any[])?.reduce((acc, v) => acc + (v.stock || 0), 0) || 0;
        const existing = categoryMap.get(cat) || { stock: 0, count: 0 };
        categoryMap.set(cat, { stock: existing.stock + stock, count: existing.count + 1 });
      });

      const categoryData: CategoryStock[] = Array.from(categoryMap.entries())
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.stock - a.stock);

      setCategoryStocks(categoryData);

      // Fetch conversations by platform
      const { data: conversations } = await supabase
        .from('conversations')
        .select('platform');

      const platformMap = new Map<string, number>();
      (conversations || []).forEach(c => {
        const platform = c.platform || 'whatsapp';
        platformMap.set(platform, (platformMap.get(platform) || 0) + 1);
      });

      const platformLabels: Record<string, string> = {
        whatsapp: 'WhatsApp',
        instagram: 'Instagram',
      };

      const platformChartData: PlatformData[] = Array.from(platformMap.entries())
        .map(([name, value]) => ({
          name: platformLabels[name] || name,
          value,
        }));

      setPlatformData(platformChartData);
      setTotalConversations(conversations?.length || 0);

      // Fetch message activity for last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: messages } = await supabase
        .from('messages')
        .select('created_at, is_from_me')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      setTotalMessages(messages?.length || 0);

      // Group messages by day
      const activityMap = new Map<string, { received: number; sent: number }>();
      
      // Initialize all 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        activityMap.set(dateStr, { received: 0, sent: 0 });
      }

      (messages || []).forEach(m => {
        const date = new Date(m.created_at);
        const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const existing = activityMap.get(dateStr) || { received: 0, sent: 0 };
        if (m.is_from_me) {
          existing.sent++;
        } else {
          existing.received++;
        }
        activityMap.set(dateStr, existing);
      });

      const activityData: MessageActivity[] = Array.from(activityMap.entries())
        .map(([date, data]) => ({ date, ...data }));

      setMessageActivity(activityData);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm text-muted-foreground">
              {entry.name}: <span className="font-medium text-foreground">{entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground mt-1">Visualize métricas e análises do sistema</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Estoque Total
            </CardTitle>
            <Package className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-foreground">{totalStock} unidades</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Conversas
            </CardTitle>
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-foreground">{totalConversations}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mensagens (7 dias)
            </CardTitle>
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-foreground">{totalMessages}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stock" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="stock" className="gap-2">
            <Package className="w-4 h-4" />
            Estoque
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stock by Product */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Estoque por Produto</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : productStocks.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhum produto cadastrado
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={productStocks} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={11}
                        width={100}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar 
                        dataKey="stock" 
                        fill="hsl(var(--foreground))" 
                        radius={[0, 4, 4, 0]}
                        name="Estoque"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Stock by Category */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Estoque por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : categoryStocks.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhuma categoria encontrada
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={categoryStocks}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="category" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                      />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar 
                        dataKey="stock" 
                        fill="hsl(var(--foreground))" 
                        radius={[4, 4, 0, 0]}
                        name="Estoque"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Category Details Table */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Detalhes por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : categoryStocks.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhuma categoria encontrada</p>
              ) : (
                <div className="space-y-3">
                  {categoryStocks.map((cat) => (
                    <div 
                      key={cat.category} 
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                    >
                      <div>
                        <p className="font-medium text-foreground">{cat.category}</p>
                        <p className="text-sm text-muted-foreground">{cat.count} produtos</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">{cat.stock}</p>
                        <p className="text-xs text-muted-foreground">unidades</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Message Activity */}
            <Card className="border-border lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Atividade de Mensagens (7 dias)</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : messageActivity.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhuma mensagem encontrada
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={messageActivity}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="date" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                      />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="received"
                        stackId="1"
                        stroke="hsl(var(--foreground))"
                        fill="hsl(var(--foreground))"
                        fillOpacity={0.6}
                        name="Recebidas"
                      />
                      <Area
                        type="monotone"
                        dataKey="sent"
                        stackId="1"
                        stroke="hsl(var(--muted-foreground))"
                        fill="hsl(var(--muted-foreground))"
                        fillOpacity={0.4}
                        name="Enviadas"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Platform Distribution */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Conversas por Plataforma</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : platformData.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhuma conversa encontrada
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={platformData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {platformData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Platform Details */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Resumo de Plataformas</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : platformData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhuma conversa encontrada</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {platformData.map((platform, index) => (
                    <div 
                      key={platform.name} 
                      className="flex items-center gap-4 p-4 rounded-lg bg-muted/50"
                    >
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{platform.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {((platform.value / totalConversations) * 100).toFixed(1)}% do total
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">{platform.value}</p>
                        <p className="text-xs text-muted-foreground">conversas</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
