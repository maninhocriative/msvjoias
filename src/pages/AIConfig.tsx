import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Sparkles,
  Save,
  Copy,
  RefreshCw,
  FileText,
  Wand2,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  MessageCircle,
  Clock,
  Timer,
  UserRound,
} from 'lucide-react';
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
  followup_enabled: boolean;
  followup_interval_minutes: number;
  followup_max_attempts: number;
  followup_messages: string[] | null;
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

interface PlaygroundInfo {
  name: string;
  model: string;
  instructions_length: number;
}

const ALINE_DEFAULT_PROMPT = `# Aline | ACIUM Manaus

Você é Aline, consultora virtual da ACIUM Manaus.

Função:
- fazer a triagem inicial do cliente
- identificar rapidamente se ele quer:
  - alianças de namoro
  - alianças de casamento
  - pingentes dourados
  - pingentes prata

Regras:
- respostas curtas e elegantes
- nunca listar produtos manualmente
- quando for casamento, dizer que vai transferir para a Keila
- depois da transferência, não continuar conduzindo o fluxo de casamento
- nunca inventar preço, estoque ou prazo
- se houver catálogo, escrever só uma frase curta de introdução

Fluxo:
- alianças de namoro: confirmar finalidade, perguntar cor e depois mostrar opções
- pingentes: perguntar cor e depois mostrar opções
- alianças de casamento: transferir para a Keila

Endereço da loja:
Shopping Sumaúma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM.`;

const KEILA_DEFAULT_PROMPT = `# Keila | ACIUM Manaus

Você é Keila, especialista em alianças de casamento da ACIUM Manaus.

Função:
- atender clientes que buscam alianças de casamento
- usar memória do cliente para lembrar preferências e contexto
- conduzir o atendimento com objetividade, elegância e segurança

Fluxo obrigatório:
1. perguntar para quando o cliente deseja fechar
2. perguntar quanto quer investir
3. perguntar se deseja o par ou a unidade
4. perguntar a numeração
5. se o cliente não souber a numeração, tranquilizar:
   "Tudo bem, se você ainda não souber a numeração agora, eu sigo com você mesmo assim 😊"

Depois:
- buscar opções no catálogo da cor escolhida
- os cards serão enviados pelo sistema
- sempre lembrar:
  "O valor do card é da unidade. O par sai pelo dobro. 💍"
- depois dos cards, perguntar:
  "Gostou de algum modelo? 😊"

Cores de casamento:
- dourada
- prata
- preta
- azul

Regras:
- respostas curtas
- nunca listar produtos manualmente
- nunca inventar preço, estoque ou prazo
- focar só em alianças de casamento`;

