import { useState, useEffect, useRef } from 'react';
import { supabase, Conversation, Message, LeadStatus } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Paperclip, Search, MessageSquare, FileText, Mic, Check, CheckCheck, Instagram, Bot, User, Square, Phone, ArrowLeft, MoreVertical, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { LeadStatusSelect, LeadStatusBadge } from '@/components/chat/LeadStatusSelect';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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

  const filteredConversations = conversations.filter((conv) =>
    conv.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.contact_number.includes(searchTerm)
  );

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <Check className="w-3.5 h-3.5" />;
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5" />;
      case 'read': return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
      default: return null;
    }
  };

  const getPlatformColor = (platform: string) => {
    return platform === 'instagram' 
      ? 'from-purple-500 via-pink-500 to-orange-400' 
      : 'from-green-500 to-green-600';
  };

  const getPlatformIcon = (platform: string) => {
    return platform === 'instagram' ? Instagram : MessageSquare;
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

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = new Date(message.created_at || '').toDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(message);
    return groups;
  }, {} as Record<string, Message[]>);

  return (
    <div className="h-screen flex bg-muted/30">
      {/* Conversations Sidebar */}
      <div className={cn(
        'w-full md:w-[380px] lg:w-[420px] bg-card border-r border-border flex flex-col shrink-0',
        selectedConversation && 'hidden md:flex'
      )}>
        {/* Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-border bg-card">
          <h1 className="text-xl font-bold text-foreground">Conversas</h1>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              {conversations.length} contatos
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar ou começar nova conversa"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-muted/50 border-0 focus-visible:ring-1 h-10 text-sm"
            />
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Carregando...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-10 h-10 text-muted-foreground/50" />
              </div>
              <p className="font-medium text-foreground">Nenhuma conversa</p>
              <p className="text-sm text-muted-foreground mt-1">As mensagens aparecerão aqui</p>
            </div>
          ) : (
            <div>
              {filteredConversations.map((conv) => {
                const PlatformIcon = getPlatformIcon(conv.platform || 'whatsapp');
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={cn(
                      'w-full px-3 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left border-b border-border/30',
                      selectedConversation?.id === conv.id && 'bg-muted/70'
                    )}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold text-white bg-gradient-to-br',
                        getPlatformColor(conv.platform || 'whatsapp')
                      )}>
                        {conv.contact_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card flex items-center justify-center">
                        <PlatformIcon className="w-2.5 h-2.5 text-muted-foreground" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-medium text-foreground truncate">{conv.contact_name}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatDate(conv.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <LeadStatusBadge status={(conv.lead_status as LeadStatus) || 'novo'} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
                    </div>

                    {/* Unread Badge */}
                    {(conv.unread_count ?? 0) > 0 && (
                      <span className="w-5 h-5 rounded-full bg-green-500 text-white text-[10px] flex items-center justify-center shrink-0 font-bold">
                        {conv.unread_count}
                      </span>
                    )}
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
            <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-card shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {/* Mobile Back Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden shrink-0 -ml-2"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                
                {/* Avatar */}
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-base font-semibold text-white bg-gradient-to-br shrink-0',
                  getPlatformColor(selectedConversation.platform || 'whatsapp')
                )}>
                  {selectedConversation.contact_name.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{selectedConversation.contact_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedConversation.contact_number}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Ver perfil</DropdownMenuItem>
                    <DropdownMenuItem>Silenciar</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">Arquivar</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages Area - WhatsApp Style Background */}
            <div 
              className="flex-1 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, hsl(var(--muted)/0.3) 0%, hsl(var(--muted)/0.5) 100%)',
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            >
              <ScrollArea className="h-full">
                <div className="p-4 md:p-6 space-y-2 max-w-4xl mx-auto">
                  {Object.entries(groupedMessages).map(([date, msgs]) => (
                    <div key={date}>
                      {/* Date Separator */}
                      <div className="flex justify-center my-4">
                        <span className="px-3 py-1 rounded-lg bg-card/80 backdrop-blur text-[11px] text-muted-foreground font-medium shadow-sm">
                          {formatDate(msgs[0].created_at || '')}
                        </span>
                      </div>

                      {/* Messages */}
                      {msgs.map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            'flex mb-1',
                            message.is_from_me ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <div
                            className={cn(
                              'relative max-w-[85%] md:max-w-[70%] rounded-lg px-3 py-2 shadow-sm',
                              message.is_from_me
                                ? 'bg-foreground text-background rounded-tr-none'
                                : 'bg-card text-foreground rounded-tl-none'
                            )}
                          >
                            {/* Message Tail */}
                            <div
                              className={cn(
                                'absolute top-0 w-3 h-3 overflow-hidden',
                                message.is_from_me ? '-right-2' : '-left-2'
                              )}
                            >
                              <div
                                className={cn(
                                  'w-4 h-4 transform rotate-45',
                                  message.is_from_me 
                                    ? 'bg-foreground -translate-x-2' 
                                    : 'bg-card translate-x-0'
                                )}
                              />
                            </div>

                            {/* Media Content */}
                            {message.message_type === 'image' && message.media_url && (
                              <img
                                src={message.media_url}
                                alt="Imagem"
                                className="w-full max-w-[280px] rounded cursor-pointer hover:opacity-90 transition-opacity mb-1"
                                onClick={() => window.open(message.media_url!, '_blank')}
                              />
                            )}
                            {message.message_type === 'audio' && message.media_url && (
                              <audio controls className="max-w-full mb-1">
                                <source src={message.media_url} />
                              </audio>
                            )}
                            {message.message_type === 'video' && message.media_url && (
                              <video controls className="max-w-full rounded mb-1">
                                <source src={message.media_url} />
                              </video>
                            )}
                            {message.message_type === 'document' && message.media_url && (
                              <a
                                href={message.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  "flex items-center gap-2 text-sm underline mb-1",
                                  message.is_from_me ? "text-background/80" : "text-foreground"
                                )}
                              >
                                <FileText className="w-4 h-4" />
                                {message.content || 'Documento'}
                              </a>
                            )}
                            
                            {/* Text Content */}
                            {(message.message_type === 'text' || message.content) && message.message_type !== 'audio' && (
                              <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
                            )}
                            
                            {/* Time & Status */}
                            <div className={cn(
                              "flex items-center gap-1 mt-1 -mb-0.5",
                              message.is_from_me ? "justify-end" : "justify-end"
                            )}>
                              <span className={cn(
                                "text-[10px]",
                                message.is_from_me ? "text-background/50" : "text-muted-foreground"
                              )}>
                                {formatTime(message.created_at || '')}
                              </span>
                              {message.is_from_me && (
                                <span className={message.status === 'read' ? 'text-blue-400' : 'text-background/50'}>
                                  {getStatusIcon(message.status || 'sent')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
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
                  className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || isRecording}
                >
                  <Paperclip className="w-5 h-5" />
                </Button>
                
                <div className="flex-1 relative">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Digite uma mensagem"
                    className="bg-muted/50 border-0 focus-visible:ring-1 rounded-full pl-4 pr-10 h-11"
                    disabled={sending || isRecording}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <Smile className="w-5 h-5" />
                  </Button>
                </div>

                {newMessage.trim() ? (
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="shrink-0 rounded-full h-11 w-11 bg-green-500 hover:bg-green-600"
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
                      "shrink-0 rounded-full h-11 w-11",
                      !isRecording && "bg-green-500 hover:bg-green-600"
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
          <div className="flex-1 flex items-center justify-center p-8 bg-muted/20">
            <div className="text-center max-w-md">
              <div className="w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
                <MessageSquare className="w-12 h-12 text-muted-foreground/50" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-2">ACIUM Chat</h3>
              <p className="text-muted-foreground mb-6">
                Envie e receba mensagens de WhatsApp e Instagram em um só lugar
              </p>
              <div className="flex justify-center gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  WhatsApp
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
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
