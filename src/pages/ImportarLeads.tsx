import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Info,
} from 'lucide-react';

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  details: string[];
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

const ImportarLeads = () => {
  const [sheetUrl, setSheetUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(true);

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
          try {
            setLastResult(JSON.parse(resultSetting.value));
          } catch {}
        }
      }
    } catch (error: any) {
      toast.error('Erro ao carregar configurações: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveSheetUrl = async () => {
    if (!sheetUrl.trim()) {
      toast.error('Cole a URL da planilha do Google Sheets');
      return;
    }
    setSavingUrl(true);
    try {
      const { data: existing } = await supabase
        .from('store_settings')
        .select('id')
        .eq('key', 'facebook_leads_sheet_url')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('store_settings')
          .update({ value: sheetUrl.trim(), updated_at: new Date().toISOString() })
          .eq('key', 'facebook_leads_sheet_url');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('store_settings')
          .insert({ key: 'facebook_leads_sheet_url', value: sheetUrl.trim(), description: 'URL da planilha Google Sheets com leads do Facebook' });
        if (error) throw error;
      }
      toast.success('URL da planilha salva com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSavingUrl(false);
    }
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
    } finally {
      setImporting(false);
    }
  };

  const copySQL = () => {
    navigator.clipboard.writeText(CRON_SQL);
    toast.success('SQL copiado para a área de transferência!');
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  const getLineColor = (line: string) => {
    if (line.startsWith('OK:')) return 'text-emerald-600 dark:text-emerald-400';
    if (line.startsWith('SKIP:')) return 'text-amber-600 dark:text-amber-400';
    if (line.startsWith('ERRO:')) return 'text-destructive';
    return 'text-muted-foreground';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold">Importar Leads</h1>
        <p className="text-muted-foreground">
          Importação automática de leads do Facebook Ads via Google Sheets
        </p>
      </div>

      {/* Seção 1 — Configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Planilha de Leads
          </CardTitle>
          <CardDescription>
            Cole abaixo a URL da planilha do Google Sheets que contém os leads. A planilha precisa
            estar com <strong>acesso público de visualização</strong> ativado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="sheet-url">URL do Google Sheets</Label>
            <div className="flex gap-2">
              <Input
                id="sheet-url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                className="flex-1"
              />
              {sheetUrl && (
                <Button variant="outline" size="icon" asChild>
                  <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              )}
              <Button onClick={saveSheetUrl} disabled={savingUrl}>
                {savingUrl ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A planilha deve conter colunas de <strong>telefone</strong> e opcionalmente{' '}
            <strong>nome</strong> e <strong>campanha</strong>. Os nomes das colunas são detectados
            automaticamente.
          </p>
        </CardContent>
      </Card>

      {/* Seção 2 — Execução */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5" />
            Executar Importação
          </CardTitle>
          <CardDescription>
            A importação pode ser executada manualmente ou agendada para rodar automaticamente
            todos os dias às 08:00 (horário de Brasília).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runImport} disabled={importing || !sheetUrl} className="w-full sm:w-auto">
            {importing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                Importando...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Importar agora
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Seção 3 — Resultado */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Última Importação
            </CardTitle>
            <CardDescription>
              Executada em {formatDate(lastResult.ran_at)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{lastResult.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-600 dark:text-emerald-400" />
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{lastResult.imported}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Importados</p>
              </div>
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-amber-600 dark:text-amber-400" />
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{lastResult.skipped}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">Ignorados</p>
              </div>
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-center">
                <XCircle className="w-5 h-5 mx-auto mb-1 text-red-600 dark:text-red-400" />
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{lastResult.errors}</p>
                <p className="text-xs text-red-600 dark:text-red-400">Erros</p>
              </div>
            </div>

            {lastResult.details.length > 0 && (
              <div className="space-y-2">
                <Label>Log detalhado</Label>
                <ScrollArea className="h-48 rounded-md border bg-muted/30 p-3">
                  <div className="space-y-1 font-mono text-xs">
                    {lastResult.details.map((line, i) => (
                      <p key={i} className={getLineColor(line)}>
                        {line}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Seção 4 — Cron */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            Como ativar o agendamento automático
          </CardTitle>
          <CardDescription>
            Para que a importação rode automaticamente todo dia às 08h (Brasília), ative as
            extensões <Badge variant="secondary">pg_cron</Badge> e{' '}
            <Badge variant="secondary">pg_net</Badge> no Supabase e execute o SQL abaixo no SQL
            Editor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <ScrollArea className="h-44 rounded-md border bg-muted/50 p-4">
              <pre className="text-xs font-mono whitespace-pre">{CRON_SQL}</pre>
            </ScrollArea>
            <Button
              variant="outline"
              size="icon"
              className="absolute top-2 right-4"
              onClick={copySQL}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O horário <code>0 11 * * *</code> corresponde a 08:00 no fuso de Manaus (UTC-3 → 11 UTC).
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportarLeads;
