import { memo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { Bot, Crown, Glasses, UserCheck, Instagram, Sparkles } from 'lucide-react';
import type { Conversation, LeadStatus } from '@/lib/supabase';

interface CustomerProfile {
  whatsapp: string;
  name?: string;
  profile_pic_url?: string;
}

interface AlineConversation {
  id: string;
  phone: string;
  status: string;
  active_agent?: string;
  assigned_seller_id?: string;
  assigned_seller_name?: string;
  assigned_at?: string;
  current_node?: string;
  collected_data?: Record<string, any> | null;
}

interface ConversationItemProps {
  conv: Conversation;
  isSelected: boolean;
  customerProfile?: CustomerProfile;
  alineData?: AlineConversation;
  currentUserId?: string | null;
  onClick: () => void;
}

const formatTime = (date: string) => {
  if (!date) return '';

  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
};

const formatContactPresence = (conv: Conversation) => {
  const presence = String(conv.contact_presence || '').toLowerCase();

  if (presence === 'composing') return 'digitando...';
  if (presence === 'recording') return 'gravando audio...';
  if (conv.contact_is_online || presence === 'available') return 'online agora';

  const lastSeen = conv.contact_last_seen_at || conv.contact_presence_updated_at;
  if (!lastSeen) return '';

  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return '';

  const diffMins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMins < 1) return 'visto agora';
  if (diffMins < 60) return `visto ha ${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `visto ha ${diffHours}h`;

  return `visto em ${date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })}`;
};

const STATUS_CONFIG: Record<
  string,
  { dot: string; label: string; bg: string; text: string }
> = {
  novo: { dot: 'bg-slate-400', label: 'Novo', bg: 'bg-slate-500/10', text: 'text-slate-400' },
  frio: { dot: 'bg-blue-400', label: 'Frio', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  quente: { dot: 'bg-orange-400', label: 'Quente', bg: 'bg-orange-500/10', text: 'text-orange-400' },
  comprador: { dot: 'bg-emerald-400', label: 'Comprador', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  sem_interesse: { dot: 'bg-red-400', label: 'Sem interesse', bg: 'bg-red-500/10', text: 'text-red-400' },
  vendido: { dot: 'bg-emerald-400', label: 'Vendido', bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  humano: { dot: 'bg-amber-400', label: 'Humano', bg: 'bg-amber-500/15', text: 'text-amber-300' },
  venda_iniciada: { dot: 'bg-amber-400', label: 'Venda iniciada', bg: 'bg-amber-500/15', text: 'text-amber-300' },
  perdido: { dot: 'bg-red-400', label: 'Perdido', bg: 'bg-red-500/10', text: 'text-red-400' },
};

const twoLineClamp: CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
};

const ATTENDING_EXPIRATION_MS = 15 * 60 * 1000;

function getConversationStageMeta(conv: Conversation, alineData?: AlineConversation) {
  const leadStatus = conv.lead_status || 'novo';
  const node = String(alineData?.current_node || '').toLowerCase();
  const data = alineData?.collected_data || {};
  const text = String(conv.last_message || '').toLowerCase();

  if (leadStatus === 'humano' || alineData?.status === 'human_takeover' || alineData?.active_agent === 'human') {
    return { label: 'Ação humana', className: 'bg-amber-500/15 text-amber-300 border-amber-500/20' };
  }

  if (leadStatus === 'venda_iniciada') {
    return { label: 'Ação humana', className: 'bg-amber-500/15 text-amber-300 border-amber-500/20' };
  }

  if (leadStatus === 'vendido') {
    return { label: 'Venda finalizada', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
  }

  if (data.kate_preview_image_url || data.malu_preview_image_url || node.includes('preview')) {
    return { label: 'Simulação enviada', className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20' };
  }

  if (node.includes('foto')) {
    return { label: 'Aguardando foto', className: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20' };
  }

  if (node.includes('pagamento') || data.payment_method) {
    return { label: 'Pagamento', className: 'bg-blue-500/15 text-blue-300 border-blue-500/20' };
  }

  if (node.includes('entrega') || data.delivery_method) {
    return { label: 'Entrega', className: 'bg-violet-500/15 text-violet-300 border-violet-500/20' };
  }

  if (data.selected_sku || data.selected_name || node.includes('selecao')) {
    return { label: 'Modelo escolhido', className: 'bg-teal-500/15 text-teal-300 border-teal-500/20' };
  }

  if (node.includes('catalogo')) {
    return { label: 'Catálogo enviado', className: 'bg-sky-500/15 text-sky-300 border-sky-500/20' };
  }


  if (
    text.includes('atendimento humano') ||
    text.includes('vou te encaminhar') ||
    text.includes('vendedor envia') ||
    text.includes('finalizar seu')
  ) {
    return { label: 'Acao humana', className: 'bg-amber-500/15 text-amber-300 border-amber-500/20' };
  }

  if (
    text.includes('voce escolheu') ||
    text.includes('você escolheu') ||
    text.includes('produto selecionado') ||
    text.includes('seguimos com')
  ) {
    return { label: 'Ação humana', className: 'bg-amber-500/15 text-amber-300 border-amber-500/20' };
  }

  if (text.includes('gostou de algum modelo') || text.includes('catalogo') || text.includes('catálogo')) {
    return { label: 'Catalogo enviado', className: 'bg-sky-500/15 text-sky-300 border-sky-500/20' };
  }
  return null;
}
function getAgentMeta(alineData?: AlineConversation, isSaleFinalized?: boolean) {
  const isHumanTakeover = alineData?.status === 'human_takeover';
  const activeAgent = alineData?.active_agent || 'aline';

  if (isHumanTakeover) {
    return {
      label: 'Humano',
      Icon: UserCheck,
      dotClass: 'bg-amber-500',
      avatarClass: 'bg-gradient-to-br from-amber-500 to-orange-500',
      badgeClass: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
      iconClass: 'text-amber-950',
    };
  }

  if (activeAgent === 'keila') {
    return {
      label: 'Keila',
      Icon: Crown,
      dotClass: 'bg-sky-500',
      avatarClass: 'bg-gradient-to-br from-sky-500 to-indigo-500',
      badgeClass: 'bg-sky-500/15 text-sky-300 border border-sky-500/20',
      iconClass: 'text-sky-950',
    };
  }

  if (activeAgent === 'kate') {
    return {
      label: 'Kate',
      Icon: Sparkles,
      dotClass: 'bg-fuchsia-500',
      avatarClass: 'bg-gradient-to-br from-fuchsia-500 to-rose-500',
      badgeClass: 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/20',
      iconClass: 'text-fuchsia-950',
    };
  }

  if (activeAgent === 'malu') {
    return {
      label: 'Malu',
      Icon: Glasses,
      dotClass: 'bg-violet-500',
      avatarClass: 'bg-gradient-to-br from-violet-500 to-cyan-500',
      badgeClass: 'bg-violet-500/15 text-violet-300 border border-violet-500/20',
      iconClass: 'text-violet-950',
    };
  }

  return {
    label: 'Aline',
    Icon: Bot,
    dotClass: 'bg-emerald-500',
    avatarClass: isSaleFinalized
      ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
      : 'bg-gradient-to-br from-emerald-400 to-cyan-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-400',
    iconClass: 'text-emerald-950',
  };
}

const ConversationItem = memo(
  ({ conv, isSelected, customerProfile, alineData, currentUserId, onClick }: ConversationItemProps) => {
    const hasUnread = (conv.unread_count ?? 0) > 0;
    const isInstagram = conv.platform === 'instagram';
    const isHumanTakeover = alineData?.status === 'human_takeover';
    const hasAssignedSeller = Boolean(alineData?.assigned_seller_id);
    const isSaleFinalized = conv.lead_status === 'vendido';
    const agentMeta = getAgentMeta(alineData, isSaleFinalized);
    const AgentIcon = agentMeta.Icon;
    const sellerName = alineData?.assigned_seller_name || '';
    const sellerFirstName = sellerName.split(' ')[0];
    const sellerInitial = sellerName.charAt(0).toUpperCase() || 'V';
    const leadStatus = (conv.lead_status as LeadStatus) || 'novo';
    const stageMeta = getConversationStageMeta(conv, alineData);
    const statusCfg = STATUS_CONFIG[leadStatus] ?? STATUS_CONFIG.novo;
    const isWaitingHumanAttention =
      leadStatus === 'humano' ||
      leadStatus === 'venda_iniciada' ||
      isHumanTakeover ||
      alineData?.active_agent === 'human' ||
      String(stageMeta?.label || '').toLowerCase().includes('humana');
    const needsHumanAttention = isWaitingHumanAttention && !hasAssignedSeller;
    const displayName = customerProfile?.name || conv.contact_name || conv.contact_number;
    const lastMsgTime = (conv as any).last_message_at || conv.created_at;
    const previewText = conv.last_message || 'Sem mensagens';
    const contactPresence = String(conv.contact_presence || '').toLowerCase();
    const isContactOnline =
      conv.contact_is_online || ['available', 'composing', 'recording'].includes(contactPresence);
    const contactPresenceLabel = formatContactPresence(conv);
    const attendingSinceMs = conv.attending_since ? new Date(conv.attending_since).getTime() : 0;
    const hasActiveAttendant =
      Boolean(conv.attending_name) &&
      Boolean(attendingSinceMs) &&
      Date.now() - attendingSinceMs < ATTENDING_EXPIRATION_MS &&
      conv.attending_by !== currentUserId;

    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full min-w-0 px-3 py-2.5 flex items-start gap-3 text-left transition-colors relative group border-b border-white/[0.06]',
          isSelected
            ? 'bg-[#2a3942]'
            : 'bg-transparent hover:bg-[#202c33]',
          isSaleFinalized && !isSelected && 'bg-emerald-500/[0.035]',
          needsHumanAttention && 'bg-emerald-500/[0.08]',
        )}
      >
        <div className="relative shrink-0 mt-0.5">
          {customerProfile?.profile_pic_url ? (
            <img
              src={customerProfile.profile_pic_url}
              alt={displayName}
              className="w-12 h-12 rounded-full object-cover ring-1 ring-white/10"
              loading="lazy"
            />
          ) : (
            <div
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center text-base font-semibold text-white ring-1 ring-white/10',
                isInstagram
                  ? 'bg-gradient-to-br from-fuchsia-500 to-orange-400'
                  : agentMeta.avatarClass,
              )}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          {contactPresenceLabel && (
            <span
              title={contactPresenceLabel}
              className={cn(
                'absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-[#111b21] shadow-sm',
                isContactOnline ? 'bg-emerald-400 ring-2 ring-emerald-400/25' : 'bg-slate-500',
                ['composing', 'recording'].includes(contactPresence) && 'animate-pulse',
              )}
            />
          )}
        </div>

        <div className="flex-1 min-w-0 w-full">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <p
              title={displayName}
              className={cn(
                'text-[14px] font-medium leading-5 min-w-0 truncate',
                hasUnread ? 'text-white' : 'text-slate-300',
              )}
            >
              {displayName}
            </p>

            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={cn(
                  'text-[11px] leading-5',
                  hasUnread ? 'text-[#00a884]' : 'text-slate-500',
                )}
              >
                {formatTime(lastMsgTime)}
              </span>
            </div>
          </div>

          <div className="mt-0.5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0 pr-1">
              <p
                title={previewText}
                style={twoLineClamp}
                className={cn(
                  'text-[12px] leading-[1.35] break-words min-h-0',
                  hasUnread ? 'text-slate-200' : 'text-slate-500',
                )}
              >
                {previewText}
              </p>

              {contactPresenceLabel && (
                <div
                  className={cn(
                    'mt-1 inline-flex max-w-full items-center gap-1 text-[10px] font-medium leading-4',
                    isContactOnline ? 'text-emerald-300' : 'text-slate-500',
                  )}
                  title={contactPresenceLabel}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      isContactOnline ? 'bg-emerald-300' : 'bg-slate-500',
                    )}
                  />
                  <span className="truncate">{contactPresenceLabel}</span>
                </div>
              )}
            </div>

            {hasUnread && (
              <span className="mt-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-[#00a884] text-[#111b21] text-[10px] font-bold flex items-center justify-center">
                {(conv.unread_count ?? 0) > 99 ? '99+' : conv.unread_count}
              </span>
            )}
          </div>

          <div className="flex items-center gap-x-1.5 gap-y-1 mt-1.5 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium',
                statusCfg.bg,
                statusCfg.text,
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusCfg.dot)} />
              {statusCfg.label}
            </span>

            {isHumanTakeover && hasAssignedSeller ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 text-amber-300 max-w-full">
                <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-amber-950 text-[8px] font-bold flex items-center justify-center shrink-0">
                  {sellerInitial}
                </span>
                <span className="truncate max-w-[92px]" title={sellerFirstName || 'Vendedor'}>
                  {sellerFirstName || 'Vendedor'}
                </span>
              </span>
            ) : (
              <span className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium',
                agentMeta.badgeClass,
              )}>
                <AgentIcon className="w-2.5 h-2.5 shrink-0" />
                {agentMeta.label}
              </span>
            )}
            {isWaitingHumanAttention && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-[0.02em] ring-1',
                  needsHumanAttention
                    ? 'bg-[#00a884]/25 text-emerald-50 ring-[#00a884]/35 animate-pulse'
                    : 'bg-amber-500/15 text-amber-200 ring-amber-500/25',
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    needsHumanAttention ? 'bg-emerald-300' : 'bg-amber-300',
                  )}
                />
                {needsHumanAttention ? 'Precisa atendimento humano' : 'Em atendimento humano'}
              </span>
            )}
            {stageMeta && (
              <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold', stageMeta.className)}>
                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                {stageMeta.label}
              </span>
            )}
            {isInstagram && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-fuchsia-500/10 text-fuchsia-400">
                <Instagram className="w-2.5 h-2.5 shrink-0" />
                IG
              </span>
            )}

            {contactPresenceLabel && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                {contactPresenceLabel}
              </span>
            )}

            {hasActiveAttendant && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-300 max-w-full">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
                </span>
                <span className="truncate max-w-[150px]" title={`${conv.attending_name} atendendo`}>
                  {conv.attending_name} atendendo
                </span>
              </span>
            )}
          </div>
        </div>
      </button>
    );
  },
);

ConversationItem.displayName = 'ConversationItem';

export default ConversationItem;
