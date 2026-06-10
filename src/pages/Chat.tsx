import { memo, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { supabase, Conversation, Message, LeadStatus } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import {
  Send,
  Paperclip,
  Search,
  MessageSquare,
  Mic,
  Bot,
  Phone,
  ArrowLeft,
  MoreVertical,
  UserCheck,
  RefreshCw,
  MessageCircle,
  Sparkles,
  X,
  Loader2,
  UserPlus,
  Camera,
  Square,
  CheckCircle2,
  Trophy,
  ShoppingBag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { LeadStatusSelect } from '@/components/chat/LeadStatusSelect';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import TypingIndicator from '@/components/chat/TypingIndicator';
import SellerToolsPanel from '@/components/chat/SellerToolsPanel';
import AssignSellerDialog from '@/components/chat/AssignSellerDialog';
import FinalizeSaleDialog from '@/components/chat/FinalizeSaleDialog';
import MessageItem from '@/components/chat/MessageItem';
import ConversationItem from '@/components/chat/ConversationItem';
import { useSellerPresence } from '@/hooks/useSellerPresence';
import { useUserRole } from '@/hooks/useUserRole';
import { useAssignmentNotification } from '@/hooks/useAssignmentNotification';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuth } from '@/contexts/AuthContext';
import { useChatAttending } from '@/hooks/useChatAttending';
import { ToastAction } from '@/components/ui/toast';
import {
  CONVERSATION_LIST_SELECT,
  INITIAL_MESSAGE_LIMIT,
  INITIAL_ALINE_LOG_LIMIT,
  MESSAGE_PAGE_LIMIT,
  CONVERSATION_LIST_LIMIT,
  normalizeComparablePhone,
  getStartOfTodayTime,
  formatChatCurrency,
  isNearDuplicateMessage,
  sortConversationsByRecent,
  dedupeMessagesStable,
  areMessagesEqual,
  mergeMessagesStable,
  buildPhoneVariants,
  chunkArray,
  playHumanAttentionBeep,
  notifyBrowserHumanAttention,
  formatContactPresence,
} from '@/lib/chat-helpers';

interface AlineConversation {
  id: string;
  phone: string;
  status: string;
  active_agent?: string;
  assigned_seller_id?: string;
  assigned_seller_name?: string;
  assignment_reason?: string;
  assigned_at?: string;
  current_node?: string;
  followup_count?: number;
  collected_data?: Record<string, any> | null;
}

type ChatInboxView = 'all' | 'today' | 'recovery';

interface CustomerProfile {
  whatsapp: string;
  name?: string;
  profile_pic_url?: string;
}

type OutgoingAttachmentPayload = {
  message: string;
  message_type: string;
  media_url: string;
};

type PendingChatAttachment = {
  id: string;
  file: File;
  messageType: string;
  previewUrl: string | null;
  label: string;
  sizeLabel: string;
};

type MessagesCacheState = {
  messages: Message[];
  hasOlder: boolean;
  oldestCrmCursor: string | null;
  oldestAlineCursor: string | null;
};

const statusFilters = [
  { key: 'all', label: 'Todos', color: 'bg-slate-500' },
  { key: 'novo', label: 'Novos', color: 'bg-slate-400' },
  { key: 'frio', label: 'Frios', color: 'bg-blue-400' },
  { key: 'quente', label: 'Quentes', color: 'bg-orange-400' },
  { key: 'acao_humana', label: 'Ação humana', color: 'bg-amber-400' },
  { key: 'vendido', label: 'Vendidos', color: 'bg-emerald-400' },
];

const chatViewTabs: Array<{ key: ChatInboxView; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'today', label: 'Hoje' },
  { key: 'recovery', label: 'Recuperacao' },
];



interface ChatComposerProps {
  disabled: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  pendingAttachments: PendingChatAttachment[];
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPasteFiles: (files: File[]) => void;
  onRemovePendingAttachment: (id: string) => void;
  onCaptureScreenshot: () => void;
  onStartRecording: () => void;
  onSendMessage: (message: string) => Promise<void> | void;
}

const ChatComposer = memo(function ChatComposer({
  disabled,
  fileInputRef,
  pendingAttachments,
  onFileUpload,
  onPasteFiles,
  onRemovePendingAttachment,
  onCaptureScreenshot,
  onStartRecording,
  onSendMessage,
}: ChatComposerProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = (draft.trim().length > 0 || pendingAttachments.length > 0) && !disabled;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [draft]);

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;

    const messageText = draft;
    setDraft('');
    void onSendMessage(messageText);
  };

  return (
    <div className="space-y-2">
      {pendingAttachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto rounded-lg bg-[#111b21] px-3 py-2">
          {pendingAttachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative flex w-28 shrink-0 flex-col gap-1 overflow-hidden rounded-lg bg-[#202c33] p-2"
            >
              <button
                type="button"
                aria-label="Remover anexo"
                onClick={() => onRemovePendingAttachment(attachment.id)}
                className="absolute right-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-slate-950/80 text-slate-200 transition-colors hover:bg-rose-500 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>

              <div className="grid h-16 place-items-center overflow-hidden rounded-md bg-[#111b21]">
                {attachment.messageType === 'image' && attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.label}
                    className="h-full w-full object-cover"
                  />
                ) : attachment.messageType === 'video' && attachment.previewUrl ? (
                  <video src={attachment.previewUrl} className="h-full w-full object-cover" muted />
                ) : attachment.messageType === 'audio' ? (
                  <Mic className="h-5 w-5 text-emerald-300" />
                ) : (
                  <Paperclip className="h-5 w-5 text-slate-300" />
                )}
              </div>

              <span className="truncate text-[10px] font-medium text-slate-200" title={attachment.label}>
                {attachment.label}
              </span>
              <span className="text-[9px] text-slate-500">{attachment.sizeLabel}</span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-none">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileUpload}
        accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
        multiple
      />

      <div className="flex items-center gap-1 shrink-0 pb-1">
        <button
          type="button"
          aria-label="Anexar arquivos"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="grid h-10 w-10 place-items-center rounded-full text-slate-300 transition-colors hover:bg-white/8 hover:text-[#00a884] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <button
          type="button"
          aria-label="Preparar captura de tela"
          onClick={onCaptureScreenshot}
          disabled={disabled}
          className="hidden sm:grid h-10 w-10 place-items-center rounded-full text-slate-300 transition-colors hover:bg-white/8 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Camera className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-w-0 rounded-lg bg-[#2a3942] px-4 py-2 focus-within:ring-1 focus-within:ring-[#00a884]/35">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => {
            if (disabled) return;
            const clipboardFiles = Array.from(event.clipboardData?.files || []);
            const pastedFiles = clipboardFiles.length
              ? clipboardFiles
              : Array.from(event.clipboardData?.items || [])
                  .filter((item) => item.kind === 'file')
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => !!file);

            if (!pastedFiles.length) return;

            event.preventDefault();
            onPasteFiles(pastedFiles);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={pendingAttachments.length > 0 ? 'Adicione uma legenda ou envie o anexo' : 'Digite uma mensagem'}
          disabled={disabled}
          rows={1}
          className="block max-h-[120px] min-h-[24px] w-full resize-none bg-transparent text-[15px] leading-6 text-slate-100 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {canSend ? (
        <button
          type="submit"
          aria-label="Enviar mensagem"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#111b21] transition-colors hover:bg-[#06cf9c]"
        >
          <Send className="w-4 h-4" />
        </button>
      ) : !disabled ? (
        <button
          type="button"
          aria-label="Gravar áudio"
          onClick={onStartRecording}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#111b21] transition-colors hover:bg-[#06cf9c]"
        >
          <Mic className="w-5 h-5" />
        </button>
      ) : null}
      </form>
    </div>
  );
});

