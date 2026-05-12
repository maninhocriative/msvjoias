import { memo } from 'react';
import { cn } from '@/lib/utils';
import {
  Check,
  CheckCheck,
  Clock,
  Volume2,
  FileText,
  Loader2,
  AlertCircle,
  Pencil,
  X,
} from 'lucide-react';
import type { Message } from '@/lib/supabase';

interface MessageItemProps {
  message: Message;
  showTail: boolean;
  canEdit?: boolean;
  editValue?: string;
  isEditing?: boolean;
  isSavingEdit?: boolean;
  onStartEdit?: (message: Message) => void;
  onEditValueChange?: (value: string) => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (message: Message) => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'sending':
      return <Loader2 className="w-3 h-3 animate-spin" />;
    case 'failed':
      return <AlertCircle className="w-3 h-3 text-red-400" />;
    case 'sent':
      return <Check className="w-3 h-3" />;
    case 'delivered':
      return <CheckCheck className="w-3 h-3" />;
    case 'read':
      return <CheckCheck className="w-3 h-3 text-blue-400" />;
    default:
      return <Clock className="w-3 h-3 opacity-50" />;
  }
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const MessageItem = memo(({
  message,
  showTail,
  canEdit = false,
  editValue = '',
  isEditing = false,
  isSavingEdit = false,
  onStartEdit,
  onEditValueChange,
  onCancelEdit,
  onSaveEdit,
}: MessageItemProps) => {
  const isMe = message.is_from_me;
  const isInternalNote = message.message_type === 'internal_note';
  const isDeleted = Boolean(message.deleted_at);

  if (isInternalNote) {
    return (
      <div className="flex w-full justify-center my-3 px-4">
        <div className="max-w-[88%] rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3.5 py-2 text-center text-[13px] leading-5 text-amber-100 shadow-sm">
          <p className="whitespace-pre-wrap" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {message.content}
          </p>
          <span className="mt-1 block text-[10px] text-amber-100/55">{formatTime(message.created_at || '')}</span>
        </div>
      </div>
    );
  }
  const hasMedia =
    (message.message_type === 'image' ||
      message.message_type === 'audio' ||
      message.message_type === 'video' ||
      message.message_type === 'document') &&
    !!message.media_url;

  const showTextContent =
    !isDeleted &&
    message.message_type !== 'audio' &&
    !!message.content &&
    message.content.trim().length > 0;

  return (
    <div
      className={cn(
        'flex w-full',
        isMe ? 'justify-end pl-10 sm:pl-16' : 'justify-start pr-10 sm:pr-16',
      )}
    >
      <div
        className={cn(
          'group/message relative w-fit min-w-0 max-w-[90%] sm:max-w-[82%] lg:max-w-[72%] xl:max-w-[66%] px-3.5 py-2 border shadow-[0_10px_24px_-22px_rgba(0,0,0,0.9)] clear-both',
          isMe
            ? 'bg-[#005c4b] text-white border-emerald-300/10'
            : 'bg-[#202c33] text-slate-100 border-white/6',
          showTail
            ? isMe
              ? 'rounded-2xl rounded-tr-sm mt-1.5 mb-0.5'
              : 'rounded-2xl rounded-tl-sm mt-1.5 mb-0.5'
            : 'rounded-2xl my-0.5',
        )}
        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
      >
        {canEdit && !isEditing && (
          <button
            type="button"
            onClick={() => onStartEdit?.(message)}
            className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/90 px-2 py-1 text-[10px] text-slate-200 opacity-0 shadow-sm transition-opacity hover:border-emerald-400/40 hover:text-white group-hover/message:opacity-100 focus:opacity-100"
          >
            <Pencil className="w-3 h-3" />
            Editar
          </button>
        )}

        {isEditing ? (
          <div className="space-y-2 min-w-[240px]">
            <textarea
              value={editValue}
              onChange={(e) => onEditValueChange?.(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-[14px] text-white outline-none transition-colors focus:border-emerald-400/40"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={isSavingEdit}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-2.5 py-1.5 text-[12px] text-slate-200 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="w-3 h-3" />
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => onSaveEdit?.(message)}
                disabled={isSavingEdit || !editValue.trim()}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingEdit ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Salvar
              </button>
            </div>
          </div>
        ) : (
          <>
            {message.message_type === 'image' && message.media_url && (
              <img
                src={message.media_url}
                alt="Imagem"
                loading="lazy"
                decoding="async"
                className="block w-full max-w-[260px] sm:max-w-[340px] lg:max-w-[420px] rounded-xl cursor-pointer bg-slate-700/50 transition-opacity hover:opacity-90"
                style={{
                  aspectRatio: '4 / 3',
                  objectFit: 'cover',
                  maxHeight: '70vh',
                }}
                onClick={() => window.open(message.media_url!, '_blank')}
                onLoad={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.aspectRatio = 'auto';
                  target.style.objectFit = 'contain';
                }}
              />
            )}

            {message.message_type === 'image' && !message.media_url && !showTextContent && !isDeleted && (
              <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/10 px-3 py-2 text-sm text-slate-300">
                <FileText className="w-4 h-4 shrink-0" />
                <span>Imagem recebida</span>
              </div>
            )}

            {message.message_type === 'audio' && message.media_url && (
              <div className="flex items-center gap-2 bg-black/20 rounded-2xl p-2.5 mb-2 w-full max-w-[320px] min-w-0 border border-white/8">
                <Volume2 className="w-5 h-5 shrink-0 text-emerald-300" />
                <audio controls className="w-full min-w-0 h-8" preload="none">
                  <source src={message.media_url} />
                </audio>
              </div>
            )}

            {message.message_type === 'video' && message.media_url && (
              <video
                controls
                className="block w-full max-w-[280px] sm:max-w-[360px] lg:max-w-[460px] rounded-2xl mb-2 bg-black/20 border border-white/8"
                preload="none"
                style={{ maxHeight: '70vh' }}
              >
                <source src={message.media_url} />
              </video>
            )}

            {message.message_type === 'document' && message.media_url && (
              <a
                href={message.media_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm underline mb-2 hover:opacity-80 break-all rounded-2xl border border-white/8 bg-black/10 px-3 py-2"
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>{message.content || 'Documento'}</span>
              </a>
            )}

            {isDeleted && (
              <p className="text-[14px] italic text-white/70">
                Mensagem editada e substituida.
              </p>
            )}

            {showTextContent && (
              <p
                className={cn(
                  'text-[14.5px] leading-6 whitespace-pre-wrap',
                  hasMedia && 'mt-1',
                )}
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
              >
                {message.content}
              </p>
            )}

            <div className="flex items-center gap-1.5 justify-end mt-1 -mb-0.5 ml-auto w-fit">
              <span
                className={cn(
                  'text-[10px]',
                  isMe ? 'text-emerald-200/60' : 'text-slate-500',
                )}
              >
                {formatTime(message.created_at || '')}
              </span>

              {message.replaced_message_id && !isDeleted && (
                <span
                  className={cn(
                    'text-[10px]',
                    isMe ? 'text-emerald-200/60' : 'text-slate-500',
                  )}
                >
                  editada
                </span>
              )}

              {isMe && (
                <span
                  className={cn(
                    message.status === 'read'
                      ? 'text-blue-400'
                      : 'text-emerald-200/60',
                  )}
                >
                  {getStatusIcon(message.status || 'sent')}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export default MessageItem;
