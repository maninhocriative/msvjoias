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
  const isDeleted = Boolean(message.deleted_at);
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
        'flex w-full mb-2.5',
        isMe ? 'justify-end pl-8 sm:pl-12' : 'justify-start pr-8 sm:pr-12',
      )}
    >
      <div
        className={cn(
          'relative w-fit min-w-0 max-w-[92%] sm:max-w-[86%] lg:max-w-[78%] xl:max-w-[72%] px-4 py-3 border shadow-[0_24px_50px_-34px_rgba(15,23,42,0.95)] backdrop-blur-sm',
          isMe
            ? 'bg-[linear-gradient(160deg,rgba(16,185,129,0.95),rgba(5,150,105,0.92))] text-white border-emerald-400/20'
            : 'bg-slate-900/88 text-slate-100 border-white/8',
          showTail
            ? isMe
              ? 'rounded-[24px] rounded-tr-md mt-2'
              : 'rounded-[24px] rounded-tl-md mt-2'
            : 'rounded-[24px]',
        )}
        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
      >
        {canEdit && !isEditing && (
          <button
            type="button"
            onClick={() => onStartEdit?.(message)}
            className="absolute -top-2 left-2 sm:left-auto sm:right-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/85 px-2.5 py-1 text-[11px] text-slate-200 shadow-sm transition-colors hover:border-emerald-400/40 hover:text-white"
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
                className="block w-full max-w-[280px] sm:max-w-[360px] lg:max-w-[460px] rounded-2xl cursor-pointer hover:opacity-90 transition-opacity mb-2 bg-slate-700/50"
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
                  'text-[15px] leading-7 whitespace-pre-wrap tracking-[0.01em]',
                  hasMedia && 'mt-1',
                )}
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
              >
                {message.content}
              </p>
            )}

            <div className="flex items-center gap-2 justify-end mt-2 -mb-0.5 ml-auto w-fit">
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
