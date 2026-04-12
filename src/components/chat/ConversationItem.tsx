import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Bot, User, UserCheck, Instagram, MessageCircle } from 'lucide-react';
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

const formatLastSeen = (date: string) => {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
};

// Ponto colorido por status do lead — pequeno, discreto
const STATUS_DOT: Record<string, string> = {
  novo: 'bg-slate-400',
  frio: 'bg-blue-400',
  quente: 'bg-orange-400',
  comprador: 'bg-emerald-400',
  sem_interesse: 'bg-red-400',
};

const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  frio: 'Frio',
  quente: 'Quente',
  comprador: 'Comprador',
  sem_interesse: 'Sem interesse',
};

const ConversationItem = memo(({ conv, isSelected, customerProfile, alineData, onClick }: ConversationItemProps) => {
  const hasUnread = (conv.unread_count ?? 0) > 0;
  const isInstagram = conv.platform === 'instagram';
  const isHumanTakeover = alineData?.status === 'human_takeover';
  const sellerName = alineData?.assigned_seller_name?.split(' ')[0];
  const leadStatus = (conv.lead_status as LeadStatus) || 'novo';
  const displayName = customerProfile?.name || conv.contact_name || conv.contact_number;

  const lastMsgTime = (conv as any).last_message_at
    ? new Date((conv as any).last_message_at).getTime()
    : (conv.created_at ? new Date(conv.created_at).getTime() : 0);
  const isRecentlyActive = Date.now() - lastMsgTime < 5 * 60 * 1000;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-3 py-2.5 flex items-center gap-3 transition-all text-left relative',
        'hover:bg-white/5',
        isSelected
          ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500'
          : 'border-l-2 border-l-transparent',
      )}
    >
      {/* Avatar — compacto 40px */}
      <div className="relative shrink-0">
        {customerProfile?.profile_pic_url ? (
          <img
            src={customerProfile.profile_pic_url}
            alt={displayName}
            className="w-10 h-10 rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white',
            isInstagram
              ? 'bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400'
              : 'bg-gradient-to-br from-emerald-400 to-cyan-500'
          )}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Indicador online */}
        {isRecentlyActive && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
        )}

        {/* Plataforma */}
        <div className={cn(
          'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-md flex items-center justify-center',
          isInstagram ? 'bg-gradient-to-br from-fuchsia-500 to-orange-400' : 'bg-emerald-500'
        )}>
          {isInstagram
            ? <Instagram className="w-2.5 h-2.5 text-white" />
            : <MessageCircle className="w-2.5 h-2.5 text-white" />}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        {/* Linha 1: nome + hora */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className={cn(
            'text-sm font-semibold truncate flex-1',
            hasUnread ? 'text-emerald-300' : 'text-white',
          )}>
            {displayName}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasUnread && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                {(conv.unread_count ?? 0) > 99 ? '99+' : conv.unread_count}
              </span>
            )}
            <span className="text-[11px] text-slate-500">
              {formatLastSeen((conv as any).last_message_at || conv.created_at)}
            </span>
          </div>
        </div>

        {/* Linha 2: meta-info (status + atendente) — inline, compacto */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {/* Ponto do status */}
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[leadStatus])} />
          <span className="text-[10px] text-slate-500">{STATUS_LABEL[leadStatus]}</span>

          <span className="text-slate-700">·</span>

          {/* Atendente */}
          {isHumanTakeover ? (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
              <UserCheck className="w-2.5 h-2.5" />
              {sellerName || 'Vendedor'}
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-500/70">
              <Bot className="w-2.5 h-2.5" />
              Aline
            </span>
          )}
        </div>

        {/* Linha 3: preview da mensagem — só 1 linha */}
        <p className={cn(
          'text-xs truncate',
          hasUnread ? 'text-slate-300' : 'text-slate-600',
        )}>
          {conv.last_message || 'Sem mensagens'}
        </p>
      </div>
    </button>
  );
});

ConversationItem.displayName = 'ConversationItem';

export default ConversationItem;
