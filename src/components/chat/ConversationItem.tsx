import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Bot, UserCheck, Instagram } from 'lucide-react';
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
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

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
  const sellerFirstName = alineData?.assigned_seller_name?.split(' ')[0];
  const leadStatus = (conv.lead_status as LeadStatus) || 'novo';
  const displayName = customerProfile?.name || conv.contact_name || conv.contact_number;
  const lastMsgTime = (conv as any).last_message_at || conv.created_at;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors border-b border-white/5',
        isSelected
          ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500'
          : 'hover:bg-white/[0.03] border-l-2 border-l-transparent',
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {customerProfile?.profile_pic_url ? (
          <img
            src={customerProfile.profile_pic_url}
            alt={displayName}
            className="w-10 h-10 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white',
            isInstagram
              ? 'bg-gradient-to-br from-fuchsia-500 to-orange-400'
              : 'bg-gradient-to-br from-emerald-400 to-cyan-500'
          )}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {/* Status do atendente — ponto no canto */}
        <span className={cn(
          'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900',
          isHumanTakeover ? 'bg-amber-500' : 'bg-emerald-500'
        )} />
      </div>

      {/* Conteúdo — ocupa todo o espaço restante */}
      <div className="flex-1 min-w-0">
        {/* Linha 1: nome + hora */}
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <p className={cn(
            'text-sm font-semibold truncate leading-tight',
            hasUnread ? 'text-white' : 'text-slate-300',
          )}>
            {displayName}
          </p>
          <span className="text-[10px] text-slate-600 shrink-0 leading-tight">
            {formatTime(lastMsgTime)}
          </span>
        </div>

        {/* Linha 2: badges compactos */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[leadStatus])} />
          <span className="text-[10px] text-slate-500 shrink-0">{STATUS_LABEL[leadStatus]}</span>
          <span className="text-[10px] text-slate-700 shrink-0">·</span>
          {isHumanTakeover ? (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-400 shrink-0">
              <UserCheck className="w-2.5 h-2.5" />
              {sellerFirstName || 'Vendedor'}
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-500 shrink-0">
              <Bot className="w-2.5 h-2.5" />
              Aline
            </span>
          )}
          {hasUnread && (
            <>
              <span className="text-[10px] text-slate-700 shrink-0">·</span>
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                {(conv.unread_count ?? 0) > 99 ? '99+' : conv.unread_count}
              </span>
            </>
          )}
        </div>

        {/* Linha 3: preview */}
        <p className={cn(
          'text-[11px] truncate leading-tight',
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
