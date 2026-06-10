// Helpers puros do Chat (Fase 2 da refatoracao): constantes e funcoes sem estado
// de React extraidas de Chat.tsx para reduzir o monolito e permitir reuso/teste.
import { Conversation, Message } from '@/lib/supabase';

export const CONVERSATION_LIST_SELECT =
  'id, contact_name, contact_number, platform, last_message, last_message_at, unread_count, lead_status, contact_presence, contact_is_online, contact_last_seen_at, contact_presence_updated_at, attending_by, attending_name, attending_since, created_at';
export const INITIAL_MESSAGE_LIMIT = 30;
export const INITIAL_ALINE_LOG_LIMIT = 60;
export const MESSAGE_PAGE_LIMIT = 30;
export const CONVERSATION_LIST_LIMIT = 500;
export const MESSAGE_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
export const OPTIMISTIC_REPLACEMENT_WINDOW_MS = 45 * 1000;

export const normalizeComparablePhone = (phone: string | null | undefined) =>
  String(phone || '').replace(/\D/g, '');

export const getStartOfTodayTime = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.getTime();
};

export const formatChatCurrency = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';

  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

export const getMessageTime = (message: Partial<Message>) =>
  new Date(message.created_at || '').getTime() || 0;

export const isOptimisticMessage = (message: Partial<Message>) =>
  String(message.id || '').startsWith('optimistic-');

export const normalizeMessageText = (value?: string | null) =>
  String(value || '').trim().replace(/\s+/g, ' ');

export const normalizeMediaUrl = (value?: string | null) => {
  const url = String(value || '').trim();
  if (!url || url.startsWith('blob:')) return '';
  return url.split('?')[0];
};

