import { useState, useEffect } from 'react';
import { Bot, Sparkles, Save, Copy, RefreshCw, FileText, Wand2, Check, X, Plus, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AIAgentConfig {
  id: string;
  name: string;
  assistant_id: string | null;
  model: string;
  system_prompt: string | null;
  personality: string | null;
  greeting: string | null;
  rules: string[] | null;
  available_functions: string[] | null;
  product_presentation_template: string | null;
  closing_phrases: string[] | null;
  active_template: string | null;
  max_products_per_message: number;
  send_video_priority: boolean;
  include_sizes: boolean;
  include_stock: boolean;
  include_price: boolean;
  is_active: boolean;
}

interface PromptTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  system_prompt: string;
  personality: string | null;
  rules: string[] | null;
  is_default: boolean;
}

const AIConfig = () => {
  const [config, setConfig] = useState<AIAgentConfig | null>(null);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('prompt');
  const [newRule, setNewRule] = useState('');
  const [newPhrase, setNewPhrase] = useState('');
  const [playgroundInfo, setPlaygroundInfo] = useState<{
    name: string;
    model: string;
    instructions_length: number;
  } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfig();
    fetchTemplates();
  }, []);

  // Buscar informações do Assistant quando o ID mudar
  useEffect(() => {
    if (config?.assistant_id && config.assistant_id.startsWith('asst_')) {
      fetchPlaygroundInfoDirect(config.assistant_id);
    } else {
      setPlaygroundInfo(null);
    }
  }, [config?.assistant_id]);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_agent_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setConfig(data);
    } catch (error) {
      console.error('Error fetching config:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as configurações.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_prompt_templates')
        .select('*')
        .order('is_default', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('ai_agent_config')
        .update({
          ...config,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id);

      if (error) throw error;

      toast({
        title: 'Salvo!',
        description: 'Configurações atualizadas com sucesso.',
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const applyTemplate = (template: PromptTemplate) => {
    if (!config) return;
    setConfig({
      ...config,
      active_template: template.slug,
      system_prompt: template.system_prompt,
      personality: template.personality,
      rules: template.rules,
    });
    toast({
      title: 'Template aplicado',
      description: `Template "${template.name}" aplicado. Salve para confirmar.`,
    });
  };

  const addRule = () => {
    if (!newRule.trim() || !config) return;
    setConfig({
      ...config,
      rules: [...(config.rules || []), newRule.trim()],
    });
    setNewRule('');
  };

  const removeRule = (index: number) => {
    if (!config) return;
    setConfig({
      ...config,
      rules: (config.rules || []).filter((_, i) => i !== index),
    });
  };

  const addClosingPhrase = () => {
    if (!newPhrase.trim() || !config) return;
    setConfig({
      ...config,
      closing_phrases: [...(config.closing_phrases || []), newPhrase.trim()],
    });
    setNewPhrase('');
  };

  const removeClosingPhrase = (index: number) => {
    if (!config) return;
    setConfig({
      ...config,
      closing_phrases: (config.closing_phrases || []).filter((_, i) => i !== index),
    });
  };

  const syncWithPlayground = async (action: 'push' | 'pull' | 'get') => {
    if (!config?.assistant_id) {
      toast({
        title: 'Assistant ID necessário',
        description: 'Configure o Assistant ID do Playground primeiro.',
        variant: 'destructive',
      });
      return;
    }

    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-assistant', {
        body: {
          action,
          assistant_id: config.assistant_id,
          config_id: config.id,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      if (action === 'get') {
        setPlaygroundInfo(data.assistant);
        toast({
          title: 'Informações carregadas',
          description: `Assistant: ${data.assistant.name}`,
        });
      } else if (action === 'push') {
        toast({
          title: 'Sincronizado!',
          description: 'Prompt enviado para o Playground com sucesso.',
        });
        setPlaygroundInfo(data.assistant);
      } else if (action === 'pull') {
        toast({
          title: 'Importado!',
          description: 'Prompt importado do Playground. Recarregando...',
        });
        // Recarregar config do banco
        await fetchConfig();
        setPlaygroundInfo(data.assistant);
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: 'Erro na sincronização',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchPlaygroundInfoDirect = async (assistantId: string) => {
    if (!assistantId || !assistantId.startsWith('asst_')) return;
    
    setIsSyncing(true);
    try {
      // Primeiro, salvar o assistant_id no banco se houver config
      if (config) {
        await supabase
          .from('ai_agent_config')
          .update({ assistant_id: assistantId })
          .eq('id', config.id);
      }

      const { data, error } = await supabase.functions.invoke('sync-assistant', {
        body: {
          action: 'get',
          assistant_id: assistantId,
          config_id: config?.id,
        },
      });

      if (error) throw error;

      if (data.success && data.assistant) {
        setPlaygroundInfo(data.assistant);
      }
    } catch (error) {
      console.error('Error fetching playground info:', error);
      setPlaygroundInfo(null);
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchPlaygroundInfo = async () => {
    if (config?.assistant_id) {
      await fetchPlaygroundInfoDirect(config.assistant_id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Bot className="w-16 h-16 text-muted-foreground" />
        <p className="text-muted-foreground">Configuração não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-background" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Configuração da IA</h1>
              <p className="text-sm text-muted-foreground">Personalize o prompt e comportamento da {config.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={config.is_active ? "default" : "secondary"}>
              {config.is_active ? 'Ativa' : 'Inativa'}
            </Badge>
            <Button onClick={saveConfig} disabled={isSaving} className="gap-2">
              <Save className="w-4 h-4" />
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-xl grid-cols-4">
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="sections">Seções</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
          </TabsList>

          {/* Prompt Tab - Texto Simples */}
          <TabsContent value="prompt" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Prompt Completo (Texto Livre)
                </CardTitle>
                <CardDescription>
                  Escreva o prompt completo da {config.name}. Este texto será enviado como system prompt para a IA.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={config.system_prompt || ''}
                  onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
                  placeholder="Você é a Aline, consultora virtual de joias da Acium..."
                  className="min-h-[400px] font-mono text-sm"
                />
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>{(config.system_prompt || '').length} caracteres</span>
                  <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigator.clipboard.writeText(config.system_prompt || '')}>
                    <Copy className="w-4 h-4" />
                    Copiar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sections Tab - Seções Estruturadas */}
          <TabsContent value="sections" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Identidade */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Identidade</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do Assistente</Label>
                    <Input
                      value={config.name}
                      onChange={(e) => setConfig({ ...config, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Personalidade</Label>
                    <Textarea
                      value={config.personality || ''}
                      onChange={(e) => setConfig({ ...config, personality: e.target.value })}
                      placeholder="Elegante, atenciosa, especialista em joias..."
                      className="min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mensagem de Boas-vindas</Label>
                    <Textarea
                      value={config.greeting || ''}
                      onChange={(e) => setConfig({ ...config, greeting: e.target.value })}
                      placeholder="Olá! Sou a Aline..."
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Regras */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Regras e Restrições</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {(config.rules || []).map((rule, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                        <Check className="w-4 h-4 text-green-600 shrink-0" />
                        <span className="flex-1 text-sm">{rule}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRule(index)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newRule}
                      onChange={(e) => setNewRule(e.target.value)}
                      placeholder="Nova regra..."
                      onKeyDown={(e) => e.key === 'Enter' && addRule()}
                    />
                    <Button variant="outline" size="icon" onClick={addRule}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Template de Produto */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Template de Apresentação de Produto</CardTitle>
                  <CardDescription>Use variáveis: {"{{nome}}, {{preco}}, {{descricao}}, {{tamanhos}}, {{cor}}"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={config.product_presentation_template || ''}
                    onChange={(e) => setConfig({ ...config, product_presentation_template: e.target.value })}
                    placeholder="*{{nome}}*
- *Descrição:* {{descricao}}
- *Preço:* {{preco}}
- *Tamanhos:* {{tamanhos}}"
                    className="min-h-[150px] font-mono text-sm"
                  />
                </CardContent>
              </Card>

              {/* Frases de Fechamento */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Frases de Fechamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {(config.closing_phrases || []).map((phrase, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                        <span className="flex-1 text-sm">{phrase}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeClosingPhrase(index)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newPhrase}
                      onChange={(e) => setNewPhrase(e.target.value)}
                      placeholder="Nova frase..."
                      onKeyDown={(e) => e.key === 'Enter' && addClosingPhrase()}
                    />
                    <Button variant="outline" size="icon" onClick={addClosingPhrase}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Configurações de Produto */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configurações de Apresentação de Produtos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label>Máximo de Produtos por Mensagem</Label>
                    <Input
                      type="number"
                      value={config.max_products_per_message}
                      onChange={(e) => setConfig({ ...config, max_products_per_message: parseInt(e.target.value) || 5 })}
                      min={1}
                      max={20}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <Label>Priorizar Vídeo</Label>
                      <p className="text-xs text-muted-foreground">Enviar vídeo quando disponível</p>
                    </div>
                    <Switch
                      checked={config.send_video_priority}
                      onCheckedChange={(checked) => setConfig({ ...config, send_video_priority: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <Label>Incluir Tamanhos</Label>
                      <p className="text-xs text-muted-foreground">Mostrar tamanhos disponíveis</p>
                    </div>
                    <Switch
                      checked={config.include_sizes}
                      onCheckedChange={(checked) => setConfig({ ...config, include_sizes: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <Label>Incluir Estoque</Label>
                      <p className="text-xs text-muted-foreground">Mostrar disponibilidade</p>
                    </div>
                    <Switch
                      checked={config.include_stock}
                      onCheckedChange={(checked) => setConfig({ ...config, include_stock: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <Label>Incluir Preço</Label>
                      <p className="text-xs text-muted-foreground">Mostrar valores</p>
                    </div>
                    <Switch
                      checked={config.include_price}
                      onCheckedChange={(checked) => setConfig({ ...config, include_price: checked })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className={config.active_template === template.slug ? 'ring-2 ring-primary' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      {template.is_default && <Badge variant="secondary">Padrão</Badge>}
                    </div>
                    <CardDescription className="text-xs">{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-3">{template.personality}</p>
                    <div className="flex gap-2">
                      <Button
                        variant={config.active_template === template.slug ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => applyTemplate(template)}
                      >
                        {config.active_template === template.slug ? (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            Ativo
                          </>
                        ) : (
                          'Usar Template'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Playground Tab */}
          <TabsContent value="playground" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="w-5 h-5" />
                  Integração com OpenAI Playground
                </CardTitle>
                <CardDescription>
                  Conecte sua {config.name} ao Assistant do OpenAI Playground para sincronização automática.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Assistant ID do Playground</Label>
                  <div className="flex gap-2">
                    <Input
                      value={config.assistant_id || ''}
                      onChange={(e) => setConfig({ ...config, assistant_id: e.target.value })}
                      placeholder="asst_xxxxxxxxxxxxxxxxxxxx"
                      className="font-mono"
                    />
                    <Button variant="outline" size="icon" asChild>
                      <a href="https://platform.openai.com/playground" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Encontre o ID no Playground &gt; Assistants &gt; Settings
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Select value={config.model} onValueChange={(value) => setConfig({ ...config, model: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini (Rápido, Econômico)</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o (Mais Inteligente)</SelectItem>
                      <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo (Mais Barato)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button 
                    onClick={() => syncWithPlayground('push')} 
                    className="gap-2 flex-1" 
                    variant="outline"
                    disabled={isSyncing}
                  >
                    <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                    Enviar para Playground
                  </Button>
                  <Button 
                    onClick={() => syncWithPlayground('pull')} 
                    className="gap-2 flex-1" 
                    variant="outline"
                    disabled={isSyncing}
                  >
                    <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                    Importar do Playground
                  </Button>
                </div>

                {playgroundInfo && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                    <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">Informações do Playground</h4>
                    <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                      <p><strong>Nome:</strong> {playgroundInfo.name}</p>
                      <p><strong>Modelo:</strong> {playgroundInfo.model}</p>
                      <p><strong>Prompt:</strong> {playgroundInfo.instructions_length} caracteres</p>
                    </div>
                  </div>
                )}

                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Como funciona:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>1. Configure o Assistant ID do seu assistente no Playground</li>
                    <li>2. O prompt configurado aqui será sincronizado automaticamente</li>
                    <li>3. A {config.name} usará o prompt atualizado nas conversas</li>
                    <li>4. Alterações no CRM atualizam o Playground e vice-versa</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AIConfig;
