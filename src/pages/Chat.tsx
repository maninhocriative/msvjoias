import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, Conversation, Message, LeadStatus } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Paperclip, Search, MessageSquare, FileText, Mic, Check, CheckCheck, Instagram, Bot, User, Square, Phone, ArrowLeft, MoreVertical, Smile, UserCheck, BotOff, RefreshCw, Clock, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { LeadStatusSelect, LeadStatusBadge } from '@/components/chat/LeadStatusSelect';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import TypingIndicator from '@/components/chat/TypingIndicator';
import { Badge } from '@/components/ui/badge';

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
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
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
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          fetchConversations();
        }
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
      
      const channelName = `messages-${selectedConversation.id}`;
      
      const channel = supabase
        .channel(channelName)
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
              if (prev.some(m => m.id === payload.new.id)) {
                return prev;
              }
              return [...prev, payload.new as Message];
            });
          }
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
              prev.map((msg) => 
                msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
              )
            );
          }
        )
        .subscribe();

      const typingChannel = supabase
        .channel(`typing-${selectedConversation.contact_number}`)
        .on('presence', { event: 'sync' }, () => {
          const state = typingChannel.presenceState();
          const typingUsers = Object.values(state).flat();
          const contactIsTyping = typingUsers.some(
            (user: any) => user.phone === selectedConversation.contact_number && user.isTyping
          );
          setIsContactTyping(contactIsTyping);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(typingChannel);
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

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation || sending) return;

    setSending(true);

    try {
      const { error } = await supabase.functions.invoke('automation-send', {
        body: {
          conversation_id: selectedConversation.id,
          phone: selectedConversation.contact_number,
          message: newMessage,
          message_type: 'text',
          platform: selectedConversation.platform || 'whatsapp',
        },
      });

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      });
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

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

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
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar o arquivo.',
        variant: 'destructive',
      });
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
      toast({
        title: 'Erro',
        description: 'Não foi possível acessar o microfone.',
        variant: 'destructive',
      });
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
      
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

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
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar o áudio.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter((conv) => {
    const matchesSearch = conv.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.contact_number.includes(searchTerm);
    const matchesStatus = filterStatus === 'all' || conv.lead_status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <Check className="w-3 h-3" />;
      case 'delivered': return <CheckCheck className="w-3 h-3" />;
      case 'read': return <CheckCheck className="w-3 h-3 text-sky-400" />;
      default: return <Clock className="w-3 h-3 opacity-50" />;
    }
  };

  const getPlatformColor = (platform: string) => {
    return platform === 'instagram' 
      ? 'from-fuchsia-500 via-pink-500 to-orange-400' 
      : 'from-emerald-400 to-teal-500';
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

  const statusCounts = {
    all: conversations.length,
    novo: conversations.filter(c => c.lead_status === 'novo').length,
    frio: conversations.filter(c => c.lead_status === 'frio').length,
    quente: conversations.filter(c => c.lead_status === 'quente').length,
    comprador: conversations.filter(c => c.lead_status === 'comprador').length,
    sem_interesse: conversations.filter(c => c.lead_status === 'sem_interesse').length,
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Conversations Sidebar */}
      <div className={cn(
        'w-full md:w-[360px] lg:w-[400px] bg-card border-r border-border flex flex-col shrink-0',
        selectedConversation && 'hidden md:flex'
      )}>
        {/* Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-border bg-gradient-to-r from-card to-muted/30">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              {unreadTotal > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-card">
                  {unreadTotal > 99 ? '99+' : unreadTotal}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Chat CRM</h1>
              <p className="text-xs text-muted-foreground">{conversations.length} conversas</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchConversations}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Search & Filters */}
        <div className="p-3 space-y-3 border-b border-border/50 bg-muted/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-background border-border/50 focus-visible:ring-emerald-500/30 h-10"
            />
          </div>
          
          {/* Status Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {[
              { key: 'all', label: 'Todos', color: 'bg-muted' },
              { key: 'novo', label: 'Novos', color: 'bg-blue-500/10 text-blue-600' },
              { key: 'frio', label: 'Frios', color: 'bg-slate-500/10 text-slate-600' },
              { key: 'quente', label: 'Quentes', color: 'bg-amber-500/10 text-amber-600' },
              { key: 'comprador', label: 'Compradores', color: 'bg-emerald-500/10 text-emerald-600' },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                  filterStatus === key 
                    ? 'bg-foreground text-background shadow-sm' 
                    : `${color} hover:opacity-80`
                )}
              >
                {label}
                {statusCounts[key as keyof typeof statusCounts] > 0 && (
                  <span className="ml-1.5 opacity-70">
                    {statusCounts[key as keyof typeof statusCounts]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-8 flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">Carregando conversas...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="font-medium text-foreground">Nenhuma conversa</p>
              <p className="text-sm text-muted-foreground text-center mt-1">
                {searchTerm ? 'Tente outra busca' : 'As mensagens aparecerão aqui'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {filteredConversations.map((conv) => {
                const PlatformIcon = getPlatformIcon(conv.platform || 'whatsapp');
                const hasUnread = (conv.unread_count ?? 0) > 0;
                
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={cn(
                      'w-full px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-all text-left relative group',
                      selectedConversation?.id === conv.id && 'bg-muted/70',
                      hasUnread && 'bg-emerald-500/5'
                    )}
                  >
                    {/* Unread Indicator Bar */}
                    {hasUnread && (
                      <div className="absolute left-0 top-3 bottom-3 w-1 bg-emerald-500 rounded-r-full" />
                    )}
                    
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center text-base font-semibold text-white bg-gradient-to-br shadow-sm',
                        getPlatformColor(conv.platform || 'whatsapp')
                      )}>
                        {conv.contact_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-card flex items-center justify-center shadow-sm border border-border/50">
                        <PlatformIcon className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className={cn(
                          'font-medium text-foreground truncate text-sm',
                          hasUnread && 'font-semibold'
                        )}>
                          {conv.contact_name}
                        </p>
                        <span className={cn(
                          'text-[11px] shrink-0',
                          hasUnread ? 'text-emerald-600 font-medium' : 'text-muted-foreground'
                        )}>
                          {formatLastSeen(conv.created_at)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-1.5">
                        <LeadStatusBadge status={(conv.lead_status as LeadStatus) || 'novo'} />
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          'text-xs truncate flex-1',
                          hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'
                        )}>
                          {conv.last_message || 'Sem mensagens'}
                        </p>
                        
                        {hasUnread && (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center shrink-0 font-bold shadow-sm">
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
        'flex-1 flex flex-col min-w-0 bg-muted/20',
        !selectedConversation && 'hidden md:flex'
      )}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-card shrink-0 shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden shrink-0 -ml-2"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-base font-semibold text-white bg-gradient-to-br shrink-0',
                  getPlatformColor(selectedConversation.platform || 'whatsapp')
                )}>
                  {selectedConversation.contact_name.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{selectedConversation.contact_name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">{selectedConversation.contact_number}</p>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <LeadStatusBadge status={(selectedConversation.lead_status as LeadStatus) || 'novo'} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <LeadStatusSelect
                  value={(selectedConversation.lead_status as LeadStatus) || 'novo'}
                  onChange={(status) => updateLeadStatus(selectedConversation.id, status)}
                  disabled={updatingLeadStatus}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem 
                      onClick={() => handleTakeover('takeover')}
                      disabled={takingOver}
                    >
                      <UserCheck className="w-4 h-4 mr-2" />
                      Assumir atendimento
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleTakeover('release')}
                      disabled={takingOver}
                    >
                      <Bot className="w-4 h-4 mr-2" />
                      Devolver para Aline
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Phone className="w-4 h-4 mr-2" />
                      Ligar
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      Arquivar conversa
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages Area */}
            <div 
              className="flex-1 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, hsl(var(--muted) / 0.2) 0%, hsl(var(--muted) / 0.4) 100%)',
              }}
            >
              <ScrollArea className="h-full">
                <div className="p-4 md:px-8 space-y-1 max-w-4xl mx-auto min-h-full">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center mb-4 shadow-sm">
                        <MessageCircle className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <p className="text-muted-foreground text-center">
                        Nenhuma mensagem ainda
                      </p>
                    </div>
                  ) : (
                    Object.entries(groupedMessages).map(([date, msgs]) => (
                      <div key={date}>
                        {/* Date Separator */}
                        <div className="flex justify-center my-4">
                          <span className="px-3 py-1 rounded-lg bg-card/90 backdrop-blur text-[11px] text-muted-foreground font-medium shadow-sm border border-border/30">
                            {formatDate(msgs[0].created_at || '')}
                          </span>
                        </div>

                        {/* Messages */}
                        {msgs.map((message, idx) => {
                          const showTail = idx === 0 || msgs[idx - 1]?.is_from_me !== message.is_from_me;
                          
                          return (
                            <div
                              key={message.id}
                              className={cn(
                                'flex mb-0.5',
                                message.is_from_me ? 'justify-end' : 'justify-start'
                              )}
                            >
                              <div
                                className={cn(
                                  'relative max-w-[85%] md:max-w-[65%] px-3 py-2 shadow-sm',
                                  message.is_from_me
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-card text-foreground',
                                  showTail 
                                    ? message.is_from_me 
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
                                    className="w-full max-w-[280px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity mb-1"
                                    onClick={() => window.open(message.media_url!, '_blank')}
                                  />
                                )}
                                {message.message_type === 'audio' && message.media_url && (
                                  <audio controls className="max-w-full mb-1">
                                    <source src={message.media_url} />
                                  </audio>
                                )}
                                {message.message_type === 'video' && message.media_url && (
                                  <video controls className="max-w-full rounded-lg mb-1">
                                    <source src={message.media_url} />
                                  </video>
                                )}
                                {message.message_type === 'document' && message.media_url && (
                                  <a
                                    href={message.media_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      "flex items-center gap-2 text-sm underline mb-1 hover:opacity-80",
                                      message.is_from_me ? "text-white/90" : "text-foreground"
                                    )}
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
                                <div className="flex items-center gap-1 justify-end mt-1 -mb-0.5">
                                  <span className={cn(
                                    "text-[10px]",
                                    message.is_from_me ? "text-white/60" : "text-muted-foreground"
                                  )}>
                                    {formatTime(message.created_at || '')}
                                  </span>
                                  {message.is_from_me && (
                                    <span className={cn(
                                      message.status === 'read' ? 'text-sky-300' : 'text-white/60'
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
                    <TypingIndicator contactName={selectedConversation.contact_name} />
                  )}
                  
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              </ScrollArea>
            </div>

            {/* Input Area */}
            <div className="p-3 bg-card border-t border-border shrink-0">
              <form onSubmit={sendMessage} className="flex items-center gap-2 max-w-4xl mx-auto">
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
                  className="shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || isRecording}
                >
                  <Paperclip className="w-5 h-5" />
                </Button>
                
                <div className="flex-1 relative">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    className="bg-muted/50 border-border/50 focus-visible:ring-emerald-500/30 rounded-full pl-4 pr-10 h-11"
                    disabled={sending || isRecording}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground rounded-full"
                  >
                    <Smile className="w-5 h-5" />
                  </Button>
                </div>

                {newMessage.trim() ? (
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="shrink-0 rounded-full h-11 w-11 bg-emerald-500 hover:bg-emerald-600 shadow-sm"
                    disabled={sending}
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant={isRecording ? "destructive" : "default"}
                    size="icon"
                    className={cn(
                      "shrink-0 rounded-full h-11 w-11 shadow-sm",
                      !isRecording && "bg-emerald-500 hover:bg-emerald-600"
                    )}
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={sending}
                  >
                    {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>
                )}
              </form>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-6 shadow-lg">
                <MessageCircle className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">ACIUM Chat CRM</h3>
              <p className="text-muted-foreground mb-8">
                Gerencie todas as suas conversas de WhatsApp e Instagram em um só lugar
              </p>
              <div className="flex justify-center gap-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" />
                  WhatsApp
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500" />
                  Instagram
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
