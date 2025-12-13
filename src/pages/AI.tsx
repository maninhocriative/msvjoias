import { useState } from 'react';
import { Bot, Sparkles, Settings2, Play, Pause, Clock, MessageSquare, Zap, Brain, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const AI = () => {
  const [botEnabled, setBotEnabled] = useState(true);
  const [autoReply, setAutoReply] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState(true);

  const stats = [
    { label: 'Mensagens Hoje', value: '124', icon: MessageSquare, change: '+12%' },
    { label: 'Respostas Automáticas', value: '89', icon: Zap, change: '+8%' },
    { label: 'Tempo Médio', value: '2.3s', icon: Clock, change: '-15%' },
    { label: 'Taxa de Resolução', value: '78%', icon: BarChart3, change: '+5%' },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center">
              <Brain className="w-6 h-6 text-background" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Assistente IA</h1>
              <p className="text-sm text-muted-foreground">Configure e monitore seu assistente virtual</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={botEnabled ? "default" : "secondary"} className="gap-1.5 px-3 py-1">
              {botEnabled ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {botEnabled ? 'Ativo' : 'Pausado'}
            </Badge>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings2 className="w-4 h-4" />
              Configurações Avançadas
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

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Bot Status Card */}
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

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Ações Rápidas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Play className="w-4 h-4" />
                  Testar Assistente
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Ver Conversas Recentes
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Relatório de Performance
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Configuration */}
          <div className="lg:col-span-2">
            <Card className="h-full">
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
                          Identifica quando o cliente demonstra interesse em comprar e oferece ajuda
                        </p>
                      </div>
                      <div className="p-4 border border-border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Sugerir produtos relacionados</Label>
                          <Switch defaultChecked />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Sugere produtos similares ou complementares durante a conversa
                        </p>
                      </div>
                      <div className="p-4 border border-border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Coletar dados de contato</Label>
                          <Switch defaultChecked />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Solicita nome e informações quando o cliente demonstra interesse
                        </p>
                      </div>
                      <div className="p-4 border border-border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Transferir para humano</Label>
                          <Switch defaultChecked />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Transfere automaticamente quando não consegue resolver
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default AI;
