import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RefreshCw,
  MessageCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  Send,
  Timer,
  History,
  Search,
  Sparkles,
  Filter,
  Bot,
  Megaphone,
  CalendarClock,
  ArrowUpRight,
  Phone,
  UserRound,
  Clock3,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/* ── Types ── */
interface ConversationRow {
  id: string;
  phone: string;
  status: string;
  followup_count: number;
  last_message_at: string | null;
  created_at: string | null;
}

interface Message {
  id: string;
  role: string;
  message: string;
  created_at: string | null;
  node: string | null;
}

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

type FollowupSource = 'aline' | 'marketing' | 'hybrid';
type FollowupStateKey = 'ready' | 'waiting' | 'completed';

interface FollowupItem {
  id: string;
  phone: string;
  name: string | null;
  campaign: string | null;
  ad_name: string | null;
  platform: string | null;
  form: string | null;
  imported_at: string | null;
  conversation_id: string | null;
  conversation_status: string | null;
  followup_count: number;
  last_message_at: string | null;
  created_at: string | null;
  marketing_status: LeadMarketingStatus;
  marketing_queue: FollowupQueue;
  in_followups: boolean;
  in_broadcasts: boolean;
  broadcast_campaign: BroadcastCampaign;
  source: FollowupSource;
}

interface FollowupStateMeta {
  key: FollowupStateKey;
  label: string;
  helper: string;
  className: string;
  icon: any;
}

/* ── Constants ── */
const LEGACY_INTERVALS = [
  { minutes: 3, label: '3 min' },
  { minutes: 10, label: '10 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 120, label: '2 horas' },
  { minutes: 360, label: '6 horas' },
];

const MARKETING_QUEUE_MINUTES: Record<Exclude<FollowupQueue, 'none'>, number> = {
  followup_imediato: 0,
  followup_24h: 24 * 60,
  followup_3dias: 3 * 24 * 60,
  followup_7dias: 7 * 24 * 60,
};

const MARKETING_SETTING_KEY = 'facebook_leads_marketing_state';
const MARKETING_LOCAL_KEY = 'facebook_leads_marketing_state_local';

const FOLLOWUP_QUEUE_OPTIONS: Array<{ value: FollowupQueue; label: string }> = [
  { value: 'none', label: 'Sem fila de marketing' },
  { value: 'followup_imediato', label: 'Imediato' },
  { value: 'followup_24h', label: '24 horas' },
  { value: 'followup_3dias', label: '3 dias' },
  { value: 'followup_7dias', label: '7 dias' },
];

/* ── Helpers ── */
function safeReadLocalStorage(key: string) {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLocalStorage(key: string, value: string) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function normalizePhone(phone: string) {
  return (phone || '').replace(/\D/g, '');
}

function buildChatHref(phone: string) {
  return `/chat?phone=${encodeURIComponent(normalizePhone(phone))}`;
}

function formatPhone(phone: string) {
  const cleaned = normalizePhone(phone);

  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }

  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }

  return phone;
}

function campaignShort(raw: string) {
  if (!raw) return '';
  const match = raw.match(/\[([^\]]+)\]\s*$/);
  const text = match ? match[1] : raw.replace(/^\[+|\]+$/g, '');
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
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

function getDefaultMarketingState(phone: string): LeadMarketingState {
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

function getFollowupQueueLabel(value: FollowupQueue) {
  return (
    FOLLOWUP_QUEUE_OPTIONS.find((item) => item.value === value)?.label ||
    'Sem fila de marketing'
  );
}

function getSourceMeta(source: FollowupSource) {
  if (source === 'hybrid') {
    return {
      label: 'Importado + Aline',
      className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
      icon: Sparkles,
    };
  }

  if (source === 'marketing') {
    return {
      label: 'Importado',
      className: 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/20',
      icon: Megaphone,
    };
  }

  return {
    label: 'Aline',
    className: 'bg-blue-500/15 text-blue-300 border border-blue-500/20',
    icon: Bot,
  };
}

function getLeadStatusMeta(status: LeadMarketingStatus) {
  const map: Record<LeadMarketingStatus, { label: string; className: string }> = {
    novo: {
      label: 'Novo',
      className: 'bg-slate-500/15 text-slate-300 border border-slate-500/20',
    },
    frio: {
      label: 'Frio',
      className: 'bg-blue-500/15 text-blue-300 border border-blue-500/20',
    },
    quente: {
      label: 'Quente',
      className: 'bg-orange-500/15 text-orange-300 border border-orange-500/20',
    },
    qualificado: {
      label: 'Qualificado',
      className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
    },
    comprador: {
      label: 'Comprador',
      className: 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/20',
    },
    sem_interesse: {
      label: 'Sem interesse',
      className: 'bg-zinc-500/15 text-zinc-300 border border-zinc-500/20',
    },
    perdido: {
      label: 'Perdido',
      className: 'bg-rose-500/15 text-rose-300 border border-rose-500/20',
    },
  };

  return map[status];
}

function getRelativeDate(date?: string | null) {
  if (!date) return '-';

  try {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: ptBR,
    });
  } catch {
    return '-';
  }
}

