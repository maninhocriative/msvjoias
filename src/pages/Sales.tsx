import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Search,
  Trophy,
  ShoppingBag,
  Package,
  User,
  CalendarDays,
} from 'lucide-react';
import { supabase, ChatSaleRecord } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const currency = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const Sales = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('30days');

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['chat-sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, customer_name, customer_phone, selected_name, selected_sku, quantity, total_price, assigned_to, created_at, source, status, external_reference, notes, summary_text',
        )
        .eq('source', 'chat')
        .eq('status', 'done')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []) as ChatSaleRecord[];
    },
  });

  const sellers = useMemo(() => {
    return Array.from(
      new Set(
        sales
          .map((sale) => sale.assigned_to)
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [sales]);

  const filteredSales = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    const now = Date.now();

    return sales.filter((sale) => {
      const matchesSearch =
        !searchLower ||
        (sale.customer_name || '').toLowerCase().includes(searchLower) ||
        sale.customer_phone.includes(searchTerm) ||
        (sale.selected_name || '').toLowerCase().includes(searchLower) ||
        (sale.selected_sku || '').toLowerCase().includes(searchLower) ||
        (sale.assigned_to || '').toLowerCase().includes(searchLower);

      const matchesSeller =
        sellerFilter === 'all' || sale.assigned_to === sellerFilter;

      const saleTime = new Date(sale.created_at).getTime();
      const matchesPeriod =
        periodFilter === 'all' ||
        (periodFilter === 'today' &&
          new Date(sale.created_at).toDateString() === new Date().toDateString()) ||
        (periodFilter === '7days' && now - saleTime <= 7 * 24 * 60 * 60 * 1000) ||
        (periodFilter === '30days' && now - saleTime <= 30 * 24 * 60 * 60 * 1000);

      return matchesSearch && matchesSeller && matchesPeriod;
    });
  }, [sales, searchTerm, sellerFilter, periodFilter]);

  const stats = useMemo(() => {
    const totalSales = filteredSales.length;
    const totalItems = filteredSales.reduce((sum, sale) => sum + (sale.quantity || 0), 0);
    const totalValue = filteredSales.reduce(
      (sum, sale) => sum + Number(sale.total_price || 0),
      0,
    );
    const uniqueSellers = new Set(
      filteredSales
        .map((sale) => sale.assigned_to)
        .filter((value): value is string => Boolean(value)),
    ).size;

    return { totalSales, totalItems, totalValue, uniqueSellers };
  }, [filteredSales]);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1800px] mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Vendas do Chat</h1>
        <p className="text-sm text-muted-foreground">
          Vendas registradas quando o vendedor finaliza a conversa pelo chat.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-white/5 bg-card/70">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Vendas</p>
              <p className="text-2xl font-bold text-foreground">{stats.totalSales}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-card/70">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Itens</p>
              <p className="text-2xl font-bold text-foreground">{stats.totalItems}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-card/70">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Valor total</p>
              <p className="text-2xl font-bold text-foreground">{currency(stats.totalValue)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-card/70">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-fuchsia-500/10 flex items-center justify-center">
              <User className="w-5 h-5 text-fuchsia-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Vendedores</p>
              <p className="text-2xl font-bold text-foreground">{stats.uniqueSellers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/5 bg-card/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por cliente, vendedor, produto, SKU ou telefone..."
                className="pl-10"
              />
            </div>

            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger className="w-full lg:w-[220px]">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {sellers.map((seller) => (
                  <SelectItem key={seller} value={seller}>
                    {seller}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7days">7 dias</SelectItem>
                <SelectItem value="30days">30 dias</SelectItem>
                <SelectItem value="all">Todo período</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card className="border-white/5 bg-card/70">
          <CardContent className="p-10 text-center text-muted-foreground">
            Carregando vendas...
          </CardContent>
        </Card>
      ) : filteredSales.length === 0 ? (
        <Card className="border-white/5 bg-card/70">
          <CardContent className="p-10 text-center space-y-2">
            <p className="text-base font-medium text-foreground">Nenhuma venda encontrada</p>
            <p className="text-sm text-muted-foreground">
              Ajuste os filtros ou registre uma venda pelo chat.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredSales.map((sale) => (
            <Card key={sale.id} className="border-white/5 bg-card/70">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                        Venda do chat
                      </Badge>
                      {sale.assigned_to && (
                        <Badge variant="outline" className="border-white/10">
                          {sale.assigned_to}
                        </Badge>
                      )}
                    </div>

                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {sale.selected_name || 'Produto sem nome'}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        {sale.selected_sku && (
                          <span className="text-sm text-muted-foreground font-mono">
                            {sale.selected_sku}
                          </span>
                        )}
                        <span className="text-sm text-muted-foreground">
                          Quantidade: <strong className="text-foreground">{sale.quantity}</strong>
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Total: <strong className="text-foreground">{currency(Number(sale.total_price || 0))}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      <span>
                        Cliente: <strong className="text-foreground">{sale.customer_name || sale.customer_phone}</strong>
                      </span>
                      {sale.customer_name && (
                        <span>Telefone: {sale.customer_phone}</span>
                      )}
                    </div>

                    {sale.notes && (
                      <div className="rounded-xl border border-white/5 bg-muted/30 px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-1">
                          Observações
                        </p>
                        <p className="text-sm text-foreground">{sale.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 xl:text-right">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground xl:justify-end">
                      <CalendarDays className="w-4 h-4" />
                      {format(new Date(sale.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </div>

                    {sale.summary_text && (
                      <p className="text-xs text-muted-foreground mt-3 max-w-[360px] xl:ml-auto">
                        {sale.summary_text}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Sales;
