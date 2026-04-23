import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase, Conversation, Message, LeadStatus } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send, Paperclip, Search, MessageSquare, Mic, Bot, User, Phone,
  ArrowLeft, MoreVertical, UserCheck, RefreshCw, MessageCircle,
  Sparkles, X, Loader2, Users, UserPlus, Camera, Square,
  CheckCircle2, Trophy, ShoppingBag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { LeadStatusSelect, LeadStatusBadge } from '@/components/chat/LeadStatusSelect';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import TypingIndicator from '@/components/chat/TypingIndicator';
import SellerToolsPanel from '@/components/chat/SellerToolsPanel';
import AssignSellerDialog from '@/components/chat/AssignSellerDialog';
import MessageItem from '@/components/chat/MessageItem';
import ConversationItem from '@/components/chat/ConversationItem';
import { useSellerPresence, assignConversationToSeller } from '@/hooks/useSellerPresence';
import { useUserRole } from '@/hooks/useUserRole';
import { useAssignmentNotification } from '@/hooks/useAssignmentNotification';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface AlineConversation {
  id: string; phone: string; status: string;
  assigned_seller_id?: string; assigned_seller_name?: string;
  assignment_reason?: string; assigned_at?: string;
}
interface CustomerProfile {
  whatsapp: string; name?: string; profile_pic_url?: string;
}

