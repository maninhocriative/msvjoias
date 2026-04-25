import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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

interface AlineConversation {
  id: string;
  phone: string;
  status: string;
  assigned_seller_id?: string;
  assigned_seller_name?: string;
  assignment_reason?: string;
  assigned_at?: string;
}

interface CustomerProfile {
  whatsapp: string;
  name?: string;
  profile_pic_url?: string;
}

function normalizePhone(phone: string) {
  return (phone || '').replace(/\D/g, '');
}

const statusFilters = [
  { key: 'all', label: 'Todos', color: 'bg-slate-500' },
  { key: 'novo', label: 'Novos', color: 'bg-slate-400' },
  { key: 'frio', label: 'Frios', color: 'bg-blue-400' },
  { key: 'quente', label: 'Quentes', color: 'bg-orange-400' },
  { key: 'vendido', label: 'Vendidos', color: 'bg-emerald-400' },
];

const Chat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
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
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAttendant, setFilterAttendant] = useState<string>('all');
  const [alineStatusMap, setAlineStatusMap] = useState<Record<string, AlineConversation>>({});
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [customerProfiles, setCustomerProfiles] = useState<Record<string, CustomerProfile>>({});
  const [finalizingSale, setFinalizingSale] = useState(false);

  const audioStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScroll = useRef(true);
  const lastMessageCount = useRef(0);
  const handledRoutePhoneRef = useRef('');

  const { toast } = useToast();
  const { onlineSellers, startChatting, stopChatting } = useSellerPresence();
  const { isAdmin, isGerente } = useUserRole();
  const { profile, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  useAssignmentNotification();

  const routePhone = normalizePhone(searchParams.get('phone') || '');

  const currentLoggedSellerName = useMemo(() => {
    const profileName = profile?.full_name?.trim();
    const userMetadataName = typeof user?.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name.trim()
      : '';
    const emailName = user?.email?.split('@')[0];

    return profileName || userMetadataName || emailName || 'Vendedor';
  }, [profile?.full_name, user?.user_metadata, user?.email]);

  const getIsHumanTakeover = useCallback(
    (phone: string) => alineStatusMap[phone]?.status === 'human_takeover',
    [alineStatusMap],
  );

  const matchesStatusFilter = useCallback((conv: Conversation, status: string) => {
    const leadStatus = conv.lead_status || 'novo';
    return status === 'all' || leadStatus === status;
  }, []);

  const matchesAttendantFilter = useCallback(
    (conv: Conversation, attendant: string) => {
      const isHuman = getIsHumanTakeover(conv.contact_number);

      if (attendant === 'all') return true;
      if (attendant === 'vendedor') return isHuman;
      if (attendant === 'aline') return !isHuman;

      return true;
    },
    [getIsHumanTakeover],
  );

  const updateLeadStatus = async (conversationId: string, status: LeadStatus) => {
    setUpdatingLeadStatus(true);

    try {
      const { error } = await supabase
        .from('conversations')
        .update({ lead_status: status })
        .eq('id', conversationId);

      if (error) throw error;

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
      const customerName =
        customerProfiles[selectedConversation.contact_number]?.name ||
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

      const totalPrice = Number(payload.unitPrice || 0) * Number(payload.quantity || 1);
      const summaryText =
        `Venda finalizada no chat por ${currentLoggedSellerName}: ` +
        `${payload.productName}` +
        `${payload.productSku ? ` (${payload.productSku})` : ''}` +
        ` x${payload.quantity}.`;

      const { error: orderError } = await supabase.from('orders').insert([
        {
          customer_phone: selectedConversation.contact_number,
          customer_name: customerName,
          product_id: payload.productId,
          quantity: payload.quantity,
          unit_price: payload.unitPrice,
          total_price: totalPrice,
          status: 'done',
          source: 'chat',
          external_reference: selectedConversation.id,
          selected_sku: payload.productSku,
          selected_name: payload.productName,
          assigned_to: currentLoggedSellerName,
          notes: payload.notes || null,
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
        description: `${payload.productName} x${payload.quantity} salvo com sucesso.`,
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

  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(
          'id, content, created_at, is_from_me, media_url, message_type, status, conversation_id',
        )
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      setMessages((data || []).filter((m) => m.content?.trim() || m.media_url));
    } catch {
      // silent
    }
  }, []);

  const markAsRead = async (id: string) => {
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id);
  };

  const fetchAlineStatus = useCallback(async (phone: string) => {
    try {
      const { data } = await supabase
        .from('aline_conversations')
        .select(
          'id, phone, status, assigned_seller_id, assigned_seller_name, assignment_reason, assigned_at',
        )
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.phone) {
        setAlineStatusMap((prev) => ({
          ...prev,
          [phone]: data,
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
      fetchMessages(selectedConversation.id);
      markAsRead(selectedConversation.id);
      setIsContactTyping(false);
      fetchAlineStatus(selectedConversation.contact_number);
      startChatting(selectedConversation.contact_number);

      const channel = supabase
        .channel(`messages-${selectedConversation.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${selectedConversation.id}`,
          },
          (payload) => {
            if (!(payload.new as Message).is_from_me) {
              setIsContactTyping(false);
            }

            setMessages((prev) => {
              if (prev.some((m) => m.id === (payload.new as Message).id)) {
                return prev;
              }

              return [...prev, payload.new as Message];
            });
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${selectedConversation.id}`,
          },
          (payload) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === (payload.new as Message).id ? { ...m, ...payload.new } : m,
              ),
            );
          },
        )
        .subscribe();

      const pollInterval = setInterval(
        () => fetchMessages(selectedConversation.id),
        15000,
      );

      return () => {
        supabase.removeChannel(channel);
        clearInterval(pollInterval);
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
  ]);

  useEffect(() => {
    const isNewConversationLoad = messages.length > 0 && lastMessageCount.current === 0;
    const hasNewMessages = messages.length > lastMessageCount.current;

    if (isNewConversationLoad) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    } else if (hasNewMessages && shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    lastMessageCount.current = messages.length;
  }, [messages]);

  const handleMessagesScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    shouldAutoScroll.current =
      target.scrollHeight - target.scrollTop - target.clientHeight < 100;
  }, []);

  const fetchConversations = useCallback(
    async (showToast = false) => {
      try {
        setRefreshing(true);

        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .order('last_message_at', { ascending: false, nullsFirst: false });

        if (error) throw error;

        const conversationList = data || [];
        setConversations(conversationList);

        if (conversationList.length > 0) {
          const phones = conversationList.map((c) => c.contact_number);

          const [{ data: alineData }, { data: customersData }] = await Promise.all([
            supabase
              .from('aline_conversations')
              .select(
                'id, phone, status, assigned_seller_id, assigned_seller_name, assignment_reason, assigned_at',
              )
              .in('phone', phones),
            supabase
              .from('customers')
              .select('whatsapp, name, profile_pic_url')
              .in('whatsapp', phones),
          ]);

          if (alineData) {
            const statusMap: Record<string, AlineConversation> = {};

            alineData.forEach((ac) => {
              statusMap[ac.phone] = ac;
            });

            setAlineStatusMap(statusMap);
          }

          if (customersData) {
            const profilesMap: Record<string, CustomerProfile> = {};

            customersData.forEach((customer) => {
              profilesMap[customer.whatsapp] = {
                whatsapp: customer.whatsapp,
                name: customer.name,
                profile_pic_url: customer.profile_pic_url,
              };
            });

            setCustomerProfiles(profilesMap);
          }
        } else {
          setAlineStatusMap({});
          setCustomerProfiles({});
        }

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
    [toast],
  );

  useEffect(() => {
    fetchConversations(false);

    const convChannel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => fetchConversations(false),
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
              const current = prev[updated.phone];

              if (
                current?.status === updated.status &&
                current?.assigned_seller_id === updated.assigned_seller_id &&
                current?.assigned_seller_name === updated.assigned_seller_name
              ) {
                return prev;
              }

              return {
                ...prev,
                [updated.phone]: updated,
              };
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
      supabase.removeChannel(alineChannel);
    };
  }, [fetchConversations]);

  useEffect(() => {
    if (!routePhone) {
      handledRoutePhoneRef.current = '';
      return;
    }

    if (loading) return;
    if (handledRoutePhoneRef.current === routePhone) return;

    const matchedConversation = conversations.find(
      (conv) => normalizePhone(conv.contact_number) === routePhone,
    );

    handledRoutePhoneRef.current = routePhone;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('phone');
    setSearchParams(nextParams, { replace: true });

    setFilterStatus('all');
    setFilterAttendant('all');

    if (matchedConversation) {
      setSelectedConversation(matchedConversation);
      setSearchTerm('');
      return;
    }

    setSearchTerm(routePhone);

    toast({
      title: 'Conversa não encontrada',
      description: 'Esse telefone ainda não existe no chat. A busca foi aberta para você.',
    });
  }, [routePhone, loading, conversations, searchParams, setSearchParams, toast]);

  const addOptimisticMessage = useCallback(
    (content: string, messageType = 'text', mediaUrl: string | null = null): string => {
      const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          conversation_id: selectedConversation?.id || '',
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

  const removeOptimistic = useCallback((tempId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
  }, []);

  const sendMessageDirect = async (messageText: string) => {
    if (!messageText.trim() || !selectedConversation) return;

    const tempId = addOptimisticMessage(messageText);

    supabase.functions
      .invoke('automation-send', {
        body: {
          conversation_id: selectedConversation.id,
          phone: selectedConversation.contact_number,
          message: messageText,
          message_type: 'text',
          platform: selectedConversation.platform || 'whatsapp',
        },
      })
      .then(({ error }) => {
        if (error) {
          markOptimisticFailed(tempId);
          toast({
            title: 'Erro',
            description: 'Não foi possível enviar.',
            variant: 'destructive',
          });
        }

        setTimeout(() => removeOptimistic(tempId), 3000);
      })
      .catch(() => {
        markOptimisticFailed(tempId);
        toast({
          title: 'Erro',
          description: 'Não foi possível enviar.',
          variant: 'destructive',
        });
      });
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !selectedConversation) return;

    const messageText = newMessage;
    setNewMessage('');
    await sendMessageDirect(messageText);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file || !selectedConversation) return;

    let messageType = 'document';

    if (file.type.startsWith('image/')) messageType = 'image';
    else if (file.type.startsWith('audio/')) messageType = 'audio';
    else if (file.type.startsWith('video/')) messageType = 'video';

    const tempId = addOptimisticMessage(file.name, messageType);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    try {
      const fileName = `${Date.now()}.${file.name.split('.').pop()}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('chat-media').getPublicUrl(fileName);

      const { error } = await supabase.functions.invoke('automation-send', {
        body: {
          conversation_id: selectedConversation.id,
          phone: selectedConversation.contact_number,
          message: file.name,
          message_type: messageType,
          media_url: publicUrl,
          platform: selectedConversation.platform || 'whatsapp',
        },
      });

      if (error) throw error;

      setTimeout(() => removeOptimistic(tempId), 3000);
    } catch {
      markOptimisticFailed(tempId);

      toast({
        title: 'Erro',
        description: 'Não foi possível enviar o arquivo.',
        variant: 'destructive',
      });
    }
  };

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

    const tempId = addOptimisticMessage('🎤 Áudio', 'audio');

    try {
      const fileName = `audio-${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('chat-media').getPublicUrl(fileName);

      const { error } = await supabase.functions.invoke('automation-send', {
        body: {
          conversation_id: selectedConversation.id,
          phone: selectedConversation.contact_number,
          message: 'Áudio',
          message_type: 'audio',
          media_url: publicUrl,
          platform: selectedConversation.platform || 'whatsapp',
        },
      });

      if (error) throw error;

      setTimeout(() => removeOptimistic(tempId), 3000);
    } catch {
      markOptimisticFailed(tempId);

      toast({
        title: 'Erro',
        description: 'Não foi possível enviar o áudio.',
        variant: 'destructive',
      });
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await uploadAudio(blob);
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

      const tempId = addOptimisticMessage('📸 Screenshot', 'image');
      const fileName = `screenshot-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('chat-media').getPublicUrl(fileName);

      const { error } = await supabase.functions.invoke('automation-send', {
        body: {
          conversation_id: selectedConversation.id,
          phone: selectedConversation.contact_number,
          message: 'Screenshot',
          message_type: 'image',
          media_url: publicUrl,
          platform: selectedConversation.platform || 'whatsapp',
        },
      });

      if (error) throw error;

      setTimeout(() => removeOptimistic(tempId), 3000);
    } catch (error: any) {
      if (error.name !== 'NotAllowedError') {
        toast({
          title: 'Erro',
          description: 'Não foi possível capturar.',
          variant: 'destructive',
        });
      }
    }
  };

  const formatRecordingTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

  const searchedConversations = useMemo(() => {
    const searchLower = debouncedSearchTerm.toLowerCase();

    return conversations.filter((conv) => {
      const displayName =
        customerProfiles[conv.contact_number]?.name || conv.contact_name || '';

      return (
        !debouncedSearchTerm ||
        displayName.toLowerCase().includes(searchLower) ||
        conv.contact_number?.includes(debouncedSearchTerm)
      );
    });
  }, [conversations, debouncedSearchTerm, customerProfiles]);

  const filteredConversations = useMemo(() => {
    return searchedConversations
      .filter((conv) => matchesStatusFilter(conv, filterStatus))
      .filter((conv) => matchesAttendantFilter(conv, filterAttendant))
      .sort((a, b) => {
        const dateA = new Date((a as any).last_message_at || a.created_at || 0).getTime();
        const dateB = new Date((b as any).last_message_at || b.created_at || 0).getTime();
        return dateB - dateA;
      });
  }, [
    searchedConversations,
    filterStatus,
    filterAttendant,
    matchesStatusFilter,
    matchesAttendantFilter,
  ]);

  const statusCounts = useMemo(() => {
    const source =
      filterAttendant === 'all'
        ? searchedConversations
        : searchedConversations.filter((conv) =>
            matchesAttendantFilter(conv, filterAttendant),
          );

    return {
      all: source.length,
      novo: source.filter((c) => (c.lead_status || 'novo') === 'novo').length,
      frio: source.filter((c) => c.lead_status === 'frio').length,
      quente: source.filter((c) => c.lead_status === 'quente').length,
      vendido: source.filter((c) => c.lead_status === 'vendido').length,
    };
  }, [searchedConversations, filterAttendant, matchesAttendantFilter]);

  const attendantCounts = useMemo(() => {
    const source =
      filterStatus === 'all'
        ? searchedConversations
        : searchedConversations.filter((conv) =>
            matchesStatusFilter(conv, filterStatus),
          );

    return {
      aline: source.filter((conv) => !getIsHumanTakeover(conv.contact_number)).length,
      vendedor: source.filter((conv) => getIsHumanTakeover(conv.contact_number)).length,
    };
  }, [searchedConversations, filterStatus, matchesStatusFilter, getIsHumanTakeover]);

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
    ? alineStatusMap[selectedConversation.contact_number]
    : null;

  const isCurrentHumanTakeover = currentAlineData?.status === 'human_takeover';
  const currentSellerName = currentAlineData?.assigned_seller_name || '';
  const currentSellerFirstName = currentSellerName.split(' ')[0];
  const currentSellerInitial = currentSellerName.charAt(0).toUpperCase() || 'V';
  const isSaleFinalized = selectedConversation?.lead_status === 'vendido';

  const activeStatusLabel =
    statusFilters.find((item) => item.key === filterStatus)?.label || 'Todos';

  const activeAttendantLabel =
    filterAttendant === 'all'
      ? 'Todos os atendimentos'
      : filterAttendant === 'aline'
        ? 'Aline'
        : 'Vendedor';

  const hasActiveFilters = filterStatus !== 'all' || filterAttendant !== 'all';

  return (
    <div className="h-full min-h-0 min-w-0 flex bg-[#0d1117] overflow-hidden">
      <div
        className={cn(
          'flex flex-col shrink-0 min-h-0 border-r border-white/5 bg-slate-950 overflow-x-hidden',
          'w-full md:w-[400px] lg:w-[460px] xl:w-[500px] 2xl:w-[540px]',
          selectedConversation ? 'hidden md:flex' : 'flex',
        )}
      >
        <div className="px-4 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
                  <MessageCircle className="w-[18px] h-[18px] text-white" />
                </div>

                {unreadTotal > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-white leading-tight truncate">
                  Chat CRM
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {conversations.length} conversas
                </p>
              </div>
            </div>

            <button
              onClick={() => fetchConversations(true)}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors shrink-0"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            </button>
          </div>

          {onlineSellers.length > 0 && (
            <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
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
                    className="flex-none flex items-center gap-1 px-2 py-0.5 bg-slate-800/60 rounded-full border border-white/5 hover:border-emerald-500/40 transition-colors"
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
            <Input
              placeholder="Buscar conversa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 bg-slate-800/60 border-white/5 text-sm text-white placeholder:text-slate-600 focus-visible:ring-emerald-500/40 rounded-lg"
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

        <div className="px-3 py-3 border-b border-white/5 shrink-0 bg-slate-950/80">
          <div className="rounded-xl border border-white/5 bg-slate-900/45 p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Filtros
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  <span className="text-slate-300">{activeStatusLabel}</span>
                  <span className="text-slate-600"> • </span>
                  <span className="text-slate-300">{activeAttendantLabel}</span>
                </p>
              </div>

              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setFilterStatus('all');
                    setFilterAttendant('all');
                  }}
                  className="shrink-0 px-2 py-1 rounded-lg border border-white/5 bg-slate-800/70 text-[10px] font-medium text-slate-400 hover:text-white hover:border-white/10 transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="space-y-2">
              <p className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">
                Status
              </p>

              <div className="grid grid-cols-2 xl:grid-cols-3 gap-1.5">
                {statusFilters.map(({ key, label, color }) => {
                  const active = filterStatus === key;

                  return (
                    <button
                      key={key}
                      onClick={() => setFilterStatus(key)}
                      className={cn(
                        'w-full min-w-0 rounded-xl border px-3 py-2 transition-all text-left',
                        active
                          ? 'border-emerald-500/35 bg-emerald-500/14 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.08)]'
                          : 'border-white/5 bg-slate-800/45 text-slate-400 hover:text-slate-200 hover:border-white/10',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              active ? 'bg-emerald-300' : color,
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
                              ? 'bg-white/12 text-white'
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
                    label: 'Aline',
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
                        'w-full min-w-0 rounded-xl border px-3 py-2 transition-all text-left',
                        active
                          ? activeClass
                          : 'border-white/5 bg-slate-800/45 text-slate-400 hover:text-slate-200 hover:border-white/10',
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
            filteredConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isSelected={selectedConversation?.id === conv.id}
                customerProfile={customerProfiles[conv.contact_number]}
                alineData={alineStatusMap[conv.contact_number]}
                onClick={() => setSelectedConversation(conv)}
              />
            ))
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
                'px-4 border-b border-white/5 flex flex-col justify-center bg-slate-950/90 backdrop-blur-xl shrink-0 gap-0',
                isSaleFinalized ? 'h-auto py-2' : 'h-14',
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

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    className="md:hidden shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div className="relative shrink-0">
                    {customerProfiles[selectedConversation.contact_number]?.profile_pic_url ? (
                      <img
                        src={
                          customerProfiles[selectedConversation.contact_number]
                            .profile_pic_url
                        }
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white',
                          selectedConversation.platform === 'instagram'
                            ? 'bg-gradient-to-br from-fuchsia-500 to-orange-400'
                            : isSaleFinalized
                              ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
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

                    <span
                      className={cn(
                        'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-slate-950',
                        isCurrentHumanTakeover ? 'bg-amber-500' : 'bg-emerald-500',
                      )}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white truncate">
                        {customerProfiles[selectedConversation.contact_number]?.name ||
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
                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Bot className="w-3 h-3 shrink-0" />
                          Aline
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-600 truncate">
                      {selectedConversation.contact_number}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleFinalizeSale}
                    disabled={finalizingSale}
                    className={cn(
                      'hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                      isSaleFinalized
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                        : 'bg-slate-800/80 text-slate-400 border border-white/5 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20',
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
                      <button className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="end"
                      className="w-52 bg-slate-800 border-white/10"
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

            <div
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide bg-[#0b141a]"
              onScroll={handleMessagesScroll}
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.015\'%3E%3Ccircle cx=\'30\' cy=\'30\' r=\'1\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
              }}
            >
              <div
                ref={messagesContainerRef}
                className="w-full px-4 sm:px-6 lg:px-10 xl:px-12 py-4 max-w-5xl xl:max-w-6xl mx-auto min-h-full"
              >
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                    <Sparkles className="w-8 h-8 mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma mensagem ainda</p>
                  </div>
                ) : (
                  Object.entries(groupedMessages).map(([date, grouped]) => (
                    <div key={date}>
                      <div className="flex justify-center my-4">
                        <span className="px-3 py-1 rounded-full bg-slate-800/80 text-[10px] text-slate-500 font-medium">
                          {formatDate(grouped[0].created_at || '')}
                        </span>
                      </div>

                      {grouped.map((message, index) => (
                        <MessageItem
                          key={message.id}
                          message={message}
                          showTail={
                            index === 0 ||
                            grouped[index - 1]?.is_from_me !== message.is_from_me
                          }
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

            <div className="px-4 py-3 bg-slate-950/95 border-t border-white/5 shrink-0">
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

                <form onSubmit={sendMessage} className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                  />

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isRecording}
                      className="p-2 rounded-lg text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={captureAndSendScreenshot}
                      disabled={isRecording}
                      className="hidden sm:block p-2 rounded-lg text-slate-600 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 relative min-w-0">
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Digite uma mensagem..."
                      disabled={isRecording}
                      className="bg-slate-800/60 border-white/5 text-white placeholder:text-slate-600 h-10 pr-10 focus-visible:ring-emerald-500/30 rounded-xl text-sm"
                    />
                    {newMessage.trim() && (
                      <button
                        type="submit"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-emerald-500 hover:bg-emerald-600 rounded-md flex items-center justify-center transition-colors"
                      >
                        <Send className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>

                  {!isRecording && (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="p-2 rounded-lg text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors shrink-0"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                </form>
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
            customerProfiles[selectedConversation.contact_number]?.name ||
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
            alineStatusMap[selectedConversation.contact_number]?.assigned_seller_id
          }
          currentSellerName={
            alineStatusMap[selectedConversation.contact_number]?.assigned_seller_name
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