const Chat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 200);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [updatingLeadStatus, setUpdatingLeadStatus] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [chatView, setChatView] = useState<ChatInboxView>('all');
  const [todayInboundConversationIds, setTodayInboundConversationIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAttendant, setFilterAttendant] = useState<string>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [alineStatusMap, setAlineStatusMap] = useState<Record<string, AlineConversation>>({});
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [customerProfiles, setCustomerProfiles] = useState<Record<string, CustomerProfile>>({});
  const [finalizingSale, setFinalizingSale] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');
  const [editingMessageBusyId, setEditingMessageBusyId] = useState<string | null>(null);
  const [deletingMessageBusyId, setDeletingMessageBusyId] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingChatAttachment[]>([]);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const recordingCancelledRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScroll = useRef(true);
  const lastMessageCount = useRef(0);
  const relatedConversationIdsRef = useRef<Set<string>>(new Set());
  const relatedAlineConversationIdsRef = useRef<Set<string>>(new Set());
  const fetchMessagesRequestRef = useRef(0);
  const messagesCacheRef = useRef<Map<string, MessagesCacheState>>(new Map());
  const currentMessagesCacheKeyRef = useRef<string>('');
  const oldestCrmMessageCursorRef = useRef<string | null>(null);
  const oldestAlineMessageCursorRef = useRef<string | null>(null);
  const loadingOlderMessagesRef = useRef(false);
  const hasOlderMessagesRef = useRef(false);
  const actionHumanAlertReadyRef = useRef(false);
  const actionHumanConversationIdsRef = useRef<Set<string>>(new Set());
  const profilePictureRequestsRef = useRef<Set<string>>(new Set());
  const pendingAttachmentsRef = useRef<PendingChatAttachment[]>([]);

  const scrollMessagesToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    });
  }, []);

  const { toast } = useToast();
  const { onlineSellers, startChatting, stopChatting } = useSellerPresence();
  const { isAdmin, isGerente } = useUserRole();
  const { profile, user } = useAuth();

  useAssignmentNotification();

  const currentLoggedSellerName = useMemo(() => {
    const profileName = profile?.full_name?.trim();
    const userMetadataName = typeof user?.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name.trim()
      : '';
    const emailName = user?.email?.split('@')[0];

    return profileName || userMetadataName || emailName || 'Vendedor';
  }, [profile?.full_name, user?.user_metadata, user?.email]);

  useChatAttending({
    conversationId: selectedConversation?.id,
    userId: user?.id,
    userName: currentLoggedSellerName,
    enabled: Boolean(selectedConversation),
  });

  const getAlineDataForPhone = useCallback(
    (phone: string) => {
      for (const variant of buildPhoneVariants(phone)) {
        const data = alineStatusMap[variant];
        if (data) return data;
      }
      return undefined;
    },
    [alineStatusMap],
  );

  const getCustomerProfileForPhone = useCallback(
    (phone: string) => {
      for (const variant of buildPhoneVariants(phone)) {
        const data = customerProfiles[variant];
        if (data) return data;
      }
      return undefined;
    },
    [customerProfiles],
  );

  const requestMissingProfilePictures = useCallback(
    async (conversationList: Conversation[], profilesMap: Record<string, CustomerProfile>) => {
      const phones = conversationList
        .filter((conversation) => {
          const variants = buildPhoneVariants(conversation.contact_number);
          return !variants.some((variant) => profilesMap[variant]?.profile_pic_url);
        })
        .map((conversation) => buildPhoneVariants(conversation.contact_number)[0])
        .filter((phone): phone is string => Boolean(phone))
        .filter((phone) => {
          if (profilePictureRequestsRef.current.has(phone)) return false;
          profilePictureRequestsRef.current.add(phone);
          return true;
        })
        .slice(0, 40);

      if (phones.length === 0) return;

      try {
        const { data, error } = await supabase.functions.invoke('zapi-profile-picture', {
          body: { phones },
        });

        if (error) throw error;

        const results = Array.isArray(data?.results) ? data.results : [];
        const withPictures = results.filter((item: any) => item?.phone && item?.profilePicUrl);
        if (withPictures.length === 0) return;

        setCustomerProfiles((prev) => {
          const next = { ...prev };

          withPictures.forEach((item: any) => {
            const variants = buildPhoneVariants(String(item.phone));
            const existing = variants.map((variant) => next[variant] || profilesMap[variant]).find(Boolean);
            const profile: CustomerProfile = {
              whatsapp: String(item.phone),
              name: existing?.name || String(item.phone),
              profile_pic_url: String(item.profilePicUrl),
            };

            variants.forEach((variant) => {
              next[variant] = profile;
            });
          });

          return next;
        });
      } catch (error) {
        console.warn('Nao foi possivel buscar fotos de perfil dos contatos:', error);
      }
    },
    [],
  );

  const getIsHumanTakeover = useCallback(
    (phone: string) => {
      const data = getAlineDataForPhone(phone);
      return data?.status === 'human_takeover' || data?.active_agent === 'human';
    },
    [getAlineDataForPhone],
  );

  const fetchTodayInboundConversationIds = useCallback(async () => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('is_from_me', false)
      .gte('created_at', startOfToday.toISOString())
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      console.warn('Nao foi possivel carregar mensagens recebidas hoje:', error);
      return;
    }

    setTodayInboundConversationIds(
      new Set((data || []).map((message) => message.conversation_id).filter(Boolean)),
    );
  }, []);

  const getDerivedActionStage = useCallback((conv: Conversation) => {
    const text = String(conv.last_message || '').toLowerCase();
    return (
      text.includes('atendimento humano') ||
      text.includes('vou te encaminhar') ||
      text.includes('vendedor envia') ||
      text.includes('finalizar seu') ||
      text.includes('seguimos com') ||
      text.includes('sem simulacao') ||
      text.includes('sem simulação') ||
      text.includes('forma de pagamento')
    );
  }, []);

  const isActionHumanConversation = useCallback((conv: Conversation) => {
    const leadStatus = conv.lead_status || 'novo';
    return leadStatus === 'humano' || leadStatus === 'venda_iniciada' || getIsHumanTakeover(conv.contact_number) || getDerivedActionStage(conv);
  }, [getIsHumanTakeover, getDerivedActionStage]);

  const isRecoveryAutomationConversation = useCallback(
    (conv: Conversation) => {
      const data = getAlineDataForPhone(conv.contact_number);
      const currentNode = String(data?.current_node || '').toLowerCase();
      const collectedData = data?.collected_data || {};
      const lastFollowupKind = String(collectedData.last_followup_kind || '').toLowerCase();

      return (
        Number(data?.followup_count || 0) > 0 ||
        currentNode.includes('followup') ||
        currentNode.includes('resgate') ||
        currentNode.includes('recuper') ||
        Boolean(collectedData.last_followup_at) ||
        lastFollowupKind.includes('followup') ||
        lastFollowupKind.includes('resgate')
      );
    },
    [getAlineDataForPhone],
  );

  const matchesChatView = useCallback(
    (conv: Conversation, view: ChatInboxView) => {
      if (view === 'all') return true;

      if (view === 'today') {
        return todayInboundConversationIds.has(conv.id);
      }

      return isRecoveryAutomationConversation(conv);
    },
    [isRecoveryAutomationConversation, todayInboundConversationIds],
  );

  useEffect(() => {
    const actionHumanConversations = conversations.filter(isActionHumanConversation);
    const nextIds = new Set(actionHumanConversations.map((conversation) => conversation.id));

    if (!actionHumanAlertReadyRef.current) {
      actionHumanConversationIdsRef.current = nextIds;
      actionHumanAlertReadyRef.current = true;
      return;
    }

    const newAttentionConversations = actionHumanConversations.filter(
      (conversation) => !actionHumanConversationIdsRef.current.has(conversation.id),
    );

    actionHumanConversationIdsRef.current = nextIds;

    if (newAttentionConversations.length === 0) return;

    const firstConversation = newAttentionConversations[0];
    const displayName =
      getCustomerProfileForPhone(firstConversation.contact_number)?.name ||
      firstConversation.contact_name ||
      firstConversation.contact_number;

    playHumanAttentionBeep();
    notifyBrowserHumanAttention(displayName);
    toast({
      title: 'Precisa de atendimento humano',
      description:
        newAttentionConversations.length === 1
          ? `${displayName} esta aguardando um vendedor online.`
          : `${newAttentionConversations.length} conversas entraram na fila humana.`,
      action: (
        <ToastAction
          altText="Abrir conversa"
          onClick={() => {
            setSelectedConversation(firstConversation);
            setChatView('all');
            setFilterStatus('all');
            setFilterAttendant('all');
          }}
        >
          Abrir
        </ToastAction>
      ),
    });
  }, [conversations, isActionHumanConversation, getCustomerProfileForPhone, toast]);

  const matchesStatusFilter = useCallback((conv: Conversation, status: string) => {
    const leadStatus = conv.lead_status || 'novo';
    if (status === 'acao_humana') {
      return isActionHumanConversation(conv);
    }
    return status === 'all' || leadStatus === status;
  }, [isActionHumanConversation]);

  const matchesAttendantFilter = useCallback(
    (conv: Conversation, attendant: string) => {
      const isHuman = isActionHumanConversation(conv);

      if (attendant === 'all') return true;
      if (attendant === 'vendedor') return isHuman;
      if (attendant === 'aline') return !isHuman;

      return true;
    },
    [isActionHumanConversation],
  );

  const updateLeadStatus = async (conversationId: string, status: LeadStatus) => {
    setUpdatingLeadStatus(true);

    try {
      const targetConversation =
        conversations.find((conversation) => conversation.id === conversationId) ||
        (selectedConversation?.id === conversationId ? selectedConversation : null);

      const { error } = await supabase
        .from('conversations')
        .update({ lead_status: status })
        .eq('id', conversationId);

      if (error) throw error;

      if (status === 'humano' && targetConversation?.contact_number) {
        const { error: takeoverError } = await supabase.functions.invoke('aline-takeover', {
          body: {
            phone: targetConversation.contact_number,
            action: 'takeover',
            reason: 'Status alterado para humano no painel',
          },
        });

        if (takeoverError) {
          console.warn('Falha ao sincronizar atendimento humano:', takeoverError);
        } else {
          setAlineStatusMap((prev) => ({
            ...prev,
            [targetConversation.contact_number]: {
              ...prev[targetConversation.contact_number],
              phone: targetConversation.contact_number,
              status: 'human_takeover',
              active_agent: 'human',
            },
          }));
        }
      }

      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, lead_status: status } : c)),
      );

      if (selectedConversation?.id === conversationId) {
        setSelectedConversation((prev) =>
          prev ? { ...prev, lead_status: status } : null,
        );
      }

      toast({ title: 'Status atualizado!' });
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingLeadStatus(false);
    }
  };

  const handleUndoSale = async () => {
    if (!selectedConversation || finalizingSale) return;

    setFinalizingSale(true);

    try {
      const { data: existingSale, error: fetchSaleError } = await supabase
        .from('orders')
        .select('id, notes')
        .eq('external_reference', selectedConversation.id)
        .eq('source', 'chat')
        .eq('status', 'done')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchSaleError) throw fetchSaleError;

      if (existingSale?.id) {
        const updatedNotes = existingSale.notes
          ? `${existingSale.notes}\nVenda desfeita pelo chat.`
          : 'Venda desfeita pelo chat.';

        const { error: cancelOrderError } = await supabase
          .from('orders')
          .update({
            status: 'canceled',
            notes: updatedNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSale.id);

        if (cancelOrderError) throw cancelOrderError;
      }

      const { error: conversationError } = await supabase
        .from('conversations')
        .update({ lead_status: 'qualificado' })
        .eq('id', selectedConversation.id);

      if (conversationError) throw conversationError;

      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversation.id ? { ...c, lead_status: 'qualificado' } : c,
        ),
      );

      setSelectedConversation((prev) =>
        prev ? { ...prev, lead_status: 'qualificado' } : null,
      );

      toast({
        title: '↩️ Venda desfeita',
        description: 'A conversa voltou para qualificado e a venda do chat foi cancelada.',
      });
    } catch (error) {
      console.error('Erro ao desfazer venda:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível desfazer a venda.',
        variant: 'destructive',
      });
    } finally {
      setFinalizingSale(false);
    }
  };

  const handleFinalizeSale = () => {
    if (!selectedConversation || finalizingSale) return;

    if (selectedConversation.lead_status === 'vendido') {
      void handleUndoSale();
      return;
    }

    setFinalizeDialogOpen(true);
  };

  const handleConfirmSale = async (payload: {
    productId: string;
    productName: string;
    productSku: string | null;
    unitPrice: number;
    quantity: number;
    notes: string;
  }) => {
    if (!selectedConversation) return;

    setFinalizingSale(true);

    try {
      const raw = payload as any;
      const selectedProduct = raw.selectedProduct || raw.product || null;
      const selectedItem =
        Array.isArray(raw.items) && raw.items.length > 0 ? raw.items[0] : null;

      const productIdCandidate =
        raw.productId ??
        raw.product_id ??
        raw.id ??
        selectedProduct?.id ??
        selectedProduct?.product_id ??
        selectedItem?.id ??
        selectedItem?.product_id ??
        null;

      const productNameCandidate =
        raw.productName ??
        raw.product_name ??
        raw.name ??
        raw.selectedName ??
        raw.selected_name ??
        selectedProduct?.name ??
        selectedProduct?.product_name ??
        selectedItem?.name ??
        selectedItem?.product_name ??
        null;

      const productSkuCandidate =
        raw.productSku ??
        raw.product_sku ??
        raw.sku ??
        raw.selectedSku ??
        raw.selected_sku ??
        selectedProduct?.sku ??
        selectedProduct?.product_sku ??
        selectedItem?.sku ??
        selectedItem?.product_sku ??
        null;

      const quantityCandidate =
        raw.quantity ??
        raw.qty ??
        raw.selectedQuantity ??
        raw.selected_quantity ??
        selectedItem?.quantity ??
        1;

      const unitPriceCandidate =
        raw.unitPrice ??
        raw.unit_price ??
        raw.price ??
        raw.selectedPrice ??
        raw.selected_price ??
        selectedProduct?.price ??
        selectedProduct?.unit_price ??
        selectedItem?.price ??
        selectedItem?.unit_price ??
        0;

      const notes = String(
        raw.notes ?? raw.observations ?? raw.observacao ?? '',
      ).trim();

      const parseMoney = (value: unknown) => {
        if (typeof value === 'number') return value;

        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) return NaN;

          const normalized = trimmed.includes(',')
            ? trimmed.replace(/\./g, '').replace(',', '.')
            : trimmed;

          const numeric = normalized.replace(/[^\d.-]/g, '');
          return Number(numeric);
        }

        return Number(value);
      };

      const productId =
        productIdCandidate !== null && productIdCandidate !== undefined
          ? String(productIdCandidate).trim()
          : '';

      const productName =
        productNameCandidate !== null && productNameCandidate !== undefined
          ? String(productNameCandidate).trim()
          : '';

      const productSku =
        productSkuCandidate !== null && productSkuCandidate !== undefined
          ? String(productSkuCandidate).trim()
          : null;

      const parsedQuantity = Number(quantityCandidate);
      const safeQuantity =
        Number.isFinite(parsedQuantity) && parsedQuantity > 0
          ? Math.floor(parsedQuantity)
          : 1;

      const parsedUnitPrice = parseMoney(unitPriceCandidate);
      const safeUnitPrice =
        Number.isFinite(parsedUnitPrice) && parsedUnitPrice >= 0
          ? parsedUnitPrice
          : 0;

      if (!productName) {
        throw new Error('Selecione um produto válido antes de confirmar a venda.');
      }

      const customerName =
        getCustomerProfileForPhone(selectedConversation.contact_number)?.name ||
        selectedConversation.contact_name ||
        null;

      const { data: existingSale, error: existingSaleError } = await supabase
        .from('orders')
        .select('id')
        .eq('external_reference', selectedConversation.id)
        .eq('source', 'chat')
        .eq('status', 'done')
        .limit(1)
        .maybeSingle();

      if (existingSaleError) throw existingSaleError;

      if (existingSale?.id) {
        throw new Error('Já existe uma venda ativa registrada para esta conversa.');
      }

      const totalPrice = safeUnitPrice * safeQuantity;
      const summaryText =
        `Venda finalizada no chat por ${currentLoggedSellerName}: ` +
        `${productName}` +
        `${productSku ? ` (${productSku})` : ''}` +
        ` x${safeQuantity}.`;

      const { error: orderError } = await supabase.from('orders').insert([
        {
          customer_phone: selectedConversation.contact_number,
          customer_name: customerName,
          product_id: productId || null,
          quantity: safeQuantity,
          unit_price: safeUnitPrice,
          total_price: totalPrice,
          status: 'done',
          source: 'chat',
          external_reference: selectedConversation.id,
          selected_sku: productSku,
          selected_name: productName,
          assigned_to: currentLoggedSellerName,
          notes: notes || null,
          summary_text: summaryText,
        },
      ]);

      if (orderError) throw orderError;

      const { error: conversationError } = await supabase
        .from('conversations')
        .update({ lead_status: 'vendido' })
        .eq('id', selectedConversation.id);

      if (conversationError) throw conversationError;

      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversation.id ? { ...c, lead_status: 'vendido' } : c,
        ),
      );

      setSelectedConversation((prev) =>
        prev ? { ...prev, lead_status: 'vendido' } : null,
      );

      toast({
        title: '🏆 Venda registrada',
        description: `${productName} x${safeQuantity} salvo com sucesso.`,
      });
    } catch (error: any) {
      console.error('Erro ao finalizar venda:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Não foi possível finalizar a venda.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setFinalizingSale(false);
    }
  };

  const handleTakeover = async (action: 'takeover' | 'release') => {
    if (!selectedConversation) return;

    setTakingOver(true);

    try {
      const { data, error } = await supabase.functions.invoke('aline-takeover', {
        body: {
          phone: selectedConversation.contact_number,
          action,
        },
      });

      if (error) throw error;

      const newStatus = action === 'takeover' ? 'human_takeover' : 'active';

      setAlineStatusMap((prev) => ({
        ...prev,
        [selectedConversation.contact_number]: {
          ...prev[selectedConversation.contact_number],
          phone: selectedConversation.contact_number,
          status: newStatus,
          active_agent: action === 'release' ? 'aline' : 'human',
        },
      }));

      toast({
        title:
          action === 'takeover'
            ? '✋ Atendimento assumido'
            : '🤖 Devolvido para Aline',
        description: data.message,
      });
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o atendimento.',
        variant: 'destructive',
      });
    } finally {
      setTakingOver(false);
    }
  };

  const handleAssignToSeller = async (sellerId: string, sellerName: string) => {
    if (!selectedConversation) return;

    setTakingOver(true);

    try {
      const { error } = await supabase.functions.invoke('aline-takeover', {
        body: {
          phone: selectedConversation.contact_number,
          action: 'takeover',
          seller_id: sellerId,
          seller_name: sellerName,
          reason: 'Atribuição manual via painel',
        },
      });

      if (error) throw error;

      setAlineStatusMap((prev) => ({
        ...prev,
        [selectedConversation.contact_number]: {
          ...prev[selectedConversation.contact_number],
          phone: selectedConversation.contact_number,
          status: 'human_takeover',
          active_agent: 'human',
          assigned_seller_id: sellerId,
          assigned_seller_name: sellerName,
        },
      }));

      toast({
        title: '✅ Conversa atribuída',
        description: `Atribuída para ${sellerName}`,
      });
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível atribuir.',
        variant: 'destructive',
      });
    } finally {
      setTakingOver(false);
    }
  };

  const buildMessagePreview = useCallback((message: Partial<Message> | null | undefined) => {
    if (!message) return '';
    if (message.deleted_at) return 'Mensagem removida';
    if (message.content?.trim()) return message.content.trim();

    switch (message.message_type) {
      case 'image':
        return '📷 Imagem';
      case 'audio':
        return '🎤 Áudio';
      case 'video':
        return '🎬 Vídeo';
      case 'document':
        return '📎 Documento';
      default:
        return message.media_url ? '📎 Mídia' : '';
    }
  }, []);

  const bumpConversationFromMessage = useCallback(
    (message: Partial<Message> | null | undefined, options?: { forceTop?: boolean }) => {
      if (!message?.conversation_id) return;

      const nextLastMessage = buildMessagePreview(message);
      const nextLastMessageAt =
        options?.forceTop
          ? new Date().toISOString()
          : message.edited_at || message.created_at || new Date().toISOString();

      setConversations((prev) => {
        let touched = false;
        const next = prev.map((conversation) => {
          if (conversation.id !== message.conversation_id) return conversation;
          touched = true;
          return {
            ...conversation,
            last_message: nextLastMessage || conversation.last_message,
            last_message_at: nextLastMessageAt,
          };
        });

        return touched ? sortConversationsByRecent(next) : prev;
      });

      setSelectedConversation((prev) =>
        prev?.id === message.conversation_id
          ? {
              ...prev,
              last_message: nextLastMessage || prev.last_message,
              last_message_at: nextLastMessageAt,
            }
          : prev,
      );
    },
    [buildMessagePreview],
  );

  const fetchMessages = useCallback(async (conversationId: string, phone?: string) => {
    const requestId = fetchMessagesRequestRef.current + 1;
    fetchMessagesRequestRef.current = requestId;
    const cacheKey = `${conversationId}:${phone || ''}`;
    currentMessagesCacheKeyRef.current = cacheKey;
    const cachedState = messagesCacheRef.current.get(cacheKey);

    if (cachedState) {
      oldestCrmMessageCursorRef.current = cachedState.oldestCrmCursor;
      oldestAlineMessageCursorRef.current = cachedState.oldestAlineCursor;
      hasOlderMessagesRef.current = cachedState.hasOlder;
      setHasOlderMessages(cachedState.hasOlder);
      setMessages((prev) => (areMessagesEqual(prev, cachedState.messages) ? prev : cachedState.messages));
    } else {
      oldestCrmMessageCursorRef.current = null;
      oldestAlineMessageCursorRef.current = null;
      hasOlderMessagesRef.current = false;
      setHasOlderMessages(false);
      setMessages((prev) => (prev.length === 0 ? prev : []));
    }

    try {
      const phoneVariants = phone ? buildPhoneVariants(phone) : [];
      const [crmConversationsResult, alineConversationResult] = await Promise.all([
        phone
          ? supabase
              .from('conversations')
              .select('id')
              .in('contact_number', phoneVariants)
              .order('created_at', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [{ id: conversationId }], error: null }),
        phone
          ? supabase
              .from('aline_conversations')
              .select('id')
              .in('phone', phoneVariants)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const relatedConversationIds = Array.from(
        new Set(
          (crmConversationsResult?.data || [])
            .map((conversation) => conversation?.id)
            .filter(Boolean)
          .concat(conversationId),
        ),
      );
      relatedConversationIdsRef.current = new Set(relatedConversationIds);

      const { data, error } = await supabase
        .from('messages')
        .select(
          'id, content, created_at, is_from_me, media_url, message_type, status, conversation_id, zapi_message_id, edited_at, deleted_at, replaced_message_id',
        )
        .in('conversation_id', relatedConversationIds)
        .order('created_at', { ascending: false })
        .limit(INITIAL_MESSAGE_LIMIT + 1);

      if (error) throw error;

      const crmRows = data || [];
      const initialCrmMessages = crmRows.slice(0, INITIAL_MESSAGE_LIMIT).reverse().filter(
        (message) => message.content?.trim() || message.media_url || message.deleted_at,
      );
      let mergedMessages = [...initialCrmMessages];

      const alineConversationId = alineConversationResult?.data?.id;
      let hasOlderAlineLogs = false;
      let initialAlineMessages: Message[] = [];
      relatedAlineConversationIdsRef.current = new Set(alineConversationId ? [alineConversationId] : []);

      if (requestId !== fetchMessagesRequestRef.current) {
        return;
      }

      if (phone && alineConversationId) {
        const { data: alineHistory, error: alineHistoryError } = await supabase
          .from('aline_messages')
          .select('id, message, created_at, role')
          .eq('conversation_id', alineConversationId)
          .order('created_at', { ascending: false })
          .limit(INITIAL_ALINE_LOG_LIMIT + 1);

        if (!alineHistoryError && alineHistory?.length) {
          hasOlderAlineLogs = alineHistory.length > INITIAL_ALINE_LOG_LIMIT;
          const mirroredTextMessages = mergedMessages.filter(
            (message) =>
              !message.media_url &&
              (message.message_type === 'text' || !message.message_type) &&
              message.content?.trim(),
          );

          const fallbackAlineMessages = alineHistory.slice(0, INITIAL_ALINE_LOG_LIMIT).reverse()
            .filter((entry) => entry.message?.trim())
            .filter((entry) => {
              const entryTime = new Date(entry.created_at || '').getTime();
              const entryIsFromMe = entry.role !== 'user';

              return !mirroredTextMessages.some((message) => {
                const messageTime = new Date(message.created_at || '').getTime();
                const sameContent = message.content?.trim() === entry.message.trim();
                const sameDirection = message.is_from_me === entryIsFromMe;
                const closeEnough =
                  Number.isFinite(entryTime) &&
                  Number.isFinite(messageTime) &&
                  Math.abs(messageTime - entryTime) <= 30000;

                return sameDirection && sameContent && closeEnough;
              });
            })
            .map(
              (entry): Message => ({
                id: `aline-log:${entry.id}`,
                conversation_id: conversationId,
                content: entry.message,
                message_type: 'text',
                media_url: null,
                is_from_me: entry.role !== 'user',
                status: entry.role === 'user' ? 'received' : 'sent',
                created_at: entry.created_at || new Date().toISOString(),
              }),
            );

          if (fallbackAlineMessages.length > 0) {
            initialAlineMessages = fallbackAlineMessages;
            mergedMessages = [...mergedMessages, ...fallbackAlineMessages].sort(
              (a, b) =>
                new Date(a.created_at || '').getTime() -
                new Date(b.created_at || '').getTime(),
            );
          }
        }
      }

      mergedMessages = dedupeMessagesStable(mergedMessages);
      const oldestCrmCursor = initialCrmMessages[0]?.created_at || null;
      const oldestAlineCursor = initialAlineMessages[0]?.created_at || null;
      const hasOlder =
        crmRows.length > INITIAL_MESSAGE_LIMIT ||
        hasOlderAlineLogs;

      if (requestId !== fetchMessagesRequestRef.current) {
        return;
      }

      oldestCrmMessageCursorRef.current = oldestCrmCursor;
      oldestAlineMessageCursorRef.current = oldestAlineCursor;
      hasOlderMessagesRef.current = hasOlder;
      setHasOlderMessages(hasOlder);
      messagesCacheRef.current.set(cacheKey, {
        messages: mergedMessages,
        hasOlder,
        oldestCrmCursor,
        oldestAlineCursor,
      });
      setMessages((prev) => (areMessagesEqual(prev, mergedMessages) ? prev : mergedMessages));
    } catch {
      // silent
    }
  }, []);

  const markAsRead = async (id: string) => {
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id);
  };

  const fetchAlineStatus = useCallback(async (phone: string) => {
    try {
      const phoneVariants = buildPhoneVariants(phone);
      const { data } = await supabase
        .from('aline_conversations')
        .select(
          'id, phone, status, active_agent, assigned_seller_id, assigned_seller_name, assignment_reason, assigned_at, current_node, followup_count, collected_data',
        )
        .in('phone', phoneVariants)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.phone) {
        setAlineStatusMap((prev) => ({
          ...prev,
          [phone]: data,
          [data.phone]: data,
        }));
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      lastMessageCount.current = 0;
      shouldAutoScroll.current = true;
      setEditingMessageId(null);
      setEditingMessageDraft('');
      setEditingMessageBusyId(null);
      fetchMessages(selectedConversation.id, selectedConversation.contact_number);
      markAsRead(selectedConversation.id);
      setIsContactTyping(false);
      fetchAlineStatus(selectedConversation.contact_number);
      startChatting(selectedConversation.contact_number);
      const channel = supabase
        .channel(`messages-related-${selectedConversation.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          (payload) => {
            const newMessage = payload.new as Message;
            if (!relatedConversationIdsRef.current.has(newMessage.conversation_id)) {
              return;
            }

            if (!newMessage.is_from_me) {
              setIsContactTyping(false);
            }

            setMessages((prev) => {
              if (prev.some((m) => m.id === newMessage.id)) {
                return prev;
              }

              const withoutAlineDuplicate = prev.filter(
                (message) =>
                  !String(message.id).startsWith('aline-log:') ||
                  !isNearDuplicateMessage(message, newMessage),
              );
              const next = mergeMessagesStable(withoutAlineDuplicate, [newMessage]);
              const cacheKey = currentMessagesCacheKeyRef.current;
              if (cacheKey) {
                const currentCache = messagesCacheRef.current.get(cacheKey);
                messagesCacheRef.current.set(cacheKey, {
                  messages: next,
                  hasOlder: currentCache?.hasOlder ?? hasOlderMessagesRef.current,
                  oldestCrmCursor: currentCache?.oldestCrmCursor ?? oldestCrmMessageCursorRef.current,
                  oldestAlineCursor: currentCache?.oldestAlineCursor ?? oldestAlineMessageCursorRef.current,
                });
              }
              return areMessagesEqual(prev, next) ? prev : next;
            });
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
          },
          (payload) => {
            const updatedMessage = payload.new as Message;
            if (!relatedConversationIdsRef.current.has(updatedMessage.conversation_id)) {
              return;
            }

            setMessages((prev) => {
              const next = dedupeMessagesStable(
                prev.map((m) =>
                  m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m,
                ),
              );
              const cacheKey = currentMessagesCacheKeyRef.current;
              if (cacheKey) {
                const currentCache = messagesCacheRef.current.get(cacheKey);
                messagesCacheRef.current.set(cacheKey, {
                  messages: next,
                  hasOlder: currentCache?.hasOlder ?? hasOlderMessagesRef.current,
                  oldestCrmCursor: currentCache?.oldestCrmCursor ?? oldestCrmMessageCursorRef.current,
                  oldestAlineCursor: currentCache?.oldestAlineCursor ?? oldestAlineMessageCursorRef.current,
                });
              }
              return areMessagesEqual(prev, next) ? prev : next;
            });
          },
        )
        .subscribe();

      const phoneConversationChannel = supabase
        .channel(`conversation-phone-${selectedConversation.contact_number}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
            filter: `contact_number=eq.${selectedConversation.contact_number}`,
          },
          (payload) => {
            const updatedConversation = payload.new as Conversation;
            setSelectedConversation((prev) =>
              prev && prev.id === selectedConversation.id
                ? { ...prev, ...updatedConversation }
                : prev,
            );
            setConversations((prev) =>
              sortConversationsByRecent(
                prev.map((conversation) =>
                  conversation.id === updatedConversation.id
                    ? { ...conversation, ...updatedConversation }
                    : conversation,
                ),
              ),
            );
          },
        )
        .subscribe();

      const alineChannel = supabase
        .channel(`aline-messages-related-${selectedConversation.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'aline_messages',
          },
          (payload) => {
            const changedMessage = payload.new as {
              id?: string;
              conversation_id?: string;
              message?: string;
              created_at?: string;
              role?: string;
            } | null;
            if (
              changedMessage?.conversation_id &&
              !relatedAlineConversationIdsRef.current.has(changedMessage.conversation_id)
            ) {
              return;
            }

            const content = changedMessage?.message?.trim();
            if (!content || !changedMessage?.id) return;

            const fallbackMessage: Message = {
              id: `aline-log:${changedMessage.id}`,
              conversation_id: selectedConversation.id,
              content,
              message_type: 'text',
              media_url: null,
              is_from_me: changedMessage.role !== 'user',
              status: changedMessage.role === 'user' ? 'received' : 'sent',
              created_at: changedMessage.created_at || new Date().toISOString(),
            };

            setMessages((prev) => {
              if (
                prev.some(
                  (message) =>
                    message.id === fallbackMessage.id ||
                    isNearDuplicateMessage(message, fallbackMessage),
                )
              ) {
                return prev;
              }

              const next = mergeMessagesStable(prev, [fallbackMessage]);
              const cacheKey = currentMessagesCacheKeyRef.current;
              if (cacheKey) {
                const currentCache = messagesCacheRef.current.get(cacheKey);
                messagesCacheRef.current.set(cacheKey, {
                  messages: next,
                  hasOlder: currentCache?.hasOlder ?? hasOlderMessagesRef.current,
                  oldestCrmCursor: currentCache?.oldestCrmCursor ?? oldestCrmMessageCursorRef.current,
                  oldestAlineCursor: currentCache?.oldestAlineCursor ?? oldestAlineMessageCursorRef.current,
                });
              }
              return next;
            });
            bumpConversationFromMessage(fallbackMessage);
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(phoneConversationChannel);
        supabase.removeChannel(alineChannel);
        stopChatting();
      };
    }

    stopChatting();
  }, [
    selectedConversation?.id,
    selectedConversation?.contact_number,
    fetchMessages,
    fetchAlineStatus,
    startChatting,
    stopChatting,
    scrollMessagesToBottom,
    bumpConversationFromMessage,
  ]);

  useLayoutEffect(() => {
    const isNewConversationLoad = messages.length > 0 && lastMessageCount.current === 0;
    const hasNewMessages = messages.length > lastMessageCount.current;

    if (isNewConversationLoad || (hasNewMessages && shouldAutoScroll.current)) {
      scrollMessagesToBottom();
    }

    lastMessageCount.current = messages.length;
  }, [messages, scrollMessagesToBottom]);

  useEffect(() => {
    if (!selectedConversation?.id) return;

    shouldAutoScroll.current = true;
    const timer = window.setTimeout(() => {
      if (shouldAutoScroll.current) {
        scrollMessagesToBottom();
      }
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [scrollMessagesToBottom, selectedConversation?.id]);

  const loadOlderMessages = useCallback(async () => {
    if (!selectedConversation?.id) return;
    if (loadingOlderMessagesRef.current || !hasOlderMessagesRef.current) return;

    const crmCursor = oldestCrmMessageCursorRef.current;
    const alineCursor = oldestAlineMessageCursorRef.current;
    if (!crmCursor && !alineCursor) return;

    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;
    const previousScrollTop = container?.scrollTop || 0;

    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);

    try {
      const relatedConversationIds = Array.from(relatedConversationIdsRef.current);
      const relatedAlineConversationIds = Array.from(relatedAlineConversationIdsRef.current);

      const [crmResult, alineResult] = await Promise.all([
        relatedConversationIds.length && crmCursor
          ? supabase
              .from('messages')
              .select(
                'id, content, created_at, is_from_me, media_url, message_type, status, conversation_id, zapi_message_id, edited_at, deleted_at, replaced_message_id',
              )
              .in('conversation_id', relatedConversationIds)
              .lt('created_at', crmCursor)
              .order('created_at', { ascending: false })
              .limit(MESSAGE_PAGE_LIMIT + 1)
          : Promise.resolve({ data: [], error: null }),
        relatedAlineConversationIds.length && alineCursor
          ? supabase
              .from('aline_messages')
              .select('id, message, created_at, role')
              .in('conversation_id', relatedAlineConversationIds)
              .lt('created_at', alineCursor)
              .order('created_at', { ascending: false })
              .limit(MESSAGE_PAGE_LIMIT + 1)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (crmResult.error) throw crmResult.error;
      if (alineResult.error) throw alineResult.error;

      const crmRows = crmResult.data || [];
      const alineRows = alineResult.data || [];
      const olderCrmMessages = crmRows.slice(0, MESSAGE_PAGE_LIMIT).reverse().filter(
        (message) => message.content?.trim() || message.media_url || message.deleted_at,
      );
      const olderAlineMessages = alineRows.slice(0, MESSAGE_PAGE_LIMIT).reverse()
        .filter((entry) => entry.message?.trim())
        .map(
          (entry): Message => ({
            id: `aline-log:${entry.id}`,
            conversation_id: selectedConversation.id,
            content: entry.message,
            message_type: 'text',
            media_url: null,
            is_from_me: entry.role !== 'user',
            status: entry.role === 'user' ? 'received' : 'sent',
            created_at: entry.created_at || new Date().toISOString(),
          }),
        );

      const nextHasOlder =
        crmRows.length > MESSAGE_PAGE_LIMIT || alineRows.length > MESSAGE_PAGE_LIMIT;
      const nextOldestCrmCursor = olderCrmMessages[0]?.created_at || crmCursor;
      const nextOldestAlineCursor = olderAlineMessages[0]?.created_at || alineCursor;
      hasOlderMessagesRef.current = nextHasOlder;
      setHasOlderMessages(nextHasOlder);

      setMessages((prev) => {
        const next = dedupeMessagesStable([
          ...olderCrmMessages,
          ...olderAlineMessages,
          ...prev,
        ]);
        const cacheKey = currentMessagesCacheKeyRef.current;

        oldestCrmMessageCursorRef.current = nextOldestCrmCursor;
        oldestAlineMessageCursorRef.current = nextOldestAlineCursor;

        if (cacheKey) {
          messagesCacheRef.current.set(cacheKey, {
            messages: next,
            hasOlder: nextHasOlder,
            oldestCrmCursor: nextOldestCrmCursor,
            oldestAlineCursor: nextOldestAlineCursor,
          });
        }

        window.requestAnimationFrame(() => {
          const nextContainer = messagesContainerRef.current;
          if (!nextContainer) return;
          nextContainer.scrollTop =
            nextContainer.scrollHeight - previousScrollHeight + previousScrollTop;
        });

        return areMessagesEqual(prev, next) ? prev : next;
      });
    } catch {
      // silent
    } finally {
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [messages, selectedConversation?.id]);

  const handleMessagesScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    shouldAutoScroll.current =
      target.scrollHeight - target.scrollTop - target.clientHeight < 100;

    if (target.scrollTop < 160) {
      void loadOlderMessages();
    }
  }, [loadOlderMessages]);

  const fetchConversations = useCallback(
    async (showToast = false) => {
      try {
        if (showToast) setRefreshing(true);

        const { data, error } = await supabase
          .from('conversations')
          .select(CONVERSATION_LIST_SELECT)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(CONVERSATION_LIST_LIMIT);

        if (error) throw error;

        const conversationList = sortConversationsByRecent(data || []);
        const statusMap: Record<string, AlineConversation> = {};
        const profilesMap: Record<string, CustomerProfile> = {};

        if (conversationList.length > 0) {
          const phones = Array.from(
            new Set(conversationList.flatMap((c) => buildPhoneVariants(c.contact_number))),
          );

          const phoneChunks = chunkArray(phones, 150);

          const [alineResults, customerResults] = await Promise.all([
            Promise.all(
              phoneChunks.map((chunk) =>
                supabase
                  .from('aline_conversations')
                  .select(
                    'id, phone, status, active_agent, assigned_seller_id, assigned_seller_name, assignment_reason, assigned_at, current_node, followup_count, collected_data',
                  )
                  .in('phone', chunk),
              ),
            ),
            Promise.all(
              phoneChunks.map((chunk) =>
                supabase
                  .from('customers')
                  .select('whatsapp, name, profile_pic_url')
                  .in('whatsapp', chunk),
              ),
            ),
          ]);

          const alineData = alineResults.flatMap((result) => result.data || []);
          const customersData = customerResults.flatMap((result) => result.data || []);

          alineData.forEach((ac) => {
            statusMap[ac.phone] = ac;
            buildPhoneVariants(ac.phone).forEach((variant) => {
              statusMap[variant] = ac;
            });
          });

          customersData.forEach((customer) => {
            const profile = {
              whatsapp: customer.whatsapp,
              name: customer.name,
              profile_pic_url: customer.profile_pic_url,
            };

            profilesMap[customer.whatsapp] = profile;
            buildPhoneVariants(customer.whatsapp).forEach((variant) => {
              profilesMap[variant] = profile;
            });
          });
        }

        setAlineStatusMap(statusMap);
        setCustomerProfiles(profilesMap);
        setConversations(conversationList);
        void fetchTodayInboundConversationIds();
        void requestMissingProfilePictures(conversationList, profilesMap);
        setSelectedConversation((prev) => {
          if (!prev) return prev;
          return conversationList.find((conversation) => conversation.id === prev.id) || prev;
        });

        if (showToast) {
          toast({
            title: '✅ Atualizado!',
            description: `${conversationList.length} conversas`,
          });
        }
      } catch {
        if (showToast) {
          toast({
            title: 'Erro',
            description: 'Não foi possível atualizar',
            variant: 'destructive',
          });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchTodayInboundConversationIds, requestMissingProfilePictures, toast],
  );

  useEffect(() => {
    fetchConversations(false);

    const convChannel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          const eventType = payload.eventType;

          if (eventType === 'DELETE') {
            const deleted = payload.old as Partial<Conversation>;
            if (!deleted?.id) return;

            setConversations((prev) => prev.filter((conversation) => conversation.id !== deleted.id));
            setSelectedConversation((prev) => (prev?.id === deleted.id ? null : prev));
            return;
          }

          const updated = payload.new as Conversation;
          if (!updated?.id) return;

          setConversations((prev) => {
            const exists = prev.some((conversation) => conversation.id === updated.id);
            const next = exists
              ? prev.map((conversation) =>
                  conversation.id === updated.id ? { ...conversation, ...updated } : conversation,
                )
              : [updated, ...prev];

            return sortConversationsByRecent(next);
          });
          setSelectedConversation((prev) =>
            prev?.id === updated.id ? { ...prev, ...updated } : prev,
          );
        },
      )
      .subscribe();

    const messageListChannel = supabase
      .channel('messages-list-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMessage = payload.new as Message;
          if (!newMessage?.conversation_id) return;

          if (!newMessage.is_from_me) {
            const messageTime = new Date(newMessage.created_at || '').getTime();
            if (Number.isFinite(messageTime) && messageTime >= getStartOfTodayTime()) {
              setTodayInboundConversationIds((prev) => {
                if (prev.has(newMessage.conversation_id)) return prev;
                const next = new Set(prev);
                next.add(newMessage.conversation_id);
                return next;
              });
            }
          }

          bumpConversationFromMessage(newMessage);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const updatedMessage = payload.new as Message;
          if (!updatedMessage?.conversation_id) return;

          bumpConversationFromMessage(updatedMessage, { forceTop: true });
        },
      )
      .subscribe();

    const alineChannel = supabase
      .channel('aline-conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aline_conversations' },
        (payload) => {
          const updated = payload.new as AlineConversation;

          if (updated?.phone) {
            setAlineStatusMap((prev) => {
              const variants = buildPhoneVariants(updated.phone);
              const current = variants.map((variant) => prev[variant]).find(Boolean);

              if (
                current?.status === updated.status &&
                current?.active_agent === updated.active_agent &&
                current?.assigned_seller_id === updated.assigned_seller_id &&
                current?.assigned_seller_name === updated.assigned_seller_name &&
                current?.current_node === updated.current_node
              ) {
                return prev;
              }

              const next = { ...prev };
              variants.forEach((variant) => {
                next[variant] = updated;
              });
              return next;
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
      supabase.removeChannel(messageListChannel);
      supabase.removeChannel(alineChannel);
    };
  }, [bumpConversationFromMessage, fetchConversations]);

  const openConversationFromStoredTarget = useCallback(() => {
    const targetConversationId = localStorage.getItem('crm_open_conversation_id');
    const targetPhone = localStorage.getItem('crm_open_phone');
    if (!targetConversationId && !targetPhone) return false;

    const target = conversations.find((conversation) => {
      if (targetConversationId && conversation.id === targetConversationId) return true;
      if (!targetPhone) return false;
      return buildPhoneVariants(conversation.contact_number).some(
        (variant) => normalizeComparablePhone(variant) === normalizeComparablePhone(targetPhone),
      );
    });

    if (!target) return false;

    setSelectedConversation(target);
    setChatView('all');
    setFilterStatus('all');
    setFilterAttendant('all');
    localStorage.removeItem('crm_open_conversation_id');
    localStorage.removeItem('crm_open_phone');
    return true;
  }, [conversations]);

  useEffect(() => {
    if (conversations.length === 0) return;
    openConversationFromStoredTarget();
  }, [conversations, openConversationFromStoredTarget]);

  useEffect(() => {
    const handleOpenRequestedConversation = () => {
      if (!openConversationFromStoredTarget()) {
        void fetchConversations(false);
      }
    };

    window.addEventListener('crm-open-conversation', handleOpenRequestedConversation);
    return () => {
      window.removeEventListener('crm-open-conversation', handleOpenRequestedConversation);
    };
  }, [fetchConversations, openConversationFromStoredTarget]);

  const addOptimisticMessage = useCallback(
    (
      content: string,
      messageType = 'text',
      mediaUrl: string | null = null,
      conversationId = selectedConversation?.id || '',
    ): string => {
      const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          conversation_id: conversationId,
          content,
          message_type: messageType,
          media_url: mediaUrl,
          is_from_me: true,
          status: 'sending',
          created_at: new Date().toISOString(),
        },
      ]);

      shouldAutoScroll.current = true;

      return tempId;
    },
    [selectedConversation?.id],
  );

  const markOptimisticFailed = useCallback((tempId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)),
    );
  }, []);

  const removeOptimisticMessages = useCallback((tempIds: string[]) => {
    if (!tempIds.length) return;

    setMessages((prev) => prev.filter((message) => !tempIds.includes(message.id)));
  }, []);

  const invokeAutomationSend = useCallback(
    async (body: Record<string, unknown>, conversation = selectedConversation) => {
      if (!conversation) {
        throw new Error('Nenhuma conversa selecionada.');
      }

      const { data, error } = await supabase.functions.invoke('automation-send', {
        body: {
          conversation_id: conversation.id,
          phone: conversation.contact_number,
          platform: conversation.platform || 'whatsapp',
          prefer_zapi: true,
          ...body,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    [selectedConversation],
  );

  const getAttachmentMessageType = useCallback((file: File) => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.startsWith('video/')) return 'video';
    return 'document';
  }, []);

  const getAttachmentDisplayLabel = useCallback((file: File, messageType: string) => {
    if (messageType === 'audio') return 'Audio';
    if (messageType === 'image') return file.name || 'Imagem';
    if (messageType === 'video') return file.name || 'Video';
    return file.name || 'Documento';
  }, []);

  const getAttachmentMessage = useCallback((file: File, messageType: string) => {
    if (messageType === 'document') return file.name || 'Documento';
    if (messageType === 'audio') return 'Audio';
    return '';
  }, []);

  const isSupportedAttachmentFile = useCallback((file: File) => {
    if (file.type.startsWith('image/')) return true;
    if (file.type.startsWith('audio/')) return true;
    if (file.type.startsWith('video/')) return true;
    return /\.(pdf|doc|docx)$/i.test(file.name);
  }, []);

  const getAttachmentSizeLabel = useCallback((size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  const revokePendingAttachmentPreview = useCallback((attachment: PendingChatAttachment) => {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }, []);

  const addPendingAttachments = useCallback(
    (files: File[]) => {
      if (!files.length) return;

      const attachments = files.map((file) => {
        const messageType = getAttachmentMessageType(file);
        const previewUrl =
          messageType === 'image' || messageType === 'audio' || messageType === 'video'
            ? URL.createObjectURL(file)
            : null;

        return {
          id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          messageType,
          previewUrl,
          label: getAttachmentDisplayLabel(file, messageType),
          sizeLabel: getAttachmentSizeLabel(file.size),
        };
      });

      setPendingAttachments((prev) => [...prev, ...attachments]);
    },
    [getAttachmentDisplayLabel, getAttachmentMessageType, getAttachmentSizeLabel],
  );

  const removePendingAttachment = useCallback(
    (id: string) => {
      setPendingAttachments((prev) => {
        const target = prev.find((attachment) => attachment.id === id);
        if (target) revokePendingAttachmentPreview(target);
        return prev.filter((attachment) => attachment.id !== id);
      });
    },
    [revokePendingAttachmentPreview],
  );

  const clearPendingAttachments = useCallback(() => {
    setPendingAttachments((prev) => {
      prev.forEach(revokePendingAttachmentPreview);
      return [];
    });
  }, [revokePendingAttachmentPreview]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach(revokePendingAttachmentPreview);
    };
  }, [revokePendingAttachmentPreview]);

  useEffect(() => {
    clearPendingAttachments();
  }, [clearPendingAttachments, selectedConversation?.id]);

  const uploadAttachmentFile = useCallback(
    async (
      file: File,
      messageType: string,
      conversationId = selectedConversation?.id || 'chat',
    ): Promise<OutgoingAttachmentPayload> => {
      const extension =
        file.name.split('.').pop() ||
        file.type.split('/').pop() ||
        'bin';
      const uniqueId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const fileName = `${conversationId}/${uniqueId}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('chat-media').getPublicUrl(fileName);

      return {
        message: getAttachmentMessage(file, messageType),
        message_type: messageType,
        media_url: publicUrl,
      };
    },
    [getAttachmentMessage, selectedConversation?.id],
  );

  const sendAttachments = useCallback(
    async (files: File[], conversation = selectedConversation) => {
      if (!conversation || !files.length) return;

      const optimisticEntries = files.map((file) => {
        const messageType = getAttachmentMessageType(file);
        const localPreviewUrl =
          messageType === 'image' || messageType === 'audio' || messageType === 'video'
            ? URL.createObjectURL(file)
            : null;
        return {
          file,
          messageType,
          localPreviewUrl,
          tempId: addOptimisticMessage(
            getAttachmentDisplayLabel(file, messageType),
            messageType,
            localPreviewUrl,
            conversation.id,
          ),
        };
      });

      await Promise.allSettled(
        optimisticEntries.map(async (entry) => {
          try {
            const attachment = await uploadAttachmentFile(
              entry.file,
              entry.messageType,
              conversation.id,
            );

            await invokeAutomationSend({
              attachments: [attachment],
            }, conversation);

            setTimeout(() => {
              removeOptimisticMessages([entry.tempId]);
              if (entry.localPreviewUrl) URL.revokeObjectURL(entry.localPreviewUrl);
            }, 300);
          } catch (error) {
            markOptimisticFailed(entry.tempId);
            if (entry.localPreviewUrl) URL.revokeObjectURL(entry.localPreviewUrl);
            throw error;
          }
        }),
      ).then((results) => {
        const failedCount = results.filter((result) => result.status === 'rejected').length;
        if (failedCount > 0) {
          toast({
            title: failedCount === files.length ? 'Erro' : 'Envio parcial',
            description:
              failedCount === files.length
                ? 'Nao foi possivel enviar os arquivos selecionados.'
                : `${files.length - failedCount} de ${files.length} arquivo(s) foram enviados.`,
            variant: failedCount === files.length ? 'destructive' : undefined,
          });
        }
      });
    },
    [
      addOptimisticMessage,
      getAttachmentDisplayLabel,
      getAttachmentMessageType,
      invokeAutomationSend,
      markOptimisticFailed,
      removeOptimisticMessages,
      selectedConversation,
      toast,
      uploadAttachmentFile,
    ],
  );

  const sendMessageDirect = useCallback(async (
    messageText: string,
    conversation = selectedConversation,
  ) => {
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage || !conversation) return;

    const tempId = addOptimisticMessage(trimmedMessage, 'text', null, conversation.id);

    try {
      await invokeAutomationSend({
        message: trimmedMessage,
        message_type: 'text',
      }, conversation);

      setTimeout(() => removeOptimisticMessages([tempId]), 300);
    } catch (error) {
      markOptimisticFailed(tempId);
      toast({
        title: 'Erro',
        description:
          error instanceof Error ? error.message : 'Nao foi possivel enviar.',
        variant: 'destructive',
      });
    }
  }, [
    addOptimisticMessage,
    invokeAutomationSend,
    markOptimisticFailed,
    removeOptimisticMessages,
    selectedConversation,
    toast,
  ]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (!files.length) {
      return;
    }

    const supportedFiles = files.filter(isSupportedAttachmentFile);

    if (!supportedFiles.length) {
      toast({
        title: 'Arquivo nao suportado',
        description: 'Anexe imagens, audios, videos, PDF ou documentos.',
        variant: 'destructive',
      });
      return;
    }

    addPendingAttachments(supportedFiles);
  };

  const handlePasteFiles = useCallback(
    (files: File[]) => {
      const supportedFiles = files.filter(isSupportedAttachmentFile);

      if (!supportedFiles.length) {
        toast({
          title: 'Arquivo nao suportado',
          description: 'Cole imagens, audios, videos, PDF ou documentos.',
          variant: 'destructive',
        });
        return;
      }

      addPendingAttachments(supportedFiles);
    },
    [addPendingAttachments, isSupportedAttachmentFile, toast],
  );

  const handleComposerSend = useCallback(
    (messageText: string) => {
      const conversation = selectedConversation;
      const filesToSend = pendingAttachments.map((attachment) => attachment.file);
      const hasText = messageText.trim().length > 0;
      if (!conversation || (!hasText && !filesToSend.length)) return;

      if (hasText) {
        void sendMessageDirect(messageText, conversation);
      }

      if (filesToSend.length) {
        clearPendingAttachments();
        void sendAttachments(filesToSend, conversation);
      }
    },
    [
      clearPendingAttachments,
      pendingAttachments,
      selectedConversation,
      sendAttachments,
      sendMessageDirect,
    ],
  );

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isRecording && recordingStartTime) {
      interval = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - recordingStartTime) / 1000));
      }, 100);
    } else {
      setRecordingDuration(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, recordingStartTime]);

  const uploadAudio = async (blob: Blob) => {
    if (!selectedConversation || blob.size < 1000) {
      toast({ title: 'Áudio muito curto' });
      return;
    }

    try {
      const isOgg = blob.type.includes('ogg');
      const audioFile = new File([blob], `audio-${Date.now()}.${isOgg ? 'ogg' : 'webm'}`, {
        type: blob.type || 'audio/webm',
      });
      await sendAttachments([audioFile]);
    } catch {
      toast({
        title: 'Erro',
        description: 'Nao foi possivel enviar o audio.',
        variant: 'destructive',
      });
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      recordingCancelledRef.current = false;

      const preferredMimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType: preferredMimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: preferredMimeType });
        if (!recordingCancelledRef.current) {
          await uploadAudio(blob);
        }
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      };

      recorder.start(100);
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingStartTime(Date.now());
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível acessar o microfone.',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    setMediaRecorder(null);
    setIsRecording(false);
    setRecordingStartTime(null);
  };

  const cancelRecording = () => {
    recordingCancelledRef.current = true;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    setMediaRecorder(null);
    setIsRecording(false);
    setRecordingStartTime(null);

    toast({ title: 'Gravação cancelada' });
  };

  const captureAndSendScreenshot = async () => {
    if (!selectedConversation) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' } as any,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);

      stream.getTracks().forEach((track) => track.stop());

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 0.9),
      );

      if (!blob) throw new Error('Failed');
      const screenshotFile = new File([blob], `screenshot-${Date.now()}.png`, {
        type: 'image/png',
      });

      addPendingAttachments([screenshotFile]);
    } catch (error: any) {
      if (error.name !== 'NotAllowedError') {
        toast({
          title: 'Erro',
          description: 'Nao foi possivel capturar.',
          variant: 'destructive',
        });
      }
    }
  };

  const canEditMessage = useCallback((message: Message) => {
    if (!message.is_from_me) return false;
    if (message.message_type !== 'text') return false;
    if (message.media_url) return false;
    if (message.deleted_at) return false;
    if (!message.zapi_message_id) return false;
    return ['sent', 'delivered', 'read'].includes(message.status || '');
  }, []);

  const canDeleteMessage = useCallback((message: Message) => {
    if (!message.is_from_me) return false;
    if (message.deleted_at) return false;
    if (!message.zapi_message_id) return false;
    return ['sent', 'delivered', 'read'].includes(message.status || '');
  }, []);

  const handleStartEditingMessage = useCallback((message: Message) => {
    setEditingMessageId(message.id);
    setEditingMessageDraft(message.content || '');
  }, []);

  const handleCancelEditingMessage = useCallback(() => {
    setEditingMessageId(null);
    setEditingMessageDraft('');
    setEditingMessageBusyId(null);
  }, []);

  const handleSaveEditedMessage = useCallback(
    async (message: Message) => {
      const nextContent = editingMessageDraft.trim();

      if (!nextContent || !message.zapi_message_id) {
        return;
      }

      if (nextContent === (message.content || '').trim()) {
        handleCancelEditingMessage();
        return;
      }

      const tempId = addOptimisticMessage(nextContent);
      setEditingMessageBusyId(message.id);

      try {
        await invokeAutomationSend({
          message: nextContent,
          message_type: 'text',
          replace_message_id: message.id,
          replace_zapi_message_id: message.zapi_message_id,
        });

        handleCancelEditingMessage();
        setTimeout(() => removeOptimisticMessages([tempId]), 300);
      } catch (error) {
        markOptimisticFailed(tempId);
        toast({
          title: 'Erro',
          description:
            error instanceof Error
              ? error.message
              : 'Nao foi possivel editar a mensagem.',
          variant: 'destructive',
        });
      } finally {
        setEditingMessageBusyId(null);
      }
    },
    [
      addOptimisticMessage,
      editingMessageDraft,
      handleCancelEditingMessage,
      invokeAutomationSend,
      markOptimisticFailed,
      removeOptimisticMessages,
      toast,
    ],
  );

  const handleDeleteMessage = useCallback(
    async (message: Message) => {
      if (!message.zapi_message_id || !selectedConversation) return;

      const confirmed = window.confirm(
        'Apagar esta mensagem no WhatsApp e no CRM? Essa acao nao pode ser desfeita.',
      );
      if (!confirmed) return;

      setDeletingMessageBusyId(message.id);

      try {
        await invokeAutomationSend({
          delete_message_id: message.id,
          delete_zapi_message_id: message.zapi_message_id,
        });

        const deletedAt = new Date().toISOString();
        setMessages((prev) =>
          prev.map((item) =>
            item.id === message.id
              ? { ...item, deleted_at: deletedAt, status: 'deleted' }
              : item,
          ),
        );
        const nextLastMessage =
          [...messages]
            .filter((item) => item.id !== message.id && !item.deleted_at)
            .sort((a, b) =>
              new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime(),
            )[0] || null;
        const nextPreview = buildMessagePreview(nextLastMessage) || 'Mensagem removida';
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === selectedConversation.id
              ? { ...conversation, last_message: nextPreview }
              : conversation,
          ),
        );
        setSelectedConversation((prev) =>
          prev && prev.id === selectedConversation.id
            ? { ...prev, last_message: nextPreview }
            : prev,
        );

        toast({ title: 'Mensagem apagada' });
      } catch (error) {
        toast({
          title: 'Erro',
          description:
            error instanceof Error
              ? error.message
              : 'Nao foi possivel apagar a mensagem.',
          variant: 'destructive',
        });
      } finally {
        setDeletingMessageBusyId(null);
      }
    },
    [buildMessagePreview, invokeAutomationSend, messages, selectedConversation, toast],
  );

  const formatRecordingTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

  const searchedConversations = useMemo(() => {
    const searchLower = debouncedSearchTerm.toLowerCase();

    return conversations.filter((conv) => {
      const displayName =
        getCustomerProfileForPhone(conv.contact_number)?.name || conv.contact_name || '';

      return (
        !debouncedSearchTerm ||
        displayName.toLowerCase().includes(searchLower) ||
        conv.contact_number?.includes(debouncedSearchTerm)
      );
    });
  }, [conversations, debouncedSearchTerm, getCustomerProfileForPhone]);

  const filteredConversations = useMemo(() => {
    return searchedConversations
      .filter((conv) => matchesChatView(conv, chatView))
      .filter((conv) => matchesStatusFilter(conv, filterStatus))
      .filter((conv) => matchesAttendantFilter(conv, filterAttendant))
      .sort((a, b) => {
        const dateA = new Date((a as any).last_message_at || a.created_at || 0).getTime();
        const dateB = new Date((b as any).last_message_at || b.created_at || 0).getTime();
        return dateB - dateA;
      });
  }, [
    searchedConversations,
    chatView,
    filterStatus,
    filterAttendant,
    matchesChatView,
    matchesStatusFilter,
    matchesAttendantFilter,
  ]);

  const statusCounts = useMemo(() => {
    const source =
      filterAttendant === 'all'
        ? searchedConversations.filter((conv) => matchesChatView(conv, chatView))
        : searchedConversations
            .filter((conv) => matchesChatView(conv, chatView))
            .filter((conv) => matchesAttendantFilter(conv, filterAttendant));

    return {
      all: source.length,
      novo: source.filter((c) => (c.lead_status || 'novo') === 'novo').length,
      frio: source.filter((c) => c.lead_status === 'frio').length,
      quente: source.filter((c) => c.lead_status === 'quente').length,
      acao_humana: source.filter((c) => isActionHumanConversation(c)).length,
      vendido: source.filter((c) => c.lead_status === 'vendido').length,
    };
  }, [
    searchedConversations,
    chatView,
    filterAttendant,
    matchesChatView,
    matchesAttendantFilter,
    isActionHumanConversation,
  ]);

  const attendantCounts = useMemo(() => {
    const source =
      filterStatus === 'all'
        ? searchedConversations.filter((conv) => matchesChatView(conv, chatView))
        : searchedConversations
            .filter((conv) => matchesChatView(conv, chatView))
            .filter((conv) => matchesStatusFilter(conv, filterStatus));

    return {
      aline: source.filter((conv) => !isActionHumanConversation(conv)).length,
      vendedor: source.filter((conv) => isActionHumanConversation(conv)).length,
    };
  }, [
    searchedConversations,
    chatView,
    filterStatus,
    matchesChatView,
    matchesStatusFilter,
    isActionHumanConversation,
  ]);

  const chatViewCounts = useMemo(
    () => ({
      all: searchedConversations.length,
      today: searchedConversations.filter((conv) => matchesChatView(conv, 'today')).length,
      recovery: searchedConversations.filter((conv) => matchesChatView(conv, 'recovery')).length,
    }),
    [searchedConversations, matchesChatView],
  );

  const groupedMessages = useMemo(() => {
    return messages.reduce((groups, message) => {
      const date = new Date(message.created_at || '').toDateString();

      if (!groups[date]) groups[date] = [];
      groups[date].push(message);

      return groups;
    }, {} as Record<string, Message[]>);
  }, [messages]);

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);

    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Hoje';
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';

    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  };

  const unreadTotal = conversations.reduce(
    (sum, conversation) => sum + (conversation.unread_count || 0),
    0,
  );

  const currentAlineData = selectedConversation
    ? getAlineDataForPhone(selectedConversation.contact_number)
    : null;

  const isCurrentHumanTakeover = currentAlineData?.status === 'human_takeover';
  const currentSellerName = currentAlineData?.assigned_seller_name || '';
  const currentSellerFirstName = currentSellerName.split(' ')[0];
  const currentSellerInitial = currentSellerName.charAt(0).toUpperCase() || 'V';
  const isSaleFinalized = selectedConversation?.lead_status === 'vendido';
  const selectedAutomationProduct = currentAlineData?.collected_data
    ? {
        name:
          currentAlineData.collected_data.selected_name ||
          currentAlineData.collected_data.selected_product?.name ||
          currentAlineData.collected_data.produto_nome ||
          '',
        sku:
          currentAlineData.collected_data.selected_sku ||
          currentAlineData.collected_data.selected_product?.sku ||
          currentAlineData.collected_data.produto_sku ||
          '',
        price:
          currentAlineData.collected_data.selected_price ||
          currentAlineData.collected_data.selected_product?.price ||
          currentAlineData.collected_data.produto_preco ||
          null,
      }
    : null;
  const hasSelectedAutomationProduct = Boolean(
    selectedAutomationProduct?.name || selectedAutomationProduct?.sku,
  );
  const selectedNeedsHumanAttention = selectedConversation
    ? isActionHumanConversation(selectedConversation)
    : false;
  const contactPresenceLabel = formatContactPresence(selectedConversation);
  const selectedContactPresence = String(selectedConversation?.contact_presence || '').toLowerCase();
  const selectedContactIsOnline = Boolean(
    selectedConversation?.contact_is_online ||
      ['available', 'composing', 'recording'].includes(selectedContactPresence),
  );

  const currentAgentSlug = isCurrentHumanTakeover
    ? 'human'
    : currentAlineData?.active_agent === 'keila'
      ? 'keila'
      : currentAlineData?.active_agent === 'kate'
        ? 'kate'
        : currentAlineData?.active_agent === 'malu'
          ? 'malu'
      : 'aline';

  const currentAgentLabel =
    currentAgentSlug === 'human'
      ? 'Humano'
      : currentAgentSlug === 'keila'
        ? 'Keila'
        : currentAgentSlug === 'kate'
          ? 'Kate'
          : currentAgentSlug === 'malu'
            ? 'Malu'
        : 'Aline';

  const currentAgentBadgeClass =
    currentAgentSlug === 'human'
      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
      : currentAgentSlug === 'keila'
        ? 'bg-sky-500/15 text-sky-300 border border-sky-500/25'
        : currentAgentSlug === 'kate'
          ? 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/25'
          : currentAgentSlug === 'malu'
            ? 'bg-violet-500/15 text-violet-300 border border-violet-500/25'
        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';

  const activeStatusLabel =
    statusFilters.find((item) => item.key === filterStatus)?.label || 'Todos';

  const activeChatViewLabel =
    chatViewTabs.find((item) => item.key === chatView)?.label || 'Todas';

  const activeAttendantLabel =
    filterAttendant === 'all'
      ? 'Todos os atendimentos'
      : filterAttendant === 'aline'
        ? 'Aline, Keila e Kate'
        : 'Vendedor';

  const hasActiveFilters = chatView !== 'all' || filterStatus !== 'all' || filterAttendant !== 'all';

  return (
    <div className="h-full min-h-0 min-w-0 flex bg-[#0b141a] overflow-hidden max-md:h-[100dvh]">
      <div
        className={cn(
          'flex flex-col shrink-0 min-h-0 border-r border-[#2a3942] bg-[#111b21] overflow-x-hidden',
          'w-full md:w-[390px] lg:w-[430px] xl:w-[460px] 2xl:w-[500px]',
          selectedConversation ? 'hidden md:flex' : 'flex',
        )}
      >
        <div className="px-3 py-3 border-b border-[#2a3942] shrink-0 bg-[#202c33] max-md:px-4 max-md:pt-3 max-md:pb-2.5">
          <div className="flex items-center justify-between mb-2.5 sm:mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center">
                  <MessageCircle className="w-[18px] h-[18px] text-white" />
                </div>

                {unreadTotal > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[15px] font-medium text-slate-100 leading-tight truncate">
                  Chat CRM
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {conversations.length} conversas
                </p>
              </div>
            </div>

            <button
              onClick={() => fetchConversations(true)}
              disabled={refreshing}
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/8 transition-colors shrink-0"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            </button>
          </div>

          {onlineSellers.length > 0 && (
            <div className="flex items-center gap-2 mb-2.5 sm:mb-3 px-2.5 py-1.5 bg-[#111b21] rounded-lg">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
              <span className="text-[11px] text-emerald-400 font-medium shrink-0">
                {onlineSellers.length} online
              </span>

              <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
                {onlineSellers.map((seller) => (
                  <button
                    key={seller.user_id}
                    onClick={() =>
                      selectedConversation
                        ? handleAssignToSeller(
                            seller.user_id,
                            seller.full_name || 'Vendedor',
                          )
                        : toast({ title: 'Selecione uma conversa primeiro' })
                    }
                    className="flex-none flex items-center gap-1 px-2 py-0.5 bg-[#2a3942] rounded-full hover:bg-[#33444f] transition-colors"
                  >
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white text-[9px] font-bold">
                      {(seller.full_name || 'V').charAt(0)}
                    </div>
                    <span className="text-[10px] text-slate-400 max-w-[72px] truncate">
                      {(seller.full_name || 'Vendedor').split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <Input
              placeholder="Buscar conversa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 max-md:h-10 bg-[#111b21] border-transparent text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-[#00a884]/40 rounded-lg max-md:rounded-2xl"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="px-3 py-2 border-b border-[#2a3942] shrink-0 bg-[#111b21] max-md:px-4 max-md:py-2.5">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase text-slate-500">
                  Filtros
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  <span className="text-slate-300">{activeChatViewLabel}</span>
                  <span className="text-slate-600"> / </span>
                  <span className="text-slate-300">{activeStatusLabel}</span>
                  <span className="text-slate-600"> • </span>
                  <span className="text-slate-300">{activeAttendantLabel}</span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      setChatView('all');
                      setFilterStatus('all');
                      setFilterAttendant('all');
                    }}
                    className="px-2 py-1 rounded-full bg-[#202c33] text-[10px] font-medium text-slate-400 hover:text-white transition-colors"
                  >
                    Limpar
                  </button>
                )}

                <button
                  onClick={() => setMobileFiltersOpen((prev) => !prev)}
                  className="md:hidden px-2 py-1 rounded-full bg-[#202c33] text-[10px] font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  {mobileFiltersOpen ? 'Ocultar' : 'Filtros'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-[#0b141a] p-1 md:bg-transparent md:p-0">
                {chatViewTabs.map(({ key, label }) => {
                  const active = chatView === key;

                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setChatView(key);
                        setFilterStatus('all');
                      }}
                      className={cn(
                        'min-w-0 rounded-full px-2.5 py-1.5 max-md:py-2 transition-colors text-center',
                        active
                          ? 'bg-cyan-500/18 text-cyan-200 border border-cyan-400/25 max-md:bg-[#00a884] max-md:text-[#071513] max-md:border-transparent'
                          : 'bg-[#202c33] text-slate-400 hover:text-slate-200',
                      )}
                    >
                      <div className="flex items-center justify-center gap-1.5 min-w-0">
                        <span className="truncate text-[10px] sm:text-[11px] font-semibold">
                          {label}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                            active ? 'bg-white/12 text-current' : 'bg-white/5 text-slate-500',
                          )}
                        >
                          {chatViewCounts[key]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={cn('space-y-3', mobileFiltersOpen ? 'block' : 'hidden md:block')}>
            <div className="space-y-2">
              <p className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">
                Status
              </p>

              <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide md:flex-wrap md:overflow-visible">
                {statusFilters.map(({ key, label, color }) => {
                  const active = filterStatus === key;

                  return (
                    <button
                      key={key}
                      onClick={() => setFilterStatus(key)}
                      className={cn(
                        'min-w-fit max-w-full rounded-full px-3 py-1.5 transition-colors text-left max-md:flex-none',
                        active
                          ? 'bg-[#00a884] text-[#111b21]'
                          : 'bg-[#202c33] text-slate-400 hover:text-slate-200',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              active ? 'bg-[#111b21]' : color,
                            )}
                          />
                          <span className="truncate text-[10px] sm:text-[11px] font-medium">
                            {label}
                          </span>
                        </div>

                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                            active
                              ? 'bg-[#111b21]/10 text-[#111b21]'
                              : 'bg-white/5 text-slate-500',
                          )}
                        >
                          {statusCounts[key]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">
                  Atendimento
                </p>

                {filterAttendant !== 'all' && (
                  <button
                    onClick={() => setFilterAttendant('all')}
                    className="text-[10px] text-slate-500 hover:text-white transition-colors"
                  >
                    Remover filtro
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {[
                  {
                    key: 'aline',
                    label: 'Aline/Keila/Kate/Malu',
                    count: attendantCounts.aline,
                    icon: Bot,
                    activeClass:
                      'border-emerald-500/35 bg-emerald-500/14 text-emerald-300',
                  },
                  {
                    key: 'vendedor',
                    label: 'Vendedor',
                    count: attendantCounts.vendedor,
                    icon: UserCheck,
                    activeClass:
                      'border-amber-500/35 bg-amber-500/14 text-amber-300',
                  },
                ].map(({ key, label, count, icon: Icon, activeClass }) => {
                  const active = filterAttendant === key;

                  return (
                    <button
                      key={key}
                      onClick={() =>
                        setFilterAttendant((prev) => (prev === key ? 'all' : key))
                      }
                      className={cn(
                        'w-full min-w-0 rounded-full px-3 py-1.5 transition-colors text-left',
                        active
                          ? activeClass
                          : 'bg-[#202c33] text-slate-400 hover:text-slate-200',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate text-[10px] sm:text-[11px] font-medium">
                            {label}
                          </span>
                        </div>

                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                            active
                              ? 'bg-white/12 text-current'
                              : 'bg-white/5 text-slate-500',
                          )}
                        >
                          {count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-600">Carregando...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-600">
              <MessageSquare className="w-6 h-6 opacity-30" />
              <p className="text-xs">
                {searchTerm || hasActiveFilters
                  ? 'Nenhuma conversa encontrada'
                  : 'Nenhuma conversa'}
              </p>
            </div>
          ) : (
            <div className="pb-20 md:pb-3">
              {filteredConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isSelected={selectedConversation?.id === conv.id}
                  customerProfile={getCustomerProfileForPhone(conv.contact_number)}
                  alineData={getAlineDataForPhone(conv.contact_number)}
                  currentUserId={user?.id}
                  onClick={() => setSelectedConversation(conv)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          'flex-1 min-w-0 min-h-0 flex flex-col',
          !selectedConversation ? 'hidden md:flex' : 'flex',
        )}
      >
        {selectedConversation ? (
          <>
            <div
              className={cn(
                'px-4 border-b border-[#2a3942] flex flex-col justify-center bg-[#202c33] shrink-0 gap-0 max-md:px-3',
                isSaleFinalized || selectedNeedsHumanAttention ? 'h-auto py-2' : 'h-14 max-md:h-[58px]',
              )}
            >
              {isSaleFinalized && (
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <Trophy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-emerald-400 font-semibold flex-1">
                    Venda finalizada com sucesso!
                  </span>
                  <button
                    onClick={handleUndoSale}
                    disabled={finalizingSale}
                    className="text-[10px] text-emerald-600 hover:text-emerald-400 transition-colors"
                  >
                    Desfazer
                  </button>
                </div>
              )}

              {selectedNeedsHumanAttention && !isSaleFinalized && (
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/30 shadow-[0_0_28px_rgba(16,185,129,0.25)] animate-pulse">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span className="text-[11px] text-emerald-200 font-black uppercase tracking-[0.04em] flex-1">
                    Precisa de atendimento humano agora
                  </span>
                  <span className="hidden sm:inline-flex text-[10px] text-emerald-300 font-semibold">
                    Vendedor online deve assumir esta conversa
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <button
                    className="md:hidden shrink-0 p-2 -ml-1 rounded-full text-slate-300 hover:text-white hover:bg-white/8 transition-colors"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  <div className="relative shrink-0">
                    {getCustomerProfileForPhone(selectedConversation.contact_number)?.profile_pic_url ? (
                      <img
                        src={
                          getCustomerProfileForPhone(selectedConversation.contact_number)
                            .profile_pic_url
                        }
                        alt=""
                        className="w-8 h-8 max-md:w-9 max-md:h-9 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={cn(
                          'w-8 h-8 max-md:w-9 max-md:h-9 rounded-full flex items-center justify-center text-sm font-bold text-white',
                          selectedConversation.platform === 'instagram'
                            ? 'bg-gradient-to-br from-fuchsia-500 to-orange-400'
                            : isSaleFinalized
                              ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                              : currentAgentSlug === 'keila'
                                ? 'bg-gradient-to-br from-sky-500 to-indigo-500'
                                : currentAgentSlug === 'kate'
                                  ? 'bg-gradient-to-br from-fuchsia-500 to-rose-500'
                                : 'bg-gradient-to-br from-emerald-400 to-cyan-500',
                        )}
                      >
                        {(
                          selectedConversation.contact_name ||
                          selectedConversation.contact_number
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    )}

                    {contactPresenceLabel && (
                      <span
                        title={contactPresenceLabel}
                        className={cn(
                          'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#202c33]',
                          selectedContactIsOnline ? 'bg-emerald-400 ring-2 ring-emerald-400/25' : 'bg-slate-500',
                          ['composing', 'recording'].includes(selectedContactPresence) && 'animate-pulse',
                        )}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="min-w-0 max-w-full truncate text-sm font-semibold text-white max-md:text-[15px]">
                        {getCustomerProfileForPhone(selectedConversation.contact_number)?.name ||
                          selectedConversation.contact_name ||
                          selectedConversation.contact_number}
                      </p>

                      {isCurrentHumanTakeover && currentSellerName ? (
                        <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                          <span className="w-4 h-4 rounded-full bg-amber-500 text-amber-950 text-[9px] font-bold flex items-center justify-center shrink-0">
                            {currentSellerInitial}
                          </span>
                          {currentSellerFirstName}
                        </span>
                      ) : (
                        <span className={cn(
                          'hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold',
                          currentAgentBadgeClass,
                        )}>
                          {currentAgentSlug === 'kate' ? (
                            <Sparkles className="w-3 h-3 shrink-0" />
                          ) : (
                            <Bot className="w-3 h-3 shrink-0" />
                          )}
                          {currentAgentLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate max-md:text-[11px]">
                      <span className="truncate">{selectedConversation.contact_number}</span>
                      {contactPresenceLabel && (
                        <>
                          <span className="text-slate-700">•</span>
                          <span
                            className={cn(
                              'truncate',
                              selectedConversation.contact_is_online ||
                                selectedConversation.contact_presence === 'composing' ||
                                selectedConversation.contact_presence === 'recording'
                                ? 'text-emerald-400'
                                : 'text-slate-500',
                            )}
                          >
                            {contactPresenceLabel}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleFinalizeSale}
                    disabled={finalizingSale}
                    className={cn(
                      'hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all',
                      isSaleFinalized
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                        : 'bg-[#111b21] text-slate-400 hover:bg-[#2a3942] hover:text-emerald-400',
                      finalizingSale && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {finalizingSale ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isSaleFinalized ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <ShoppingBag className="w-3.5 h-3.5" />
                    )}
                    {isSaleFinalized ? 'Venda finalizada' : 'Finalizar venda'}
                  </button>

                  <div className="hidden sm:block">
                    <LeadStatusSelect
                      value={
                        (selectedConversation.lead_status as LeadStatus) || 'novo'
                      }
                      onChange={(status) =>
                        updateLeadStatus(selectedConversation.id, status)
                      }
                      disabled={updatingLeadStatus}
                    />
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 max-md:p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/8 transition-colors">
                        <MoreVertical className="w-4 h-4 max-md:w-5 max-md:h-5" />
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="end"
                      className="w-52 bg-[#233138] border-[#2a3942]"
                    >
                      <div className="sm:hidden px-2 py-1.5 border-b border-white/10">
                        <LeadStatusSelect
                          value={
                            (selectedConversation.lead_status as LeadStatus) || 'novo'
                          }
                          onChange={(status) =>
                            updateLeadStatus(selectedConversation.id, status)
                          }
                          disabled={updatingLeadStatus}
                        />
                      </div>

                      <DropdownMenuItem
                        onClick={handleFinalizeSale}
                        disabled={finalizingSale}
                        className={cn(
                          'sm:hidden focus:bg-white/10',
                          isSaleFinalized
                            ? 'text-emerald-400 focus:text-emerald-300'
                            : 'text-slate-200 focus:text-white',
                        )}
                      >
                        {isSaleFinalized ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Desfazer venda
                          </>
                        ) : (
                          <>
                            <ShoppingBag className="w-4 h-4 mr-2" />
                            Finalizar venda
                          </>
                        )}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator className="sm:hidden bg-white/10" />

                      <DropdownMenuItem
                        onClick={() => handleTakeover('takeover')}
                        disabled={takingOver}
                        className="text-slate-200 focus:bg-white/10 focus:text-white"
                      >
                        <UserCheck className="w-4 h-4 mr-2" />
                        Assumir atendimento
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={() => handleTakeover('release')}
                        disabled={takingOver}
                        className="text-slate-200 focus:bg-white/10 focus:text-white"
                      >
                        <Bot className="w-4 h-4 mr-2" />
                        Devolver para Aline
                      </DropdownMenuItem>

                      {(isAdmin || isGerente) && (
                        <>
                          <DropdownMenuSeparator className="bg-white/10" />
                          <DropdownMenuItem
                            onClick={() => setAssignDialogOpen(true)}
                            className="text-emerald-400 focus:bg-emerald-500/10"
                          >
                            <UserPlus className="w-4 h-4 mr-2" />
                            Atribuir vendedor
                          </DropdownMenuItem>
                        </>
                      )}

                      <DropdownMenuSeparator className="bg-white/10" />

                      <DropdownMenuItem className="text-slate-200 focus:bg-white/10 focus:text-white">
                        <Phone className="w-4 h-4 mr-2" />
                        Ligar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            <div className="sm:hidden shrink-0 border-b border-[#2a3942] bg-[#111b21] px-3 py-2">
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-[#0b141a] p-1">
                <button
                  type="button"
                  onClick={handleFinalizeSale}
                  disabled={finalizingSale}
                  className={cn(
                    'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[11px] font-semibold disabled:opacity-50',
                    isSaleFinalized
                      ? 'bg-emerald-500/18 text-emerald-200'
                      : 'bg-[#00a884] text-[#071513]',
                  )}
                >
                  {finalizingSale ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShoppingBag className="h-3.5 w-3.5" />
                  )}
                  <span className="truncate">{isSaleFinalized ? 'Desfazer' : 'Venda'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTakeover('takeover')}
                  disabled={takingOver}
                  className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full bg-[#202c33] px-2 py-2 text-[11px] font-semibold text-slate-200 disabled:opacity-50"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span className="truncate">Assumir</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTakeover('release')}
                  disabled={takingOver}
                  className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full bg-[#202c33] px-2 py-2 text-[11px] font-semibold text-slate-200 disabled:opacity-50"
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span className="truncate">Aline</span>
                </button>
              </div>
            </div>

            {hasSelectedAutomationProduct && (
              <div className="shrink-0 border-b border-amber-400/20 bg-amber-500/[0.08] px-3 py-2 max-md:px-3 max-md:py-2">
                <div className="mx-auto flex max-w-5xl flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between xl:max-w-6xl">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300/80 max-md:text-[9px]">
                      Modelo escolhido pelo cliente
                    </p>
                    <p className="mt-0.5 truncate text-[13px] font-semibold text-amber-50 max-md:text-[12px]">
                      {selectedAutomationProduct?.name || 'Produto selecionado'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-amber-100/85 max-md:text-[10px]">
                    {selectedAutomationProduct?.sku && (
                      <span className="rounded-full border border-amber-300/20 bg-black/15 px-2 py-1">
                        SKU: {selectedAutomationProduct.sku}
                      </span>
                    )}
                    {formatChatCurrency(selectedAutomationProduct?.price) && (
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                        {formatChatCurrency(selectedAutomationProduct?.price)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div
              ref={messagesContainerRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide bg-[#0b141a]"
              onScroll={handleMessagesScroll}
              style={{
                overflowAnchor: 'none',
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.015\'%3E%3Ccircle cx=\'30\' cy=\'30\' r=\'1\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
              }}
            >
              <div
                className="w-full px-2.5 py-2.5 sm:px-6 sm:py-4 lg:px-10 xl:px-12 max-w-5xl xl:max-w-6xl mx-auto min-h-full"
              >
                {(loadingOlderMessages || hasOlderMessages) && messages.length > 0 && (
                  <div className="flex justify-center pb-2">
                    <button
                      type="button"
                      onClick={() => void loadOlderMessages()}
                      disabled={loadingOlderMessages || !hasOlderMessages}
                      className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-slate-800/80 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:border-white/14 hover:text-slate-200 disabled:cursor-default disabled:opacity-70"
                    >
                      {loadingOlderMessages ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Carregando mensagens anteriores
                        </>
                      ) : (
                        'Carregar mensagens anteriores'
                      )}
                    </button>
                  </div>
                )}

                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                    <Sparkles className="w-8 h-8 mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma mensagem ainda</p>
                  </div>
                ) : (
                  Object.entries(groupedMessages).map(([date, grouped]) => (
                    <div key={date}>
                      <div className="flex justify-center my-3 sm:my-4">
                        <span className="px-3 py-1 rounded-full bg-slate-800/80 text-[10px] text-slate-500 font-medium">
                          {formatDate(grouped[0].created_at || '')}
                        </span>
                      </div>

                      {grouped.map((message, index) => (
                        <MessageItem
                          key={message.id}
                          message={message}
                          platform={selectedConversation?.platform}
                          showTail={
                            index === 0 ||
                            grouped[index - 1]?.is_from_me !== message.is_from_me
                          }
                          canEdit={canEditMessage(message)}
                          canDelete={canDeleteMessage(message)}
                          editValue={
                            editingMessageId === message.id ? editingMessageDraft : ''
                          }
                          isEditing={editingMessageId === message.id}
                          isSavingEdit={editingMessageBusyId === message.id}
                          isDeleting={deletingMessageBusyId === message.id}
                          onStartEdit={handleStartEditingMessage}
                          onDelete={handleDeleteMessage}
                          onEditValueChange={setEditingMessageDraft}
                          onCancelEdit={handleCancelEditingMessage}
                          onSaveEdit={handleSaveEditedMessage}
                        />
                      ))}
                    </div>
                  ))
                )}

                {isContactTyping && selectedConversation && (
                  <TypingIndicator
                    contactName={selectedConversation.contact_name || ''}
                  />
                )}

                <div ref={messagesEndRef} className="h-2" />
              </div>
            </div>

            <div className="px-4 py-3 bg-[#202c33] border-t border-[#2a3942] shrink-0 max-md:px-2.5 max-md:py-2">
              <div className="max-w-5xl xl:max-w-6xl mx-auto">
                {isRecording && (
                  <div className="flex items-center justify-between mb-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      <span className="text-xs text-rose-400 font-medium">
                        Gravando
                      </span>
                      <span className="text-xs text-rose-300 font-mono">
                        {formatRecordingTime(recordingDuration)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={cancelRecording}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={stopRecording}
                        className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Square className="w-3 h-3" />
                        Enviar
                      </button>
                    </div>
                  </div>
                )}

                <ChatComposer
                  disabled={isRecording}
                  fileInputRef={fileInputRef}
                  pendingAttachments={pendingAttachments}
                  onFileUpload={handleFileUpload}
                  onPasteFiles={handlePasteFiles}
                  onRemovePendingAttachment={removePendingAttachment}
                  onCaptureScreenshot={captureAndSendScreenshot}
                  onStartRecording={startRecording}
                  onSendMessage={handleComposerSend}
                />
              </div>
            </div>
          </>
        ) : (
          <div
            className="flex-1 flex items-center justify-center bg-[#0b141a]"
            style={{
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.015\'%3E%3Ccircle cx=\'30\' cy=\'30\' r=\'1\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
            }}
          >
            <div className="text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-emerald-500/40" />
              </div>
              <p className="text-sm font-medium text-slate-500">
                Selecione uma conversa
              </p>
              <p className="text-xs text-slate-700 mt-1">
                para começar a atender
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedConversation && (
        <div className="hidden lg:block shrink-0">
          <SellerToolsPanel
            phone={selectedConversation.contact_number}
            contactName={selectedConversation.contact_name || ''}
            conversationId={selectedConversation.id}
            onSendMessage={sendMessageDirect}
          />
        </div>
      )}

      {selectedConversation && (
        <FinalizeSaleDialog
          open={finalizeDialogOpen}
          onOpenChange={setFinalizeDialogOpen}
          sellerName={currentLoggedSellerName}
          customerName={
            getCustomerProfileForPhone(selectedConversation.contact_number)?.name ||
            selectedConversation.contact_name ||
            'Cliente'
          }
          customerPhone={selectedConversation.contact_number}
          onConfirm={handleConfirmSale}
        />
      )}

      {selectedConversation && (isAdmin || isGerente) && (
        <AssignSellerDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          conversationPhone={selectedConversation.contact_number}
          currentSellerId={
            getAlineDataForPhone(selectedConversation.contact_number)?.assigned_seller_id
          }
          currentSellerName={
            getAlineDataForPhone(selectedConversation.contact_number)?.assigned_seller_name
          }
          onAssigned={() => {
            fetchConversations(false);
            fetchAlineStatus(selectedConversation.contact_number);
          }}
        />
      )}
    </div>
  );
};

export default Chat;