function formatRemainingMinutes(minutes: number) {
  if (minutes <= 1) return '1 min';
  if (minutes < 60) return `${Math.ceil(minutes)} min`;
  if (minutes < 1440) return `${Math.ceil(minutes / 60)} h`;
  return `${Math.ceil(minutes / 1440)} d`;
}

function getFollowupState(item: FollowupItem): FollowupStateMeta {
  if (
    item.marketing_status === 'comprador' ||
    item.marketing_status === 'perdido' ||
    item.marketing_status === 'sem_interesse'
  ) {
    return {
      key: 'completed',
      label: 'Encerrado',
      helper: 'Status do lead finalizado',
      className: 'bg-zinc-500/15 text-zinc-300 border border-zinc-500/20',
      icon: CheckCircle2,
    };
  }

  if (item.followup_count >= 5) {
    return {
      key: 'completed',
      label: 'Concluído',
      helper: 'Fluxo automático finalizado',
      className: 'bg-zinc-500/15 text-zinc-300 border border-zinc-500/20',
      icon: CheckCircle2,
    };
  }

  if (item.in_followups && item.marketing_queue !== 'none') {
    const delay = MARKETING_QUEUE_MINUTES[item.marketing_queue];
    const referenceDate = item.last_message_at || item.imported_at || item.created_at;

    if (delay === 0) {
      return {
        key: 'ready',
        label: 'Pronto para acionar',
        helper: getFollowupQueueLabel(item.marketing_queue),
        className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
        icon: Send,
      };
    }

    if (!referenceDate) {
      return {
        key: 'waiting',
        label: 'Aguardando janela',
        helper: getFollowupQueueLabel(item.marketing_queue),
        className: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
        icon: Timer,
      };
    }

    const elapsed = (Date.now() - new Date(referenceDate).getTime()) / 60000;

    if (elapsed >= delay) {
      return {
        key: 'ready',
        label: 'Pronto para acionar',
        helper: getFollowupQueueLabel(item.marketing_queue),
        className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
        icon: Send,
      };
    }

    return {
      key: 'waiting',
      label: `${formatRemainingMinutes(delay - elapsed)} restantes`,
      helper: getFollowupQueueLabel(item.marketing_queue),
      className: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
      icon: Timer,
    };
  }

  const nextFollowup = LEGACY_INTERVALS[item.followup_count];

  if (!nextFollowup) {
    return {
      key: 'completed',
      label: 'Concluído',
      helper: 'Sem mais follow-ups',
      className: 'bg-zinc-500/15 text-zinc-300 border border-zinc-500/20',
      icon: CheckCircle2,
    };
  }

  if (!item.last_message_at) {
    return {
      key: 'waiting',
      label: `Aguardando ${nextFollowup.label}`,
      helper: 'Fluxo automático da Aline',
      className: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
      icon: Clock,
    };
  }

  const elapsed = (Date.now() - new Date(item.last_message_at).getTime()) / 60000;

  if (elapsed >= nextFollowup.minutes) {
    return {
      key: 'ready',
      label: 'Pronto para enviar',
      helper: 'Fluxo automático da Aline',
      className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
      icon: Send,
    };
  }

  return {
    key: 'waiting',
    label: `${formatRemainingMinutes(nextFollowup.minutes - elapsed)} restantes`,
    helper: 'Fluxo automático da Aline',
    className: 'bg-blue-500/15 text-blue-300 border border-blue-500/20',
    icon: Timer,
  };
}

