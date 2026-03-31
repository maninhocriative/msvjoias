import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Save, RefreshCw, ExternalLink, Play, FileSpreadsheet,
  Users, CheckCircle2, AlertTriangle, XCircle,
  Copy, ChevronDown, Search, MessageCircle, Inbox,
} from 'lucide-react';

/* ── Types ── */
interface LeadData {
  name: string; phone: string; campaign: string; ad_name: string;
  when: string; intent: string; platform: string; form: string; imported_at: string;
}
interface ImportResult {
  total: number; imported: number; skipped: number; errors: number;
  details: string[]; leads: LeadData[]; ran_at: string;
}

/* ── Constants ── */
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

const INTENT_MAP: Record<string, { label: string; cls: string }> = {
  essa_semana:             { label: 'Esta semana', cls: 'bg-emerald-600 text-white' },
  'essa semana':           { label: 'Esta semana', cls: 'bg-emerald-600 text-white' },
  esse_mes:                { label: 'Este mês',    cls: 'bg-blue-600 text-white' },
  'esse_mês':              { label: 'Este mês',    cls: 'bg-blue-600 text-white' },
  nos_proximos_3_meses:    { label: '3 meses',     cls: 'bg-amber-500 text-white' },
  ainda_estou_pesquisando: { label: 'Pesquisando', cls: 'bg-muted text-muted-foreground' },
};

/* ── Helpers ── */
function avatarColor(name: string) {
  const c = (name || 'A').charAt(0).toUpperCase();
  if ('AB'.includes(c))      return 'bg-violet-600';
  if ('CDE'.includes(c))     return 'bg-blue-600';
  if ('FGH'.includes(c))     return 'bg-emerald-600';
  if ('IJKL'.includes(c))    return 'bg-orange-500';
  if ('MNO'.includes(c))     return 'bg-pink-600';
  if ('PQRS'.includes(c))    return 'bg-cyan-600';
  if ('TUV'.includes(c))     return 'bg-red-600';
  return 'bg-amber-500';
}

function campaignShort(raw: string) {
  if (!raw) return '';
  const m = raw.match(/\[([^\]]+)\]\s*$/);
  const text = m ? m[1] : raw.replace(/^\[+|\]+$/g, '');
  return text.length > 25 ? text.slice(0, 25) + '…' : text;
}

function intentBadge(value: string) {
  if (!value) return null;
  const key = value.toLowerCase().replace(/\s+/g, '_');
  const mapped = INTENT_MAP[key] || INTENT_MAP[value.toLowerCase()];
  const label = mapped ? mapped.label : (value.length > 12 ? value.slice(0, 12) + '…' : value);
  const cls   = mapped ? mapped.cls : 'bg-muted text-muted-foreground';
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}

function logColor(line: string) {
  if (line.startsWith('OK:'))   return 'text-emerald-500';
  if (line.startsWith('SKIP:')) return 'text-amber-500';
  if (line.startsWith('ERRO:')) return 'text-destructive';
  return 'text-muted-foreground';
}

