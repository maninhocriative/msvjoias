import { memo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { Bot, Crown, Glasses, UserCheck, Instagram, Clock, Sparkles } from 'lucide-react';
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

function getConversationStageMeta(conv: Conversation, alineData?: AlineConversation) {
  const leadStatus = conv.lead_status || 'novo';
  const node = String(alineData?.current_node || '').toLowerCase();
  const data = alineData?.collected_data || {};
  const text = String(conv.last_message || '').toLowerCase();

  if (leadStatus === 'humano' || alineData?.status === 'human_takeover') {
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
  ({ conv, isSelected, customerProfile, alineData, onClick }: ConversationItemProps) => {
    const hasUnread = (conv.unread_count ?? 0) > 0;
    const isInstagram = conv.platform === 'instagram';
    const isHumanTakeover = alineData?.status === 'human_takeover';
    const isSaleFinalized = conv.lead_status === 'vendido';
    const agentMeta = getAgentMeta(alineData, isSaleFinalized);
    const AgentIcon = agentMeta.Icon;
    const sellerName = alineData?.assigned_seller_name || '';
    const sellerFirstName = sellerName.split(' ')[0];
    const sellerInitial = sellerName.charAt(0).toUpperCase() || 'V';
    const leadStatus = (conv.lead_status as LeadStatus) || 'novo';
    const stageMeta = getConversationStageMeta(conv, alineData);
    const statusCfg = STATUS_CONFIG[leadStatus] ?? STATUS_CONFIG.novo;
    const needsHumanAttention =
      leadStatus === 'humano' ||
      leadStatus === 'venda_iniciada' ||
      isHumanTakeover ||
      String(stageMeta?.label || '').toLowerCase().includes('humana');
    const displayName = customerProfile?.name || conv.contact_name || conv.contact_number;
    const lastMsgTime = (conv as any).last_message_at || conv.created_at;
    const previewText = conv.last_message || 'Sem mensagens';
    const contactPresence = String(conv.contact_presence || '').toLowerCase();
    const isContactOnline =
      conv.contact_is_online || ['available', 'composing', 'recording'].includes(contactPresence);
    const contactPresenceLabel =
      contactPresence === 'composing'
        ? 'digitando'
        : contactPresence === 'recording'
          ? 'gravando'
          : isContactOnline
            ? 'online'
            : '';

    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full min-w-0 px-3.5 py-3 flex items-start gap-3 text-left transition-all relative group rounded-2xl border shadow-[0_18px_42px_-36px_rgba(15,23,42,0.9)]',
          isSelected
            ? 'border-emerald-500/35 bg-[linear-gradient(160deg,rgba(16,185,129,0.16),rgba(15,23,42,0.92))] ring-1 ring-emerald-500/20'
            : 'border-white/[0.06] bg-slate-900/55 hover:bg-slate-900/75 hover:border-white/12',
          isSaleFinalized && !isSelected && 'bg-emerald-500/[0.05]',
          needsHumanAttention && 'border-emerald-400/40 ring-1 ring-emerald-400/20',
        )}
      >
        <div className="relative shrink-0 mt-0.5">
          {customerProfile?.profile_pic_url ? (
            <img
              src={customerProfile.profile_pic_url}
              alt={displayName}
              className="w-11 h-11 rounded-2xl object-cover ring-1 ring-white/10"
              loading="lazy"
            />
          ) : (
            <div
              className={cn(
                'w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold text-white ring-1 ring-white/10 shadow-[0_16px_30px_-18px_rgba(15,23,42,0.8)]',
                isInstagram
                  ? 'bg-gradient-to-br from-fuchsia-500 to-orange-400'
                  : agentMeta.avatarClass,
              )}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <span
            className={cn(
              'absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-950 flex items-center justify-center shadow-sm',
              agentMeta.dotClass,
            )}
          >
            <AgentIcon className={cn('w-2 h-2', agentMeta.iconClass)} />
          </span>
        </div>

        <div className="flex-1 min-w-0 w-full">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 mb-1.5">
            <p
              title={displayName}
              className={cn(
                'text-[13px] font-semibold leading-tight min-w-0 truncate tracking-[0.01em]',
                hasUnread ? 'text-white' : 'text-slate-300',
              )}
            >
              {displayName}
            </p>

            <div className="flex items-center gap-1.5 shrink-0">
              {hasUnread && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {(conv.unread_count ?? 0) > 99 ? '99+' : conv.unread_count}
                </span>
              )}

              <span className="text-[10px] text-slate-500 leading-tight flex items-center gap-1 rounded-full bg-white/[0.03] px-2 py-1">
                <Clock className="w-2.5 h-2.5" />
                {formatTime(lastMsgTime)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-x-1.5 gap-y-1 mb-1.5 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border border-white/8',
                statusCfg.bg,
                statusCfg.text,
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusCfg.dot)} />
              {statusCfg.label}
            </span>

            {isHumanTakeover ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/20 max-w-full">
                <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-amber-950 text-[8px] font-bold flex items-center justify-center shrink-0">
                  {sellerInitial}
                </span>
                <span className="truncate max-w-[92px]" title={sellerFirstName || 'Vendedor'}>
                  {sellerFirstName || 'Vendedor'}
                </span>
              </span>
            ) : (
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border border-white/8',
                agentMeta.badgeClass,
              )}>
                <AgentIcon className="w-2.5 h-2.5 shrink-0" />
                {agentMeta.label}
              </span>
            )}
            {needsHumanAttention && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.02em] bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.45)] animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 shrink-0" />
                Precisa atendimento humano
              </span>
            )}
            {stageMeta && (
              <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border', stageMeta.className)}>
                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                {stageMeta.label}
              </span>
            )}
            {isInstagram && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/15">
                <Instagram className="w-2.5 h-2.5 shrink-0" />
                IG
              </span>
            )}

            {contactPresenceLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/15">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                {contactPresenceLabel}
              </span>
            )}
          </div>

          <p
            title={previewText}
            style={twoLineClamp}
            className={cn(
              'text-[11px] leading-[1.45] break-words min-h-[2.1rem] pr-1',
              hasUnread ? 'text-slate-300' : 'text-slate-500',
            )}
          >
            {previewText}
          </p>
        </div>
      </button>
    );
  },
);

ConversationItem.displayName = 'ConversationItem';

export default ConversationItem;