const Chat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 200);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [updatingLeadStatus, setUpdatingLeadStatus] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAttendant, setFilterAttendant] = useState<string>('all');
  const [alineStatus, setAlineStatus] = useState<string | null>(null);
  const [alineStatusMap, setAlineStatusMap] = useState<Record<string, AlineConversation>>({});
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [customerProfiles, setCustomerProfiles] = useState<Record<string, CustomerProfile>>({});
  const [finalizingSale, setFinalizingSale] = useState(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScroll = useRef(true);
  const lastMessageCount = useRef(0);
  const { toast } = useToast();
  const { onlineSellers, startChatting, stopChatting } = useSellerPresence();
  const { isAdmin, isGerente } = useUserRole();
  useAssignmentNotification();

  // ─── Actions ──────────────────────────────────────────────────────────────
  const updateLeadStatus = async (conversationId: string, status: LeadStatus) => {
    setUpdatingLeadStatus(true);
    try {
      const { error } = await supabase.from('conversations').update({ lead_status: status }).eq('id', conversationId);
      if (error) throw error;
      setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, lead_status: status } : c));
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, lead_status: status } : null);
      }
      toast({ title: 'Status atualizado!' });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível atualizar o status.', variant: 'destructive' });
    } finally {
      setUpdatingLeadStatus(false);
    }
  };

  // ─── Finalizar venda ───────────────────────────────────────────────────────
  const handleFinalizeSale = async () => {
    if (!selectedConversation || finalizingSale) return;
    const alreadyFinalized = selectedConversation.lead_status === 'vendido';

    // Toggle: se já vendido, volta para 'qualificado'; senão marca como vendido
    const newStatus: LeadStatus = alreadyFinalized ? 'qualificado' : 'vendido';
    setFinalizingSale(true);
    try {
      const { error } = await supabase.from('conversations').update({ lead_status: newStatus }).eq('id', selectedConversation.id);
      if (error) throw error;
      setConversations(prev => prev.map(c => c.id === selectedConversation.id ? { ...c, lead_status: newStatus } : c));
      setSelectedConversation(prev => prev ? { ...prev, lead_status: newStatus } : null);
      toast({
        title: alreadyFinalized ? '↩️ Venda desmarcada' : '🏆 Venda finalizada!',
        description: alreadyFinalized
          ? 'Status voltou para qualificado.'
          : 'Parabéns! Conversa marcada como venda concluída.',
      });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível finalizar a venda.', variant: 'destructive' });
    } finally {
      setFinalizingSale(false);
    }
  };

  const handleTakeover = async (action: 'takeover' | 'release') => {
    if (!selectedConversation) return;
    setTakingOver(true);
    try {
      const { data, error } = await supabase.functions.invoke('aline-takeover', {
        body: { phone: selectedConversation.contact_number, action },
      });
      if (error) throw error;
      const newStatus = action === 'takeover' ? 'human_takeover' : 'active';
      setAlineStatus(newStatus);
      setAlineStatusMap(prev => ({
        ...prev,
        [selectedConversation.contact_number]: { ...prev[selectedConversation.contact_number], status: newStatus },
      }));
      toast({ title: action === 'takeover' ? '✋ Atendimento assumido' : '🤖 Devolvido para Aline', description: data.message });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível alterar o atendimento.', variant: 'destructive' });
    } finally {
      setTakingOver(false);
    }
  };

  const handleAssignToSeller = async (sellerId: string, sellerName: string) => {
    if (!selectedConversation) return;
    setTakingOver(true);
    try {
      const { error } = await supabase.functions.invoke('aline-takeover', {
        body: { phone: selectedConversation.contact_number, action: 'takeover', seller_id: sellerId, seller_name: sellerName, reason: 'Atribuição manual via painel' },
      });
      if (error) throw error;
      setAlineStatus('human_takeover');
      setAlineStatusMap(prev => ({
        ...prev,
        [selectedConversation.contact_number]: { ...prev[selectedConversation.contact_number], status: 'human_takeover', assigned_seller_id: sellerId, assigned_seller_name: sellerName },
      }));
      toast({ title: '✅ Conversa atribuída', description: `Atribuída para ${sellerName}` });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível atribuir.', variant: 'destructive' });
    } finally {
      setTakingOver(false);
    }
  };

  // ─── Realtime: mensagens ───────────────────────────────────────────────────
  useEffect(() => {
    if (selectedConversation) {
      lastMessageCount.current = 0;
      shouldAutoScroll.current = true;
      fetchMessages(selectedConversation.id);
      markAsRead(selectedConversation.id);
      setIsContactTyping(false);
      fetchAlineStatus(selectedConversation.contact_number);
      startChatting(selectedConversation.contact_number);

      const channel = supabase.channel(`messages-${selectedConversation.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation.id}` }, (payload) => {
          if (!(payload.new as Message).is_from_me) setIsContactTyping(false);
          setMessages(prev => {
            if (prev.some(m => m.id === (payload.new as Message).id)) return prev;
            return [...prev, payload.new as Message];
          });
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation.id}` }, (payload) => {
          setMessages(prev => prev.map(m => m.id === (payload.new as Message).id ? { ...m, ...payload.new } : m));
        })
        .subscribe();

      const pollInterval = setInterval(() => fetchMessages(selectedConversation.id), 15000);
      return () => { supabase.removeChannel(channel); clearInterval(pollInterval); stopChatting(); };
    } else {
      stopChatting();
    }
  }, [selectedConversation?.id, startChatting, stopChatting]);

  useEffect(() => {
    const isNew = messages.length > 0 && lastMessageCount.current === 0;
    const hasNew = messages.length > lastMessageCount.current;
    if (isNew) messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    else if (hasNew && shouldAutoScroll.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    lastMessageCount.current = messages.length;
  }, [messages]);

  const handleMessagesScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const t = event.currentTarget;
    shouldAutoScroll.current = t.scrollHeight - t.scrollTop - t.clientHeight < 100;
  }, []);

  // ─── Fetch conversations ───────────────────────────────────────────────────
  const fetchConversations = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      const { data, error } = await supabase.from('conversations').select('*').order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      setConversations(data || []);

      if (data && data.length > 0) {
        const phones = data.map(c => c.contact_number);
        const [{ data: alineData }, { data: customersData }] = await Promise.all([
          supabase.from('aline_conversations').select('id, phone, status, assigned_seller_id, assigned_seller_name, assignment_reason, assigned_at').in('phone', phones),
          supabase.from('customers').select('whatsapp, name, profile_pic_url').in('whatsapp', phones),
        ]);

        if (alineData) {
          const statusMap: Record<string, AlineConversation> = {};
          alineData.forEach(ac => { statusMap[ac.phone] = ac; });
          setAlineStatusMap(statusMap);
        }
        if (customersData) {
          const profilesMap: Record<string, CustomerProfile> = {};
          customersData.forEach(c => { profilesMap[c.whatsapp] = { whatsapp: c.whatsapp, name: c.name, profile_pic_url: c.profile_pic_url }; });
          setCustomerProfiles(profilesMap);
        }
      }
      if (showToast) toast({ title: '✅ Atualizado!', description: `${data?.length || 0} conversas` });
    } catch {
      if (showToast) toast({ title: 'Erro', description: 'Não foi possível atualizar', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchConversations(false);
    const convChannel = supabase.channel('conversations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => fetchConversations(false))
      .subscribe();
    const alineChannel = supabase.channel('aline-conversations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aline_conversations' }, (payload) => {
        const updated = payload.new as AlineConversation;
        if (updated?.phone) {
          setAlineStatusMap(prev => {
            const current = prev[updated.phone];
            if (current?.status === updated.status && current?.assigned_seller_id === updated.assigned_seller_id) return prev;
            return { ...prev, [updated.phone]: updated };
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(convChannel); supabase.removeChannel(alineChannel); };
  }, [fetchConversations]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const { data, error } = await supabase.from('messages')
        .select('id, content, created_at, is_from_me, media_url, message_type, status, conversation_id')
        .eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(100);
      if (error) throw error;
      setMessages((data || []).filter(m => m.content?.trim() || m.media_url));
    } catch { /* silent */ }
  }, []);

  const markAsRead = async (id: string) => {
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id);
  };

  const fetchAlineStatus = async (phone: string) => {
    try {
      const { data } = await supabase.from('aline_conversations').select('status').eq('phone', phone).order('created_at', { ascending: false }).limit(1).maybeSingle();
      setAlineStatus(data?.status || null);
    } catch { setAlineStatus(null); }
  };

  // ─── Optimistic messaging ──────────────────────────────────────────────────
  const addOptimisticMessage = useCallback((content: string, messageType = 'text', mediaUrl: string | null = null): string => {
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages(prev => [...prev, { id: tempId, conversation_id: selectedConversation?.id || '', content, message_type: messageType, media_url: mediaUrl, is_from_me: true, status: 'sending', created_at: new Date().toISOString() }]);
    shouldAutoScroll.current = true;
    return tempId;
  }, [selectedConversation?.id]);

  const markOptimisticFailed = useCallback((tempId: string) => {
    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
  }, []);

  const removeOptimistic = useCallback((tempId: string) => {
    setMessages(prev => prev.filter(m => m.id !== tempId));
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation || sending) return;
    const msg = newMessage;
    setNewMessage('');
    await sendMessageDirect(msg);
  };

  const sendMessageDirect = async (messageText: string) => {
    if (!messageText.trim() || !selectedConversation) return;
    const tempId = addOptimisticMessage(messageText);
    supabase.functions.invoke('automation-send', {
      body: { conversation_id: selectedConversation.id, phone: selectedConversation.contact_number, message: messageText, message_type: 'text', platform: selectedConversation.platform || 'whatsapp' },
    }).then(({ error }) => {
      if (error) { markOptimisticFailed(tempId); toast({ title: 'Erro', description: 'Não foi possível enviar.', variant: 'destructive' }); }
      setTimeout(() => removeOptimistic(tempId), 3000);
    }).catch(() => { markOptimisticFailed(tempId); toast({ title: 'Erro', description: 'Não foi possível enviar.', variant: 'destructive' }); });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation) return;
    let messageType = 'document';
    if (file.type.startsWith('image/')) messageType = 'image';
    else if (file.type.startsWith('audio/')) messageType = 'audio';
    else if (file.type.startsWith('video/')) messageType = 'video';
    const tempId = addOptimisticMessage(file.name, messageType);
    if (fileInputRef.current) fileInputRef.current.value = '';
    try {
      const fileName = `${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(fileName);
      const { error } = await supabase.functions.invoke('automation-send', {
        body: { conversation_id: selectedConversation.id, phone: selectedConversation.contact_number, message: file.name, message_type: messageType, media_url: publicUrl, platform: selectedConversation.platform || 'whatsapp' },
      });
      if (error) throw error;
      setTimeout(() => removeOptimistic(tempId), 3000);
    } catch { markOptimisticFailed(tempId); toast({ title: 'Erro', description: 'Não foi possível enviar o arquivo.', variant: 'destructive' }); }
  };

  // ─── Audio recording ───────────────────────────────────────────────────────
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRecording && recordingStartTime) {
      interval = setInterval(() => setRecordingDuration(Math.floor((Date.now() - recordingStartTime) / 1000)), 100);
    } else { setRecordingDuration(0); }
    return () => { if (interval) clearInterval(interval); };
  }, [isRecording, recordingStartTime]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) { chunks.push(e.data); setAudioChunks([...chunks]); } };
      recorder.onstop = async () => { const blob = new Blob(chunks, { type: 'audio/webm' }); await uploadAudio(blob); stream.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; setAudioChunks([]); };
      recorder.start(100);
      setMediaRecorder(recorder); setIsRecording(true); setRecordingStartTime(Date.now());
    } catch { toast({ title: 'Erro', description: 'Não foi possível acessar o microfone.', variant: 'destructive' }); }
  };

  const stopRecording = () => { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); setMediaRecorder(null); setIsRecording(false); setRecordingStartTime(null); };
  const cancelRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
    setMediaRecorder(null); setIsRecording(false); setRecordingStartTime(null); setAudioChunks([]);
    toast({ title: 'Gravação cancelada' });
  };

  const uploadAudio = async (blob: Blob) => {
    if (!selectedConversation || blob.size < 1000) { toast({ title: 'Áudio muito curto' }); return; }
    const tempId = addOptimisticMessage('🎤 Áudio', 'audio');
    try {
      const fileName = `audio-${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, blob);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(fileName);
      const { error } = await supabase.functions.invoke('automation-send', { body: { conversation_id: selectedConversation.id, phone: selectedConversation.contact_number, message: 'Áudio', message_type: 'audio', media_url: publicUrl, platform: selectedConversation.platform || 'whatsapp' } });
      if (error) throw error;
      setTimeout(() => removeOptimistic(tempId), 3000);
    } catch { markOptimisticFailed(tempId); toast({ title: 'Erro', description: 'Não foi possível enviar o áudio.', variant: 'destructive' }); }
  };

  const captureAndSendScreenshot = async () => {
    if (!selectedConversation) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { mediaSource: 'screen' } as any });
      const video = document.createElement('video');
      video.srcObject = stream; await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png', 0.9));
      if (!blob) throw new Error('Failed');
      const tempId = addOptimisticMessage('📸 Screenshot', 'image');
      const fileName = `screenshot-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, blob);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(fileName);
      const { error } = await supabase.functions.invoke('automation-send', { body: { conversation_id: selectedConversation.id, phone: selectedConversation.contact_number, message: 'Screenshot', message_type: 'image', media_url: publicUrl, platform: selectedConversation.platform || 'whatsapp' } });
      if (error) throw error;
      setTimeout(() => removeOptimistic(tempId), 3000);
    } catch (error: any) {
      if (error.name !== 'NotAllowedError') toast({ title: 'Erro', description: 'Não foi possível capturar.', variant: 'destructive' });
    }
  };

  const formatRecordingTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Filters & counts ─────────────────────────────────────────────────────
  const filteredConversations = useMemo(() => {
    const searchLower = debouncedSearchTerm.toLowerCase();
    return conversations.filter((conv) => {
      const displayName = customerProfiles[conv.contact_number]?.name || conv.contact_name || '';
      const matchesSearch = !debouncedSearchTerm || displayName.toLowerCase().includes(searchLower) || conv.contact_number?.includes(debouncedSearchTerm);
      const matchesStatus = filterStatus === 'all' || conv.lead_status === filterStatus;
      const convStatus = alineStatusMap[conv.contact_number]?.status;
      const isHuman = convStatus === 'human_takeover';
      const matchesAttendant = filterAttendant === 'all' || (filterAttendant === 'vendedor' && isHuman) || (filterAttendant === 'aline' && !isHuman);
      return matchesSearch && matchesStatus && matchesAttendant;
    }).sort((a, b) => {
      const dA = new Date((a as any).last_message_at || a.created_at || 0).getTime();
      const dB = new Date((b as any).last_message_at || b.created_at || 0).getTime();
      return dB - dA;
    });
  }, [conversations, debouncedSearchTerm, filterStatus, filterAttendant, alineStatusMap, customerProfiles]);

  const groupedMessages = useMemo(() => {
    return messages.reduce((groups, msg) => {
      const date = new Date(msg.created_at || '').toDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(msg);
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
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const unreadTotal = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  const statusFilters = [
    { key: 'all',      label: 'Todos',       color: 'bg-slate-500'   },
    { key: 'novo',     label: 'Novos',       color: 'bg-slate-400'   },
    { key: 'frio',     label: 'Frios',       color: 'bg-blue-400'    },
    { key: 'quente',   label: 'Quentes',     color: 'bg-orange-400'  },
    { key: 'vendido',  label: 'Vendidos',    color: 'bg-emerald-400' },
  ];

  const statusCounts: Record<string, number> = {
    all:     conversations.length,
    novo:    conversations.filter(c => c.lead_status === 'novo' || !c.lead_status).length,
    frio:    conversations.filter(c => c.lead_status === 'frio').length,
    quente:  conversations.filter(c => c.lead_status === 'quente').length,
    vendido: conversations.filter(c => c.lead_status === 'vendido').length,
  };

  const attendantCounts = {
    all:      conversations.length,
    aline:    conversations.filter(c => alineStatusMap[c.contact_number]?.status !== 'human_takeover').length,
    vendedor: conversations.filter(c => alineStatusMap[c.contact_number]?.status === 'human_takeover').length,
  };

  // ─── Dados do atendente atual ──────────────────────────────────────────────
  const currentAlineData = selectedConversation
    ? alineStatusMap[selectedConversation.contact_number]
    : null;
  const isCurrentHumanTakeover = currentAlineData?.status === 'human_takeover';
  const currentSellerName = currentAlineData?.assigned_seller_name || '';
  const currentSellerFirstName = currentSellerName.split(' ')[0];
  const currentSellerInitial = currentSellerName.charAt(0).toUpperCase() || 'V';
  const isSaleFinalized = selectedConversation?.lead_status === 'vendido';

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex bg-[#0d1117] overflow-hidden">

      {/* ── Painel esquerdo: lista de conversas ──────────────────────────── */}
      <div className={cn(
        'flex flex-col shrink-0 border-r border-white/5 bg-slate-950 overflow-hidden',
        'w-full md:w-[320px] lg:w-[360px]',
        selectedConversation ? 'hidden md:flex' : 'flex',
      )}>

        {/* Header da lista */}
        <div className="px-4 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
                  <MessageCircle className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
                </div>
                {unreadTotal > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">Chat CRM</p>
                <p className="text-[10px] text-slate-500">{conversations.length} conversas</p>
              </div>
            </div>
            <button
              onClick={() => fetchConversations(true)}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            </button>
          </div>

          {/* Vendedores online — compacto */}
          {onlineSellers.length > 0 && (
            <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
              <span className="text-[11px] text-emerald-400 font-medium shrink-0">{onlineSellers.length} online</span>
              <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
                {onlineSellers.map(seller => (
                  <button
                    key={seller.user_id}
                    onClick={() => selectedConversation
                      ? handleAssignToSeller(seller.user_id, seller.full_name || 'Vendedor')
                      : toast({ title: 'Selecione uma conversa primeiro' })
                    }
                    className="flex-none flex items-center gap-1 px-2 py-0.5 bg-slate-800/60 rounded-full border border-white/5 hover:border-emerald-500/40 transition-colors"
                  >
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white text-[9px] font-bold">
                      {(seller.full_name || 'V').charAt(0)}
                    </div>
                    <span className="text-[10px] text-slate-400 max-w-[48px] truncate">
                      {(seller.full_name || 'Vendedor').split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
            <Input
              placeholder="Buscar conversa..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9 bg-slate-800/60 border-white/5 text-sm text-white placeholder:text-slate-600 focus-visible:ring-emerald-500/40 rounded-lg"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filtros */}
        <div className="px-3 py-2 border-b border-white/5 space-y-2 shrink-0 overflow-hidden">
          {/* Status — scroll horizontal sem scrollbar */}
          <div className="-mx-3 px-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
            {statusFilters.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={cn(
                  'flex-none flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap',
                  filterStatus === key
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-800/50 text-slate-500 hover:text-slate-300',
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', filterStatus === key ? 'bg-white/70' : color)} />
                {label}
                <span className={cn('text-[10px]', filterStatus === key ? 'text-emerald-100' : 'text-slate-700')}>
                  {statusCounts[key]}
                </span>
              </button>
            ))}
          </div>

          {/* Atendente */}
          <div className="flex gap-1.5">
            {[
              { key: 'all',      label: `Todos (${attendantCounts.all})`          },
              { key: 'aline',    label: `Aline (${attendantCounts.aline})`        },
              { key: 'vendedor', label: `Vendedor (${attendantCounts.vendedor})`  },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterAttendant(key)}
                className={cn(
                  'flex-1 py-1 rounded-lg text-[11px] font-medium transition-all truncate',
                  filterAttendant === key
                    ? key === 'aline' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : key === 'vendedor' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-slate-700 text-white'
                    : 'text-slate-600 hover:text-slate-400',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-600">Carregando...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-600">
              <MessageSquare className="w-6 h-6 opacity-30" />
              <p className="text-xs">{searchTerm ? 'Nenhum resultado' : 'Nenhuma conversa'}</p>
            </div>
          ) : (
            filteredConversations.map(conv => (
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

      {/* ── Área do chat ──────────────────────────────────────────────────── */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0',
        !selectedConversation ? 'hidden md:flex' : 'flex',
      )}>
        {selectedConversation ? (
          <>
            {/* ── Chat Header ─────────────────────────────────────────────── */}
            <div className={cn(
              'px-4 border-b border-white/5 flex flex-col justify-center bg-slate-950/90 backdrop-blur-xl shrink-0 gap-0',
              // Altura dinâmica: menor quando tem banner de venda finalizada
              isSaleFinalized ? 'h-auto py-2' : 'h-14',
            )}>

              {/* Banner de venda finalizada */}
              {isSaleFinalized && (
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <Trophy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-emerald-400 font-semibold flex-1">Venda finalizada com sucesso!</span>
                  <button
                    onClick={handleFinalizeSale}
                    disabled={finalizingSale}
                    className="text-[10px] text-emerald-600 hover:text-emerald-400 transition-colors"
                  >
                    Desfazer
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                {/* Voltar mobile + info do contato */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    className="md:hidden shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {customerProfiles[selectedConversation.contact_number]?.profile_pic_url ? (
                      <img
                        src={customerProfiles[selectedConversation.contact_number].profile_pic_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white',
                        selectedConversation.platform === 'instagram'
                          ? 'bg-gradient-to-br from-fuchsia-500 to-orange-400'
                          : isSaleFinalized
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                            : 'bg-gradient-to-br from-emerald-400 to-cyan-500'
                      )}>
                        {(selectedConversation.contact_name || selectedConversation.contact_number).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className={cn(
                      'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-slate-950',
                      isCurrentHumanTakeover ? 'bg-amber-500' : 'bg-emerald-500'
                    )} />
                  </div>

                  {/* Nome e info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white truncate">
                        {customerProfiles[selectedConversation.contact_number]?.name || selectedConversation.contact_name || selectedConversation.contact_number}
                      </p>

                      {/* Badge do atendente atual — destaque visual */}
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
                    <p className="text-[10px] text-slate-600 truncate">{selectedConversation.contact_number}</p>
                  </div>
                </div>

                {/* Ações do header */}
                <div className="flex items-center gap-1.5 shrink-0">

                  {/* Botão Finalizar Venda — visível no desktop */}
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
                      value={(selectedConversation.lead_status as LeadStatus) || 'novo'}
                      onChange={status => updateLeadStatus(selectedConversation.id, status)}
                      disabled={updatingLeadStatus}
                    />
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 bg-slate-800 border-white/10">
                      {/* Status no mobile */}
                      <div className="sm:hidden px-2 py-1.5 border-b border-white/10">
                        <LeadStatusSelect
                          value={(selectedConversation.lead_status as LeadStatus) || 'novo'}
                          onChange={status => updateLeadStatus(selectedConversation.id, status)}
                          disabled={updatingLeadStatus}
                        />
                      </div>
                      {/* Finalizar venda no mobile */}
                      <DropdownMenuItem
                        onClick={handleFinalizeSale}
                        disabled={finalizingSale}
                        className={cn(
                          'sm:hidden focus:bg-white/10',
                          isSaleFinalized ? 'text-emerald-400 focus:text-emerald-300' : 'text-slate-200 focus:text-white',
                        )}
                      >
                        {isSaleFinalized
                          ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Venda finalizada</>
                          : <><ShoppingBag className="w-4 h-4 mr-2" /> Finalizar venda</>
                        }
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="sm:hidden bg-white/10" />
                      <DropdownMenuItem onClick={() => handleTakeover('takeover')} disabled={takingOver} className="text-slate-200 focus:bg-white/10 focus:text-white">
                        <UserCheck className="w-4 h-4 mr-2" /> Assumir atendimento
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleTakeover('release')} disabled={takingOver} className="text-slate-200 focus:bg-white/10 focus:text-white">
                        <Bot className="w-4 h-4 mr-2" /> Devolver para Aline
                      </DropdownMenuItem>
                      {(isAdmin || isGerente) && (
                        <>
                          <DropdownMenuSeparator className="bg-white/10" />
                          <DropdownMenuItem onClick={() => setAssignDialogOpen(true)} className="text-emerald-400 focus:bg-emerald-500/10">
                            <UserPlus className="w-4 h-4 mr-2" /> Atribuir vendedor
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem className="text-slate-200 focus:bg-white/10 focus:text-white">
                        <Phone className="w-4 h-4 mr-2" /> Ligar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            {/* Área de mensagens */}
            <div
              className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide bg-[#0b141a]"
              onScroll={handleMessagesScroll}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }}
            >
              <div ref={messagesContainerRef} className="px-4 sm:px-8 lg:px-16 py-4 max-w-3xl mx-auto min-h-full">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                    <Sparkles className="w-8 h-8 mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma mensagem ainda</p>
                  </div>
                ) : (
                  Object.entries(groupedMessages).map(([date, msgs]) => (
                    <div key={date}>
                      <div className="flex justify-center my-4">
                        <span className="px-3 py-1 rounded-full bg-slate-800/80 text-[10px] text-slate-500 font-medium">
                          {formatDate(msgs[0].created_at || '')}
                        </span>
                      </div>
                      {msgs.map((msg, idx) => (
                        <MessageItem
                          key={msg.id}
                          message={msg}
                          showTail={idx === 0 || msgs[idx - 1]?.is_from_me !== msg.is_from_me}
                        />
                      ))}
                    </div>
                  ))
                )}
                {isContactTyping && selectedConversation && (
                  <TypingIndicator contactName={selectedConversation.contact_name || ''} />
                )}
                <div ref={messagesEndRef} className="h-2" />
              </div>
            </div>

            {/* Input */}
            <div className="px-4 py-3 bg-slate-950/95 border-t border-white/5 shrink-0">
              <div className="max-w-3xl mx-auto">
                {/* Gravando */}
                {isRecording && (
                  <div className="flex items-center justify-between mb-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      <span className="text-xs text-rose-400 font-medium">Gravando</span>
                      <span className="text-xs text-rose-300 font-mono">{formatRecordingTime(recordingDuration)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={cancelRecording} className="px-2 py-1 text-xs text-slate-500 hover:text-rose-400 transition-colors">Cancelar</button>
                      <button onClick={stopRecording} className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white text-xs rounded-lg transition-colors flex items-center gap-1">
                        <Square className="w-3 h-3" /> Enviar
                      </button>
                    </div>
                  </div>
                )}

                <form onSubmit={sendMessage} className="flex items-end gap-2">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*,audio/*,video/*,.pdf,.doc,.docx" />

                  {/* Botões de ação */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isRecording}
                      className="p-2 rounded-lg text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={captureAndSendScreenshot} disabled={isRecording}
                      className="hidden sm:block p-2 rounded-lg text-slate-600 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors">
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Input */}
                  <div className="flex-1 relative">
                    <Input
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder="Digite uma mensagem..."
                      disabled={isRecording}
                      className="bg-slate-800/60 border-white/5 text-white placeholder:text-slate-600 h-10 pr-10 focus-visible:ring-emerald-500/30 rounded-xl text-sm"
                    />
                    {newMessage.trim() && (
                      <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-emerald-500 hover:bg-emerald-600 rounded-md flex items-center justify-center transition-colors">
                        <Send className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>

                  {/* Microfone */}
                  {!isRecording && (
                    <button type="button" onClick={startRecording}
                      className="p-2 rounded-lg text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors shrink-0">
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                </form>
              </div>
            </div>
          </>
        ) : (
          /* Estado vazio */
          <div className="flex-1 flex items-center justify-center bg-[#0b141a]"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }}>
            <div className="text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-emerald-500/40" />
              </div>
              <p className="text-sm font-medium text-slate-500">Selecione uma conversa</p>
              <p className="text-xs text-slate-700 mt-1">para começar a atender</p>
            </div>
          </div>
        )}
      </div>

      {/* Seller Tools Panel */}
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

      {/* Dialog atribuir vendedor */}
      {selectedConversation && (isAdmin || isGerente) && (
        <AssignSellerDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          conversationPhone={selectedConversation.contact_number}
          currentSellerId={alineStatusMap[selectedConversation.contact_number]?.assigned_seller_id}
          currentSellerName={alineStatusMap[selectedConversation.contact_number]?.assigned_seller_name}
          onAssigned={() => { fetchConversations(false); fetchAlineStatus(selectedConversation.contact_number); }}
        />
      )}
    </div>
  );
};

export default Chat;
