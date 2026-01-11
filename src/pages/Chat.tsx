import { useState, useEffect, useRef } from 'react';
import { supabase, Conversation, Message, LeadStatus } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Paperclip, Search, MessageSquare, FileText, Mic, Check, CheckCheck, Instagram, Bot, User, Phone, ArrowLeft, MoreVertical, UserCheck, RefreshCw, Clock, MessageCircle, Sparkles, X, Volume2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { LeadStatusSelect, LeadStatusBadge } from '@/components/chat/LeadStatusSelect';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import TypingIndicator from '@/components/chat/TypingIndicator';
import SellerToolsPanel from '@/components/chat/SellerToolsPanel';

const Chat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [updatingLeadStatus, setUpdatingLeadStatus] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAttendant, setFilterAttendant] = useState<string>('all');
  const [alineStatus, setAlineStatus] = useState<string | null>(null);
  const [alineStatusMap, setAlineStatusMap] = useState<Record<string, string>>({});
  const [showSellerTools, setShowSellerTools] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const updateLeadStatus = async (conversationId: string, status: LeadStatus) => {
    setUpdatingLeadStatus(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ lead_status: status })
        .eq('id', conversationId);

      if (error) throw error;

      setConversations(prev => prev.map(c => 
        c.id === conversationId ? { ...c, lead_status: status } : c
      ));
      
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, lead_status: status } : null);
      }

      toast({ title: 'Status atualizado!' });
    } catch (error) {
      console.error('Error updating lead status:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingLeadStatus(false);
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

      // Atualizar o status local da Aline
      setAlineStatus(action === 'takeover' ? 'human_takeover' : 'active');

      toast({
        title: action === 'takeover' ? '✋ Atendimento assumido' : '🤖 Devolvido para Aline',
        description: data.message,
      });
    } catch (error) {
      console.error('Takeover error:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o atendimento.',
        variant: 'destructive',
      });
    } finally {
      setTakingOver(false);
    }
  };

  useEffect(() => {
    fetchConversations();

    const convChannel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => fetchConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
    };
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
      markAsRead(selectedConversation.id);
      setIsContactTyping(false);
      fetchAlineStatus(selectedConversation.contact_number);
      
      const channel = supabase
        .channel(`messages-${selectedConversation.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation.id}` },
          (payload) => {
            if (!(payload.new as Message).is_from_me) setIsContactTyping(false);
            setMessages((prev) => {
              if (prev.some(m => m.id === payload.new.id)) return prev;
              return [...prev, payload.new as Message];
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation.id}` },
          (payload) => {
            setMessages((prev) => 
              prev.map((msg) => msg.id === payload.new.id ? { ...msg, ...payload.new } : msg)
            );
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedConversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
      
      // Buscar status de atendimento de todas as conversas
      if (data && data.length > 0) {
        const phones = data.map(c => c.contact_number);
        const { data: alineData } = await supabase
          .from('aline_conversations')
          .select('phone, status')
          .in('phone', phones);
        
        if (alineData) {
          const statusMap: Record<string, string> = {};
          alineData.forEach(ac => {
            statusMap[ac.phone] = ac.status;
          });
          setAlineStatusMap(statusMap);
        }
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const markAsRead = async (conversationId: string) => {
    await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);
  };

  const fetchAlineStatus = async (phone: string) => {
    try {
      const { data, error } = await supabase
        .from('aline_conversations')
        .select('status')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching aline status:', error);
        setAlineStatus(null);
        return;
      }

      setAlineStatus(data?.status || null);
    } catch (error) {
      console.error('Error fetching aline status:', error);
      setAlineStatus(null);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation || sending) return;

    await sendMessageDirect(newMessage);
    setNewMessage('');
  };

  const sendMessageDirect = async (messageText: string) => {
    if (!messageText.trim() || !selectedConversation) return;

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('automation-send', {
        body: {
          conversation_id: selectedConversation.id,
          phone: selectedConversation.contact_number,
          message: messageText,
          message_type: 'text',
          platform: selectedConversation.platform || 'whatsapp',
        },
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error sending message:', error);
      toast({ title: 'Erro', description: 'Não foi possível enviar a mensagem.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation) return;

    setSending(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(fileName);

      let messageType = 'document';
      if (file.type.startsWith('image/')) messageType = 'image';
      else if (file.type.startsWith('audio/')) messageType = 'audio';
      else if (file.type.startsWith('video/')) messageType = 'video';

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
      toast({ title: 'Arquivo enviado!' });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({ title: 'Erro', description: 'Não foi possível enviar o arquivo.', variant: 'destructive' });
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await uploadAudio(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      toast({ title: 'Gravando...', description: 'Clique novamente para parar' });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({ title: 'Erro', description: 'Não foi possível acessar o microfone.', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setMediaRecorder(null);
      setIsRecording(false);
    }
  };

  const uploadAudio = async (blob: Blob) => {
    if (!selectedConversation) return;
    setSending(true);
    try {
      const fileName = `${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, blob);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(fileName);

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
      toast({ title: 'Áudio enviado!' });
    } catch (error) {
      console.error('Error uploading audio:', error);
      toast({ title: 'Erro', description: 'Não foi possível enviar o áudio.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter((conv) => {
    const matchesSearch = conv.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.contact_number?.includes(searchTerm);
    const matchesStatus = filterStatus === 'all' || conv.lead_status === filterStatus;
    
    // Filtro por atendente
    const convAlineStatus = alineStatusMap[conv.contact_number];
    const isHumanAttendant = convAlineStatus === 'human_takeover';
    const isAlineAttendant = convAlineStatus === 'active' || !convAlineStatus;
    const matchesAttendant = filterAttendant === 'all' || 
      (filterAttendant === 'vendedor' && isHumanAttendant) ||
      (filterAttendant === 'aline' && isAlineAttendant);
    
    return matchesSearch && matchesStatus && matchesAttendant;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <Check className="w-3 h-3" />;
      case 'delivered': return <CheckCheck className="w-3 h-3" />;
      case 'read': return <CheckCheck className="w-3 h-3 text-blue-400" />;
      default: return <Clock className="w-3 h-3 opacity-50" />;
    }
  };

  const getPlatformIcon = (platform: string) => {
    return platform === 'instagram' ? Instagram : MessageCircle;
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Hoje';
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

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

  const groupedMessages = messages.reduce((groups, message) => {
    const date = new Date(message.created_at || '').toDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(message);
    return groups;
  }, {} as Record<string, Message[]>);

  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const statusFilters = [
    { key: 'all', label: 'Todos', emoji: '📋' },
    { key: 'novo', label: 'Novos', emoji: '🆕' },
    { key: 'quente', label: 'Quentes', emoji: '🔥' },
    { key: 'frio', label: 'Frios', emoji: '❄️' },
    { key: 'comprador', label: 'Compradores', emoji: '💰' },
  ];

  const attendantFilters = [
    { key: 'all', label: 'Todos', icon: null },
    { key: 'aline', label: 'Aline', icon: Bot },
    { key: 'vendedor', label: 'Vendedor', icon: User },
  ];

  const statusCounts: Record<string, number> = {
    all: conversations.length,
    novo: conversations.filter(c => c.lead_status === 'novo').length,
    quente: conversations.filter(c => c.lead_status === 'quente').length,
    frio: conversations.filter(c => c.lead_status === 'frio').length,
    comprador: conversations.filter(c => c.lead_status === 'comprador').length,
  };

  const attendantCounts: Record<string, number> = {
    all: conversations.length,
    aline: conversations.filter(c => alineStatusMap[c.contact_number] !== 'human_takeover').length,
    vendedor: conversations.filter(c => alineStatusMap[c.contact_number] === 'human_takeover').length,
  };

  return (
    <div className="h-screen flex bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      {/* Sidebar de Conversas */}
      <div className={cn(
        'w-full md:w-[380px] lg:w-[420px] flex flex-col shrink-0 bg-slate-900/80 backdrop-blur-xl border-r border-white/5',
        selectedConversation && 'hidden md:flex'
      )}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                {unreadTotal > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Chat CRM</h1>
                <p className="text-xs text-slate-400">{conversations.length} conversas</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchConversations}
              className="text-slate-400 hover:text-white hover:bg-white/10 rounded-xl"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Buscar conversa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500/50 h-11 rounded-xl"
            />
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="px-3 py-2 grid grid-cols-5 gap-1.5 border-b border-white/5">
          {statusFilters.map(({ key, label, emoji }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={cn(
                'px-2 py-2 rounded-lg text-[10px] font-medium transition-all flex flex-col items-center gap-0.5',
                filterStatus === key 
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' 
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white'
              )}
            >
              <span className="text-base">{emoji}</span>
              <span className="truncate w-full text-center">{statusCounts[key]}</span>
            </button>
          ))}
        </div>

        {/* Attendant Filter */}
        <div className="px-3 py-2 flex gap-2 border-b border-white/5">
          {attendantFilters.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setFilterAttendant(key)}
              className={cn(
                'flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5',
                filterAttendant === key 
                  ? key === 'aline' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : key === 'vendedor'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-700 text-white border border-white/10'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white border border-transparent'
              )}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{label}</span>
              <span className="ml-1 text-[10px] opacity-70">({attendantCounts[key]})</span>
            </button>
          ))}
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-8 flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4" />
              <p className="text-sm text-slate-400">Carregando...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-slate-600" />
              </div>
              <p className="font-medium text-slate-300">Nenhuma conversa</p>
              <p className="text-sm text-slate-500 text-center mt-1">
                {searchTerm ? 'Tente outra busca' : 'As mensagens aparecerão aqui'}
              </p>
            </div>
          ) : (
            <div className="py-2">
              {filteredConversations.map((conv) => {
                const PlatformIcon = getPlatformIcon(conv.platform || 'whatsapp');
                const hasUnread = (conv.unread_count ?? 0) > 0;
                const isInstagram = conv.platform === 'instagram';
                
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={cn(
                      'w-full px-4 py-3.5 flex items-start gap-3.5 transition-all text-left relative mx-2 rounded-xl mb-1',
                      'hover:bg-white/5',
                      selectedConversation?.id === conv.id && 'bg-emerald-500/10 border border-emerald-500/20',
                      hasUnread && 'bg-slate-800/50'
                    )}
                    style={{ width: 'calc(100% - 16px)' }}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className={cn(
                        'w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-semibold text-white shadow-lg',
                        isInstagram 
                          ? 'bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400' 
                          : 'bg-gradient-to-br from-emerald-400 to-cyan-500'
                      )}>
                        {(conv.contact_name || conv.contact_number).charAt(0).toUpperCase()}
                      </div>
                      <div className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-lg flex items-center justify-center shadow-md',
                        isInstagram ? 'bg-gradient-to-br from-fuchsia-500 to-orange-400' : 'bg-emerald-500'
                      )}>
                        <PlatformIcon className="w-3 h-3 text-white" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className={cn(
                          'font-semibold text-white truncate text-sm',
                          hasUnread && 'text-emerald-300'
                        )}>
                          {conv.contact_name || conv.contact_number}
                        </p>
                        <span className={cn(
                          'text-[11px] shrink-0',
                          hasUnread ? 'text-emerald-400 font-medium' : 'text-slate-500'
                        )}>
                          {formatLastSeen(conv.created_at)}
                        </span>
                      </div>
                      
                      <div className="mb-1.5">
                        <LeadStatusBadge status={(conv.lead_status as LeadStatus) || 'novo'} />
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          'text-xs truncate flex-1',
                          hasUnread ? 'text-slate-200' : 'text-slate-500'
                        )}>
                          {conv.last_message || 'Sem mensagens'}
                        </p>
                        
                        {hasUnread && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center shrink-0 font-bold shadow-lg shadow-emerald-500/30">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0',
        !selectedConversation && 'hidden md:flex'
      )}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-[72px] px-5 border-b border-white/5 flex items-center justify-between bg-slate-900/80 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-4 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden shrink-0 -ml-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                
                <div className={cn(
                  'w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-semibold text-white shadow-lg shrink-0',
                  selectedConversation.platform === 'instagram' 
                    ? 'bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400' 
                    : 'bg-gradient-to-br from-emerald-400 to-cyan-500'
                )}>
                  {(selectedConversation.contact_name || selectedConversation.contact_number).charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white truncate">{selectedConversation.contact_name || selectedConversation.contact_number}</p>
                    {/* Indicador de Atendimento */}
                    {alineStatus && (
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 shrink-0',
                        alineStatus === 'human_takeover' 
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      )}>
                        {alineStatus === 'human_takeover' ? (
                          <>
                            <User className="w-3 h-3" />
                            Vendedor
                          </>
                        ) : (
                          <>
                            <Bot className="w-3 h-3" />
                            Aline
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{selectedConversation.contact_number}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-600" />
                    <LeadStatusBadge status={(selectedConversation.lead_status as LeadStatus) || 'novo'} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <LeadStatusSelect
                  value={(selectedConversation.lead_status as LeadStatus) || 'novo'}
                  onChange={(status) => updateLeadStatus(selectedConversation.id, status)}
                  disabled={updatingLeadStatus}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "shrink-0 rounded-xl transition-colors",
                    showSellerTools 
                      ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20" 
                      : "text-slate-400 hover:text-white hover:bg-white/10"
                  )}
                  onClick={() => setShowSellerTools(!showSellerTools)}
                  title={showSellerTools ? 'Ocultar ferramentas' : 'Mostrar ferramentas'}
                >
                  {showSellerTools ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 bg-slate-800 border-white/10">
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
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem className="text-slate-200 focus:bg-white/10 focus:text-white">
                      <Phone className="w-4 h-4 mr-2" />
                      Ligar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-hidden bg-[#0b141a]" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}>
              <ScrollArea className="h-full">
                <div className="px-4 md:px-12 lg:px-20 py-4 space-y-1 max-w-4xl mx-auto min-h-full">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="w-20 h-20 rounded-3xl bg-slate-800/50 flex items-center justify-center mb-4">
                        <Sparkles className="w-10 h-10 text-emerald-500/50" />
                      </div>
                      <p className="text-slate-400 text-center font-medium">Nenhuma mensagem ainda</p>
                      <p className="text-slate-600 text-sm mt-1">Inicie uma conversa</p>
                    </div>
                  ) : (
                    Object.entries(groupedMessages).map(([date, msgs]) => (
                      <div key={date}>
                        {/* Date Separator */}
                        <div className="flex justify-center my-4">
                          <span className="px-4 py-1.5 rounded-xl bg-slate-800/80 text-[11px] text-slate-400 font-medium shadow-lg backdrop-blur-sm">
                            {formatDate(msgs[0].created_at || '')}
                          </span>
                        </div>

                        {/* Messages */}
                        {msgs.map((message, idx) => {
                          const showTail = idx === 0 || msgs[idx - 1]?.is_from_me !== message.is_from_me;
                          const isMe = message.is_from_me;
                          
                          return (
                            <div
                              key={message.id}
                              className={cn(
                                'flex mb-0.5',
                                isMe ? 'justify-end' : 'justify-start'
                              )}
                            >
                              <div
                                className={cn(
                                  'relative max-w-[85%] md:max-w-[70%] px-3.5 py-2 shadow-md',
                                  isMe
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-800 text-slate-100',
                                  showTail 
                                    ? isMe 
                                      ? 'rounded-2xl rounded-tr-md mt-2' 
                                      : 'rounded-2xl rounded-tl-md mt-2'
                                    : 'rounded-2xl'
                                )}
                              >
                                {/* Media Content */}
                                {message.message_type === 'image' && message.media_url && (
                                  <img
                                    src={message.media_url}
                                    alt="Imagem"
                                    className="w-full max-w-[300px] rounded-xl cursor-pointer hover:opacity-90 transition-opacity mb-1.5"
                                    onClick={() => window.open(message.media_url!, '_blank')}
                                  />
                                )}
                                {message.message_type === 'audio' && message.media_url && (
                                  <div className="flex items-center gap-2 bg-black/20 rounded-xl p-2 mb-1">
                                    <Volume2 className="w-5 h-5 text-emerald-300" />
                                    <audio controls className="max-w-[200px] h-8">
                                      <source src={message.media_url} />
                                    </audio>
                                  </div>
                                )}
                                {message.message_type === 'video' && message.media_url && (
                                  <video controls className="max-w-full rounded-xl mb-1.5">
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
                                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
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
                        })}
                      </div>
                    ))
                  )}
                  
                  {isContactTyping && selectedConversation && (
                    <TypingIndicator contactName={selectedConversation.contact_name || ''} />
                  )}
                  
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              </ScrollArea>
            </div>

            {/* Input Area */}
            <div className="px-4 py-3 bg-slate-900/95 backdrop-blur-xl border-t border-white/5 shrink-0">
              <form onSubmit={sendMessage} className="max-w-4xl mx-auto">
                <div className="flex items-end gap-2">
                  {/* Attachment Button */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 h-10 w-10 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || isRecording}
                    title="Anexar arquivo"
                  >
                    <Paperclip className="w-5 h-5" />
                  </Button>
                  
                  {/* Input Container */}
                  <div className="flex-1 relative bg-slate-800/60 rounded-2xl border border-white/5 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Digite uma mensagem..."
                      className="border-0 bg-transparent text-white placeholder:text-slate-500 focus-visible:ring-0 h-11 px-4 text-[15px]"
                      disabled={sending || isRecording}
                    />
                    
                    {/* Emoji/extra buttons could go here */}
                    {isRecording && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <span className="flex items-center gap-1.5 text-rose-400 text-sm font-medium animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-rose-500" />
                          Gravando...
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {newMessage.trim() ? (
                    <Button 
                      type="submit" 
                      size="icon"
                      disabled={sending}
                      className="shrink-0 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white h-10 w-10 shadow-lg shadow-emerald-500/25 transition-all hover:scale-105"
                      title="Enviar mensagem"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      className={cn(
                        'shrink-0 rounded-xl h-10 w-10 transition-all',
                        isRecording 
                          ? 'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/25 hover:scale-105' 
                          : 'bg-slate-800/80 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400'
                      )}
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={sending}
                      title={isRecording ? "Parar gravação" : "Gravar áudio"}
                    >
                      {isRecording ? <X className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
                
                {/* Helper text */}
                <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Paperclip className="w-3 h-3" />
                    Fotos, áudios e documentos
                  </span>
                  <span className="flex items-center gap-1">
                    <Mic className="w-3 h-3" />
                    Segure para gravar
                  </span>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-900/50">
            <div className="text-center">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center mx-auto mb-6">
                <MessageCircle className="w-12 h-12 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Chat CRM</h2>
              <p className="text-slate-400 max-w-sm">
                Selecione uma conversa para começar a atender seus leads
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Seller Tools Panel */}
      {selectedConversation && showSellerTools && (
        <div className="hidden lg:block w-[320px] shrink-0">
          <SellerToolsPanel
            phone={selectedConversation.contact_number}
            contactName={selectedConversation.contact_name || ''}
            conversationId={selectedConversation.id}
            onSendMessage={sendMessageDirect}
          />
        </div>
      )}
    </div>
  );
};

export default Chat;
