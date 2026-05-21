import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BellRing, CheckCircle2, MessageCircle, Volume2, X } from 'lucide-react';
import { supabase, Conversation } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AlineHumanState = {
  phone: string;
  status: string | null;
  active_agent: string | null;
  assigned_seller_id: string | null;
  assigned_seller_name: string | null;
  assignment_reason: string | null;
  last_message_at: string | null;
};

type CrmAlert = {
  id: string;
  title: string;
  message: string;
  alert_type: string;
  phone: string | null;
  conversation_id: string | null;
  created_at: string;
  expires_at: string | null;
};

type WaitingConversation = Conversation & {
  assigned_seller_id?: string | null;
  assigned_seller_name?: string | null;
  assignment_reason?: string | null;
};

const HUMAN_STATUSES = new Set(['humano', 'venda_iniciada']);

const normalizePhone = (phone: string | null | undefined) => phone?.replace(/\D/g, '') || '';

const playAttentionSound = () => {
  try {
    type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    gain.connect(ctx.destination);

    [0, 0.18, 0.36].forEach((delay) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
      osc.connect(gain);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.12);
    });

    window.setTimeout(() => ctx.close().catch(() => undefined), 900);
  } catch (error) {
    console.warn('[GlobalHumanAttentionAlert] Audio bloqueado pelo navegador:', error);
  }
};

const formatWaitingTime = (date?: string | null) => {
  if (!date) return 'agora';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h`;
};

export default function GlobalHumanAttentionAlert() {
  const navigate = useNavigate();
  const [waiting, setWaiting] = useState<WaitingConversation[]>([]);
  const [manualAlerts, setManualAlerts] = useState<CrmAlert[]>([]);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const lastAlertKeyRef = useRef<string>('');
  const mountedRef = useRef(false);

  const loadAlerts = useCallback(async () => {
    const [{ data: conversations }, { data: alineRows }, { data: alerts }] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, contact_name, contact_number, platform, last_message, last_message_at, unread_count, lead_status, created_at, updated_at')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(150),
      supabase
        .from('aline_conversations')
        .select('phone, status, active_agent, assigned_seller_id, assigned_seller_name, assignment_reason, last_message_at')
        .or('status.eq.human_takeover,active_agent.eq.human')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(150),
      supabase
        .from('crm_alerts')
        .select('id, title, message, alert_type, phone, conversation_id, created_at, expires_at')
        .eq('active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    const alineByPhone = new Map<string, AlineHumanState>();
    (alineRows || []).forEach((row) => {
      alineByPhone.set(normalizePhone(row.phone), row as AlineHumanState);
    });

    const nextWaiting = ((conversations || []) as Conversation[])
      .map((conversation) => {
        const phone = normalizePhone(conversation.contact_number);
        const aline = alineByPhone.get(phone);
        const isHuman = HUMAN_STATUSES.has(String(conversation.lead_status || '')) || aline?.status === 'human_takeover' || aline?.active_agent === 'human';
        if (!isHuman) return null;

        return {
          ...conversation,
          assigned_seller_id: aline?.assigned_seller_id || null,
          assigned_seller_name: aline?.assigned_seller_name || null,
          assignment_reason: aline?.assignment_reason || null,
        } as WaitingConversation;
      })
      .filter(Boolean) as WaitingConversation[];

    setWaiting(nextWaiting);
    setManualAlerts((alerts || []) as CrmAlert[]);
  }, []);

  useEffect(() => {
    loadAlerts();

    const channel = supabase
      .channel('global-human-attention-alert')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, loadAlerts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aline_conversations' }, loadAlerts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_alerts' }, loadAlerts)
      .subscribe();

    const interval = window.setInterval(loadAlerts, 45000);

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [loadAlerts]);

  const unassignedWaiting = waiting.filter((conversation) => !conversation.assigned_seller_id);
  const assignedWaiting = waiting.filter((conversation) => conversation.assigned_seller_id);
  const urgent = unassignedWaiting[0] || assignedWaiting[0] || null;
  const topManualAlert = manualAlerts[0] || null;
  const alertKey = useMemo(() => {
    if (topManualAlert) return `manual:${topManualAlert.id}`;
    if (urgent) return `human:${urgent.id}:${urgent.assigned_seller_id || 'open'}:${urgent.last_message_at || urgent.updated_at || ''}`;
    return '';
  }, [topManualAlert, urgent]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      lastAlertKeyRef.current = alertKey;
      return;
    }

    if (alertKey && alertKey !== lastAlertKeyRef.current) {
      lastAlertKeyRef.current = alertKey;
      setDismissedKey(null);
      if (unassignedWaiting.length > 0 || topManualAlert) playAttentionSound();
    }
  }, [alertKey, topManualAlert, unassignedWaiting.length]);

  if (!alertKey || dismissedKey === alertKey) return null;

  const hasUnassigned = unassignedWaiting.length > 0;
  const targetPhone = topManualAlert?.phone || urgent?.contact_number || null;
  const targetConversationId = topManualAlert?.conversation_id || urgent?.id || null;
  const title = topManualAlert?.title || (
    hasUnassigned
      ? `${unassignedWaiting.length} cliente${unassignedWaiting.length > 1 ? 's' : ''} precisa${unassignedWaiting.length > 1 ? 'm' : ''} de atendimento`
      : `Atendido por ${urgent?.assigned_seller_name || 'vendedor'}`
  );
  const message = topManualAlert?.message || (
    hasUnassigned
      ? `${urgent?.contact_name || 'Lead'} aguarda um vendedor ${formatWaitingTime(urgent?.last_message_at)}. Vendedor online deve assumir agora.`
      : `${urgent?.contact_name || 'Lead'} ja esta com ${urgent?.assigned_seller_name || 'um vendedor'} na conversa.`
  );

  const handleOpenChat = () => {
    if (targetPhone) localStorage.setItem('crm_open_phone', normalizePhone(targetPhone));
    if (targetConversationId) localStorage.setItem('crm_open_conversation_id', targetConversationId);
    navigate('/chat');
  };

  return (
    <div className="fixed right-4 top-4 z-[80] w-[min(420px,calc(100vw-2rem))]">
      <div className={cn(
        'rounded-lg border text-white shadow-2xl backdrop-blur',
        hasUnassigned || topManualAlert
          ? 'animate-pulse border-emerald-400/50 bg-emerald-950/95 shadow-emerald-950/40'
          : 'border-cyan-400/40 bg-cyan-950/95 shadow-cyan-950/30'
      )}>
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 rounded-full bg-white/10 p-2">
            {topManualAlert ? <BellRing className="h-5 w-5" /> : hasUnassigned ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold uppercase tracking-wide">{title}</p>
              {(hasUnassigned || topManualAlert) && <Volume2 className="h-4 w-4 shrink-0" />}
            </div>
            <p className="mt-1 text-sm leading-5 text-white/85">{message}</p>
            {urgent?.assignment_reason && !topManualAlert && (
              <p className="mt-1 text-xs text-white/60">Motivo: {urgent.assignment_reason}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                onClick={handleOpenChat}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Abrir chat
              </Button>
              {(hasUnassigned || topManualAlert) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => playAttentionSound()}
                >
                  Testar som
                </Button>
              )}
            </div>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => setDismissedKey(alertKey)}
            aria-label="Fechar alerta"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
