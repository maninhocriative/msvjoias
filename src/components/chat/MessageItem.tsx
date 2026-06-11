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
  Trash2,
  X,
} from 'lucide-react';
import type { Message } from '@/lib/supabase';
import { supabaseUrl } from '@/lib/supabase';

interface MessageItemProps {
  message: Message;
  showTail: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  platform?: string | null;
  editValue?: string;
  isEditing?: boolean;
  isSavingEdit?: boolean;
  isDeleting?: boolean;
  onStartEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
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

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'sending':
      return 'Enviando';
    case 'failed':
      return 'Falhou';
    case 'sent':
      return 'Enviada';
    case 'delivered':
      return 'Entregue';
    case 'read':
      return 'Lida';
    default:
      return 'Aguardando';
  }
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const inferAudioMimeType = (url?: string | null) => {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('.mp3')) return 'audio/mpeg';
  if (lower.includes('.m4a') || lower.includes('.mp4')) return 'audio/mp4';
  if (lower.includes('.webm')) return 'audio/webm';
  if (lower.includes('.wav')) return 'audio/wav';
  if (lower.includes('.amr')) return 'audio/amr';
  if (lower.includes('.aac')) return 'audio/aac';
  return 'audio/ogg';
};

const normalizeUrlForComparison = (url?: string | null) =>
  String(url || '').trim().split('?')[0].replace(/\/+$/, '');

const isWhatsAppProfileImageUrl = (value?: string | null) => {
  const lower = String(value || '').toLowerCase();
  return (
    lower.includes('pps.whatsapp.net') ||
    lower.includes('profilepic') ||
    lower.includes('profile_pic') ||
    lower.includes('profile-picture') ||
    lower.includes('profilephoto') ||
    lower.includes('avatar')
  );
};

