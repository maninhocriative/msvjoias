import { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Settings2, Play, Pause, Clock, MessageSquare, Zap, Brain, BarChart3, Send, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const AI = () => {
  const [botEnabled, setBotEnabled] = useState(true);
  const [autoReply, setAutoReply] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState(true);
  const [activeTab, setActiveTab] = useState('chat');
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const stats = [
    { label: 'Mensagens Hoje', value: '124', icon: MessageSquare, change: '+12%' },
    { label: 'Respostas Automáticas', value: '89', icon: Zap, change: '+8%' },
    { label: 'Tempo Médio', value: '2.3s', icon: Clock, change: '-15%' },
    { label: 'Taxa de Resolução', value: '78%', icon: BarChart3, change: '+5%' },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: [...messages, { role: 'user', content: userMessage }],
          contact_name: 'Teste',
        },
      });

      if (error) throw error;

      if (data?.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      } else {
        throw new Error('Resposta inválida');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      });
      setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, ocorreu um erro. Tente novamente.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center">
              <Brain className="w-6 h-6 text-background" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Assistente IA</h1>
              <p className="text-sm text-muted-foreground">Configure e teste seu assistente virtual</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={botEnabled ? "default" : "secondary"} className="gap-1.5 px-3 py-1">
              {botEnabled ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {botEnabled ? 'Ativo' : 'Pausado'}
            </Badge>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setActiveTab('settings')}>
              <Settings2 className="w-4 h-4" />
              Configurações
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-border/50">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                    <p className="text-2xl lg:text-3xl font-bold text-foreground">{stat.value}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <stat.icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-2 font-medium">{stat.change} vs ontem</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full max-w-md grid grid-cols-3 mb-6">
            <TabsTrigger value="chat" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Testar Chat
            </TabsTrigger>
            <TabsTrigger value="controls" className="gap-2">
              <Zap className="w-4 h-4" />
              Controles
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings2 className="w-4 h-4" />
              Configurações
            </TabsTrigger>
          </TabsList>

          {/* Chat Tab */}
          <TabsContent value="chat" className="mt-0">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="pb-3 border-b border-border shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center">
                      <Bot className="w-5 h-5 text-background" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Aline - Assistente Virtual</CardTitle>
                      <CardDescription className="text-xs">Teste o assistente em tempo real</CardDescription>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearChat}>
                    Limpar
                  </Button>
                </div>
              </CardHeader>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.length === 0 && (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                        <Bot className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground mb-2">Comece uma conversa!</p>
                      <p className="text-sm text-muted-foreground">
                        Experimente perguntar sobre produtos, preços ou disponibilidade.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setInputMessage('Quais alianças vocês têm?')}
                        >
                          Quais alianças vocês têm?
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setInputMessage('Tem produtos em promoção?')}
                        >
                          Produtos em promoção?
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setInputMessage('Preciso de um anel de noivado')}
                        >
                          Anel de noivado
                        </Button>
                      </div>
                    </div>
                  )}

                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex gap-3',
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {message.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4 text-background" />
                        </div>
                      )}
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl px-4 py-3',
                          message.role === 'user'
                            ? 'bg-foreground text-background rounded-br-md'
                            : 'bg-muted text-foreground rounded-bl-md'
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.role === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 text-background" />
                      </div>
                      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-border shrink-0">
                <form onSubmit={sendMessage} className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 bg-muted/50 border-0 focus-visible:ring-1 rounded-full px-4"
                    disabled={isLoading}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="rounded-full shrink-0"
                    disabled={isLoading || !inputMessage.trim()}
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </form>
              </div>
            </Card>
          </TabsContent>

          {/* Controls Tab */}
          <TabsContent value="controls" className="mt-0">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bot className="w-5 h-5" />
                    Status do Bot
                  </CardTitle>
                  <CardDescription>Controle o estado do assistente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="bot-enabled" className="font-medium">Assistente Ativo</Label>
                      <p className="text-xs text-muted-foreground">Habilitar respostas automáticas</p>
                    </div>
                    <Switch
                      id="bot-enabled"
                      checked={botEnabled}
                      onCheckedChange={setBotEnabled}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-reply" className="font-medium">Auto-resposta</Label>
                      <p className="text-xs text-muted-foreground">Responder fora do horário</p>
                    </div>
                    <Switch
                      id="auto-reply"
                      checked={autoReply}
                      onCheckedChange={setAutoReply}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="catalog-search" className="font-medium">Busca no Catálogo</Label>
                      <p className="text-xs text-muted-foreground">Sugerir produtos automaticamente</p>
                    </div>
                    <Switch
                      id="catalog-search"
                      checked={catalogSearch}
                      onCheckedChange={setCatalogSearch}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    Ações Rápidas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveTab('chat')}>
                    <Play className="w-4 h-4" />
                    Testar Assistente
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" asChild>
                    <a href="/chat">
                      <MessageSquare className="w-4 h-4" />
                      Ver Conversas Reais
                    </a>
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" asChild>
                    <a href="/reports">
                      <BarChart3 className="w-4 h-4" />
                      Relatório de Performance
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Configuração do Assistente
                </CardTitle>
                <CardDescription>Personalize o comportamento e respostas do bot</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="personality" className="w-full">
                  <TabsList className="w-full grid grid-cols-3 mb-6">
                    <TabsTrigger value="personality">Personalidade</TabsTrigger>
                    <TabsTrigger value="responses">Respostas</TabsTrigger>
                    <TabsTrigger value="triggers">Gatilhos</TabsTrigger>
                  </TabsList>

                  <TabsContent value="personality" className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="bot-name">Nome do Assistente</Label>
                      <Input id="bot-name" placeholder="Ex: Aline" defaultValue="Aline" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bot-role">Função</Label>
                      <Input id="bot-role" placeholder="Ex: Atendente Virtual" defaultValue="Atendente Virtual de Vendas" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bot-tone">Tom de Comunicação</Label>
                      <Select defaultValue="friendly">
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tom" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="friendly">Amigável</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="professional">Profissional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bot-instructions">Instruções Personalizadas</Label>
                      <Textarea
                        id="bot-instructions"
                        placeholder="Descreva como o assistente deve se comportar..."
                        className="min-h-[120px]"
                        defaultValue="Seja cordial e prestativo. Apresente os produtos de forma clara e objetiva. Sempre pergunte se o cliente tem mais dúvidas antes de encerrar."
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="responses" className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="greeting">Mensagem de Saudação</Label>
                      <Textarea
                        id="greeting"
                        placeholder="Mensagem inicial..."
                        className="min-h-[80px]"
                        defaultValue="Olá! Sou a Aline, assistente virtual. Como posso ajudar você hoje?"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="away">Mensagem de Ausência</Label>
                      <Textarea
                        id="away"
                        placeholder="Mensagem fora do horário..."
                        className="min-h-[80px]"
                        defaultValue="No momento estamos fora do horário de atendimento. Deixe sua mensagem que retornaremos em breve!"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="transfer">Mensagem de Transferência</Label>
                      <Textarea
                        id="transfer"
                        placeholder="Mensagem ao transferir para humano..."
                        className="min-h-[80px]"
                        defaultValue="Vou transferir você para um de nossos atendentes. Por favor, aguarde um momento."
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="triggers" className="space-y-6">
                    <div className="space-y-4">
                      <div className="p-4 border border-border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Detectar intenção de compra</Label>
                          <Switch defaultChecked />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Identifica quando o cliente demonstra interesse em comprar
                        </p>
                      </div>
                      <div className="p-4 border border-border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Sugerir produtos relacionados</Label>
                          <Switch defaultChecked />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Sugere produtos similares ou complementares
                        </p>
                      </div>
                      <div className="p-4 border border-border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Coletar dados de contato</Label>
                          <Switch defaultChecked />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Solicita nome e informações quando há interesse
                        </p>
                      </div>
                      <div className="p-4 border border-border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Transferir para humano</Label>
                          <Switch defaultChecked />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Transfere quando não consegue resolver
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-border">
                  <Button variant="outline">Cancelar</Button>
                  <Button className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Salvar Configurações
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AI;
