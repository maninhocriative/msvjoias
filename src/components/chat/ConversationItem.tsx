import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Bot, User, UserCheck, Timer, Instagram, MessageCircle } from 'lucide-react';
import { LeadStatusBadge } from '@/components/chat/LeadStatusSelect';
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
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
};

const getWaitingTime = (alineData?: AlineConversation): string | null => {
  if (!alineData || alineData.status !== 'human_takeover' || !alineData.assigned_at) {
    return null;
  }
  
  const assignedAt = new Date(alineData.assigned_at);
  const now = new Date();
  const diffMs = now.getTime() - assignedAt.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}min`;
  return `${Math.floor(diffHours / 24)}d`;
};

const ConversationItem = memo(({ conv, isSelected, customerProfile, alineData, onClick }: ConversationItemProps) => {
  const hasUnread = (conv.unread_count ?? 0) > 0;
  const isInstagram = conv.platform === 'instagram';
  const PlatformIcon = isInstagram ? Instagram : MessageCircle;
  const waitingTime = getWaitingTime(alineData);
  const isHumanTakeover = alineData?.status === 'human_takeover';
  const sellerName = alineData?.assigned_seller_name;
  
  // Check if recently active
  const lastMsgTime = (conv as any).last_message_at 
    ? new Date((conv as any).last_message_at).getTime() 
    : (conv.created_at ? new Date(conv.created_at).getTime() : 0);
  const isRecentlyActive = Date.now() - lastMsgTime < 5 * 60 * 1000;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3.5 flex items-start gap-3.5 transition-all text-left relative mx-2 rounded-xl mb-1',
        'hover:bg-white/5',
        isSelected && 'bg-emerald-500/10 border border-emerald-500/20',
        hasUnread && 'bg-slate-800/50'
      )}
      style={{ width: 'calc(100% - 16px)' }}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {customerProfile?.profile_pic_url ? (
          <img
            src={customerProfile.profile_pic_url}
            alt={conv.contact_name || 'Cliente'}
            className="w-12 h-12 rounded-2xl object-cover shadow-lg"
            loading="lazy"
          />
        ) : (
          <div className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-semibold text-white shadow-lg',
            isInstagram 
              ? 'bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400' 
              : 'bg-gradient-to-br from-emerald-400 to-cyan-500'
          )}>
            {(conv.contact_name || conv.contact_number).charAt(0).toUpperCase()}
          </div>
        )}
        
        {isRecentlyActive && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full animate-pulse" title="Online" />
        )}
        
        <div className={cn(
          'absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-lg flex items-center justify-center shadow-md',
          isInstagram ? 'bg-gradient-to-br from-fuchsia-500 to-orange-400' : 'bg-emerald-500'
        )}>
          <PlatformIcon className="w-3 h-3 text-white" />
        </div>
        
        {waitingTime && (
          <div className="absolute -top-1 -left-1 px-1.5 py-0.5 bg-amber-500 rounded-md flex items-center gap-0.5 shadow-lg">
            <Timer className="w-2.5 h-2.5 text-white" />
            <span className="text-[9px] font-bold text-white">{waitingTime}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className={cn(
            'font-semibold text-white truncate text-sm',
            hasUnread && 'text-emerald-300'
          )}>
            {customerProfile?.name || conv.contact_name || conv.contact_number}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasUnread && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                {(conv.unread_count ?? 0) > 99 ? '99+' : conv.unread_count}
              </span>
            )}
            <span className={cn(
              'text-[11px]',
              hasUnread ? 'text-emerald-400 font-medium' : 'text-slate-500'
            )}>
              {formatLastSeen((conv as any).last_message_at || conv.created_at)}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <LeadStatusBadge status={(conv.lead_status as LeadStatus) || 'novo'} />
          {isHumanTakeover && sellerName ? (
            <span className="px-1.5 py-0.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border border-amber-500/30 rounded text-[9px] font-medium flex items-center gap-1">
              <UserCheck className="w-2.5 h-2.5" />
              {sellerName.split(' ')[0]}
            </span>
          ) : isHumanTakeover ? (
            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[9px] font-medium flex items-center gap-1">
              <User className="w-2.5 h-2.5" />
              Vendedor
            </span>
          ) : (
            <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/20 rounded text-[9px] font-medium flex items-center gap-1">
              <Bot className="w-2.5 h-2.5" />
              Aline
            </span>
          )}
        </div>
        
        <p className={cn(
          'text-xs flex-1 line-clamp-2',
          hasUnread ? 'text-slate-200' : 'text-slate-500'
        )}>
          {conv.last_message || 'Sem mensagens'}
        </p>
      </div>
    </button>
  );
});

ConversationItem.displayName = 'ConversationItem';

export default ConversationItem;