const isRedundantMediaLinkText = (content?: string | null, mediaUrl?: string | null) => {
  const trimmed = String(content || '').trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false;

  if (mediaUrl && normalizeUrlForComparison(trimmed) === normalizeUrlForComparison(mediaUrl)) {
    return true;
  }

  if (isWhatsAppProfileImageUrl(trimmed)) return true;

  return /^https?:\/\/\S+$/i.test(trimmed) && /whatsapp\.net|backblazeb2|temp-file-download|\.(jpg|jpeg|png|webp|gif|mp4|mov|webm)(?:$|[?#])/i.test(trimmed);
};

const getPlayableAudioUrl = (message: Message) => {
  const mediaUrl = String(message.media_url || '').trim();
  if (!mediaUrl) return '';
  if (mediaUrl.startsWith('blob:')) return mediaUrl;
  return `${supabaseUrl}/functions/v1/chat-media-proxy?message_id=${encodeURIComponent(message.id)}`;
};

const isAudioPlaceholderContent = (content?: string | null) => {
  const normalized = String(content || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return !normalized || normalized === 'audio recebido' || normalized === 'audio';
};

const normalizePlaceholderContent = (content?: string | null) =>
  String(content || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isInstagramAttachmentPlaceholderContent = (content?: string | null) => {
  const normalized = normalizePlaceholderContent(content);
  return [
    'ephemeral',
    'share',
    'story mention',
    'ig story',
    'instagram story',
    'midia temporaria do instagram',
    'midia do instagram',
  ].includes(normalized);
};

const isInstagramAttachmentType = (messageType?: string | null) =>
  ['ephemeral', 'share', 'story_mention', 'ig_story', 'instagram_story'].includes(
    String(messageType || '').toLowerCase(),
  );

const inferVisualMediaType = (url?: string | null) => {
  const lower = String(url || '').toLowerCase().split('?')[0];
  if (/\.(mp4|mov|webm|m4v)$/.test(lower)) return 'video';
  return 'image';
};

const cleanProductCaptionLine = (value: string) =>
  value
    .replace(/\*/g, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();

const parseProductCaption = (content?: string | null) => {
  const lines = String(content || '')
    .split(/\n+/)
    .map(cleanProductCaptionLine)
    .filter(Boolean);

  if (lines.length === 0) return null;

  const hasCatalogSignal = lines.some((line) =>
    /(^|\s)(sku|cod|codigo|valor|preco|preço|r\$)/i.test(line),
  );
  if (!hasCatalogSignal) return null;

  const title = lines[0] || 'Produto';
  const details = lines.slice(1);

  return { title, details };
};

const MessageItem = memo(({
  message,
  showTail,
  canEdit = false,
  canDelete = false,
  platform,
  editValue = '',
  isEditing = false,
  isSavingEdit = false,
  isDeleting = false,
  onStartEdit,
  onDelete,
  onEditValueChange,
  onCancelEdit,
  onSaveEdit,
}: MessageItemProps) => {
  const isMe = message.is_from_me;
  const isInternalNote = message.message_type === 'internal_note';
  const isDeleted = Boolean(message.deleted_at);
  const isInstagram = platform === 'instagram' || String(message.zapi_message_id || '').startsWith('instagram:');

  if (
    !isDeleted &&
    (message.message_type === 'text' || !message.message_type) &&
    !message.media_url &&
    isAudioPlaceholderContent(message.content)
  ) {
    return null;
  }

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
  const isProfileMediaUrl = isWhatsAppProfileImageUrl(message.media_url);
  const effectiveMessageType =
    isInstagramAttachmentType(message.message_type) && message.media_url
      ? inferVisualMediaType(message.media_url)
      : message.message_type;
  const playableAudioUrl = effectiveMessageType === 'audio' ? getPlayableAudioUrl(message) : '';
  const hasMedia =
    (effectiveMessageType === 'image' ||
      effectiveMessageType === 'audio' ||
      effectiveMessageType === 'video' ||
      effectiveMessageType === 'document') &&
    !!message.media_url &&
    !isProfileMediaUrl;
  const showInstagramAttachmentFallback =
    !isDeleted &&
    isInstagram &&
    isInstagramAttachmentType(message.message_type) &&
    !hasMedia;

  const showTextContent =
    !isDeleted &&
    (effectiveMessageType !== 'audio' || !isAudioPlaceholderContent(message.content)) &&
    !!message.content &&
    message.content.trim().length > 0 &&
    !isRedundantMediaLinkText(message.content, message.media_url) &&
    !(isInstagram && isInstagramAttachmentPlaceholderContent(message.content));
  const productCaption = hasMedia && (effectiveMessageType === 'image' || effectiveMessageType === 'video')
    ? parseProductCaption(message.content)
    : null;
  const shouldRenderProductCard = !!productCaption;

  if (!isDeleted && !hasMedia && !showTextContent && isProfileMediaUrl) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex w-full',
        isMe ? 'justify-end pl-10 sm:pl-16' : 'justify-start pr-10 sm:pr-16',
      )}
    >
      <div
        className={cn(
          'group/message relative w-fit min-w-0 max-w-[90%] sm:max-w-[82%] lg:max-w-[72%] xl:max-w-[66%] border shadow-[0_10px_24px_-22px_rgba(0,0,0,0.9)] clear-both',
          shouldRenderProductCard ? 'px-2 py-2' : 'px-3.5 py-2',
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
        {(canEdit || canDelete) && !isEditing && (
          <div className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/90 p-1 text-[10px] text-slate-200 opacity-0 shadow-sm transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
            {canEdit && (
              <button
                type="button"
                onClick={() => onStartEdit?.(message)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors hover:bg-white/8 hover:text-white"
              >
                <Pencil className="w-3 h-3" />
                Editar
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete?.(message)}
                disabled={isDeleting}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-red-200 transition-colors hover:bg-red-500/15 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Apagar
              </button>
            )}
          </div>
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
            {isInstagram && (
              <div
                className={cn(
                  'mb-1 flex',
                  isMe ? 'justify-end' : 'justify-start',
                )}
              >
                <span className="inline-flex items-center rounded border border-fuchsia-400/20 bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-fuchsia-200">
                  IG
                </span>
              </div>
            )}

            {effectiveMessageType === 'image' && hasMedia && (
              shouldRenderProductCard ? (
                <div className="w-[min(360px,74vw)] overflow-hidden rounded-xl bg-emerald-950/20">
                  <button
                    type="button"
                    className="block w-full overflow-hidden rounded-xl bg-white/95"
                    onClick={() => window.open(message.media_url!, '_blank')}
                  >
                    <img
                      src={message.media_url}
                      alt={productCaption?.title || 'Produto'}
                      loading="lazy"
                      decoding="async"
                      className="block h-auto max-h-[340px] min-h-[220px] w-full object-contain"
                    />
                  </button>
                </div>
              ) : (
                <img
                  src={message.media_url}
                  alt="Imagem"
                  loading="lazy"
                  decoding="async"
                  className="block w-auto max-w-[240px] sm:max-w-[320px] lg:max-w-[360px] rounded-xl cursor-pointer bg-slate-700/50 transition-opacity hover:opacity-90"
                  style={{
                    aspectRatio: 'auto',
                    objectFit: 'contain',
                    maxHeight: '360px',
                  }}
                  onClick={() => window.open(message.media_url!, '_blank')}
                />
              )
            )}

            {effectiveMessageType === 'image' && !message.media_url && !showTextContent && !isDeleted && (
              <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/10 px-3 py-2 text-sm text-slate-300">
                <FileText className="w-4 h-4 shrink-0" />
                <span>Imagem recebida</span>
              </div>
            )}

            {effectiveMessageType === 'audio' && hasMedia && (
              <div className="flex w-[min(340px,72vw)] flex-col gap-2 rounded-2xl border border-white/8 bg-slate-950/20 p-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-300/10">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <audio controls className="h-10 w-full min-w-0 rounded-full accent-emerald-400" preload="metadata">
                    {message.media_url && (
                      <source src={message.media_url} type={inferAudioMimeType(message.media_url)} />
                    )}
                    {playableAudioUrl && playableAudioUrl !== message.media_url && (
                      <source src={playableAudioUrl} type={inferAudioMimeType(message.media_url)} />
                    )}
                  </audio>
                </div>
                <div className="flex items-center justify-between gap-2 pl-12 text-[11px] leading-4">
                  <span className={cn('truncate', isMe ? 'text-emerald-100/65' : 'text-slate-400')}>
                    Audio
                  </span>
                  <a
                    href={message.media_url || playableAudioUrl || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 font-medium text-emerald-200/85 underline-offset-2 hover:text-emerald-100 hover:underline"
                  >
                    Abrir
                  </a>
                </div>
              </div>
            )}


            {effectiveMessageType === 'audio' && !hasMedia && !showTextContent && !isDeleted && (
              <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/10 px-3 py-2 text-sm text-slate-300">
                <Volume2 className="w-4 h-4 shrink-0 text-emerald-300" />
                <div className="min-w-0">
                  <span className="block">Audio recebido</span>
                  <span className="block text-[11px] leading-4 text-slate-400">Arquivo ainda nao disponivel para reproducao.</span>
                </div>
              </div>
            )}
            {effectiveMessageType === 'video' && hasMedia && (
              <video
                controls
                className="block w-full max-w-[280px] sm:max-w-[360px] lg:max-w-[460px] rounded-2xl mb-2 bg-black/20 border border-white/8"
                preload="none"
                style={{ maxHeight: '70vh' }}
              >
                <source src={message.media_url} />
              </video>
            )}

            {effectiveMessageType === 'document' && hasMedia && (
              <a
                href={message.media_url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm underline mb-2 hover:opacity-80 break-all rounded-2xl border border-white/8 bg-black/10 px-3 py-2"
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>{message.content || 'Documento'}</span>
              </a>
            )}

            {showInstagramAttachmentFallback && (
              <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/10 px-3 py-2 text-sm text-slate-300">
                <FileText className="w-4 h-4 shrink-0 text-fuchsia-200" />
                <div className="min-w-0">
                  <span className="block">Midia temporaria do Instagram</span>
                  <span className="block text-[11px] leading-4 text-slate-400">O Instagram nao disponibilizou a foto para exibicao.</span>
                </div>
              </div>
            )}

            {isDeleted && (
              <p className="text-[14px] italic text-white/70">
                Mensagem apagada.
              </p>
            )}

            {showTextContent && (
              shouldRenderProductCard && productCaption ? (
                <div className="mt-2 w-[min(360px,74vw)] px-1 pb-0.5">
                  <p className="text-[14px] font-semibold leading-5 text-white">
                    {productCaption.title}
                  </p>
                  {productCaption.details.length > 0 && (
                    <div className="mt-1 space-y-0.5 text-[13px] font-medium leading-5 text-emerald-50/90">
                      {productCaption.details.map((line, index) => (
                        <p key={`${line}-${index}`} className="whitespace-pre-wrap">
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p
                  className={cn(
                    'text-[14.5px] leading-6 whitespace-pre-wrap',
                    hasMedia && 'mt-1',
                  )}
                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                >
                  {message.content}
                </p>
              )
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
                  title={getStatusLabel(message.status || 'sent')}
                  aria-label={getStatusLabel(message.status || 'sent')}
                  className={cn(
                    'inline-flex items-center gap-1',
                    message.status === 'read'
                      ? 'text-blue-400'
                      : 'text-emerald-200/60',
                  )}
                >
                  <span className="hidden sm:inline text-[10px]">
                    {getStatusLabel(message.status || 'sent')}
                  </span>
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
