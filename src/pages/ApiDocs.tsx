import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  Copy, 
  Check, 
  Database, 
  Send, 
  ShoppingCart, 
  Layers, 
  Zap,
  BookOpen,
  Terminal,
  ChevronRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BASE_URL = 'https://ahbjwpkpxqqrpvpzmqwa.functions.supabase.co';

const ApiDocs = () => {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: 'Copiado!', description: 'Código copiado para a área de transferência' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const CodeBlock = ({ code, id, language = 'json' }: { code: string; id: string; language?: string }) => (
    <div className="relative group rounded-lg overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-8 bg-muted/80 flex items-center justify-between px-3 border-b border-border/50">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{language}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => copyToClipboard(code, id)}
        >
          {copiedId === id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
      <pre className="bg-muted/50 pt-10 pb-4 px-4 text-xs overflow-x-auto font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );

  const MethodBadge = ({ method }: { method: 'GET' | 'POST' | 'PUT' | 'DELETE' }) => {
    const styles = {
      GET: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      POST: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      PUT: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      DELETE: 'bg-red-500/10 text-red-600 border-red-500/20',
    };
    return (
      <Badge variant="outline" className={`font-mono text-xs ${styles[method]}`}>
        {method}
      </Badge>
    );
  };

  const ParamTable = ({ params }: { params: { name: string; type: string; required?: boolean; desc: string }[] }) => (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="grid grid-cols-[120px_80px_1fr] bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <span>Parâmetro</span>
        <span>Tipo</span>
        <span>Descrição</span>
      </div>
      <div className="divide-y divide-border">
        {params.map((param) => (
          <div key={param.name} className="grid grid-cols-[120px_80px_1fr] px-4 py-3 text-sm items-start gap-2">
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{param.name}</code>
              {param.required && <span className="w-1.5 h-1.5 rounded-full bg-primary" title="Obrigatório" />}
            </div>
            <span className="text-muted-foreground text-xs">{param.type}</span>
            <span className="text-muted-foreground">{param.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const EndpointCard = ({ 
    method, 
    endpoint, 
    description, 
    children 
  }: { 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'; 
    endpoint: string; 
    description: string;
    children: React.ReactNode;
  }) => (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-3">
          <MethodBadge method={method} />
          <code className="text-sm font-mono font-semibold">{endpoint}</code>
        </div>
        <CardDescription className="mt-2">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {children}
      </CardContent>
    </Card>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        {title}
      </h4>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="p-6 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Terminal className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">API Interna</h1>
              <p className="text-muted-foreground text-sm">
                Documentação para integração com automações (Fiqon, n8n, Make, Zapier)
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
            <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
            <code className="text-xs font-mono text-muted-foreground">{BASE_URL}</code>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 ml-auto"
              onClick={() => copyToClipboard(BASE_URL, 'base-url')}
            >
              {copiedId === 'base-url' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="catalog" className="space-y-6">
          <TabsList className="h-auto p-1 bg-muted/50 rounded-lg grid grid-cols-4 gap-1">
            <TabsTrigger value="catalog" className="gap-2 data-[state=active]:bg-background">
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline">Catálogo</span>
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2 data-[state=active]:bg-background">
              <Layers className="w-4 h-4" />
              <span className="hidden sm:inline">Sessões</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2 data-[state=active]:bg-background">
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Pedidos</span>
            </TabsTrigger>
            <TabsTrigger value="messaging" className="gap-2 data-[state=active]:bg-background">
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Mensagens</span>
            </TabsTrigger>
          </TabsList>

          {/* Catálogo */}
          <TabsContent value="catalog" className="space-y-6">
            <EndpointCard
              method="GET"
              endpoint="/catalog-api"
              description="Retorna produtos do catálogo com fotos, vídeos, preços e estoque"
            >
              <Section title="Parâmetros (Query String)">
                <ParamTable params={[
                  { name: 'sku', type: 'string', desc: 'Busca produto pelo código SKU exato' },
                  { name: 'product_id', type: 'uuid', desc: 'Busca produto pelo ID' },
                  { name: 'category', type: 'string', desc: 'Filtra por categoria (busca exata)' },
                  { name: 'cor', type: 'string', desc: 'Filtra por cor (busca parcial)' },
                  { name: 'search', type: 'string', desc: 'Busca em nome, descrição e SKU' },
                  { name: 'only_available', type: 'boolean', desc: 'Apenas produtos com estoque' },
                ]} />
              </Section>

              <Section title="Exemplo de Requisição">
                <CodeBlock
                  id="catalog-request"
                  language="bash"
                  code={`curl "${BASE_URL}/catalog-api?category=Pingente&only_available=true"`}
                />
              </Section>

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="response" className="border-none">
                  <AccordionTrigger className="text-sm font-semibold py-2 hover:no-underline">
                    <span className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      Resposta (expandir)
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <CodeBlock
                      id="catalog-response"
                      code={`{
  "success": true,
  "count": 2,
  "products": [
    {
      "id": "uuid-do-produto",
      "sku": "E0612040",
      "name": "Pingente Coração Ouro",
      "price": 289.90,
      "price_formatted": "R$ 289,90",
      "category": "Pingente",
      "image_url": "https://...",
      "video_url": "https://...",
      "total_stock": 15,
      "available": true,
      "sizes": [
        { "size": "Único", "stock": 15 }
      ]
    }
  ]
}`}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </EndpointCard>

            <EndpointCard
              method="GET"
              endpoint="/catalog-categories"
              description="Lista todas as categorias disponíveis com contagem de produtos"
            >
              <Section title="Exemplo de Requisição">
                <CodeBlock
                  id="categories-request"
                  language="bash"
                  code={`curl "${BASE_URL}/catalog-categories"`}
                />
              </Section>

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="response" className="border-none">
                  <AccordionTrigger className="text-sm font-semibold py-2 hover:no-underline">
                    <span className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      Resposta (expandir)
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <CodeBlock
                      id="categories-response"
                      code={`{
  "success": true,
  "count": 5,
  "categories": [
    {
      "name": "Pingente",
      "total_products": 12,
      "products_with_stock": 10
    }
  ],
  "aliases": {
    "pingente": "Pingente",
    "pingentes": "Pingente"
  }
}`}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </EndpointCard>
          </TabsContent>

          {/* Sessões */}
          <TabsContent value="sessions" className="space-y-6">
            <EndpointCard
              method="POST"
              endpoint="/catalog-session"
              description="Cria uma nova sessão de catálogo para rastrear itens enviados ao cliente"
            >
              <Section title="Body (JSON)">
                <ParamTable params={[
                  { name: 'phone', type: 'string', required: true, desc: 'Telefone E.164 (ex: 5592999999999)' },
                  { name: 'line', type: 'string', required: true, desc: 'Linha do catálogo (ex: tungstenio)' },
                  { name: 'intent', type: 'string', desc: 'Intenção do cliente (ex: aliancas)' },
                  { name: 'preferred_color', type: 'string', desc: 'Cor preferida (ex: dourada)' },
                  { name: 'budget_max', type: 'number', desc: 'Orçamento máximo' },
                ]} />
              </Section>

              <Section title="Exemplo">
                <CodeBlock
                  id="session-request"
                  code={`{
  "phone": "5592999999999",
  "line": "tungstenio",
  "intent": "aliancas",
  "preferred_color": "dourada"
}`}
                />
              </Section>

              <Section title="Resposta">
                <CodeBlock
                  id="session-response"
                  code={`{
  "success": true,
  "session_id": "uuid-da-sessao"
}`}
                />
              </Section>
            </EndpointCard>

            <EndpointCard
              method="POST"
              endpoint="/catalog-item"
              description="Registra um item enviado dentro de uma sessão de catálogo"
            >
              <Section title="Body (JSON)">
                <ParamTable params={[
                  { name: 'session_id', type: 'uuid', required: true, desc: 'ID da sessão retornado pelo /catalog-session' },
                  { name: 'position', type: 'number', required: true, desc: 'Posição do item (1, 2, 3...)' },
                  { name: 'sku', type: 'string', required: true, desc: 'Código SKU do produto' },
                  { name: 'name', type: 'string', required: true, desc: 'Nome do produto' },
                  { name: 'media_type', type: 'string', required: true, desc: '"image" ou "video"' },
                  { name: 'media_url', type: 'string', required: true, desc: 'URL da mídia enviada' },
                  { name: 'price', type: 'number', desc: 'Preço do produto' },
                  { name: 'sizes', type: 'array', desc: 'Tamanhos disponíveis' },
                ]} />
              </Section>

              <Section title="Exemplo">
                <CodeBlock
                  id="item-request"
                  code={`{
  "session_id": "uuid-da-sessao",
  "position": 1,
  "sku": "E0612040",
  "name": "Abaulada Diamantada 3mm",
  "price": 419,
  "media_type": "image",
  "media_url": "https://..."
}`}
                />
              </Section>
            </EndpointCard>

            <EndpointCard
              method="GET"
              endpoint="/catalog-latest"
              description="Retorna a sessão mais recente e seus itens (para interpretar 'o segundo', 'o do vídeo')"
            >
              <Section title="Parâmetros">
                <ParamTable params={[
                  { name: 'phone', type: 'string', required: true, desc: 'Telefone E.164' },
                  { name: 'line', type: 'string', required: true, desc: 'Linha do catálogo' },
                ]} />
              </Section>

              <Section title="Exemplo">
                <CodeBlock
                  id="latest-url"
                  language="bash"
                  code={`curl "${BASE_URL}/catalog-latest?phone=5592999999999&line=tungstenio"`}
                />
              </Section>
            </EndpointCard>
          </TabsContent>

          {/* Pedidos */}
          <TabsContent value="orders" className="space-y-6">
            <EndpointCard
              method="POST"
              endpoint="/orders-pending"
              description="Cria ou atualiza um pedido pendente (quando cliente está quase fechando)"
            >
              <Section title="Body (JSON)">
                <ParamTable params={[
                  { name: 'phone', type: 'string', required: true, desc: 'Telefone E.164' },
                  { name: 'summary_text', type: 'string', required: true, desc: 'Resumo do pedido para atendente' },
                  { name: 'session_id', type: 'uuid', desc: 'ID da sessão de catálogo' },
                  { name: 'selected_sku', type: 'string', desc: 'SKU do produto selecionado' },
                  { name: 'selected_name', type: 'string', desc: 'Nome do produto' },
                  { name: 'selected_size_1', type: 'string', desc: 'Tamanho 1' },
                  { name: 'selected_size_2', type: 'string', desc: 'Tamanho 2 (para par)' },
                  { name: 'unit_or_pair', type: 'string', desc: '"unidade" ou "par"' },
                  { name: 'unit_price', type: 'number', desc: 'Preço unitário' },
                  { name: 'total_price', type: 'number', desc: 'Preço total' },
                  { name: 'payment_method', type: 'string', desc: 'pix, cartão, etc.' },
                  { name: 'delivery_method', type: 'string', desc: 'retirada, envio' },
                ]} />
              </Section>

              <Section title="Exemplo">
                <CodeBlock
                  id="orders-request"
                  code={`{
  "phone": "5592999999999",
  "selected_sku": "E0612040",
  "selected_name": "Abaulada Diamantada 3mm",
  "selected_size_1": "36",
  "unit_or_pair": "unidade",
  "unit_price": 419,
  "total_price": 419,
  "payment_method": "pix",
  "delivery_method": "retirada",
  "summary_text": "Pedido: SKU E0612040, tam 36, Pix, retirada."
}`}
                />
              </Section>

              <div className="p-3 rounded-lg bg-muted/50 border border-dashed border-border">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    <strong>UPSERT:</strong> Se existir pedido pendente para o mesmo telefone nas últimas 6h, ele será atualizado.
                  </p>
                </div>
              </div>
            </EndpointCard>

            <EndpointCard
              method="GET"
              endpoint="/orders-pending"
              description="Lista pedidos por status"
            >
              <Section title="Parâmetros">
                <ParamTable params={[
                  { name: 'status', type: 'string', desc: 'pending, in_progress, done, canceled' },
                  { name: 'phone', type: 'string', desc: 'Filtrar por telefone' },
                ]} />
              </Section>

              <Section title="Exemplo">
                <CodeBlock
                  id="orders-list-url"
                  language="bash"
                  code={`curl "${BASE_URL}/orders-pending?status=pending"`}
                />
              </Section>
            </EndpointCard>

            <EndpointCard
              method="GET"
              endpoint="/order-detail"
              description="Retorna detalhes completos de um pedido"
            >
              <Section title="Parâmetros">
                <ParamTable params={[
                  { name: 'id', type: 'uuid', required: true, desc: 'ID do pedido' },
                ]} />
              </Section>

              <Section title="Exemplo">
                <CodeBlock
                  id="order-detail-url"
                  language="bash"
                  code={`curl "${BASE_URL}/order-detail?id=uuid-do-pedido"`}
                />
              </Section>
            </EndpointCard>
          </TabsContent>

          {/* Mensagens */}
          <TabsContent value="messaging" className="space-y-6">
            <EndpointCard
              method="POST"
              endpoint="/automation-send"
              description="Envia mensagens para clientes via automação (salva no CRM e encaminha)"
            >
              <Section title="Body (JSON)">
                <ParamTable params={[
                  { name: 'phone', type: 'string', required: true, desc: 'Telefone com código do país' },
                  { name: 'message', type: 'string', desc: 'Conteúdo da mensagem' },
                  { name: 'platform', type: 'string', desc: '"whatsapp" ou "instagram"' },
                  { name: 'message_type', type: 'string', desc: 'text, image, audio, video, document' },
                  { name: 'media_url', type: 'string', desc: 'URL da mídia (para tipos não-texto)' },
                ]} />
              </Section>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Enviar Texto</p>
                  <CodeBlock
                    id="send-text"
                    code={`{
  "phone": "5511999999999",
  "message": "Olá! Temos novidades 🛍️",
  "platform": "whatsapp"
}`}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Enviar Imagem</p>
                  <CodeBlock
                    id="send-image"
                    code={`{
  "phone": "5511999999999",
  "message": "Confira!",
  "message_type": "image",
  "media_url": "https://...",
  "platform": "whatsapp"
}`}
                  />
                </div>
              </div>
            </EndpointCard>

            <EndpointCard
              method="POST"
              endpoint="/automation-webhook"
              description="Recebe mensagens de clientes da sua automação (Fiqon/ZAPI)"
            >
              <Section title="URL para configurar na automação">
                <CodeBlock code={`${BASE_URL}/automation-webhook`} id="webhook-url" language="url" />
              </Section>

              <Section title="Payload esperado">
                <CodeBlock
                  id="webhook-payload"
                  code={`{
  "phone": "5511999999999",
  "message": "Quero ver alianças",
  "platform": "whatsapp",
  "contact_name": "Maria",
  "message_type": "text"
}`}
                />
              </Section>
            </EndpointCard>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default ApiDocs;
