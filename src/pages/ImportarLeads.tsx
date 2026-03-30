import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Save,
  RefreshCw,
  ExternalLink,
  Play,
  FileSpreadsheet,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Copy,
  ChevronDown,
  Search,
  MessageCircle,
  Inbox,
} from 'lucide-react';

interface LeadData {
  name: string;
  phone: string;
  campaign: string;
  ad_name: string;
  when: string;
  intent: string;
  platform: string;
  form: string;
  imported_at: string;
}

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  details: string[];
  leads: LeadData[];
  ran_at: string;
}

const CRON_SQL = `select cron.schedule(
  'importar-leads-facebook',
  '0 11 * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/import-facebook-leads',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);`;

const INTENT_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className: string }> = {
  essa_semana:              { label: 'Esta semana',    variant: 'default',   className: 'bg-emerald-600 hover:bg-emerald-700 text-white border-0' },
  esse_mes:                 { label: 'Este mês',       variant: 'default',   className: 'bg-blue-600 hover:bg-blue-700 text-white border-0' },
  nos_proximos_3_meses:     { label: 'Próx. 3 meses',  variant: 'default',   className: 'bg-amber-500 hover:bg-amber-600 text-white border-0' },
  ainda_estou_pesquisando:  { label: 'Pesquisando',     variant: 'secondary', className: '' },
};

function getInitialColor(name: string): string {
  const colors = [
    'bg-emerald-600', 'bg-blue-600', 'bg-violet-600', 'bg-rose-600',
    'bg-amber-600', 'bg-cyan-600', 'bg-pink-600', 'bg-indigo-600',
  ];
  const code = name.charCodeAt(0) || 0;
  return colors[code % colors.length];
}

function formatIntentBadge(value: string) {
  if (!value) return null;
  const key = value.toLowerCase().replace(/\s+/g, '_');
  const mapped = INTENT_MAP[key];
  if (mapped) {
    return <Badge variant={mapped.variant} className={mapped.className}>{mapped.label}</Badge>;
  }
  return <Badge variant="secondary">{value}</Badge>;
}

