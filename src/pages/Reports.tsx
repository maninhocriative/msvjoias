import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Download, Eye, Package, MessageSquare, Search, TrendingUp } from 'lucide-react';

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

interface ProductSearch {
  id: string;
  name: string;
  sku: string | null;
  searchCount: number;
  category: string | null;
}

interface PendantInterestRow {
  date: string;
  name: string;
  phone: string;
  item: string;
  sku: string;
  category: string;
}

const COLORS = ['hsl(0, 0%, 0%)', 'hsl(0, 0%, 30%)', 'hsl(0, 0%, 50%)', 'hsl(0, 0%, 70%)'];

const getCurrentMonthValue = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthLabel = (monthValue: string) => {
  const [year, month] = monthValue.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
};

const escapeHtmlValue = (value: string | number | null | undefined) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const escapeHtmlWithBreaks = (value: string | number | null | undefined) => (
  escapeHtmlValue(value).replace(/\n/g, '<br />')
);

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

const formatPhone = (phone: string) => {
  const digits = normalizePhone(phone);
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return digits ? `+${digits}` : '';
};

const downloadExcel = (rows: PendantInterestRow[], monthValue: string) => {
  const title = `Relatorio de interesse em pingentes - ${formatMonthLabel(monthValue)}`;
  const generatedAt = new Date().toLocaleString('pt-BR');
  const tableRows = rows.map((row, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtmlValue(row.date)}</td>
      <td>${escapeHtmlValue(row.name)}</td>
      <td class="phone">${escapeHtmlValue(formatPhone(row.phone))}</td>
      <td>${escapeHtmlWithBreaks(row.item)}</td>
      <td class="sku">${escapeHtmlWithBreaks(row.sku || '-')}</td>
      <td>${escapeHtmlValue(row.category)}</td>
    </tr>
  `).join('');
  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          .meta { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #111827; color: #ffffff; font-weight: 700; text-align: left; }
          th, td { border: 1px solid #d1d5db; padding: 8px 10px; vertical-align: top; }
          tbody tr:nth-child(even) { background: #f9fafb; }
          .center { text-align: center; }
          .phone, .sku { mso-number-format: "\\@"; white-space: nowrap; }
          .wide { width: 280px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtmlValue(title)}</h1>
        <div class="meta">Gerado em ${escapeHtmlValue(generatedAt)} - ${rows.length} contato(s)</div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Data</th>
              <th class="wide">Nome</th>
              <th>Telefone</th>
              <th class="wide">Itens de interesse</th>
              <th>SKU</th>
              <th>Categoria</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `interesse-pingentes-${monthValue}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [productStocks, setProductStocks] = useState<ProductStock[]>([]);
  const [categoryStocks, setCategoryStocks] = useState<CategoryStock[]>([]);
  const [platformData, setPlatformData] = useState<PlatformData[]>([]);
  const [messageActivity, setMessageActivity] = useState<MessageActivity[]>([]);
  const [productSearches, setProductSearches] = useState<ProductSearch[]>([]);
  const [totalStock, setTotalStock] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [totalConversations, setTotalConversations] = useState(0);
  const [totalSearches, setTotalSearches] = useState(0);
  const [pendantExportMonth, setPendantExportMonth] = useState(getCurrentMonthValue());
  const [pendantInterestRows, setPendantInterestRows] = useState<PendantInterestRow[]>([]);
  const [pendantExportLoading, setPendantExportLoading] = useState(false);
  const [pendantExportError, setPendantExportError] = useState<string | null>(null);

  useEffect(() => {
    fetchReportData();
  }, []);

  useEffect(() => {
    fetchPendantInterestRows(pendantExportMonth);
  }, [pendantExportMonth]);

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

      // Fetch product searches (products with product_interest in messages)
      const { data: searchMessages } = await supabase
        .from('messages')
        .select('product_interest')
        .not('product_interest', 'is', null);

      if (searchMessages && searchMessages.length > 0) {
        // Count searches per product
        const searchCountMap = new Map<string, number>();
        searchMessages.forEach(m => {
          if (m.product_interest) {
            searchCountMap.set(m.product_interest, (searchCountMap.get(m.product_interest) || 0) + 1);
          }
        });

        setTotalSearches(searchMessages.length);

        // Fetch product details for searched products
        const productIds = Array.from(searchCountMap.keys());
        const { data: searchedProducts } = await supabase
          .from('products')
          .select('id, name, sku, category')
          .in('id', productIds);

        if (searchedProducts) {
          const searchData: ProductSearch[] = searchedProducts
            .map(p => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              category: p.category,
              searchCount: searchCountMap.get(p.id) || 0,
            }))
            .sort((a, b) => b.searchCount - a.searchCount)
            .slice(0, 10);

          setProductSearches(searchData);
        }
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendantInterestRows = async (monthValue: string) => {
    setPendantExportLoading(true);
    setPendantExportError(null);

    try {
      const [year, month] = monthValue.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      const { data: pendantProducts, error: productsError } = await supabase
        .from('products')
        .select('id, name, sku, category')
        .or('category.ilike.%pingente%,name.ilike.%pingente%,description.ilike.%pingente%,ai_description.ilike.%pingente%');

      if (productsError) throw productsError;

      const productMap = new Map(
        (pendantProducts || []).map((product) => [product.id, product]),
      );
      const productIds = Array.from(productMap.keys());

      const interestMessages = productIds.length > 0
        ? (await supabase
            .from('messages')
            .select(`
              id,
              created_at,
              conversation_id,
              product_interest,
              conversations (
                contact_name,
                contact_number
              )
            `)
            .gte('created_at', startIso)
            .lt('created_at', endIso)
            .in('product_interest', productIds)
            .order('created_at', { ascending: true })).data || []
        : [];

      const { data: catalogSessions, error: catalogSessionsError } = await supabase
        .from('catalog_sessions')
        .select('id, created_at, phone, categoria, line, intent')
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .or('categoria.ilike.%pingente%,line.eq.kate,intent.ilike.%pingente%')
        .order('created_at', { ascending: true });

      if (catalogSessionsError) throw catalogSessionsError;

      const catalogSessionIds = (catalogSessions || []).map((session) => session.id);
      const { data: catalogItems } = catalogSessionIds.length > 0
        ? await supabase
            .from('catalog_items_sent')
            .select('session_id, created_at, name, sku')
            .in('session_id', catalogSessionIds)
            .order('position', { ascending: true })
        : { data: [] };

      const catalogItemsBySession = new Map<string, any[]>();
      (catalogItems || []).forEach((item) => {
        const current = catalogItemsBySession.get(item.session_id) || [];
        current.push(item);
        catalogItemsBySession.set(item.session_id, current);
      });

      const { data: agentMemories, error: memoriesError } = await supabase
        .from('customer_agent_memory')
        .select('phone, customer_name, last_interest, last_product_name, last_product_sku, last_seen_at, updated_at, agent_slug, summary')
        .gte('last_seen_at', startIso)
        .lt('last_seen_at', endIso)
        .or('agent_slug.eq.kate,last_interest.ilike.%pingente%,last_product_name.ilike.%pingente%,summary.ilike.%pingente%')
        .order('last_seen_at', { ascending: true });

      if (memoriesError) throw memoriesError;

      const phoneNumbers = Array.from(new Set([
        ...(interestMessages || []).map((message: any) => message.conversations?.contact_number),
        ...(catalogSessions || []).map((session) => session.phone),
        ...(agentMemories || []).map((memory) => memory.phone),
      ].filter(Boolean)));

      const customerMap = new Map<string, string>();
      if (phoneNumbers.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('name, whatsapp')
          .in('whatsapp', phoneNumbers);

        (customers || []).forEach((customer) => {
          customerMap.set(customer.whatsapp, customer.name);
        });
      }

      const conversationNameMap = new Map<string, string>();
      if (phoneNumbers.length > 0) {
        const { data: conversations } = await supabase
          .from('conversations')
          .select('contact_number, contact_name')
          .in('contact_number', phoneNumbers);

        (conversations || []).forEach((conversation) => {
          if (conversation.contact_name) {
            conversationNameMap.set(conversation.contact_number, conversation.contact_name);
          }
        });
      }

      const rowsByContact = new Map<string, PendantInterestRow>();
      const addRow = (row: PendantInterestRow) => {
        const key = normalizePhone(row.phone);
        if (!key) return;

        const existing = rowsByContact.get(key);
        if (!existing) {
          rowsByContact.set(key, {
            ...row,
            phone: key,
          });
          return;
        }

        const existingItems = new Set(existing.item.split('\n').filter(Boolean));
        if (row.item && !existingItems.has(row.item)) {
          existing.item = `${existing.item}\n${row.item}`;
        }

        const existingSkus = new Set(existing.sku.split('\n').filter(Boolean));
        if (row.sku && !existingSkus.has(row.sku)) {
          existing.sku = existing.sku ? `${existing.sku}\n${row.sku}` : row.sku;
        }
      };
      const getName = (phone: string, fallback?: string | null) => (
        customerMap.get(phone) || fallback || conversationNameMap.get(phone) || 'Sem nome'
      );

      (interestMessages || []).forEach((message: any) => {
        const product = productMap.get(message.product_interest);
        const conversation = message.conversations;
        const phone = conversation?.contact_number || '';

        addRow({
          date: new Date(message.created_at).toLocaleDateString('pt-BR'),
          name: getName(phone, conversation?.contact_name),
          phone,
          item: product?.name || 'Pingente',
          sku: product?.sku || '',
          category: product?.category || 'pingente',
        });
      });

      (catalogSessions || []).forEach((session) => {
        const items = catalogItemsBySession.get(session.id) || [];
        if (items.length === 0) {
          addRow({
            date: new Date(session.created_at).toLocaleDateString('pt-BR'),
            name: getName(session.phone),
            phone: session.phone,
            item: 'Pingentes',
            sku: '',
            category: 'pingente',
          });
          return;
        }

        items.forEach((item) => {
          addRow({
            date: new Date(item.created_at || session.created_at).toLocaleDateString('pt-BR'),
            name: getName(session.phone),
            phone: session.phone,
            item: item.name || 'Pingente',
            sku: item.sku || '',
            category: 'pingente',
          });
        });
      });

      (agentMemories || []).forEach((memory) => {
        addRow({
          date: new Date(memory.last_seen_at || memory.updated_at).toLocaleDateString('pt-BR'),
          name: getName(memory.phone, memory.customer_name),
          phone: memory.phone,
          item: memory.last_product_name || memory.last_interest || 'Pingentes',
          sku: memory.last_product_sku || '',
          category: 'pingente',
        });
      });

      setPendantInterestRows(Array.from(rowsByContact.values()));
    } catch (error) {
      console.error('Error fetching pendant interests:', error);
      setPendantInterestRows([]);
      setPendantExportError('Nao foi possivel gerar a lista de interesses em pingentes.');
    } finally {
      setPendantExportLoading(false);
    }
  };

  const handleDownloadPendantInterests = () => {
    if (pendantInterestRows.length === 0) return;
    downloadExcel(pendantInterestRows, pendantExportMonth);
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
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground mt-1">Visualize métricas e análises do sistema</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
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

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Procuras de Produtos
            </CardTitle>
            <Search className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-foreground">{totalSearches}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="procuras" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="stock" className="gap-2">
            <Package className="w-4 h-4" />
            Estoque
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="procuras" className="gap-2">
            <Eye className="w-4 h-4" />
            Procuras
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

        <TabsContent value="procuras" className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">Planilha de Interesse em Pingentes</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Contatos com interesse registrado em pingentes em {formatMonthLabel(pendantExportMonth)}.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="pendant-export-month">Mes</Label>
                    <Input
                      id="pendant-export-month"
                      type="month"
                      value={pendantExportMonth}
                      onChange={(event) => {
                        if (event.target.value) setPendantExportMonth(event.target.value);
                      }}
                      className="w-full sm:w-[180px]"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleDownloadPendantInterests}
                    disabled={pendantExportLoading || pendantInterestRows.length === 0}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Baixar planilha
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {pendantExportLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : pendantExportError ? (
                <p className="text-sm text-destructive py-4">{pendantExportError}</p>
              ) : pendantInterestRows.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum contato com interesse em pingentes neste mes.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span>{pendantInterestRows.length} registros encontrados</span>
                    <span>Arquivo Excel formatado</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/70 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Data</th>
                          <th className="px-4 py-3 text-left font-medium">Nome</th>
                          <th className="px-4 py-3 text-left font-medium">Telefone</th>
                          <th className="px-4 py-3 text-left font-medium">Item de interesse</th>
                          <th className="px-4 py-3 text-left font-medium">SKU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendantInterestRows.slice(0, 8).map((row) => (
                          <tr key={`${row.phone}-${row.item}`} className="border-t border-border">
                            <td className="px-4 py-3 whitespace-nowrap">{row.date}</td>
                            <td className="px-4 py-3 min-w-[180px]">{row.name}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{row.phone}</td>
                            <td className="px-4 py-3 min-w-[220px] whitespace-pre-line">{row.item}</td>
                            <td className="px-4 py-3 whitespace-pre-line">{row.sku || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pendantInterestRows.length > 8 && (
                    <p className="text-xs text-muted-foreground">
                      A previa mostra 8 linhas. A planilha baixada inclui todos os registros.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Most Searched Products Chart */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Produtos Mais Procurados</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[350px] w-full" />
              ) : productSearches.length === 0 ? (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma procura registrada ainda</p>
                    <p className="text-sm mt-2">As procuras serão registradas automaticamente quando clientes mencionarem produtos nas mensagens</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={productSearches} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={11}
                      width={120}
                      tickFormatter={(value) => value.length > 18 ? value.substring(0, 18) + '...' : value}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="searchCount" 
                      fill="hsl(var(--foreground))" 
                      radius={[0, 4, 4, 0]}
                      name="Procuras"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Product Search Details Table */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Detalhes das Procuras</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : productSearches.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhuma procura registrada</p>
              ) : (
                <div className="space-y-3">
                  {productSearches.map((product, index) => (
                    <div 
                      key={product.id} 
                      className="flex items-center gap-4 p-4 rounded-lg bg-muted/50"
                    >
                      <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{product.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {product.sku && <span>SKU: {product.sku}</span>}
                          {product.sku && product.category && <span>•</span>}
                          {product.category && <span>{product.category}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground text-lg">{product.searchCount}</p>
                        <p className="text-xs text-muted-foreground">procuras</p>
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
