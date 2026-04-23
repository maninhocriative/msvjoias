import { memo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { Bot, UserCheck, Instagram, CheckCircle2, Clock } from 'lucide-react';
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
  assigned_seller_id?: string;
  assigned_seller_name?: string;
  assigned_at?: string;
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
  perdido: { dot: 'bg-red-400', label: 'Perdido', bg: 'bg-red-500/10', text: 'text-red-400' },
};

const twoLineClamp: CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
};

const ConversationItem = memo(
  ({ conv, isSelected, customerProfile, alineData, onClick }: ConversationItemProps) => {
    const hasUnread = (conv.unread_count ?? 0) > 0;
    const isInstagram = conv.platform === 'instagram';
    const isHumanTakeover = alineData?.status === 'human_takeover';
    const isSaleFinalized = conv.lead_status === 'vendido';
    const sellerName = alineData?.assigned_seller_name || '';
    const sellerFirstName = sellerName.split(' ')[0];
    const sellerInitial = sellerName.charAt(0).toUpperCase() || 'V';
    const leadStatus = (conv.lead_status as LeadStatus) || 'novo';
    const statusCfg = STATUS_CONFIG[leadStatus] ?? STATUS_CONFIG.novo;
    const displayName = customerProfile?.name || conv.contact_name || conv.contact_number;
    const lastMsgTime = (conv as any).last_message_at || conv.created_at;
    const previewText = conv.last_message || 'Sem mensagens';

    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full min-w-0 px-3 py-3 flex items-start gap-3 text-left transition-all border-b border-white/[0.04] relative group',
          isSelected
            ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500'
            : 'hover:bg-white/[0.03] border-l-2 border-l-transparent',
          isSaleFinalized && !isSelected && 'bg-emerald-500/[0.04]',
        )}
      >
        <div className="relative shrink-0 mt-0.5">
          {customerProfile?.profile_pic_url ? (
            <img
              src={customerProfile.profile_pic_url}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10"
              loading="lazy"
            />
          ) : (
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ring-1 ring-white/10',
                isInstagram
                  ? 'bg-gradient-to-br from-fuchsia-500 to-orange-400'
                  : isSaleFinalized
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                    : 'bg-gradient-to-br from-emerald-400 to-cyan-500',
              )}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-950 flex items-center justify-center',
              isHumanTakeover ? 'bg-amber-500' : 'bg-emerald-500',
            )}
          >
            {isHumanTakeover ? (
              <UserCheck className="w-2 h-2 text-amber-950" />
            ) : (
              <Bot className="w-2 h-2 text-emerald-950" />
            )}
          </span>
        </div>

        <div className="flex-1 min-w-0 w-full">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 mb-1.5">
            <p
              title={displayName}
              className={cn(
                'text-[13px] font-semibold leading-tight min-w-0 truncate',
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

              <span className="text-[10px] text-slate-500 leading-tight flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {formatTime(lastMsgTime)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-x-1.5 gap-y-1 mb-1.5 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium',
                statusCfg.bg,
                statusCfg.text,
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusCfg.dot)} />
              {statusCfg.label}
            </span>

            {isHumanTakeover ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/20 max-w-full">
                <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-amber-950 text-[8px] font-bold flex items-center justify-center shrink-0">
                  {sellerInitial}
                </span>
                <span className="truncate max-w-[92px]" title={sellerFirstName || 'Vendedor'}>
                  {sellerFirstName || 'Vendedor'}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-400">
                <Bot className="w-2.5 h-2.5 shrink-0" />
                Aline
              </span>
            )}

            {isSaleFinalized && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                Venda finalizada
              </span>
            )}

            {isInstagram && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-fuchsia-500/10 text-fuchsia-400">
                <Instagram className="w-2.5 h-2.5 shrink-0" />
                IG
              </span>
            )}
          </div>

          <p
            title={previewText}
            style={twoLineClamp}
            className={cn(
              'text-[11px] leading-4 break-words min-h-[2rem] pr-1',
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