export const detectAudioUrlFromText = (value?: string | null) => {
  const text = String(value || '').trim();
  const match = text.match(/https?:\/\/\S+/i);
  if (!match) return '';

  const url = match[0].replace(/[)\].,;!?]+$/, '');
  const lower = url.toLowerCase();
  if (
    /\.(mp3|ogg|oga|opus|wav|m4a|aac|amr|webm)(?:$|[?#])/i.test(lower) ||
    /temp-file-download\/.*(?:=\.mp3|=\.ogg|=\.oga|=\.opus|=\.wav|=\.m4a|=\.aac|=\.amr|=\.webm)/i.test(lower) ||
    /(audio|voice|ptt|recording|microphone|opus|ogg|m4a|mp3|amr|aac|wav)/i.test(lower)
  ) {
    return url;
  }

  return '';
};

export const normalizeMessageForDisplay = (message: Message): Message => {
  const audioUrlFromContent = detectAudioUrlFromText(message.content);
  const audioUrlFromMedia = detectAudioUrlFromText(message.media_url);
  const audioUrl = audioUrlFromMedia || audioUrlFromContent;

  if (!audioUrl) return message;

  return {
    ...message,
    message_type: 'audio',
    media_url: message.media_url || audioUrl,
    content: audioUrlFromContent && normalizeMessageText(message.content) === audioUrl
      ? '[Audio recebido]'
      : message.content,
  };
};

export const isSameTimeWindow = (
  a: Partial<Message>,
  b: Partial<Message>,
  windowMs = MESSAGE_DUPLICATE_WINDOW_MS,
) => {
  const aTime = getMessageTime(a);
  const bTime = getMessageTime(b);
  if (!aTime || !bTime) return true;
  return Math.abs(aTime - bTime) <= windowMs;
};

export const isNearDuplicateMessage = (a: Partial<Message>, b: Partial<Message>) => {
  const aContent = normalizeMessageText(a.content);
  const bContent = normalizeMessageText(b.content);
  if (!aContent || !bContent || aContent !== bContent) return false;
  if (a.is_from_me !== b.is_from_me) return false;
  return isSameTimeWindow(a, b, 30000);
};

export const sortMessagesByTime = (items: Message[]) =>
  [...items].sort((a, b) => getMessageTime(a) - getMessageTime(b));

export const getConversationTime = (conversation: Partial<Conversation>) =>
  new Date(conversation.last_message_at || conversation.created_at || '').getTime() || 0;

export const sortConversationsByRecent = (items: Conversation[]) =>
  [...items].sort((a, b) => getConversationTime(b) - getConversationTime(a));

export const areDuplicateMessageRecords = (a: Partial<Message>, b: Partial<Message>) => {
  if (!a?.id || !b?.id) return false;
  if (a.id === b.id) return true;
  if (a.is_from_me !== b.is_from_me) return false;

  const aZapiId = String(a.zapi_message_id || '').trim();
  const bZapiId = String(b.zapi_message_id || '').trim();
  if (aZapiId && bZapiId && aZapiId === bZapiId) return true;

  const aType = a.message_type || 'text';
  const bType = b.message_type || 'text';
  const aContent = normalizeMessageText(a.content);
  const bContent = normalizeMessageText(b.content);

  const aMediaUrl = normalizeMediaUrl(a.media_url);
  const bMediaUrl = normalizeMediaUrl(b.media_url);
  if (aMediaUrl && bMediaUrl && aMediaUrl === bMediaUrl) return true;

  if (
    aContent &&
    bContent &&
    aContent === bContent &&
    isSameTimeWindow(a, b, 60000) &&
  (
    aType === bType ||
    (aType === 'text' && ['image', 'video'].includes(bType)) ||
    (bType === 'text' && ['image', 'video'].includes(aType))
  )
  ) {
    return true;
  }

  if (aType !== bType) return false;

  if (
    (isOptimisticMessage(a) || isOptimisticMessage(b)) &&
    ['image', 'audio', 'video', 'document'].includes(aType) &&
    isSameTimeWindow(a, b, OPTIMISTIC_REPLACEMENT_WINDOW_MS)
  ) {
    return true;
  }

  return isNearDuplicateMessage(a, b);
};

export const mergeDuplicateMessageRecords = (current: Message, incoming: Message) => {
  const currentIsOptimistic = isOptimisticMessage(current);
  const incomingIsOptimistic = isOptimisticMessage(incoming);

  if (currentIsOptimistic && !incomingIsOptimistic) {
    return { ...current, ...incoming };
  }

  if (!currentIsOptimistic && incomingIsOptimistic) {
    return {
      ...current,
      status: current.status || incoming.status,
      media_url: current.media_url || incoming.media_url,
      content: current.content || incoming.content,
    };
  }

  const currentHasMedia = ['image', 'video'].includes(current.message_type || '') && !!current.media_url;
  const incomingHasMedia = ['image', 'video'].includes(incoming.message_type || '') && !!incoming.media_url;

  if (currentHasMedia && !incomingHasMedia) {
    return {
      ...current,
      status: incoming.status || current.status,
      zapi_message_id: incoming.zapi_message_id || current.zapi_message_id,
    };
  }

  if (!currentHasMedia && incomingHasMedia) {
    return {
      ...incoming,
      id: current.id,
      created_at: current.created_at || incoming.created_at,
      zapi_message_id: incoming.zapi_message_id || current.zapi_message_id,
    };
  }

  return {
    ...current,
    ...incoming,
    id: current.id,
    created_at: current.created_at || incoming.created_at,
    zapi_message_id: incoming.zapi_message_id || current.zapi_message_id,
    media_url: incoming.media_url || current.media_url,
    content: incoming.content || current.content,
  };
};

export const dedupeMessagesStable = (items: Message[]) => {
  const deduped: Message[] = [];

  sortMessagesByTime(items.map(normalizeMessageForDisplay)).forEach((message) => {
    if (!message?.id) return;

    const duplicateIndex = deduped.findIndex((existing) =>
      areDuplicateMessageRecords(existing, message),
    );

    if (duplicateIndex >= 0) {
      deduped[duplicateIndex] = mergeDuplicateMessageRecords(deduped[duplicateIndex], message);
      return;
    }

    deduped.push(message);
  });

  return sortMessagesByTime(deduped);
};

export const areMessagesEqual = (a: Message[], b: Message[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  return a.every((message, index) => {
    const next = b[index];
    return (
      message.id === next.id &&
      message.content === next.content &&
      message.created_at === next.created_at &&
      message.conversation_id === next.conversation_id &&
      message.status === next.status &&
      message.media_url === next.media_url &&
      message.message_type === next.message_type &&
      message.zapi_message_id === next.zapi_message_id &&
      message.deleted_at === next.deleted_at &&
      message.edited_at === next.edited_at
    );
  });
};

export const mergeMessagesStable = (current: Message[], incoming: Message[]) => {
  const byId = new Map<string, Message>();
  [...current, ...incoming].forEach((message) => {
    if (!message?.id) return;
    byId.set(message.id, { ...(byId.get(message.id) || {}), ...message });
  });

  return dedupeMessagesStable(Array.from(byId.values()));
};

export const buildPhoneVariants = (phone: string) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const variants = new Set<string>();
  if (digits) variants.add(digits);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    variants.add(digits.slice(2));
  }
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    variants.add(`55${digits}`);
  }
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    variants.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
    variants.add(`${digits.slice(2, 4)}${digits.slice(5)}`);
  }
  if (digits.startsWith('55') && digits.length === 12) {
    variants.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
    variants.add(`${digits.slice(2, 4)}9${digits.slice(4)}`);
  }
  return Array.from(variants);
};

export const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export const playHumanAttentionBeep = () => {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 0.72;
    masterGain.connect(audioContext.destination);

    [0, 0.24, 0.48].forEach((offset, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = index % 2 === 0 ? 980 : 1240;
      gain.gain.setValueAtTime(0.001, audioContext.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.75, audioContext.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + offset + 0.18);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(audioContext.currentTime + offset);
      oscillator.stop(audioContext.currentTime + offset + 0.2);
    });

    window.setTimeout(() => {
      void audioContext.close().catch(() => {});
    }, 1100);
  } catch {
    // Browsers can block audio before the first user interaction.
  }
};

export const notifyBrowserHumanAttention = (name: string) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification('Precisa de atendimento humano', {
      body: `${name} esta aguardando um vendedor no CRM.`,
      tag: `human-attention-${name}`,
    });
    return;
  }

  if (Notification.permission === 'default') {
    void Notification.requestPermission();
  }
};

export const formatContactPresence = (conversation: Conversation | null) => {
  if (!conversation) return '';

  const presence = String(conversation.contact_presence || '').toLowerCase();

  if (presence === 'composing') return 'digitando...';
  if (presence === 'recording') return 'gravando audio...';
  if (conversation.contact_is_online || presence === 'available') return 'online agora';

  const lastSeen = conversation.contact_last_seen_at || conversation.contact_presence_updated_at;
  if (!lastSeen) return '';

  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMins < 1) return 'visto agora';
  if (diffMins < 60) return `visto ha ${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `visto ha ${diffHours}h`;

  return `visto em ${date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })}`;
};
