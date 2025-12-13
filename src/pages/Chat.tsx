import { useState, useEffect, useRef } from 'react';
import { supabase, Conversation, Message, LeadStatus } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Paperclip, Search, MessageSquare, FileText, Mic, Check, CheckCheck, Instagram, Bot, User, Square, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { LeadStatusSelect, LeadStatusBadge } from '@/components/chat/LeadStatusSelect';

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
      const { data, error } = await supabase.functions.invoke('automation-send', {
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <Check className="w-3 h-3 text-muted-foreground" />;
      case 'delivered': return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
      case 'read': return <CheckCheck className="w-3 h-3 text-blue-500" />;
      default: return null;
    }
  };

  const getPlatformBadge = (platform: string) => {
    switch (platform) {
      case 'instagram':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white">
            <Instagram className="w-3 h-3" />
            Instagram
          </span>
        );
      case 'whatsapp':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500 text-white">
            <MessageSquare className="w-3 h-3" />
            WhatsApp
          </span>
        );
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram':
        return (
          <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-500 flex items-center justify-center">
            <Instagram className="w-2.5 h-2.5 text-white" />
          </div>
        );
      case 'whatsapp':
      default:
        return (
          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
            <MessageSquare className="w-2.5 h-2.5 text-white" />
          </div>
        );
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-[calc(100vh-64px)] flex bg-background">
      {/* Conversations Sidebar */}
      <div className="w-80 lg:w-96 border-r border-border flex flex-col bg-card shrink-0">
        {/* Search Header */}
        <div className="p-4 border-b border-border bg-card/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-muted/50 border-0 focus-visible:ring-1"
            />
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">
              <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Carregando...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">Nenhuma conversa</p>
              <p className="text-sm text-muted-foreground mt-1">As mensagens aparecerão aqui</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={cn(
                    'w-full p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left',
                    selectedConversation?.id === conv.id && 'bg-muted'
                  )}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center text-lg font-semibold">
                      {conv.contact_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5">
                      {getPlatformIcon(conv.platform || 'whatsapp')}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground truncate">{conv.contact_name}</p>
                      {(conv.unread_count ?? 0) > 0 && (
                        <span className="w-5 h-5 rounded-full bg-foreground text-background text-xs flex items-center justify-center shrink-0 font-medium">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {getPlatformBadge(conv.platform || 'whatsapp')}
                      <LeadStatusBadge status={(conv.lead_status as LeadStatus) || 'novo'} />
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{conv.last_message}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-[72px] px-6 border-b border-border flex items-center justify-between bg-card shrink-0">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-foreground text-background flex items-center justify-center text-lg font-semibold">
                    {selectedConversation.contact_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5">
                    {getPlatformIcon(selectedConversation.platform || 'whatsapp')}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{selectedConversation.contact_name}</p>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    <span className="text-xs">{selectedConversation.contact_number}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <LeadStatusSelect
                  value={(selectedConversation.lead_status as LeadStatus) || 'novo'}
                  onChange={(status) => updateLeadStatus(selectedConversation.id, status)}
                  disabled={updatingLeadStatus}
                />
                {getPlatformBadge(selectedConversation.platform || 'whatsapp')}
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 bg-muted/30">
              <div className="p-6 space-y-4 max-w-4xl mx-auto">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex',
                      message.is_from_me ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div className={cn(
                      'flex gap-3 max-w-[80%]',
                      message.is_from_me ? 'flex-row-reverse' : 'flex-row'
                    )}>
                      {/* Avatar */}
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        message.is_from_me ? 'bg-foreground text-background' : 'bg-muted border border-border'
                      )}>
                        {message.is_from_me ? (
                          <Bot className="w-4 h-4" />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      
                      {/* Message Bubble */}
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-3 shadow-sm',
                          message.is_from_me
                            ? 'bg-foreground text-background rounded-br-md'
                            : 'bg-card border border-border text-foreground rounded-bl-md'
                        )}
                      >
                        {/* Sender Label */}
                        <p className={cn(
                          'text-[10px] font-medium mb-1.5 uppercase tracking-wide',
                          message.is_from_me ? 'text-background/60' : 'text-muted-foreground'
                        )}>
                          {message.is_from_me ? 'Bot / Atendente' : 'Cliente'}
                        </p>
                        
                        {/* Media Content */}
                        {message.message_type === 'image' && message.media_url && (
                          <img
                            src={message.media_url}
                            alt="Imagem"
                            className="w-48 h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity mb-2"
                            onClick={() => window.open(message.media_url!, '_blank')}
                          />
                        )}
                        {message.message_type === 'audio' && message.media_url && (
                          <audio controls className="max-w-full mb-2">
                            <source src={message.media_url} />
                          </audio>
                        )}
                        {message.message_type === 'video' && message.media_url && (
                          <video controls className="max-w-full rounded-lg mb-2">
                            <source src={message.media_url} />
                          </video>
                        )}
                        {message.message_type === 'document' && message.media_url && (
                          <a
                            href={message.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "flex items-center gap-2 text-sm underline mb-2",
                              message.is_from_me ? "text-background/80" : "text-foreground"
                            )}
                          >
                            <FileText className="w-4 h-4" />
                            {message.content || 'Documento'}
                          </a>
                        )}
                        
                        {/* Text Content */}
                        {(message.message_type === 'text' || message.content) && message.message_type !== 'audio' && (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                        )}
                        
                        {/* Time & Status */}
                        <div className={cn(
                          "flex items-center gap-1.5 mt-2",
                          message.is_from_me ? "justify-end" : "justify-start"
                        )}>
                          <span className={cn(
                            "text-[10px]",
                            message.is_from_me ? "text-background/60" : "text-muted-foreground"
                          )}>
                            {formatTime(message.created_at || '')}
                          </span>
                          {message.is_from_me && getStatusIcon(message.status || 'sent')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 border-t border-border bg-card shrink-0">
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
                  className="shrink-0 rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || isRecording}
                >
                  <Paperclip className="w-5 h-5" />
                </Button>
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "ghost"}
                  size="icon"
                  className="shrink-0 rounded-full"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={sending}
                >
                  {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-muted/50 border-0 focus-visible:ring-1 rounded-full px-4"
                  disabled={sending || isRecording}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="shrink-0 rounded-full"
                  disabled={sending || !newMessage.trim() || isRecording}
                >
                  <Send className="w-5 h-5" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center bg-muted/30 p-8">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                <MessageSquare className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-2">Chat Multicanal</h3>
              <p className="text-muted-foreground mb-6">
                Selecione uma conversa para começar a interagir com seus clientes
              </p>
              <div className="flex justify-center gap-3 mb-6">
                {getPlatformBadge('whatsapp')}
                {getPlatformBadge('instagram')}
              </div>
              <div className="p-4 bg-card rounded-xl border border-border">
                <p className="text-xs text-muted-foreground mb-2">Configure sua automação para:</p>
                <code className="text-xs bg-muted px-3 py-2 rounded-lg block break-all">
                  https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/automation-webhook
                </code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
