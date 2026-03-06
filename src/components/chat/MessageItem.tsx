import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Check, CheckCheck, Clock, Volume2, FileText, Loader2, AlertCircle } from 'lucide-react';
import type { Message } from '@/lib/supabase';

interface MessageItemProps {
  message: Message;
  showTail: boolean;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'sending': return <Loader2 className="w-3 h-3 animate-spin" />;
    case 'failed': return <AlertCircle className="w-3 h-3 text-red-400" />;
    case 'sent': return <Check className="w-3 h-3" />;
    case 'delivered': return <CheckCheck className="w-3 h-3" />;
    case 'read': return <CheckCheck className="w-3 h-3 text-blue-400" />;
    default: return <Clock className="w-3 h-3 opacity-50" />;
  }
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const MessageItem = memo(({ message, showTail }: MessageItemProps) => {
  const isMe = message.is_from_me;

  return (
    <div
      className={cn(
        'flex mb-0.5',
        isMe ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'relative max-w-[85%] md:max-w-[70%] px-3.5 py-2 shadow-md overflow-hidden',
          isMe
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-800 text-slate-100',
          showTail 
            ? isMe 
              ? 'rounded-2xl rounded-tr-md mt-2' 
              : 'rounded-2xl rounded-tl-md mt-2'
            : 'rounded-2xl'
        )}
        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
      >
        {/* Media Content - Optimized image loading */}
        {message.message_type === 'image' && message.media_url && (
          <img
            src={message.media_url}
            alt="Imagem"
            loading="lazy"
            decoding="async"
            className="w-full max-w-[300px] rounded-xl cursor-pointer hover:opacity-90 transition-opacity mb-1.5 bg-slate-700/50"
            style={{ aspectRatio: '4/3', objectFit: 'cover' }}
            onClick={() => window.open(message.media_url!, '_blank')}
            onLoad={(e) => {
              (e.target as HTMLImageElement).style.aspectRatio = 'auto';
              (e.target as HTMLImageElement).style.objectFit = 'contain';
            }}
          />
        )}
        {message.message_type === 'audio' && message.media_url && (
          <div className="flex items-center gap-2 bg-black/20 rounded-xl p-2 mb-1">
            <Volume2 className="w-5 h-5 text-emerald-300" />
            <audio controls className="max-w-[200px] h-8" preload="none">
              <source src={message.media_url} />
            </audio>
          </div>
        )}
        {message.message_type === 'video' && message.media_url && (
          <video controls className="max-w-full rounded-xl mb-1.5" preload="none">
            <source src={message.media_url} />
          </video>
        )}
        {message.message_type === 'document' && message.media_url && (
          <a
            href={message.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm underline mb-1 hover:opacity-80"
          >
            <FileText className="w-4 h-4" />
            {message.content || 'Documento'}
          </a>
        )}
        
        {/* Text Content */}
        {(message.message_type === 'text' || message.content) && message.message_type !== 'audio' && (
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {message.content}
          </p>
        )}
        
        {/* Time & Status */}
        <div className="flex items-center gap-1.5 justify-end mt-1 -mb-0.5">
          <span className={cn(
            "text-[10px]",
            isMe ? "text-emerald-200/60" : "text-slate-500"
          )}>
            {formatTime(message.created_at || '')}
          </span>
          {isMe && (
            <span className={cn(
              message.status === 'read' ? 'text-blue-400' : 'text-emerald-200/60'
            )}>
              {getStatusIcon(message.status || 'sent')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export default MessageItem;
