import { useState, useEffect, useRef } from 'react';
import { supabase, Conversation, Message } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Paperclip, Search, MessageSquare, Image, FileText, Mic, Video, Check, CheckCheck, Instagram, Bot, User, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchConversations();

    // Subscribe to new conversations
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
      
      // Create a unique channel name for this conversation
      const channelName = `messages-${selectedConversation.id}`;
      
      console.log('Subscribing to channel:', channelName);
      
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
            console.log('New message received:', payload);
            setMessages((prev) => {
              // Avoid duplicates
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
            console.log('Message updated:', payload);
            setMessages((prev) => 
              prev.map((msg) => 
                msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
              )
            );
          }
        )
        .subscribe((status) => {
          console.log('Channel subscription status:', status);
        });

      return () => {
        console.log('Unsubscribing from channel:', channelName);
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
      console.log('Conversas carregadas:', data);
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
      console.log('Mensagens carregadas:', data);
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
      
      console.log('Message sent:', data);
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

      const { data, error } = await supabase.functions.invoke('automation-send', {
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
      
      console.log('Media sent:', data);
      toast({ title: 'Sucesso', description: 'Arquivo enviado!' });
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
      toast({ title: 'Sucesso', description: 'Áudio enviado!' });
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white">
            <Instagram className="w-3 h-3" />
            Instagram
          </span>
        );
      case 'whatsapp':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500 text-white">
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
          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-500 flex items-center justify-center">
            <Instagram className="w-3 h-3 text-white" />
          </div>
        );
      case 'whatsapp':
      default:
        return (
          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
            <MessageSquare className="w-3 h-3 text-white" />
          </div>
        );
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Conversations Sidebar */}
      <div className="w-80 border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">Carregando...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground text-sm">Nenhuma conversa encontrada</p>
              <p className="text-xs text-muted-foreground mt-1">As mensagens do ZAPI aparecerão aqui</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={cn(
                  'w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50',
                  selectedConversation?.id === conv.id && 'bg-muted'
                )}
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center font-semibold">
                    {conv.contact_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5">
                    {getPlatformIcon(conv.platform || 'whatsapp')}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground truncate">{conv.contact_name}</p>
                    {(conv.unread_count ?? 0) > 0 && (
                      <span className="w-5 h-5 rounded-full bg-foreground text-background text-xs flex items-center justify-center shrink-0">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    {getPlatformBadge(conv.platform || 'whatsapp')}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-1">{conv.last_message}</p>
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-background">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-6 border-b border-border flex items-center justify-between bg-card">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center font-semibold">
                    {selectedConversation.contact_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5">
                    {getPlatformIcon(selectedConversation.platform || 'whatsapp')}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-foreground">{selectedConversation.contact_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedConversation.contact_number}</p>
                </div>
              </div>
              {getPlatformBadge(selectedConversation.platform || 'whatsapp')}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex',
                      message.is_from_me ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div className={cn(
                      'flex gap-2 max-w-[75%]',
                      message.is_from_me ? 'flex-row-reverse' : 'flex-row'
                    )}>
                      {/* Avatar/Icon */}
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        message.is_from_me ? 'bg-foreground text-background' : 'bg-muted'
                      )}>
                        {message.is_from_me ? (
                          <Bot className="w-4 h-4" />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                      </div>
                      
                      {/* Message bubble */}
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-2.5',
                          message.is_from_me
                            ? 'bg-foreground text-background rounded-br-md'
                            : 'bg-muted text-foreground rounded-bl-md'
                        )}
                      >
                        {/* Sender label */}
                        <p className={cn(
                          'text-xs font-medium mb-1',
                          message.is_from_me ? 'text-background/70' : 'text-muted-foreground'
                        )}>
                          {message.is_from_me ? 'Bot / Atendente' : 'Cliente'}
                        </p>
                        
                        {message.message_type === 'image' && message.media_url && (
                          <img
                            src={message.media_url}
                            alt="Imagem"
                            className="w-8 h-8 object-cover rounded cursor-pointer hover:opacity-90"
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
                            className="flex items-center gap-2 text-sm underline mb-2"
                          >
                            <FileText className="w-4 h-4" />
                            {message.content || 'Documento'}
                          </a>
                        )}
                        {(message.message_type === 'text' || message.content) && message.message_type !== 'audio' && (
                          <p className="text-sm">{message.content}</p>
                        )}
                        <div className={cn(
                          "flex items-center gap-1 mt-1",
                          message.is_from_me ? "justify-end" : "justify-start"
                        )}>
                          <span className={cn(
                            "text-xs",
                            message.is_from_me ? "text-background/70" : "text-muted-foreground"
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
            <div className="p-4 border-t border-border bg-card">
              <form onSubmit={sendMessage} className="flex items-center gap-3 max-w-3xl mx-auto">
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || isRecording}
                >
                  <Paperclip className="w-5 h-5" />
                </Button>
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "ghost"}
                  size="icon"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={sending}
                >
                  {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1"
                  disabled={sending || isRecording}
                />
                <Button type="submit" size="icon" disabled={sending || !newMessage.trim() || isRecording}>
                  <Send className="w-5 h-5" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-medium text-foreground">Chat Multicanal</h3>
              <p className="text-muted-foreground mt-1">
                Selecione uma conversa para começar
              </p>
              <div className="flex justify-center gap-2 mt-4">
                {getPlatformBadge('whatsapp')}
                {getPlatformBadge('instagram')}
              </div>
              <p className="text-xs text-muted-foreground mt-4 max-w-sm">
                Configure sua automação para enviar para:<br/>
                <code className="bg-muted px-2 py-1 rounded text-xs mt-2 inline-block">
                  https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/automation-webhook
                </code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