const AIConfig = () => {
  const [configs, setConfigs] = useState<AIAgentConfig[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('prompt');
  const [newRule, setNewRule] = useState('');
  const [newPhrase, setNewPhrase] = useState('');
  const [newFollowupMessage, setNewFollowupMessage] = useState('');
  const [playgroundInfoMap, setPlaygroundInfoMap] = useState<Record<string, PlaygroundInfo>>({});
  const { toast } = useToast();

  const selectedConfig = useMemo(() => {
    return configs.find((config) => config.id === selectedAgentId) || configs[0] || null;
  }, [configs, selectedAgentId]);

  const selectedPlaygroundInfo = useMemo(() => {
    if (!selectedConfig) return null;
    return playgroundInfoMap[selectedConfig.id] || null;
  }, [playgroundInfoMap, selectedConfig]);

  const normalizeAgentName = (name: string) => {
    return String(name || '').trim().toLowerCase();
  };

  const getDefaultPromptForAgent = (agentName: string) => {
    const normalized = normalizeAgentName(agentName);
    if (normalized === 'keila') return KEILA_DEFAULT_PROMPT;
    return ALINE_DEFAULT_PROMPT;
  };

  const buildUpdatePayload = (config: AIAgentConfig) => ({
    name: config.name,
    assistant_id: config.assistant_id,
    model: config.model,
    system_prompt: config.system_prompt,
    personality: config.personality,
    greeting: config.greeting,
    rules: config.rules,
    available_functions: config.available_functions,
    product_presentation_template: config.product_presentation_template,
    closing_phrases: config.closing_phrases,
    active_template: config.active_template,
    max_products_per_message: config.max_products_per_message,
    send_video_priority: config.send_video_priority,
    include_sizes: config.include_sizes,
    include_stock: config.include_stock,
    include_price: config.include_price,
    is_active: config.is_active,
    followup_enabled: config.followup_enabled,
    followup_interval_minutes: config.followup_interval_minutes,
    followup_max_attempts: config.followup_max_attempts,
    followup_messages: config.followup_messages,
    updated_at: new Date().toISOString(),
  });

  const updateSelectedConfig = (patch: Partial<AIAgentConfig>) => {
    if (!selectedConfig) return;

    setConfigs((prev) =>
      prev.map((config) =>
        config.id === selectedConfig.id ? { ...config, ...patch } : config,
      ),
    );
  };

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_agent_config')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      const list = data || [];
      setConfigs(list);

      if (list.length > 0) {
        setSelectedAgentId((current) => {
          const stillExists = list.some((item) => item.id === current);
          return stillExists ? current : list[0].id;
        });
      } else {
        setSelectedAgentId('');
      }
    } catch (error) {
      console.error('Error fetching configs:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os agentes.',
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

  useEffect(() => {
    fetchConfigs();
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedConfig?.assistant_id && selectedConfig.assistant_id.startsWith('asst_')) {
      void fetchPlaygroundInfoDirect(selectedConfig.assistant_id, selectedConfig.id);
    }
  }, [selectedConfig?.assistant_id, selectedConfig?.id]);

  const saveConfig = async () => {
    if (!selectedConfig) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('ai_agent_config')
        .update(buildUpdatePayload(selectedConfig))
        .eq('id', selectedConfig.id);

      if (error) throw error;

      toast({
        title: 'Salvo!',
        description: `Configurações da ${selectedConfig.name} atualizadas com sucesso.`,
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
    if (!selectedConfig) return;

    updateSelectedConfig({
      active_template: template.slug,
      system_prompt: template.system_prompt,
      personality: template.personality,
      rules: template.rules,
    });

    toast({
      title: 'Template aplicado',
      description: `Template "${template.name}" aplicado na ${selectedConfig.name}. Salve para confirmar.`,
    });
  };

  const addRule = () => {
    if (!newRule.trim() || !selectedConfig) return;

    updateSelectedConfig({
      rules: [...(selectedConfig.rules || []), newRule.trim()],
    });
    setNewRule('');
  };

  const removeRule = (index: number) => {
    if (!selectedConfig) return;

    updateSelectedConfig({
      rules: (selectedConfig.rules || []).filter((_, i) => i !== index),
    });
  };

  const addClosingPhrase = () => {
    if (!newPhrase.trim() || !selectedConfig) return;

    updateSelectedConfig({
      closing_phrases: [...(selectedConfig.closing_phrases || []), newPhrase.trim()],
    });
    setNewPhrase('');
  };

  const removeClosingPhrase = (index: number) => {
    if (!selectedConfig) return;

    updateSelectedConfig({
      closing_phrases: (selectedConfig.closing_phrases || []).filter((_, i) => i !== index),
    });
  };

  const syncWithPlayground = async (action: 'push' | 'pull' | 'get') => {
    if (!selectedConfig?.assistant_id) {
      toast({
        title: 'Assistant ID necessário',
        description: `Configure o Assistant ID da ${selectedConfig?.name || 'agente'} primeiro.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-assistant', {
        body: {
          action,
          assistant_id: selectedConfig.assistant_id,
          config_id: selectedConfig.id,
        },
      });

      if (error) throw error;
      if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      if (data.assistant) {
        setPlaygroundInfoMap((prev) => ({
          ...prev,
          [selectedConfig.id]: {
            name: data.assistant.name,
            model: data.assistant.model,
            instructions_length: data.assistant.instructions_length,
          },
        }));
      }

      if (action === 'pull' && data.assistant) {
        updateSelectedConfig({
          name: data.assistant.name || selectedConfig.name,
          system_prompt: data.assistant.instructions || selectedConfig.system_prompt,
          model: data.assistant.model || selectedConfig.model,
        });
      }

      toast({
        title:
          action === 'push'
            ? 'Sincronizado!'
            : action === 'pull'
              ? 'Importado!'
              : 'Informações carregadas',
        description:
          action === 'push'
            ? `Prompt da ${selectedConfig.name} enviado para o Playground.`
            : action === 'pull'
              ? `Prompt da ${selectedConfig.name} importado do Playground.`
              : `Assistant da ${selectedConfig.name} carregado com sucesso.`,
      });
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

  const fetchPlaygroundInfoDirect = async (assistantId: string, configId: string) => {
    if (!assistantId || !assistantId.startsWith('asst_')) return;

    setIsSyncing(true);
    try {
      await supabase
        .from('ai_agent_config')
        .update({ assistant_id: assistantId })
        .eq('id', configId);

      const { data, error } = await supabase.functions.invoke('sync-assistant', {
        body: {
          action: 'get',
          assistant_id: assistantId,
          config_id: configId,
        },
      });

      if (error) throw error;

      if (data.success && data.assistant) {
        setPlaygroundInfoMap((prev) => ({
          ...prev,
          [configId]: {
            name: data.assistant.name,
            model: data.assistant.model,
            instructions_length: data.assistant.instructions_length,
          },
        }));
      }
    } catch (error) {
      console.error('Error fetching playground info:', error);
      setPlaygroundInfoMap((prev) => {
        const next = { ...prev };
        delete next[configId];
        return next;
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const loadDefaultPrompt = () => {
    if (!selectedConfig) return;

    updateSelectedConfig({
      system_prompt: getDefaultPromptForAgent(selectedConfig.name),
    });

    toast({
      title: 'Prompt carregado!',
      description: `Prompt padrão da ${selectedConfig.name} aplicado. Salve para confirmar.`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!configs.length || !selectedConfig) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Bot className="w-16 h-16 text-muted-foreground" />
        <p className="text-muted-foreground">Nenhuma configuração de agente encontrada.</p>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Aplique a migration da Keila e confirme se existem registros em <code>ai_agent_config</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-background" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Configuração dos Agentes</h1>
              <p className="text-sm text-muted-foreground">
                Edite Aline e Keila separadamente e sincronize cada uma com seu próprio Playground.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant={selectedConfig.is_active ? 'default' : 'secondary'}>
              {selectedConfig.is_active ? `${selectedConfig.name} ativa` : `${selectedConfig.name} inativa`}
            </Badge>
            <Button onClick={saveConfig} disabled={isSaving} className="gap-2">
              <Save className="w-4 h-4" />
              {isSaving ? 'Salvando...' : `Salvar ${selectedConfig.name}`}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="w-5 h-5" />
                Agentes
              </CardTitle>
              <CardDescription>
                Cada agente tem prompt, assistant e sincronização próprios.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {configs.map((agent) => {
                const isSelected = selectedConfig.id === agent.id;
                const assistantLabel = agent.assistant_id ? agent.assistant_id : 'Sem Assistant ID';

                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={cn(
                      'w-full rounded-xl border p-4 text-left transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/40 hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{agent.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{agent.model}</p>
                      </div>
                      <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                        {agent.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground break-all">
                      {assistantLabel}
                    </p>

                    {playgroundInfoMap[agent.id] && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Playground: {playgroundInfoMap[agent.id].name}
                      </p>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5" />
                  Editando {selectedConfig.name}
                </CardTitle>
                <CardDescription>
                  Tudo abaixo afeta apenas a agente selecionada.
                </CardDescription>
              </CardHeader>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full max-w-3xl grid-cols-5">
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="sections">Seções</TabsTrigger>
                <TabsTrigger value="followup">Follow-up</TabsTrigger>
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="playground">Playground</TabsTrigger>
              </TabsList>

              <TabsContent value="prompt" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="w-5 h-5" />
                          Prompt Completo da {selectedConfig.name}
                        </CardTitle>
                        <CardDescription>
                          Escreva o prompt completo da agente selecionada.
                        </CardDescription>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={loadDefaultPrompt}
                        disabled={isSyncing}
                      >
                        {isSyncing ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4" />
                        )}
                        Carregar Prompt Padrão
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <Textarea
                      value={selectedConfig.system_prompt || ''}
                      onChange={(e) => updateSelectedConfig({ system_prompt: e.target.value })}
                      placeholder={`Escreva o prompt da ${selectedConfig.name}...`}
                      className="min-h-[420px] font-mono text-sm"
                    />
                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                      <span>{(selectedConfig.system_prompt || '').length} caracteres</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => navigator.clipboard.writeText(selectedConfig.system_prompt || '')}
                      >
                        <Copy className="w-4 h-4" />
                        Copiar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sections" className="space-y-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Identidade</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Nome do Assistente</Label>
                        <Input
                          value={selectedConfig.name}
                          onChange={(e) => updateSelectedConfig({ name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Personalidade</Label>
                        <Textarea
                          value={selectedConfig.personality || ''}
                          onChange={(e) => updateSelectedConfig({ personality: e.target.value })}
                          placeholder="Elegante, atenciosa, especialista..."
                          className="min-h-[100px]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mensagem de Boas-vindas</Label>
                        <Textarea
                          value={selectedConfig.greeting || ''}
                          onChange={(e) => updateSelectedConfig({ greeting: e.target.value })}
                          placeholder={`Olá! Sou a ${selectedConfig.name}...`}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Regras e Restrições</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        {(selectedConfig.rules || []).map((rule, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                            <Check className="w-4 h-4 text-green-600 shrink-0" />
                            <span className="flex-1 text-sm">{rule}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => removeRule(index)}
                            >
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

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Template de Produto</CardTitle>
                      <CardDescription>
                        Use variáveis: {'{{nome}}, {{preco}}, {{descricao}}, {{tamanhos}}, {{cor}}'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={selectedConfig.product_presentation_template || ''}
                        onChange={(e) =>
                          updateSelectedConfig({ product_presentation_template: e.target.value })
                        }
                        placeholder="*{{nome}}*"
                        className="min-h-[150px] font-mono text-sm"
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Frases de Fechamento</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        {(selectedConfig.closing_phrases || []).map((phrase, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                            <span className="flex-1 text-sm">{phrase}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => removeClosingPhrase(index)}
                            >
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

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Configurações de Produtos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label>Máximo de Produtos por Mensagem</Label>
                        <Input
                          type="number"
                          value={selectedConfig.max_products_per_message}
                          onChange={(e) =>
                            updateSelectedConfig({
                              max_products_per_message: parseInt(e.target.value) || 5,
                            })
                          }
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
                          checked={selectedConfig.send_video_priority}
                          onCheckedChange={(checked) =>
                            updateSelectedConfig({ send_video_priority: checked })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <Label>Incluir Tamanhos</Label>
                          <p className="text-xs text-muted-foreground">Mostrar tamanhos disponíveis</p>
                        </div>
                        <Switch
                          checked={selectedConfig.include_sizes}
                          onCheckedChange={(checked) =>
                            updateSelectedConfig({ include_sizes: checked })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <Label>Incluir Estoque</Label>
                          <p className="text-xs text-muted-foreground">Mostrar disponibilidade</p>
                        </div>
                        <Switch
                          checked={selectedConfig.include_stock}
                          onCheckedChange={(checked) =>
                            updateSelectedConfig({ include_stock: checked })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <Label>Incluir Preço</Label>
                          <p className="text-xs text-muted-foreground">Mostrar valores</p>
                        </div>
                        <Switch
                          checked={selectedConfig.include_price}
                          onCheckedChange={(checked) =>
                            updateSelectedConfig({ include_price: checked })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <Label>Agente Ativa</Label>
                          <p className="text-xs text-muted-foreground">Habilitar essa agente no sistema</p>
                        </div>
                        <Switch
                          checked={selectedConfig.is_active}
                          onCheckedChange={(checked) =>
                            updateSelectedConfig({ is_active: checked })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="followup" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageCircle className="w-5 h-5" />
                      Recuperação de Conversas da {selectedConfig.name}
                    </CardTitle>
                    <CardDescription>
                      Configure mensagens automáticas específicas para a agente selecionada.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <Label className="text-base">Ativar Follow-up Automático</Label>
                        <p className="text-sm text-muted-foreground">
                          A {selectedConfig.name} enviará mensagens para recuperar conversas inativas.
                        </p>
                      </div>
                      <Switch
                        checked={selectedConfig.followup_enabled ?? true}
                        onCheckedChange={(checked) =>
                          updateSelectedConfig({ followup_enabled: checked })
                        }
                      />
                    </div>

                    <Separator />

                    <div className="space-y-6">
                      <div className="space-y-3">
                        <Label className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Intervalo de Inatividade
                        </Label>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={Math.floor((selectedConfig.followup_interval_minutes ?? 10) / 1440)}
                              onChange={(e) => {
                                const days = parseInt(e.target.value) || 0;
                                const currentTotal = selectedConfig.followup_interval_minutes ?? 10;
                                const hours = Math.floor((currentTotal % 1440) / 60);
                                const minutes = currentTotal % 60;
                                const newTotal = Math.max(5, days * 1440 + hours * 60 + minutes);
                                updateSelectedConfig({ followup_interval_minutes: newTotal });
                              }}
                              min={0}
                              max={7}
                              disabled={!selectedConfig.followup_enabled}
                              className="w-20"
                            />
                            <span className="text-sm text-muted-foreground">dias</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={Math.floor(((selectedConfig.followup_interval_minutes ?? 10) % 1440) / 60)}
                              onChange={(e) => {
                                const hours = parseInt(e.target.value) || 0;
                                const currentTotal = selectedConfig.followup_interval_minutes ?? 10;
                                const days = Math.floor(currentTotal / 1440);
                                const minutes = currentTotal % 60;
                                const newTotal = Math.max(5, days * 1440 + hours * 60 + minutes);
                                updateSelectedConfig({ followup_interval_minutes: newTotal });
                              }}
                              min={0}
                              max={23}
                              disabled={!selectedConfig.followup_enabled}
                              className="w-20"
                            />
                            <span className="text-sm text-muted-foreground">horas</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={(selectedConfig.followup_interval_minutes ?? 10) % 60}
                              onChange={(e) => {
                                const minutes = parseInt(e.target.value) || 0;
                                const currentTotal = selectedConfig.followup_interval_minutes ?? 10;
                                const days = Math.floor(currentTotal / 1440);
                                const hours = Math.floor((currentTotal % 1440) / 60);
                                const newTotal = Math.max(5, days * 1440 + hours * 60 + minutes);
                                updateSelectedConfig({ followup_interval_minutes: newTotal });
                              }}
                              min={0}
                              max={59}
                              disabled={!selectedConfig.followup_enabled}
                              className="w-20"
                            />
                            <span className="text-sm text-muted-foreground">minutos</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Timer className="w-4 h-4" />
                          Máximo de Tentativas
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={selectedConfig.followup_max_attempts ?? 3}
                            onChange={(e) =>
                              updateSelectedConfig({
                                followup_max_attempts: parseInt(e.target.value) || 3,
                              })
                            }
                            min={1}
                            max={5}
                            disabled={!selectedConfig.followup_enabled}
                            className="w-24"
                          />
                          <span className="text-sm text-muted-foreground">mensagens</span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <Label className="text-base">Mensagens de Follow-up</Label>

                      <div className="space-y-3">
                        {(selectedConfig.followup_messages || []).map((message, index) => (
                          <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                            <Badge variant="outline" className="shrink-0 mt-0.5">
                              #{index + 1}
                            </Badge>
                            <span className="flex-1 text-sm">{message}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() =>
                                updateSelectedConfig({
                                  followup_messages: (selectedConfig.followup_messages || []).filter(
                                    (_, i) => i !== index,
                                  ),
                                })
                              }
                              disabled={!selectedConfig.followup_enabled}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      {(selectedConfig.followup_messages || []).length <
                        (selectedConfig.followup_max_attempts ?? 3) && (
                        <div className="flex gap-2">
                          <Input
                            value={newFollowupMessage}
                            onChange={(e) => setNewFollowupMessage(e.target.value)}
                            placeholder="Nova mensagem de follow-up..."
                            disabled={!selectedConfig.followup_enabled}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newFollowupMessage.trim()) {
                                updateSelectedConfig({
                                  followup_messages: [
                                    ...(selectedConfig.followup_messages || []),
                                    newFollowupMessage.trim(),
                                  ],
                                });
                                setNewFollowupMessage('');
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={!selectedConfig.followup_enabled || !newFollowupMessage.trim()}
                            onClick={() => {
                              if (!newFollowupMessage.trim()) return;
                              updateSelectedConfig({
                                followup_messages: [
                                  ...(selectedConfig.followup_messages || []),
                                  newFollowupMessage.trim(),
                                ],
                              });
                              setNewFollowupMessage('');
                            }}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="templates" className="space-y-6">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <Card
                      key={template.id}
                      className={selectedConfig.active_template === template.slug ? 'ring-2 ring-primary' : ''}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          {template.is_default && <Badge variant="secondary">Padrão</Badge>}
                        </div>
                        <CardDescription className="text-xs">{template.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {template.personality}
                        </p>
                        <Button
                          variant={selectedConfig.active_template === template.slug ? 'default' : 'outline'}
                          size="sm"
                          className="w-full"
                          onClick={() => applyTemplate(template)}
                        >
                          {selectedConfig.active_template === template.slug ? (
                            <>
                              <Check className="w-4 h-4 mr-1" />
                              Ativo
                            </>
                          ) : (
                            'Usar Template'
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="playground" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wand2 className="w-5 h-5" />
                      Playground da {selectedConfig.name}
                    </CardTitle>
                    <CardDescription>
                      Cada agente pode ter seu próprio Assistant ID e sua própria sincronização.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Assistant ID do Playground</Label>
                      <div className="flex gap-2">
                        <Input
                          value={selectedConfig.assistant_id || ''}
                          onChange={(e) => updateSelectedConfig({ assistant_id: e.target.value })}
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
                        Esse Assistant ID pertence apenas à {selectedConfig.name}.
                      </p>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Modelo</Label>
                      <Select
                        value={selectedConfig.model}
                        onValueChange={(value) => updateSelectedConfig({ model: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                          <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
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
                        <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
                        Enviar {selectedConfig.name}
                      </Button>

                      <Button
                        onClick={() => syncWithPlayground('pull')}
                        className="gap-2 flex-1"
                        variant="outline"
                        disabled={isSyncing}
                      >
                        <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
                        Importar {selectedConfig.name}
                      </Button>

                      <Button
                        onClick={() => syncWithPlayground('get')}
                        className="gap-2 flex-1"
                        variant="outline"
                        disabled={isSyncing}
                      >
                        <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
                        Ver dados
                      </Button>
                    </div>

                    {selectedPlaygroundInfo && (
                      <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                        <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
                          Informações do Playground
                        </h4>
                        <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                          <p><strong>Nome:</strong> {selectedPlaygroundInfo.name}</p>
                          <p><strong>Modelo:</strong> {selectedPlaygroundInfo.model}</p>
                          <p><strong>Prompt:</strong> {selectedPlaygroundInfo.instructions_length} caracteres</p>
                        </div>
                      </div>
                    )}

                    <div className="p-4 bg-muted rounded-lg">
                      <h4 className="font-medium mb-2">Como funciona</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>1. Selecione a agente na coluna da esquerda.</p>
                        <p>2. Edite o prompt, assistant ID e modelo dessa agente.</p>
                        <p>3. Salve a configuração.</p>
                        <p>4. Envie ou importe essa agente separadamente do Playground.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIConfig;
