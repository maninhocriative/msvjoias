import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Link2, Loader2, Plus, RefreshCw, Search, Share2, Trophy, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Influencer = {
  id: string;
  name: string;
  phone: string | null;
  handle: string | null;
  code: string;
  notes: string | null;
  active: boolean;
  created_at: string;
};

type InfluencerLead = {
  id: string;
  influencer_id: string;
  conversation_id: string | null;
  contact_name: string | null;
  contact_phone: string;
  first_message: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

type OrderRow = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  selected_name: string | null;
  total_price: number | null;
  status: string | null;
  external_reference: string | null;
  created_at: string;
};

const DEFAULT_WHATSAPP = '5592984636921';

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const phoneVariants = (phone: string) => {
  const digits = onlyDigits(phone);
  const variants = new Set<string>();
  if (digits) variants.add(digits);
  if (digits.startsWith('55')) variants.add(digits.slice(2));
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) variants.add(`55${digits}`);
  return variants;
};

const normalizeCurrency = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const soldOrderStatuses = new Set(['done', 'paid', 'completed', 'finalized', 'vendido']);

const isSoldOrder = (order: OrderRow) => soldOrderStatuses.has(String(order.status || '').toLowerCase());

const createCode = (name: string) => {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 6)
    .toUpperCase() || 'PARC';
  return `${base}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

const Influencers = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [whatsappNumber] = useState(DEFAULT_WHATSAPP);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [leads, setLeads] = useState<InfluencerLead[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', handle: '', notes: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [influencersResult, leadsResult, ordersResult] = await Promise.all([
        supabase.from('influencers').select('*').order('created_at', { ascending: false }),
        supabase.from('influencer_leads').select('*').order('last_seen_at', { ascending: false }),
        supabase
          .from('orders')
          .select('id, customer_phone, customer_name, selected_name, total_price, status, external_reference, created_at')
          .order('created_at', { ascending: false })
          .limit(2000),
      ]);

      if (influencersResult.error) throw influencersResult.error;
      if (leadsResult.error) throw leadsResult.error;
      if (ordersResult.error) throw ordersResult.error;

      setInfluencers((influencersResult.data || []) as Influencer[]);
      setLeads((leadsResult.data || []) as InfluencerLead[]);
      setOrders((ordersResult.data || []) as OrderRow[]);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar parceiros',
        description: error?.message || 'Nao foi possivel carregar os dados.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getLink = (influencer: Influencer) => {
    const text = `Oi! Vim pelo link da ${influencer.name} e quero conhecer as ofertas da ACIUM. #ACIUMP-${influencer.code}`;
    return `https://wa.me/${onlyDigits(whatsappNumber) || DEFAULT_WHATSAPP}?text=${encodeURIComponent(text)}`;
  };

  const getOrdersForLead = (lead: InfluencerLead) => {
    const variants = phoneVariants(lead.contact_phone);
    const leadTime = new Date(lead.first_seen_at).getTime();

    return orders.filter((order) => {
      if (!isSoldOrder(order)) return false;
      const orderTime = new Date(order.created_at).getTime();
      if (Number.isFinite(leadTime) && Number.isFinite(orderTime) && orderTime < leadTime) return false;
      if (lead.conversation_id && order.external_reference === lead.conversation_id) return true;
      return variants.has(onlyDigits(order.customer_phone));
    });
  };

  const rows = useMemo(() => {
    return influencers
      .filter((influencer) => {
        const term = search.trim().toLowerCase();
        if (!term) return true;
        return [influencer.name, influencer.handle, influencer.phone, influencer.code]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .map((influencer) => {
        const influencerLeads = leads.filter((lead) => lead.influencer_id === influencer.id);
        const leadOrders = influencerLeads.flatMap(getOrdersForLead);
        const uniqueOrders = Array.from(new Map(leadOrders.map((order) => [order.id, order])).values());
        const buyers = influencerLeads.filter((lead) => getOrdersForLead(lead).length > 0).length;
        return {
          influencer,
          leads: influencerLeads,
          buyers,
          orders: uniqueOrders,
          revenue: uniqueOrders.reduce((sum, order) => sum + Number(order.total_price || 0), 0),
        };
      });
  }, [influencers, leads, orders, search]);

  const totals = useMemo(() => {
    const leadIds = new Set(leads.map((lead) => lead.id));
    const allOrders = rows.flatMap((row) => row.orders);
    const uniqueOrders = new Map(allOrders.map((order) => [order.id, order]));
    return {
      influencers: influencers.length,
      leads: leadIds.size,
      orders: rows.reduce((sum, row) => sum + row.buyers, 0),
      revenue: Array.from(uniqueOrders.values()).reduce((sum, order) => sum + Number(order.total_price || 0), 0),
    };
  }, [influencers.length, leads, rows]);

  const createInfluencer = async () => {
    const name = form.name.trim();
    if (!name) {
      toast({ title: 'Informe o nome do parceiro' });
      return;
    }

    setSaving(true);
    try {
      const code = createCode(name);
      const { error } = await supabase.from('influencers').insert({
        name,
        phone: onlyDigits(form.phone) || null,
        handle: form.handle.trim() || null,
        notes: form.notes.trim() || null,
        code,
      });

      if (error) throw error;
      setForm({ name: '', phone: '', handle: '', notes: '' });
      toast({ title: 'Parceiro criado', description: `Link ${code} pronto para divulgacao.` });
      await fetchData();
    } catch (error: any) {
      toast({
        title: 'Erro ao criar parceiro',
        description: error?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    toast({ title: 'Link copiado' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-400 font-semibold">Parcerias</p>
          <h1 className="text-3xl font-bold">Links de Influenciadores</h1>
          <p className="text-muted-foreground mt-1">
            Gere links rastreaveis para WhatsApp e acompanhe leads, compras e faturamento por parceiro.
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" className="gap-2" disabled={loading}>
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          { label: 'Parceiros', value: totals.influencers, icon: Share2 },
          { label: 'Leads', value: totals.leads, icon: Users },
          { label: 'Compraram', value: totals.orders, icon: Trophy },
          { label: 'Faturamento', value: normalizeCurrency(totals.revenue), icon: Link2 },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card/80 border-border">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
              <Icon className="w-5 h-5 text-emerald-400" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/80 border-border">
        <CardHeader>
          <CardTitle>Novo parceiro</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1.5 md:col-span-1">
            <Label>Nome</Label>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome do influencer" />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="5592..." />
          </div>
          <div className="space-y-1.5">
            <Label>Instagram/TikTok</Label>
            <Input value={form.handle} onChange={(event) => setForm({ ...form, handle: event.target.value })} placeholder="@perfil" />
          </div>
          <div className="space-y-1.5">
            <Label>Observacao</Label>
            <Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Campanha, nicho..." />
          </div>
          <div className="flex items-end">
            <Button onClick={createInfluencer} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardHeader className="gap-3">
          <CardTitle>Monitoramento</CardTitle>
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar parceiro, codigo ou perfil..." />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Carregando parceiros...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parceiro</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead className="text-center">Leads</TableHead>
                  <TableHead className="text-center">Compraram</TableHead>
                  <TableHead>Faturamento</TableHead>
                  <TableHead>Ultimos leads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ influencer, leads: influencerLeads, buyers, revenue }) => {
                  const link = getLink(influencer);
                  return (
                    <TableRow key={influencer.id}>
                      <TableCell>
                        <div className="font-semibold">{influencer.name}</div>
                        <div className="text-xs text-muted-foreground">{influencer.handle || influencer.phone || 'Sem contato'} · {influencer.code}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => copyLink(link)} className="gap-1.5">
                            <Copy className="w-3.5 h-3.5" />
                            Copiar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => window.open(link, '_blank')} className="gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5" />
                            Abrir
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-bold">{influencerLeads.length}</TableCell>
                      <TableCell className="text-center font-bold text-emerald-400">{buyers}</TableCell>
                      <TableCell className="font-semibold">{normalizeCurrency(revenue)}</TableCell>
                      <TableCell>
                        <div className="space-y-1 max-w-[320px]">
                          {influencerLeads.slice(0, 3).map((lead) => {
                            const bought = getOrdersForLead(lead).length > 0;
                            return (
                              <div key={lead.id} className="text-xs flex items-center gap-2">
                                <span className={cn('w-2 h-2 rounded-full shrink-0', bought ? 'bg-emerald-400' : 'bg-slate-500')} />
                                <span className="truncate">{lead.contact_name || lead.contact_phone}</span>
                                <span className={cn('shrink-0', bought ? 'text-emerald-400' : 'text-muted-foreground')}>
                                  {bought ? 'comprou' : 'nao comprou'}
                                </span>
                              </div>
                            );
                          })}
                          {influencerLeads.length === 0 && <span className="text-xs text-muted-foreground">Sem leads ainda</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Influencers;