const ImportarLeads = () => {
  const [sheetUrl, setSheetUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [cronOpen, setCronOpen] = useState(false);

  const urlConfigured = sheetUrl.trim().length > 0;

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('store_settings')
        .select('key, value')
        .in('key', ['facebook_leads_sheet_url', 'facebook_leads_last_import']);

      if (data) {
        const urlSetting = data.find((s) => s.key === 'facebook_leads_sheet_url');
        if (urlSetting) setSheetUrl(urlSetting.value);

        const resultSetting = data.find((s) => s.key === 'facebook_leads_last_import');
        if (resultSetting) {
          try { setLastResult(JSON.parse(resultSetting.value)); } catch {}
        }
      }
    } catch (error: any) {
      toast.error('Erro ao carregar configurações: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveSheetUrl = async () => {
    if (!sheetUrl.trim()) { toast.error('Cole a URL da planilha'); return; }
    setSavingUrl(true);
    try {
      const { data: existing } = await supabase
        .from('store_settings').select('id').eq('key', 'facebook_leads_sheet_url').maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from('store_settings').update({ value: sheetUrl.trim(), updated_at: new Date().toISOString() })
          .eq('key', 'facebook_leads_sheet_url');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('store_settings').insert({ key: 'facebook_leads_sheet_url', value: sheetUrl.trim(), description: 'URL da planilha Google Sheets com leads do Facebook' });
        if (error) throw error;
      }
      toast.success('URL salva com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally { setSavingUrl(false); }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-facebook-leads', {
        body: { sheet_url: sheetUrl || undefined },
      });
      if (error) throw error;
      setLastResult(data as ImportResult);
      toast.success(`Importação concluída: ${(data as ImportResult).imported} leads importados`);
    } catch (error: any) {
      toast.error('Erro na importação: ' + error.message);
    } finally { setImporting(false); }
  };

  const copySQL = () => { navigator.clipboard.writeText(CRON_SQL); toast.success('SQL copiado!'); };
  const copyLog = () => {
    if (lastResult?.details) {
      navigator.clipboard.writeText(lastResult.details.join('\n'));
      toast.success('Log copiado!');
    }
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
  };

  const getLineColor = (line: string) => {
    if (line.startsWith('OK:')) return 'text-emerald-500';
    if (line.startsWith('SKIP:')) return 'text-amber-500';
    if (line.startsWith('ERRO:')) return 'text-destructive';
    return 'text-muted-foreground';
  };

  const filteredLeads = useMemo(() => {
    if (!lastResult?.leads) return [];
    if (!search.trim()) return lastResult.leads;
    const q = search.toLowerCase();
    return lastResult.leads.filter(
      (l) => l.name.toLowerCase().includes(q) || l.phone.includes(q)
    );
  }, [lastResult?.leads, search]);

  const successRate = lastResult && lastResult.total > 0
    ? Math.round((lastResult.imported / lastResult.total) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-600/10">
            <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Importar Leads</h1>
            <p className="text-sm text-muted-foreground">Facebook Ads via Google Sheets</p>
          </div>
        </div>
        {lastResult && (
          <Badge variant="secondary" className="text-sm self-start">
            {lastResult.imported} leads importados
          </Badge>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT — Control panel (2/5) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Card 1 — Config */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                Planilha de Leads
                {urlConfigured ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 text-[10px]">Configurada ✓</Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px]">Não configurada</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sheet-url" className="text-xs">URL do Google Sheets</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="sheet-url"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    className="flex-1 text-xs"
                  />
                  {sheetUrl && (
                    <Button variant="outline" size="icon" className="shrink-0" asChild>
                      <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
              <Button onClick={saveSheetUrl} disabled={savingUrl} size="sm" className="w-full">
                {savingUrl ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Salvar URL
              </Button>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                A planilha precisa estar com acesso público de visualização ativado.
              </p>
            </CardContent>
          </Card>

          {/* Card 2 — Scheduling & Import */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Agendamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Cron automático</p>
                  <p className="text-[10px] text-muted-foreground">Todo dia às 08:00 (Brasília)</p>
                </div>
                <Switch checked={urlConfigured} disabled />
              </div>

              {urlConfigured && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Próxima importação: amanhã às 08:00
                </p>
              )}

              <Button
                onClick={runImport}
                disabled={importing || !urlConfigured}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
              >
                {importing ? (
                  <><RefreshCw className="w-4 h-4 animate-spin mr-2" /> Importando...</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" /> Importar agora</>
                )}
              </Button>

              {lastResult && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Última execução: {formatDate(lastResult.ran_at)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Card 3 — Metrics */}
          {lastResult && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Métricas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-3 text-center">
                    <Users className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xl font-bold">{lastResult.total}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                    <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-emerald-500" />
                    <p className="text-xl font-bold text-emerald-500">{lastResult.imported}</p>
                    <p className="text-[10px] text-emerald-500/70">Importados</p>
                  </div>
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                    <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-amber-500" />
                    <p className="text-xl font-bold text-amber-500">{lastResult.skipped}</p>
                    <p className="text-[10px] text-amber-500/70">Ignorados</p>
                  </div>
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
                    <XCircle className="w-4 h-4 mx-auto mb-1 text-destructive" />
                    <p className="text-xl font-bold text-destructive">{lastResult.errors}</p>
                    <p className="text-[10px] text-destructive/70">Erros</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Taxa de sucesso</span>
                    <span className="font-medium">{successRate}%</span>
                  </div>
                  <Progress value={successRate} className="h-2" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT — Leads table (3/5) */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="flex flex-col h-full">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Leads Importados
                  {lastResult?.leads && (
                    <Badge variant="outline" className="text-[10px]">{lastResult.leads.length}</Badge>
                  )}
                </CardTitle>
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou telefone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              {(!lastResult?.leads || lastResult.leads.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <Inbox className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhum lead importado ainda</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
                    Configure a planilha e clique em "Importar agora" para começar.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Lead</TableHead>
                        <TableHead className="text-xs">Campanha</TableHead>
                        <TableHead className="text-xs">Intenção</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLeads.map((lead, i) => {
                        const initials = lead.name.substring(0, 2).toUpperCase();
                        const avatarColor = getInitialColor(lead.name);
                        return (
                          <TableRow key={`${lead.phone}-${i}`} className="group">
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-full ${avatarColor} text-white flex items-center justify-center text-[10px] font-semibold shrink-0`}>
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{lead.name}</p>
                                  <a
                                    href={`https://wa.me/${lead.phone}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-muted-foreground hover:text-emerald-500 transition-colors"
                                  >
                                    +{lead.phone}
                                  </a>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {lead.campaign && (
                                  <p className="text-xs truncate max-w-[140px]" title={lead.campaign}>
                                    {lead.campaign}
                                  </p>
                                )}
                                {lead.ad_name && (
                                  <Badge variant="outline" className="text-[9px] font-normal truncate max-w-[120px]">
                                    {lead.ad_name}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {formatIntentBadge(lead.when || lead.intent)}
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 text-[10px]">
                                Novo
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                                <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noopener noreferrer">
                                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                                </a>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Log */}
          {lastResult?.details && lastResult.details.length > 0 && (
            <Collapsible open={logOpen} onOpenChange={setLogOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        Ver log detalhado
                        <Badge variant="outline" className="text-[10px]">{lastResult.details.length}</Badge>
                      </span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${logOpen ? 'rotate-180' : ''}`} />
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-2">
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={copyLog} className="text-xs h-7">
                        <Copy className="w-3 h-3 mr-1" /> Copiar log
                      </Button>
                    </div>
                    <ScrollArea className="h-48 rounded-md border bg-muted/20 p-3">
                      <div className="space-y-0.5 font-mono text-[11px]">
                        {lastResult.details.map((line, i) => (
                          <p key={i} className={getLineColor(line)}>{line}</p>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </div>
      </div>

      {/* Cron instructions */}
      <Collapsible open={cronOpen} onOpenChange={setCronOpen}>
        <Card className="border-dashed">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Ver instruções de agendamento automático</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${cronOpen ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <CardDescription>
                Ative as extensões <Badge variant="secondary">pg_cron</Badge> e{' '}
                <Badge variant="secondary">pg_net</Badge> no Supabase e execute o SQL abaixo no SQL Editor.
              </CardDescription>
              <div className="relative">
                <ScrollArea className="h-40 rounded-md border bg-muted/30 p-4">
                  <pre className="text-xs font-mono whitespace-pre">{CRON_SQL}</pre>
                </ScrollArea>
                <Button variant="outline" size="icon" className="absolute top-2 right-4 h-7 w-7" onClick={copySQL}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                O horário <code>0 11 * * *</code> corresponde a 08:00 no fuso de Manaus (UTC-3 → 11 UTC).
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};

export default ImportarLeads;
