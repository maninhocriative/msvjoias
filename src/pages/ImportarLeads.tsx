import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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
  Copy,
  ChevronDown,
  Search,
  MessageCircle,
  Inbox,
  Sparkles,
  Send,
  Filter,
  Target,
  Clock3,
  Layers3,
  Megaphone,
  Flame,
  UserCheck,
  CircleDot,
} from 'lucide-react';

/* ── Types ── */
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

type LeadMarketingStatus =
  | 'novo'
  | 'frio'
  | 'quente'
  | 'qualificado'
  | 'comprador'
  | 'sem_interesse'
  | 'perdido';

type FollowupQueue =
  | 'none'
  | 'followup_imediato'
  | 'followup_24h'
  | 'followup_3dias'
  | 'followup_7dias';

type BroadcastCampaign =
  | 'none'
  | 'campanha_quentes'
  | 'campanha_nutricao'
  | 'campanha_remarketing'
  | 'campanha_oferta';

interface LeadMarketingState {
  phone: string;
  status: LeadMarketingStatus;
  in_followups: boolean;
  in_broadcasts: boolean;
  followup_queue: FollowupQueue;
  broadcast_campaign: BroadcastCampaign;
  updated_at: string;
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

const MARKETING_SETTING_KEY = 'facebook_leads_marketing_state';
const MARKETING_LOCAL_KEY = 'facebook_leads_marketing_state_local';

const INTENT_MAP: Record<string, { label: string; cls: string }> = {
  essa_semana: { label: 'Esta semana', cls: 'bg-emerald-600 text-white' },
  'essa semana': { label: 'Esta semana', cls: 'bg-emerald-600 text-white' },
  esse_mes: { label: 'Este mês', cls: 'bg-blue-600 text-white' },
  'esse_mês': { label: 'Este mês', cls: 'bg-blue-600 text-white' },
  nos_proximos_3_meses: { label: '3 meses', cls: 'bg-amber-500 text-white' },
  ainda_estou_pesquisando: {
    label: 'Pesquisando',
    cls: 'bg-muted text-muted-foreground',
  },
};

const LEAD_STATUS_OPTIONS: Array<{
  value: LeadMarketingStatus;
  label: string;
  cls: string;
}> = [
  { value: 'novo', label: 'Novo', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/20' },
  { value: 'frio', label: 'Frio', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/20' },
  { value: 'quente', label: 'Quente', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/20' },
  { value: 'qualificado', label: 'Qualificado', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  { value: 'comprador', label: 'Comprador', cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20' },
  { value: 'sem_interesse', label: 'Sem interesse', cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20' },
  { value: 'perdido', label: 'Perdido', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/20' },
];

const FOLLOWUP_QUEUE_OPTIONS: Array<{
  value: FollowupQueue;
  label: string;
}> = [
  { value: 'none', label: 'Sem fila' },
  { value: 'followup_imediato', label: 'Imediato' },
  { value: 'followup_24h', label: '24 horas' },
  { value: 'followup_3dias', label: '3 dias' },
  { value: 'followup_7dias', label: '7 dias' },
];

const BROADCAST_OPTIONS: Array<{
  value: BroadcastCampaign;
  label: string;
}> = [
  { value: 'none', label: 'Sem campanha' },
  { value: 'campanha_quentes', label: 'Leads quentes' },
  { value: 'campanha_nutricao', label: 'Nutrição' },
  { value: 'campanha_remarketing', label: 'Remarketing' },
  { value: 'campanha_oferta', label: 'Oferta especial' },
];

/* ── Helpers ── */
function normalizePhone(phone: string) {
  return (phone || '').replace(/\D/g, '');
}

function avatarColor(name: string) {
  const c = (name || 'A').charAt(0).toUpperCase();
  if ('AB'.includes(c)) return 'bg-violet-600';
  if ('CDE'.includes(c)) return 'bg-blue-600';
  if ('FGH'.includes(c)) return 'bg-emerald-600';
  if ('IJKL'.includes(c)) return 'bg-orange-500';
  if ('MNO'.includes(c)) return 'bg-pink-600';
  if ('PQRS'.includes(c)) return 'bg-cyan-600';
  if ('TUV'.includes(c)) return 'bg-red-600';
  return 'bg-amber-500';
}

function campaignShort(raw: string) {
  if (!raw) return '';
  const m = raw.match(/\[([^\]]+)\]\s*$/);
  const text = m ? m[1] : raw.replace(/^\[+|\]+$/g, '');
  return text.length > 48 ? text.slice(0, 48) + '…' : text;
}

function intentBadge(value: string) {
  if (!value) return null;
  const key = value.toLowerCase().replace(/\s+/g, '_');
  const mapped = INTENT_MAP[key] || INTENT_MAP[value.toLowerCase()];
  const label = mapped
    ? mapped.label
    : value.length > 16
      ? value.slice(0, 16) + '…'
      : value;
  const cls = mapped ? mapped.cls : 'bg-muted text-muted-foreground';

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function logColor(line: string) {
  if (line.startsWith('OK:')) return 'text-emerald-500';
  if (line.startsWith('SKIP:')) return 'text-amber-500';
  if (line.startsWith('ERRO:')) return 'text-destructive';
  return 'text-muted-foreground';
}

function getDefaultLeadMarketingState(phone: string): LeadMarketingState {
  return {
    phone: normalizePhone(phone),
    status: 'novo',
    in_followups: false,
    in_broadcasts: false,
    followup_queue: 'none',
    broadcast_campaign: 'none',
    updated_at: new Date().toISOString(),
  };
}

function parseMarketingState(rawValue?: string | null): Record<string, LeadMarketingState> {
  if (!rawValue) return {};

  try {
    const parsed = JSON.parse(rawValue);

    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).reduce(
        (acc: Record<string, LeadMarketingState>, [phoneKey, item]: any) => {
          const phone = normalizePhone(phoneKey || item?.phone || '');
          if (!phone) return acc;

          acc[phone] = {
            phone,
            status: item?.status || 'novo',
            in_followups: Boolean(item?.in_followups),
            in_broadcasts: Boolean(item?.in_broadcasts),
            followup_queue: item?.followup_queue || 'none',
            broadcast_campaign: item?.broadcast_campaign || 'none',
            updated_at: item?.updated_at || new Date().toISOString(),
          };

          return acc;
        },
        {},
      );
    }
  } catch {
    return {};
  }

  return {};
}

function getStatusMeta(status: LeadMarketingStatus) {
  return (
    LEAD_STATUS_OPTIONS.find((option) => option.value === status) ||
    LEAD_STATUS_OPTIONS[0]
  );
}

function getFollowupLabel(value: FollowupQueue) {
  return (
    FOLLOWUP_QUEUE_OPTIONS.find((item) => item.value === value)?.label || 'Sem fila'
  );
}

function getBroadcastLabel(value: BroadcastCampaign) {
  return (
    BROADCAST_OPTIONS.find((item) => item.value === value)?.label || 'Sem campanha'
  );
}

/* ── Page component ── */
const ImportarLeads = () => {
  const [sheetUrl, setSheetUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeadMarketingStatus>('all');
  const [queueFilter, setQueueFilter] = useState<
    'all' | 'followups' | 'broadcasts' | 'both' | 'without_actions'
  >('all');
  const [campaignFilter, setCampaignFilter] = useState('all');

  const [logOpen, setLogOpen] = useState(false);
  const [cronOpen, setCronOpen] = useState(false);

  const [marketingStateMap, setMarketingStateMap] = useState<Record<string, LeadMarketingState>>({});
  const [persistingMarketing, setPersistingMarketing] = useState(false);

  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<LeadMarketingStatus>('qualificado');
  const [bulkFollowupQueue, setBulkFollowupQueue] = useState<FollowupQueue>('followup_24h');
  const [bulkBroadcastCampaign, setBulkBroadcastCampaign] =
    useState<BroadcastCampaign>('campanha_nutricao');

  const urlOk = sheetUrl.trim().length > 0;

  const saveStoreSetting = async (key: string, value: string, description?: string) => {
    const { data: existing, error: existingError } = await supabase
      .from('store_settings')
      .select('id')
      .eq('key', key)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing?.id) {
      const { error } = await supabase
        .from('store_settings')
        .update({
          value,
          updated_at: new Date().toISOString(),
        })
        .eq('key', key);

      if (error) throw error;
      return;
    }

    const payload: Record<string, any> = { key, value };
    if (description) payload.description = description;

    const { error } = await supabase.from('store_settings').insert(payload);
    if (error) throw error;
  };

  const persistMarketingState = async (
    nextState: Record<string, LeadMarketingState>,
    successMessage?: string,
  ) => {
    setMarketingStateMap(nextState);
    localStorage.setItem(MARKETING_LOCAL_KEY, JSON.stringify(nextState));
    setPersistingMarketing(true);

    try {
      await saveStoreSetting(
        MARKETING_SETTING_KEY,
        JSON.stringify(nextState),
        'Ações de marketing dos leads importados',
      );

      if (successMessage) toast.success(successMessage);
    } catch (error: any) {
      toast.error(
        `Ação aplicada localmente, mas não foi possível salvar no banco: ${error.message}`,
      );
    } finally {
      setPersistingMarketing(false);
    }
  };

  const getLeadState = (phone: string): LeadMarketingState => {
    const normalized = normalizePhone(phone);
    return marketingStateMap[normalized] || getDefaultLeadMarketingState(normalized);
  };

  useEffect(() => {
    (async () => {
      try {
        const localMarketing = parseMarketingState(
          localStorage.getItem(MARKETING_LOCAL_KEY),
        );

        const { data, error } = await supabase
          .from('store_settings')
          .select('key, value')
          .in('key', [
            'facebook_leads_sheet_url',
            'facebook_leads_last_import',
            MARKETING_SETTING_KEY,
          ]);

        if (error) throw error;

        if (data) {
          const urlSetting = data.find((r) => r.key === 'facebook_leads_sheet_url');
          const lastImportSetting = data.find((r) => r.key === 'facebook_leads_last_import');
          const marketingSetting = data.find((r) => r.key === MARKETING_SETTING_KEY);

          if (urlSetting?.value) setSheetUrl(urlSetting.value);

          if (lastImportSetting?.value) {
            try {
              setLastResult(JSON.parse(lastImportSetting.value));
            } catch {
              // ignore
            }
          }

          const dbMarketing = parseMarketingState(marketingSetting?.value);
          const mergedMarketing = {
            ...localMarketing,
            ...dbMarketing,
          };

          setMarketingStateMap(mergedMarketing);
          localStorage.setItem(MARKETING_LOCAL_KEY, JSON.stringify(mergedMarketing));
        }
      } catch (e: any) {
        toast.error('Erro ao carregar: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveUrl = async () => {
    if (!sheetUrl.trim()) {
      toast.error('Cole a URL');
      return;
    }

    setSavingUrl(true);

    try {
      await saveStoreSetting(
        'facebook_leads_sheet_url',
        sheetUrl.trim(),
        'URL planilha leads Facebook',
      );
      toast.success('URL salva!');
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSavingUrl(false);
    }
  };

  const runImport = async () => {
    setRunning(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        'import-facebook-leads',
        {
          body: { sheet_url: sheetUrl || undefined },
        },
      );

      if (error) throw error;

      setLastResult(data as ImportResult);
      setSelectedPhones([]);
      toast.success(`${(data as ImportResult).imported} leads importados`);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  const leadsWithState = useMemo(() => {
    const leads = lastResult?.leads || [];
    return leads.map((lead) => ({
      ...lead,
      phone_key: normalizePhone(lead.phone),
      marketing: getLeadState(lead.phone),
    }));
  }, [lastResult?.leads, marketingStateMap]);

  const campaignOptions = useMemo(() => {
    return Array.from(
      new Set(
        leadsWithState
          .map((lead) => lead.campaign)
          .filter((campaign) => Boolean(campaign?.trim())),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [leadsWithState]);

  const filtered = useMemo(() => {
    return leadsWithState.filter((lead) => {
      const q = search.trim().toLowerCase();

      const matchesSearch =
        !q ||
        lead.name.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        lead.campaign?.toLowerCase().includes(q) ||
        lead.ad_name?.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'all' || lead.marketing.status === statusFilter;

      const matchesQueue =
        queueFilter === 'all' ||
        (queueFilter === 'followups' && lead.marketing.in_followups) ||
        (queueFilter === 'broadcasts' && lead.marketing.in_broadcasts) ||
        (queueFilter === 'both' &&
          lead.marketing.in_followups &&
          lead.marketing.in_broadcasts) ||
        (queueFilter === 'without_actions' &&
          !lead.marketing.in_followups &&
          !lead.marketing.in_broadcasts);

      const matchesCampaign =
        campaignFilter === 'all' || lead.campaign === campaignFilter;

      return matchesSearch && matchesStatus && matchesQueue && matchesCampaign;
    });
  }, [leadsWithState, search, statusFilter, queueFilter, campaignFilter]);

  const visiblePhoneKeys = useMemo(
    () => Array.from(new Set(filtered.map((lead) => lead.phone_key))),
    [filtered],
  );

  const allVisibleSelected =
    visiblePhoneKeys.length > 0 &&
    visiblePhoneKeys.every((phone) => selectedPhones.includes(phone));

  const stats = useMemo(() => {
    const leads = leadsWithState;

    return {
      totalLeads: leads.length,
      novos: leads.filter((lead) => lead.marketing.status === 'novo').length,
      quentes: leads.filter((lead) => lead.marketing.status === 'quente').length,
      qualificados: leads.filter((lead) => lead.marketing.status === 'qualificado').length,
      followups: leads.filter((lead) => lead.marketing.in_followups).length,
      broadcasts: leads.filter((lead) => lead.marketing.in_broadcasts).length,
    };
  }, [leadsWithState]);

  const rate =
    lastResult && lastResult.total > 0
      ? Math.round((lastResult.imported / lastResult.total) * 100)
      : 0;

  const togglePhoneSelection = (phone: string) => {
    const key = normalizePhone(phone);
    setSelectedPhones((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedPhones((prev) =>
        prev.filter((phone) => !visiblePhoneKeys.includes(phone)),
      );
      return;
    }

    setSelectedPhones((prev) => Array.from(new Set([...prev, ...visiblePhoneKeys])));
  };

  const updateLeadMarketing = async (
    phone: string,
    patch: Partial<LeadMarketingState>,
    successMessage?: string,
  ) => {
    const key = normalizePhone(phone);
    const current = getLeadState(key);

    const nextMap = {
      ...marketingStateMap,
      [key]: {
        ...current,
        ...patch,
        phone: key,
        updated_at: new Date().toISOString(),
      },
    };

    await persistMarketingState(nextMap, successMessage);
  };

  const applyBulkPatch = async (
    patchFactory: (current: LeadMarketingState) => LeadMarketingState,
    successMessage: string,
  ) => {
    if (selectedPhones.length === 0) return;

    const nextMap = { ...marketingStateMap };

    selectedPhones.forEach((phone) => {
      nextMap[phone] = patchFactory(getLeadState(phone));
    });

    await persistMarketingState(nextMap, successMessage);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 tracking-tight">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
            Importar Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Facebook Ads → Google Sheets → Acium CRM
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {persistingMarketing && (
            <Badge variant="outline" className="text-[11px]">
              Salvando ações...
            </Badge>
          )}
          {lastResult && (
            <Badge className="bg-emerald-600 text-white border-0">
              {lastResult.imported} leads importados
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
        <Card className="border-white/10 bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Configuração da Planilha</span>
              {urlOk ? (
                <Badge className="bg-emerald-600 text-white border-0 text-[10px]">
                  Configurada
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]">
                  Não configurada
                </Badge>
              )}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">URL do Google Sheets</Label>

              <div className="flex gap-2">
                <Input
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  className="flex-1"
                />

                {sheetUrl && (
                  <Button variant="outline" size="icon" className="shrink-0" asChild>
                    <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>

            <Button onClick={saveUrl} disabled={savingUrl} className="w-full">
              {savingUrl ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar URL
            </Button>

            <div className="rounded-2xl border border-white/5 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
              Compartilhe a planilha como "Qualquer pessoa com o link pode ver".
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Agendamento e Importação</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/5 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                Importação automática todo dia às 08:00
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Horário de Brasília
              </p>
            </div>

            <Button
              onClick={runImport}
              disabled={running || !urlOk}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {running ? (
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

            {lastResult && (
              <>
                <p className="text-xs text-muted-foreground text-center">
                  Última execução: {fmtDate(lastResult.ran_at)}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-center">
                    <Users className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{lastResult.total}</p>
                    <p className="text-[11px] text-muted-foreground">Total</p>
                  </div>

                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                    <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-emerald-500" />
                    <p className="text-2xl font-bold text-emerald-500">
                      {lastResult.imported}
                    </p>
                    <p className="text-[11px] text-emerald-500/70">Importados</p>
                  </div>

                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                    <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-amber-500" />
                    <p className="text-2xl font-bold text-amber-500">
                      {lastResult.skipped}
                    </p>
                    <p className="text-[11px] text-amber-500/70">Ignorados</p>
                  </div>

                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-center">
                    <XCircle className="w-4 h-4 mx-auto mb-1 text-destructive" />
                    <p className="text-2xl font-bold text-destructive">
                      {lastResult.errors}
                    </p>
                    <p className="text-[11px] text-destructive/70">Erros</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Taxa de sucesso</span>
                    <span className="font-medium">{rate}%</span>
                  </div>
                  <Progress value={rate} className="h-2" />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Leads
              </p>
              <p className="text-2xl font-bold">{stats.totalLeads}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-500/10 flex items-center justify-center">
              <CircleDot className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Novos
              </p>
              <p className="text-2xl font-bold">{stats.novos}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-500/10 flex items-center justify-center">
              <Flame className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Quentes
              </p>
              <p className="text-2xl font-bold text-orange-500">{stats.quentes}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Qualificados
              </p>
              <p className="text-2xl font-bold text-emerald-500">
                {stats.qualificados}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <Send className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Follow-ups
              </p>
              <p className="text-2xl font-bold text-blue-500">{stats.followups}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-fuchsia-500/10 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-fuchsia-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Disparos
              </p>
              <p className="text-2xl font-bold text-fuchsia-500">{stats.broadcasts}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-card/70">
        <CardHeader className="pb-4 space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers3 className="w-4 h-4 text-emerald-400" />
                Leads Importados
                {lastResult?.leads && (
                  <Badge variant="outline" className="text-[10px]">
                    {lastResult.leads.length}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Ajuste status, campanha e filas de marketing sem sair da importação.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[11px]">
                {filtered.length} visíveis
              </Badge>
              {selectedPhones.length > 0 && (
                <Badge className="bg-emerald-600 text-white border-0 text-[11px]">
                  {selectedPhones.length} selecionado(s)
                </Badge>
              )}
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.2fr_220px_220px_240px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, campanha ou anúncio..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10"
              />
            </div>

            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="h-10">
                <Target className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Campanha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as campanhas</SelectItem>
                {campaignOptions.map((campaign) => (
                  <SelectItem key={campaign} value={campaign}>
                    {campaignShort(campaign)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as 'all' | LeadMarketingStatus)
              }
            >
              <SelectTrigger className="h-10">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {LEAD_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={queueFilter}
              onValueChange={(value) =>
                setQueueFilter(
                  value as
                    | 'all'
                    | 'followups'
                    | 'broadcasts'
                    | 'both'
                    | 'without_actions',
                )
              }
            >
              <SelectTrigger className="h-10">
                <Sparkles className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Marketing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as filas</SelectItem>
                <SelectItem value="followups">Somente follow-ups</SelectItem>
                <SelectItem value="broadcasts">Somente disparos</SelectItem>
                <SelectItem value="both">Nos dois</SelectItem>
                <SelectItem value="without_actions">Sem ações</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedPhones.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-medium">
                    Ações em lote para {selectedPhones.length} lead(s)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ajuste em massa o status, follow-up e disparos.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={bulkStatus}
                    onValueChange={(value) =>
                      setBulkStatus(value as LeadMarketingStatus)
                    }
                  >
                    <SelectTrigger className="w-[180px] h-9 bg-background/70">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      applyBulkPatch(
                        (current) => ({
                          ...current,
                          status: bulkStatus,
                          updated_at: new Date().toISOString(),
                        }),
                        `Status atualizado para ${selectedPhones.length} lead(s).`,
                      )
                    }
                  >
                    Aplicar status
                  </Button>

                  <Select
                    value={bulkFollowupQueue}
                    onValueChange={(value) =>
                      setBulkFollowupQueue(value as FollowupQueue)
                    }
                  >
                    <SelectTrigger className="w-[180px] h-9 bg-background/70">
                      <SelectValue placeholder="Fila follow-up" />
                    </SelectTrigger>
                    <SelectContent>
                      {FOLLOWUP_QUEUE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() =>
                      applyBulkPatch(
                        (current) => ({
                          ...current,
                          in_followups: bulkFollowupQueue !== 'none',
                          followup_queue: bulkFollowupQueue,
                          updated_at: new Date().toISOString(),
                        }),
                        bulkFollowupQueue === 'none'
                          ? 'Leads removidos da fila de follow-up.'
                          : 'Leads enviados para follow-ups.',
                      )
                    }
                  >
                    {bulkFollowupQueue === 'none' ? 'Remover de Follow-ups' : 'Enviar p/ Follow-ups'}
                  </Button>

                  <Select
                    value={bulkBroadcastCampaign}
                    onValueChange={(value) =>
                      setBulkBroadcastCampaign(value as BroadcastCampaign)
                    }
                  >
                    <SelectTrigger className="w-[180px] h-9 bg-background/70">
                      <SelectValue placeholder="Campanha disparo" />
                    </SelectTrigger>
                    <SelectContent>
                      {BROADCAST_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    size="sm"
                    className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
                    onClick={() =>
                      applyBulkPatch(
                        (current) => ({
                          ...current,
                          in_broadcasts: bulkBroadcastCampaign !== 'none',
                          broadcast_campaign: bulkBroadcastCampaign,
                          updated_at: new Date().toISOString(),
                        }),
                        bulkBroadcastCampaign === 'none'
                          ? 'Leads removidos de disparos.'
                          : 'Leads adicionados à campanha de disparo.',
                      )
                    }
                  >
                    {bulkBroadcastCampaign === 'none' ? 'Remover de Disparos' : 'Adicionar a Disparos'}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPhones([])}
                  >
                    Limpar seleção
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          {!lastResult?.leads || lastResult.leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Nenhum lead importado ainda
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Configure a planilha e clique em "Importar agora".
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[640px] pr-2">
              <div className="space-y-3">
                {filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
                    <p className="text-sm font-medium text-muted-foreground">
                      Nenhum lead encontrado com os filtros atuais
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Ajuste a busca, a campanha ou os filtros de marketing.
                    </p>
                  </div>
                ) : (
                  filtered.map((lead, i) => {
                    const statusMeta = getStatusMeta(lead.marketing.status);
                    const isSelected = selectedPhones.includes(lead.phone_key);

                    return (
                      <div
                        key={`${lead.phone}-${i}`}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="flex items-start gap-4 min-w-0 flex-1">
                            <div className="pt-2">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => togglePhoneSelection(lead.phone)}
                                aria-label={`Selecionar ${lead.name}`}
                              />
                            </div>

                            <div
                              className={`w-11 h-11 rounded-full ${avatarColor(lead.name)} text-white flex items-center justify-center text-[11px] font-semibold shrink-0`}
                            >
                              {lead.name.substring(0, 2).toUpperCase()}
                            </div>

                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="min-w-0">
                                <p className="text-base font-semibold truncate">{lead.name}</p>

                                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                                  <a
                                    href={`https://wa.me/${lead.phone_key}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-emerald-500 transition-colors"
                                  >
                                    +{lead.phone_key}
                                  </a>

                                  {lead.imported_at && (
                                    <span className="inline-flex items-center gap-1">
                                      <Clock3 className="w-3 h-3" />
                                      {fmtDate(lead.imported_at)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="grid gap-3 lg:grid-cols-[1.1fr_0.7fr]">
                                <div className="rounded-xl border border-white/8 bg-muted/15 p-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                    Origem
                                  </p>
                                  <p
                                    className="text-sm font-medium mt-2 truncate"
                                    title={lead.campaign}
                                  >
                                    {lead.campaign ? campaignShort(lead.campaign) : 'Sem campanha'}
                                  </p>

                                  {lead.ad_name && (
                                    <p
                                      className="text-xs text-muted-foreground truncate mt-1"
                                      title={lead.ad_name}
                                    >
                                      {lead.ad_name}
                                    </p>
                                  )}

                                  <div className="flex gap-2 mt-3 flex-wrap">
                                    {lead.platform && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {lead.platform}
                                      </Badge>
                                    )}
                                    {lead.form && (
                                      <Badge variant="secondary" className="text-[10px]">
                                        {lead.form}
                                      </Badge>
                                    )}
                                    {intentBadge(lead.when || lead.intent)}
                                  </div>
                                </div>

                                <div className="rounded-xl border border-white/8 bg-muted/15 p-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                    Situação atual
                                  </p>

                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span
                                      className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusMeta.cls}`}
                                    >
                                      {statusMeta.label}
                                    </span>

                                    {lead.marketing.in_followups && (
                                      <Badge className="bg-blue-600 text-white border-0 text-[10px]">
                                        {getFollowupLabel(lead.marketing.followup_queue)}
                                      </Badge>
                                    )}

                                    {lead.marketing.in_broadcasts && (
                                      <Badge className="bg-fuchsia-600 text-white border-0 text-[10px]">
                                        {getBroadcastLabel(lead.marketing.broadcast_campaign)}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="xl:w-[420px] shrink-0 space-y-3">
                            <div className="rounded-xl border border-white/8 bg-muted/15 p-3">
                              <Label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                Status do lead
                              </Label>

                              <Select
                                value={lead.marketing.status}
                                onValueChange={(value) =>
                                  updateLeadMarketing(
                                    lead.phone,
                                    { status: value as LeadMarketingStatus },
                                    'Status do lead atualizado.',
                                  )
                                }
                              >
                                <SelectTrigger className="mt-2 h-10">
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  {LEAD_STATUS_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2 items-stretch">
                              <div className="rounded-xl border border-blue-500/10 bg-blue-500/[0.04] p-3 h-full">
                                <div className="flex h-full flex-col">
                                  <div className="min-h-[52px]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-blue-300/80">
                                      Follow-ups
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Escolha a fila e envie.
                                    </p>
                                  </div>

                                  <div className="mt-3">
                                    <Select
                                      value={lead.marketing.followup_queue}
                                      onValueChange={(value) =>
                                        updateLeadMarketing(lead.phone, {
                                          followup_queue: value as FollowupQueue,
                                          in_followups:
                                            value !== 'none'
                                              ? lead.marketing.in_followups
                                              : false,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-10 w-full bg-background/70">
                                        <SelectValue placeholder="Fila de follow-up" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {FOLLOWUP_QUEUE_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <Button
                                    className="mt-3 h-10 w-full justify-center bg-blue-600 hover:bg-blue-700 text-white text-center leading-tight px-3"
                                    size="sm"
                                    onClick={() =>
                                      updateLeadMarketing(
                                        lead.phone,
                                        {
                                          in_followups:
                                            lead.marketing.followup_queue !== 'none',
                                          followup_queue: lead.marketing.followup_queue,
                                        },
                                        lead.marketing.followup_queue === 'none'
                                          ? 'Lead removido de follow-ups.'
                                          : 'Lead enviado para a fila de follow-ups.',
                                      )
                                    }
                                  >
                                    <Send className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                                    <span className="truncate">
                                      {lead.marketing.followup_queue === 'none'
                                        ? 'Remover da fila'
                                        : 'Enviar para Follow-ups'}
                                    </span>
                                  </Button>
                                </div>
                              </div>

                              <div className="rounded-xl border border-fuchsia-500/10 bg-fuchsia-500/[0.04] p-3 h-full">
                                <div className="flex h-full flex-col">
                                  <div className="min-h-[52px]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-fuchsia-300/80">
                                      Disparos
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Escolha a campanha e adicione.
                                    </p>
                                  </div>

                                  <div className="mt-3">
                                    <Select
                                      value={lead.marketing.broadcast_campaign}
                                      onValueChange={(value) =>
                                        updateLeadMarketing(lead.phone, {
                                          broadcast_campaign: value as BroadcastCampaign,
                                          in_broadcasts:
                                            value !== 'none'
                                              ? lead.marketing.in_broadcasts
                                              : false,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-10 w-full bg-background/70">
                                        <SelectValue placeholder="Campanha de disparo" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {BROADCAST_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <Button
                                    className="mt-3 h-10 w-full justify-center bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-center leading-tight px-3"
                                    size="sm"
                                    onClick={() =>
                                      updateLeadMarketing(
                                        lead.phone,
                                        {
                                          in_broadcasts:
                                            lead.marketing.broadcast_campaign !== 'none',
                                          broadcast_campaign:
                                            lead.marketing.broadcast_campaign,
                                        },
                                        lead.marketing.broadcast_campaign === 'none'
                                          ? 'Lead removido de disparos.'
                                          : 'Lead adicionado à campanha de disparo.',
                                      )
                                    }
                                  >
                                    <Megaphone className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                                    <span className="truncate">
                                      {lead.marketing.broadcast_campaign === 'none'
                                        ? 'Remover de Disparos'
                                        : 'Adicionar a Disparos'}
                                    </span>
                                  </Button>
                                </div>
                              </div>
                            </div>

                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                asChild
                              >
                                <a
                                  href={`https://wa.me/${lead.phone_key}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <MessageCircle className="w-4 h-4 text-emerald-500" />
                                </a>
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {lastResult?.details && lastResult.details.length > 0 && (
        <Collapsible open={logOpen} onOpenChange={setLogOpen}>
          <Card className="border-white/10 bg-card/70">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    Ver log detalhado
                    <Badge variant="outline" className="text-[10px]">
                      {lastResult.details.length}
                    </Badge>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform ${
                      logOpen ? 'rotate-180' : ''
                    }`}
                  />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="pt-0 space-y-3">
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(lastResult.details.join('\n'));
                      toast.success('Log copiado!');
                    }}
                    className="text-xs"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copiar
                  </Button>
                </div>

                <ScrollArea className="h-[220px] rounded-2xl border bg-muted/20 p-4">
                  <div className="space-y-1 font-mono text-[11px]">
                    {lastResult.details.map((line, i) => (
                      <p key={i} className={logColor(line)}>
                        {line}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <Collapsible open={cronOpen} onOpenChange={setCronOpen}>
        <Card className="border-dashed border-white/15 bg-card/70">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                Como ativar agendamento automático
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    cronOpen ? 'rotate-180' : ''
                  }`}
                />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <p className="text-xs text-muted-foreground">
                Ative <Badge variant="secondary">pg_cron</Badge> e{' '}
                <Badge variant="secondary">pg_net</Badge> no Supabase e execute o SQL abaixo.
              </p>

              <div className="relative">
                <ScrollArea className="h-40 rounded-2xl border bg-muted/30 p-4">
                  <pre className="text-xs font-mono whitespace-pre">{CRON_SQL}</pre>
                </ScrollArea>

                <Button
                  variant="outline"
                  size="icon"
                  className="absolute top-2 right-4 h-8 w-8"
                  onClick={() => {
                    navigator.clipboard.writeText(CRON_SQL);
                    toast.success('SQL copiado!');
                  }}
                >
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
