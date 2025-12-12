import { useState, useEffect, useRef } from 'react';
import { supabase, Conversation, Message } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Paperclip, Search, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const Chat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
      
      const channel = supabase
        .channel('messages-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${selectedConversation.id}`,
          },
          (payload) => {
            setMessages((prev) => [...prev, payload.new as Message]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedConversation]);

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

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      const { error } = await supabase.from('messages').insert([
        {
          conversation_id: selectedConversation.id,
          content: newMessage,
          message_type: 'text',
          is_from_me: true,
        },
      ]);

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation) return;

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

      const { error } = await supabase.from('messages').insert([
        {
          conversation_id: selectedConversation.id,
          content: file.name,
          message_type: file.type.startsWith('image/') ? 'image' : 'file',
          media_url: publicUrl,
          is_from_me: true,
        },
      ]);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Arquivo enviado com sucesso!' });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar o arquivo.',
        variant: 'destructive',
      });
    }
  };

  const filteredConversations = conversations.filter((conv) =>
    conv.contact_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getPlatformInitial = (platform: string) => {
    return platform?.charAt(0).toUpperCase() || 'C';
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
                <div className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center font-semibold">
                  {conv.contact_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground truncate">{conv.contact_name}</p>
                    <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                      {getPlatformInitial(conv.platform)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{conv.last_message}</p>
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
            <div className="h-16 px-6 border-b border-border flex items-center gap-3 bg-card">
              <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center font-semibold">
                {selectedConversation.contact_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-foreground">{selectedConversation.contact_name}</p>
                <p className="text-xs text-muted-foreground">{selectedConversation.contact_number}</p>
              </div>
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
                    <div
                      className={cn(
                        'max-w-[70%] rounded-2xl px-4 py-2.5',
                        message.is_from_me
                          ? 'bg-foreground text-background rounded-br-md'
                          : 'bg-muted text-foreground rounded-bl-md'
                      )}
                    >
                      {message.message_type === 'image' && message.media_url && (
                        <img
                          src={message.media_url}
                          alt="Imagem"
                          className="max-w-full rounded-lg mb-2"
                        />
                      )}
                      <p className="text-sm">{message.content}</p>
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
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="w-5 h-5" />
                </Button>
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1"
                />
                <Button type="submit" size="icon">
                  <Send className="w-5 h-5" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-medium text-foreground">Selecione uma conversa</h3>
              <p className="text-muted-foreground mt-1">
                Escolha uma conversa para começar a enviar mensagens
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