/* ── Page component ── */
const ImportarLeads = () => {
  const [sheetUrl, setSheetUrl]       = useState('');
  const [savingUrl, setSavingUrl]     = useState(false);
  const [running, setRunning]         = useState(false);
  const [lastResult, setLastResult]   = useState<ImportResult | null>(null);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [logOpen, setLogOpen]         = useState(false);
  const [cronOpen, setCronOpen]       = useState(false);

  const urlOk = sheetUrl.trim().length > 0;

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('store_settings').select('key, value')
          .in('key', ['facebook_leads_sheet_url', 'facebook_leads_last_import']);
        if (data) {
          const u = data.find(r => r.key === 'facebook_leads_sheet_url');
          const l = data.find(r => r.key === 'facebook_leads_last_import');
          if (u?.value) setSheetUrl(u.value);
          if (l?.value) { try { setLastResult(JSON.parse(l.value)); } catch {} }
        }
      } catch (e: any) { toast.error('Erro ao carregar: ' + e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const saveUrl = async () => {
    if (!sheetUrl.trim()) { toast.error('Cole a URL'); return; }
    setSavingUrl(true);
    try {
      const { data: ex } = await supabase.from('store_settings').select('id').eq('key', 'facebook_leads_sheet_url').maybeSingle();
      if (ex) {
        const { error } = await supabase.from('store_settings').update({ value: sheetUrl.trim(), updated_at: new Date().toISOString() }).eq('key', 'facebook_leads_sheet_url');
        if (error) throw error;
      } else {
        const { error } = await supabase.from('store_settings').insert({ key: 'facebook_leads_sheet_url', value: sheetUrl.trim(), description: 'URL planilha leads Facebook' });
        if (error) throw error;
      }
      toast.success('URL salva!');
    } catch (e: any) { toast.error('Erro: ' + e.message); }
    finally { setSavingUrl(false); }
  };

  const runImport = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-facebook-leads', { body: { sheet_url: sheetUrl || undefined } });
      if (error) throw error;
      setLastResult(data as ImportResult);
      toast.success(`${(data as ImportResult).imported} leads importados`);
    } catch (e: any) { toast.error('Erro: ' + e.message); }
    finally { setRunning(false); }
  };

  const filtered = useMemo(() => {
    if (!lastResult?.leads) return [];
    if (!search.trim()) return lastResult.leads;
    const q = search.toLowerCase();
    return lastResult.leads.filter(l => l.name.toLowerCase().includes(q) || l.phone.includes(q));
  }, [lastResult?.leads, search]);

  const rate = lastResult && lastResult.total > 0 ? Math.round((lastResult.imported / lastResult.total) * 100) : 0;

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
            Importar Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Facebook Ads → Google Sheets → Acium CRM</p>
        </div>
        {lastResult && <Badge variant="secondary">{lastResult.imported} leads importados</Badge>}
      </div>

      {/* ── TWO CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Card — Config */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              Configuração da Planilha
              {urlOk
                ? <Badge className="bg-emerald-600 text-white border-0 text-[10px]">Configurada ✓</Badge>
                : <Badge variant="destructive" className="text-[10px]">Não configurada</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">URL do Google Sheets</Label>
              <div className="flex gap-1.5">
                <Input placeholder="https://docs.google.com/spreadsheets/d/..." value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} className="flex-1 text-xs" />
                {sheetUrl && (
                  <Button variant="outline" size="icon" className="shrink-0" asChild>
                    <a href={sheetUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                  </Button>
                )}
              </div>
            </div>
            <Button onClick={saveUrl} disabled={savingUrl} size="sm" className="w-full">
              {savingUrl ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Salvar URL
            </Button>
            <p className="text-[10px] text-muted-foreground">Compartilhe a planilha como "Qualquer pessoa com o link pode ver".</p>
          </CardContent>
        </Card>

        {/* Card — Schedule + metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Agendamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Importação automática todo dia às 08:00 (Brasília)</p>

            <Button onClick={runImport} disabled={running || !urlOk} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" size="sm">
              {running ? <><RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />Importando…</> : <><Play className="w-3.5 h-3.5 mr-1.5" />Importar agora</>}
            </Button>

            {lastResult && (
              <>
                <p className="text-[10px] text-muted-foreground text-center">Última execução: {fmtDate(lastResult.ran_at)}</p>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="rounded-md border p-2 text-center">
                    <Users className="w-3 h-3 mx-auto mb-0.5 text-muted-foreground" />
                    <p className="text-lg font-bold">{lastResult.total}</p>
                    <p className="text-[9px] text-muted-foreground">Total</p>
                  </div>
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-center">
                    <CheckCircle2 className="w-3 h-3 mx-auto mb-0.5 text-emerald-500" />
                    <p className="text-lg font-bold text-emerald-500">{lastResult.imported}</p>
                    <p className="text-[9px] text-emerald-500/70">Importados</p>
                  </div>
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-center">
                    <AlertTriangle className="w-3 h-3 mx-auto mb-0.5 text-amber-500" />
                    <p className="text-lg font-bold text-amber-500">{lastResult.skipped}</p>
                    <p className="text-[9px] text-amber-500/70">Ignorados</p>
                  </div>
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-center">
                    <XCircle className="w-3 h-3 mx-auto mb-0.5 text-destructive" />
                    <p className="text-lg font-bold text-destructive">{lastResult.errors}</p>
                    <p className="text-[9px] text-destructive/70">Erros</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Sucesso</span>
                    <span className="font-medium">{rate}%</span>
                  </div>
                  <Progress value={rate} className="h-1.5" />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── LEADS TABLE ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Leads Importados
              {lastResult?.leads && <Badge variant="outline" className="text-[10px]">{lastResult.leads.length}</Badge>}
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Buscar nome ou telefone…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {(!lastResult?.leads || lastResult.leads.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Inbox className="w-10 h-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Nenhum lead importado ainda</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Configure a planilha e clique em "Importar agora".</p>
            </div>
          ) : (
            <div className="overflow-x-auto" style={{ maxHeight: 500, overflowY: 'auto' }}>
              <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs" style={{ width: '40%' }}>Lead</TableHead>
                    <TableHead className="text-xs" style={{ width: '30%' }}>Campanha</TableHead>
                    <TableHead className="text-xs" style={{ width: '20%' }}>Intenção</TableHead>
                    <TableHead className="text-xs text-right" style={{ width: '10%' }}>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lead, i) => (
                    <TableRow key={`${lead.phone}-${i}`} className="group">
                      <TableCell className="py-2 overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full ${avatarColor(lead.name)} text-white flex items-center justify-center text-[10px] font-semibold shrink-0`}>
                            {lead.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{lead.name}</p>
                            <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-emerald-500 transition-colors">
                              +{lead.phone}
                            </a>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 overflow-hidden">
                        {lead.campaign ? (
                          <p className="text-xs truncate" title={lead.campaign}>{campaignShort(lead.campaign)}</p>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                        {lead.ad_name && (
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={lead.ad_name}>
                            {lead.ad_name.length > 20 ? lead.ad_name.slice(0, 20) + '…' : lead.ad_name}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        {intentBadge(lead.when || lead.intent)}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                          <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── LOG ── */}
      {lastResult?.details && lastResult.details.length > 0 && (
        <Collapsible open={logOpen} onOpenChange={setLogOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">Ver log detalhado <Badge variant="outline" className="text-[10px]">{lastResult.details.length}</Badge></span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${logOpen ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-2">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(lastResult.details.join('\n')); toast.success('Log copiado!'); }} className="text-xs h-7">
                    <Copy className="w-3 h-3 mr-1" /> Copiar
                  </Button>
                </div>
                <ScrollArea className="h-[200px] rounded-md border bg-muted/20 p-3">
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {lastResult.details.map((line, i) => <p key={i} className={logColor(line)}>{line}</p>)}
                  </div>
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* ── CRON ── */}
      <Collapsible open={cronOpen} onOpenChange={setCronOpen}>
        <Card className="border-dashed">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                Como ativar agendamento automático
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${cronOpen ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <p className="text-xs text-muted-foreground">
                Ative <Badge variant="secondary">pg_cron</Badge> e <Badge variant="secondary">pg_net</Badge> no Supabase e execute o SQL abaixo.
              </p>
              <div className="relative">
                <ScrollArea className="h-40 rounded-md border bg-muted/30 p-4">
                  <pre className="text-xs font-mono whitespace-pre">{CRON_SQL}</pre>
                </ScrollArea>
                <Button variant="outline" size="icon" className="absolute top-2 right-4 h-7 w-7" onClick={() => { navigator.clipboard.writeText(CRON_SQL); toast.success('SQL copiado!'); }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                <code>0 11 * * *</code> = 08:00 Brasília (UTC-3).
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};

export default ImportarLeads;