/* ── Page ── */
export default function FollowupMonitor() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [marketingStateMap, setMarketingStateMap] = useState<
    Record<string, LeadMarketingState>
  >({});
  const [importedLeads, setImportedLeads] = useState<LeadData[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [persistingMarketing, setPersistingMarketing] = useState(false);

  const [selectedItem, setSelectedItem] = useState<FollowupItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | FollowupSource>('all');
  const [stateFilter, setStateFilter] = useState<'all' | FollowupStateKey>('all');
  const [queueFilter, setQueueFilter] = useState<
    'all' | 'legacy' | Exclude<FollowupQueue, 'none'>
  >('all');

  const { toast } = useToast();

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
    safeWriteLocalStorage(MARKETING_LOCAL_KEY, JSON.stringify(nextState));
    setPersistingMarketing(true);

    try {
      await saveStoreSetting(
        MARKETING_SETTING_KEY,
        JSON.stringify(nextState),
        'Ações de marketing dos leads importados',
      );

      if (successMessage) {
        toast({
          title: 'Atualizado',
          description: successMessage,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Aviso',
        description: `Ação salva localmente, mas não foi possível persistir no banco: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setPersistingMarketing(false);
    }
  };

  const getLeadState = (phone: string): LeadMarketingState => {
    const normalized = normalizePhone(phone);
    return marketingStateMap[normalized] || getDefaultMarketingState(normalized);
  };

  const fetchData = async () => {
    try {
      const localMarketing = parseMarketingState(
        safeReadLocalStorage(MARKETING_LOCAL_KEY),
      );

      const [
        { data: conversationsData, error: conversationsError },
        { data: settingsData, error: settingsError },
      ] = await Promise.all([
        supabase
          .from('aline_conversations')
          .select('*')
          .order('last_message_at', { ascending: false })
          .limit(300),
        supabase
          .from('store_settings')
          .select('key, value')
          .in('key', [MARKETING_SETTING_KEY, 'facebook_leads_last_import']),
      ]);

      if (conversationsError) throw conversationsError;
      if (settingsError) throw settingsError;

      const marketingSetting = settingsData?.find(
        (row) => row.key === MARKETING_SETTING_KEY,
      );
      const importSetting = settingsData?.find(
        (row) => row.key === 'facebook_leads_last_import',
      );

      const dbMarketing = parseMarketingState(marketingSetting?.value);
      const mergedMarketing = { ...localMarketing, ...dbMarketing };

      let imported: LeadData[] = [];
      if (importSetting?.value) {
        try {
          const parsed = JSON.parse(importSetting.value) as ImportResult;
          imported = parsed?.leads || [];
        } catch {
          imported = [];
        }
      }

      setConversations((conversationsData || []) as ConversationRow[]);
      setMarketingStateMap(mergedMarketing);
      setImportedLeads(imported);
      safeWriteLocalStorage(MARKETING_LOCAL_KEY, JSON.stringify(mergedMarketing));
    } catch (error) {
      console.error('Erro ao buscar dados de follow-up:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados de follow-up',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('aline_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data || []) as Message[]);
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as mensagens',
        variant: 'destructive',
      });
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedItem?.conversation_id) {
      setMessages([]);
      return;
    }

    fetchMessages(selectedItem.conversation_id);
  }, [selectedItem?.conversation_id]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const combinedItems = useMemo(() => {
    const conversationByPhone = new Map<string, ConversationRow>();
    conversations.forEach((conversation) => {
      conversationByPhone.set(normalizePhone(conversation.phone), conversation);
    });

    const importedByPhone = new Map<string, LeadData>();
    importedLeads.forEach((lead) => {
      const phone = normalizePhone(lead.phone);
      const existing = importedByPhone.get(phone);

      if (!existing) {
        importedByPhone.set(phone, lead);
        return;
      }

      const existingTime = new Date(existing.imported_at || 0).getTime();
      const currentTime = new Date(lead.imported_at || 0).getTime();

      if (currentTime >= existingTime) {
        importedByPhone.set(phone, lead);
      }
    });

    const phones = new Set<string>();

    Object.values(marketingStateMap)
      .filter((item) => item.in_followups)
      .forEach((item) => phones.add(normalizePhone(item.phone)));

    conversations.forEach((conversation) => {
      if (conversation.status === 'active' || (conversation.followup_count || 0) > 0) {
        phones.add(normalizePhone(conversation.phone));
      }
    });

    const items = Array.from(phones).map((phone) => {
      const marketing = getLeadState(phone);
      const conversation = conversationByPhone.get(phone);
      const imported = importedByPhone.get(phone);

      let source: FollowupSource = 'marketing';
      if (conversation && marketing.in_followups) source = 'hybrid';
      else if (conversation) source = 'aline';

      return {
        id: conversation?.id || `lead-${phone}`,
        phone,
        name: imported?.name || null,
        campaign: imported?.campaign || null,
        ad_name: imported?.ad_name || null,
        platform: imported?.platform || null,
        form: imported?.form || null,
        imported_at: imported?.imported_at || null,
        conversation_id: conversation?.id || null,
        conversation_status: conversation?.status || null,
        followup_count: Number(conversation?.followup_count || 0),
        last_message_at: conversation?.last_message_at || null,
        created_at: conversation?.created_at || imported?.imported_at || null,
        marketing_status: marketing.status,
        marketing_queue: marketing.followup_queue,
        in_followups: marketing.in_followups || Boolean(conversation),
        in_broadcasts: marketing.in_broadcasts,
        broadcast_campaign: marketing.broadcast_campaign,
        source,
      } as FollowupItem;
    });

    return items.sort((a, b) => {
      const stateA = getFollowupState(a).key;
      const stateB = getFollowupState(b).key;

      const priority: Record<FollowupStateKey, number> = {
        ready: 0,
        waiting: 1,
        completed: 2,
      };

      if (priority[stateA] !== priority[stateB]) {
        return priority[stateA] - priority[stateB];
      }

      const dateA = new Date(a.last_message_at || a.imported_at || a.created_at || 0).getTime();
      const dateB = new Date(b.last_message_at || b.imported_at || b.created_at || 0).getTime();

      return dateB - dateA;
    });
  }, [conversations, importedLeads, marketingStateMap]);

  const filteredItems = useMemo(() => {
    return combinedItems.filter((item) => {
      const q = search.trim().toLowerCase();
      const followupState = getFollowupState(item);

      const matchesSearch =
        !q ||
        item.phone.includes(q) ||
        (item.name || '').toLowerCase().includes(q) ||
        (item.campaign || '').toLowerCase().includes(q) ||
        (item.ad_name || '').toLowerCase().includes(q);

      const matchesSource =
        sourceFilter === 'all' || item.source === sourceFilter;

      const matchesState =
        stateFilter === 'all' || followupState.key === stateFilter;

      const matchesQueue =
        queueFilter === 'all' ||
        (queueFilter === 'legacy' && item.marketing_queue === 'none') ||
        item.marketing_queue === queueFilter;

      return matchesSearch && matchesSource && matchesState && matchesQueue;
    });
  }, [combinedItems, search, sourceFilter, stateFilter, queueFilter]);

  const stats = useMemo(() => {
    const items = combinedItems;
    const ready = items.filter((item) => getFollowupState(item).key === 'ready').length;
    const waiting = items.filter((item) => getFollowupState(item).key === 'waiting').length;
    const completed = items.filter((item) => getFollowupState(item).key === 'completed').length;
    const importedOnly = items.filter((item) => item.source === 'marketing').length;

    return {
      total: items.length,
      ready,
      waiting,
      completed,
      importedOnly,
    };
  }, [combinedItems]);

  const updateFollowupQueue = async (
    item: FollowupItem,
    queue: FollowupQueue,
    successMessage?: string,
  ) => {
    const current = getLeadState(item.phone);

    const nextState = {
      ...marketingStateMap,
      [item.phone]: {
        ...current,
        phone: item.phone,
        in_followups: queue !== 'none',
        followup_queue: queue,
        updated_at: new Date().toISOString(),
      },
    };

    await persistMarketingState(nextState, successMessage);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monitor de Follow-ups</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe a fila de follow-ups da Aline e os leads enviados pela importação.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {persistingMarketing && (
            <Badge variant="outline" className="text-[11px]">
              Salvando ajustes...
            </Badge>
          )}

          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center">
              <Users className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Na fila
              </p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <Send className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Prontos
              </p>
              <p className="text-2xl font-bold text-emerald-500">{stats.ready}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <Timer className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Aguardando
              </p>
              <p className="text-2xl font-bold text-amber-500">{stats.waiting}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-fuchsia-500/10 flex items-center justify-center">
              <Megaphone className="h-5 w-5 text-fuchsia-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Importados
              </p>
              <p className="text-2xl font-bold text-fuchsia-500">{stats.importedOnly}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/70">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-zinc-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-zinc-400" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Concluídos
              </p>
              <p className="text-2xl font-bold text-zinc-400">{stats.completed}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-card/70">
        <CardHeader className="space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Leads com Follow-up
            </CardTitle>

            <Badge variant="secondary" className="text-[11px]">
              {filteredItems.length} visíveis
            </Badge>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.2fr_220px_220px_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, campanha ou anúncio..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              value={sourceFilter}
              onValueChange={(value) => setSourceFilter(value as 'all' | FollowupSource)}
            >
              <SelectTrigger>
                <UserRound className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                <SelectItem value="aline">Somente Aline</SelectItem>
                <SelectItem value="marketing">Somente importados</SelectItem>
                <SelectItem value="hybrid">Importado + Aline</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={stateFilter}
              onValueChange={(value) =>
                setStateFilter(value as 'all' | FollowupStateKey)
              }
            >
              <SelectTrigger>
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as situações</SelectItem>
                <SelectItem value="ready">Prontos</SelectItem>
                <SelectItem value="waiting">Aguardando</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={queueFilter}
              onValueChange={(value) =>
                setQueueFilter(
                  value as 'all' | 'legacy' | Exclude<FollowupQueue, 'none'>,
                )
              }
            >
              <SelectTrigger>
                <CalendarClock className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Fila" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as filas</SelectItem>
                <SelectItem value="legacy">Fluxo Aline</SelectItem>
                <SelectItem value="followup_imediato">Imediato</SelectItem>
                <SelectItem value="followup_24h">24 horas</SelectItem>
                <SelectItem value="followup_3dias">3 dias</SelectItem>
                <SelectItem value="followup_7dias">7 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Nenhum lead encontrado
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Ajuste os filtros ou envie leads para follow-up na página de importação.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[660px] pr-2">
              <div className="space-y-3">
                {filteredItems.map((item) => {
                  const followupState = getFollowupState(item);
                  const statusMeta = getLeadStatusMeta(item.marketing_status);
                  const sourceMeta = getSourceMeta(item.source);
                  const StateIcon = followupState.icon;
                  const SourceIcon = sourceMeta.icon;

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-semibold text-foreground">
                                  {item.name || formatPhone(item.phone)}
                                </p>

                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${sourceMeta.className}`}
                                >
                                  <SourceIcon className="w-3 h-3" />
                                  {sourceMeta.label}
                                </span>

                                <span
                                  className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${statusMeta.className}`}
                                >
                                  {statusMeta.label}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="w-3.5 h-3.5" />
                                  {formatPhone(item.phone)}
                                </span>

                                <span className="inline-flex items-center gap-1">
                                  <Clock3 className="w-3.5 h-3.5" />
                                  Última atividade{' '}
                                  {getRelativeDate(item.last_message_at || item.imported_at || item.created_at)}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${followupState.className}`}
                              >
                                <StateIcon className="w-3.5 h-3.5" />
                                {followupState.label}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-3 lg:grid-cols-[1.1fr_0.7fr_0.7fr]">
                            <div className="rounded-xl border border-white/8 bg-muted/15 p-3">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                Origem
                              </p>

                              <p className="text-sm font-medium mt-2 truncate">
                                {item.campaign ? campaignShort(item.campaign) : 'Sem campanha'}
                              </p>

                              {item.ad_name && (
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                  {item.ad_name}
                                </p>
                              )}

                              <div className="flex flex-wrap gap-2 mt-3">
                                {item.platform && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {item.platform}
                                  </Badge>
                                )}
                                {item.form && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {item.form}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="rounded-xl border border-white/8 bg-muted/15 p-3">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                Fluxo
                              </p>

                              <p className="text-sm font-medium mt-2">
                                {item.marketing_queue !== 'none'
                                  ? getFollowupQueueLabel(item.marketing_queue)
                                  : 'Fluxo automático da Aline'}
                              </p>

                              <p className="text-xs text-muted-foreground mt-1">
                                {followupState.helper}
                              </p>

                              <div className="flex items-center gap-2 mt-3">
                                <span className="text-sm font-semibold">
                                  {item.followup_count}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  / 5 enviados
                                </span>
                              </div>
                            </div>

                            <div className="rounded-xl border border-white/8 bg-muted/15 p-3">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                Disparos
                              </p>

                              <p className="text-sm font-medium mt-2">
                                {item.in_broadcasts ? 'Em campanha' : 'Sem disparo'}
                              </p>

                              <p className="text-xs text-muted-foreground mt-1">
                                {item.in_broadcasts
                                  ? item.broadcast_campaign === 'none'
                                    ? 'Campanha ainda não definida'
                                    : item.broadcast_campaign
                                  : 'Nenhuma campanha associada'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="xl:w-[320px] shrink-0 space-y-3">
                          <div className="rounded-xl border border-white/8 bg-muted/15 p-3">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                              Fila de follow-up
                            </p>

                            <Select
                              value={item.marketing_queue}
                              onValueChange={(value) =>
                                updateFollowupQueue(
                                  item,
                                  value as FollowupQueue,
                                  value === 'none'
                                    ? 'Fila de marketing removida.'
                                    : 'Fila de follow-up atualizada.',
                                )
                              }
                            >
                              <SelectTrigger className="mt-2 h-10">
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

                            <p className="text-[11px] text-muted-foreground mt-2">
                              A alteração salva automaticamente.
                            </p>
                          </div>

                          <div className="grid gap-2">
                            <Button
                              variant="outline"
                              className="w-full justify-center"
                              onClick={() => setSelectedItem(item)}
                            >
                              <History className="w-4 h-4 mr-2" />
                              {item.conversation_id ? 'Ver conversa' : 'Ver detalhes'}
                            </Button>

                            <Button variant="ghost" className="w-full justify-center" asChild>
                              <Link to={buildChatHref(item.phone)}>
                                <MessageCircle className="w-4 h-4 mr-2 text-emerald-500" />
                                Abrir no Chat
                                <ArrowUpRight className="w-4 h-4 ml-2" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              {selectedItem?.name || (selectedItem ? formatPhone(selectedItem.phone) : 'Lead')}
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{formatPhone(selectedItem.phone)}</Badge>
                <Badge variant="secondary">
                  {getSourceMeta(selectedItem.source).label}
                </Badge>
                <Badge className={getLeadStatusMeta(selectedItem.marketing_status).className}>
                  {getLeadStatusMeta(selectedItem.marketing_status).label}
                </Badge>
                <Badge variant="outline">
                  {selectedItem.marketing_queue !== 'none'
                    ? getFollowupQueueLabel(selectedItem.marketing_queue)
                    : 'Fluxo Aline'}
                </Badge>
              </div>

              {!selectedItem.conversation_id && (
                <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4">
                  <p className="text-sm font-medium text-foreground">
                    Este lead ainda não possui conversa na tabela da Aline
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ele foi enviado para follow-up pela página de importação e pode ser
                    acionado via chat interno.
                  </p>

                  {(selectedItem.campaign || selectedItem.ad_name) && (
                    <div className="mt-3 text-sm space-y-1">
                      {selectedItem.campaign && (
                        <p>
                          <span className="text-muted-foreground">Campanha:</span>{' '}
                          {selectedItem.campaign}
                        </p>
                      )}
                      {selectedItem.ad_name && (
                        <p>
                          <span className="text-muted-foreground">Anúncio:</span>{' '}
                          {selectedItem.ad_name}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <ScrollArea className="h-[56vh] pr-4">
                {selectedItem.conversation_id ? (
                  messagesLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mb-2" />
                      <p>Nenhuma mensagem encontrada</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-xl ${
                            msg.role === 'user'
                              ? 'bg-primary/10 ml-10'
                              : 'bg-muted mr-10'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">
                              {msg.role === 'user' ? 'Cliente' : 'Aline'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {msg.created_at
                                ? new Date(msg.created_at).toLocaleString('pt-BR')
                                : ''}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                          {msg.node && (
                            <span className="text-xs text-muted-foreground mt-1 block">
                              Node: {msg.node}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    Ainda não existe histórico de mensagens para este lead.
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
