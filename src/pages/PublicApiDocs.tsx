import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Check, Database, Send, ShoppingCart, Layers, MessageSquare, Package, ExternalLink, Zap, BookOpen, Bot, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BASE_URL = 'https://ahbjwpkpxqqrpvpzmqwa.functions.supabase.co';

const PublicApiDocs = () => {
  const navigate = useNavigate();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const API_DOCS_URL = `${window.location.origin}/api-docs.txt`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyApiDocsUrl = () => {
    navigator.clipboard.writeText(API_DOCS_URL);
    toast({
      title: "Link copiado!",
      description: "Cole este link no ChatGPT, Claude ou qualquer IA para ela analisar nossa documentação.",
    });
  };

  const CodeBlock = ({ code, id, language = 'json' }: { code: string; id: string; language?: string }) => (
    <div className="relative group">
      <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto border border-slate-700/50 shadow-lg">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white hover:bg-slate-700"
        onClick={() => copyToClipboard(code, id)}
      >
        {copiedId === id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );

  const ParamTable = ({ params }: { params: { name: string; type: string; required?: boolean; desc: string }[] }) => (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Campo</th>
            <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Tipo</th>
            <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Obrigatório</th>
            <th className="text-left p-3 font-semibold text-slate-700 dark:text-slate-300">Descrição</th>
          </tr>
        </thead>
        <tbody className="text-slate-600 dark:text-slate-400">
          {params.map((param, i) => (
            <tr key={param.name} className={i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}>
              <td className="p-3"><code className="bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">{param.name}</code></td>
              <td className="p-3"><Badge variant="outline" className="text-xs">{param.type}</Badge></td>
              <td className="p-3">{param.required ? <span className="text-green-600 dark:text-green-400">✓ Sim</span> : <span className="text-slate-400">Não</span>}</td>
              <td className="p-3">{param.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const EndpointCard = ({ method, path, description, children }: { method: string; path: string; description: string; children: React.ReactNode }) => (
    <Card className="border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className={method === 'GET' ? 'bg-emerald-500 hover:bg-emerald-600' : method === 'POST' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-purple-500 hover:bg-purple-600'}>
            {method}
          </Badge>
          <code className="text-base font-mono font-semibold text-slate-800 dark:text-slate-200">{path}</code>
        </div>
        <CardDescription className="mt-2 text-slate-600 dark:text-slate-400">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Acium CRM API</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Documentação v1.0</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="default" 
                size="sm" 
                className="gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg"
                onClick={copyApiDocsUrl}
              >
                <Bot className="w-4 h-4" />
                <span className="hidden sm:inline">Copiar Link para IA</span>
                <span className="sm:hidden">Link IA</span>
              </Button>
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href="/api-docs.txt" target="_blank">
                  <ExternalLink className="w-4 h-4" />
                  <span className="hidden sm:inline">Ver Texto</span>
                </a>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => navigate('/nomenclatura')}
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Nomenclatura IA</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="mb-10">
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-2xl p-8 text-white shadow-xl shadow-amber-500/20">
            <h2 className="text-3xl font-bold mb-3">API Documentation</h2>
            <p className="text-amber-100 mb-6 max-w-2xl">
              Integre seu catálogo com automações externas (FiqOn, n8n, Make, Zapier). 
              Todas as APIs estão prontas para uso imediato.
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                <span className="text-sm font-medium">Base URL:</span>
                <code className="text-xs bg-white/20 px-2 py-1 rounded">{BASE_URL}</code>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { icon: Database, label: 'Catálogo', color: 'from-emerald-500 to-teal-600', tab: 'catalog' },
            { icon: Layers, label: 'Sessões', color: 'from-blue-500 to-indigo-600', tab: 'sessions' },
            { icon: ShoppingCart, label: 'Pedidos', color: 'from-purple-500 to-pink-600', tab: 'orders' },
            { icon: MessageSquare, label: 'Mensagens', color: 'from-orange-500 to-red-600', tab: 'messages' },
          ].map((item) => (
            <a
              key={item.tab}
              href={`#${item.tab}`}
              className="group bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-all hover:-translate-y-1"
            >
              <div className={`w-10 h-10 bg-gradient-to-br ${item.color} rounded-lg flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform`}>
                <item.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">{item.label}</h3>
            </a>
          ))}
        </div>

        {/* API Documentation Tabs */}
        <Tabs defaultValue="catalog" className="space-y-8">
          <TabsList className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded-xl flex-wrap h-auto gap-1">
            <TabsTrigger value="catalog" className="gap-2 data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-lg">
              <Database className="w-4 h-4" />
              Catálogo
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white rounded-lg">
              <Layers className="w-4 h-4" />
              Sessões
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2 data-[state=active]:bg-purple-500 data-[state=active]:text-white rounded-lg">
              <ShoppingCart className="w-4 h-4" />
              Pedidos
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-lg">
              <MessageSquare className="w-4 h-4" />
              Mensagens
            </TabsTrigger>
            <TabsTrigger value="workflow" className="gap-2 data-[state=active]:bg-pink-500 data-[state=active]:text-white rounded-lg">
              <Package className="w-4 h-4" />
              Fluxo
            </TabsTrigger>
          </TabsList>

          {/* CATALOG TAB */}
          <TabsContent value="catalog" id="catalog" className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Catálogo de Produtos</h2>
                <p className="text-slate-600 dark:text-slate-400">Busque produtos com fotos, vídeos, preços e estoque</p>
              </div>
            </div>

            <EndpointCard method="GET" path="/catalog-api" description="Retorna produtos do catálogo filtrados por diversos parâmetros">
              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">URL Completa</h4>
                <CodeBlock code={`${BASE_URL}/catalog-api`} id="catalog-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Parâmetros (Query String)</h4>
                <ParamTable params={[
                  { name: 'sku', type: 'string', desc: 'Busca produto pelo SKU exato' },
                  { name: 'product_id', type: 'uuid', desc: 'Busca produto pelo ID' },
                  { name: 'category', type: 'string', desc: 'Filtra por categoria (busca parcial)' },
                  { name: 'search', type: 'string', desc: 'Busca em nome, descrição e SKU' },
                  { name: 'only_available', type: 'boolean', desc: 'Retorna apenas produtos com estoque' },
                ]} />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Exemplo cURL</h4>
                <CodeBlock
                  id="catalog-curl"
                  language="bash"
                  code={`curl -X GET "${BASE_URL}/catalog-api?category=Aliancas&only_available=true"`}
                />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Resposta de Sucesso</h4>
                <CodeBlock
                  id="catalog-response"
                  code={`{
  "success": true,
  "count": 2,
  "products": [
    {
      "id": "uuid-do-produto",
      "sku": "E0612040",
      "name": "Abaulada Diamantada Dourada 3mm",
      "price": 419.00,
      "price_formatted": "R$ 419,00",
      "category": "Aliancas",
      "image_url": "https://...",
      "video_url": "https://...",
      "total_stock": 25,
      "available": true,
      "sizes": [
        { "size": "36", "stock": 10 },
        { "size": "38", "stock": 15 }
      ]
    }
  ]
}`}
                />
              </div>
            </EndpointCard>

            {/* Catalog Categories */}
            <EndpointCard method="GET" path="/catalog-categories" description="Lista todas as categorias disponíveis com contagem de produtos">
              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">URL Completa</h4>
                <CodeBlock code={`${BASE_URL}/catalog-categories`} id="categories-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Exemplo cURL</h4>
                <CodeBlock
                  id="categories-curl"
                  language="bash"
                  code={`curl -X GET "${BASE_URL}/catalog-categories"`}
                />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Resposta de Sucesso</h4>
                <CodeBlock
                  id="categories-response"
                  code={`{
  "success": true,
  "count": 3,
  "categories": [
    {
      "name": "Pingente",
      "name_lowercase": "pingente",
      "total_products": 9,
      "products_with_stock": 8
    }
  ],
  "aliases": {
    "pingente": "Pingente",
    "pingentes": "Pingente"
  },
  "usage": {
    "description": "Use o campo 'name' para filtrar no /catalog-api",
    "example": "?category=Pingente"
  }
}`}
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold mb-2 text-blue-800 dark:text-blue-200">💡 Uso na Automação</h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• Chame este endpoint para descobrir as categorias disponíveis</li>
                  <li>• Use o campo <strong>name</strong> no parâmetro category do /catalog-api</li>
                  <li>• O campo <strong>aliases</strong> mapeia variações para o nome correto</li>
                </ul>
              </div>
            </EndpointCard>
          </TabsContent>

          {/* SESSIONS TAB */}
          <TabsContent value="sessions" id="sessions" className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Sessões de Catálogo</h2>
                <p className="text-slate-600 dark:text-slate-400">Rastreie produtos enviados ao cliente para referências como "o segundo"</p>
              </div>
            </div>

            <EndpointCard method="POST" path="/catalog-session" description="Cria uma nova sessão ao iniciar envio de produtos">
              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">URL</h4>
                <CodeBlock code={`${BASE_URL}/catalog-session`} id="session-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Corpo da Requisição</h4>
                <ParamTable params={[
                  { name: 'phone', type: 'string', required: true, desc: 'Telefone E.164 sem + (ex: 5592999999999)' },
                  { name: 'line', type: 'string', required: true, desc: 'Linha do catálogo (ex: tungstenio, oui)' },
                  { name: 'intent', type: 'string', desc: 'Intenção do cliente (ex: aliancas)' },
                  { name: 'preferred_color', type: 'string', desc: 'Cor preferida (ex: dourada)' },
                  { name: 'budget_max', type: 'number', desc: 'Orçamento máximo' },
                ]} />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Exemplo</h4>
                <CodeBlock
                  id="session-request"
                  code={`{
  "phone": "5592999999999",
  "line": "tungstenio",
  "intent": "aliancas",
  "preferred_color": "dourada",
  "budget_max": 500
}`}
                />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Resposta</h4>
                <CodeBlock id="session-response" code={`{ "success": true, "session_id": "uuid-da-sessao" }`} />
              </div>
            </EndpointCard>

            <EndpointCard method="POST" path="/catalog-item" description="Registra cada item enviado dentro da sessão">
              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">URL</h4>
                <CodeBlock code={`${BASE_URL}/catalog-item`} id="item-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Corpo da Requisição</h4>
                <ParamTable params={[
                  { name: 'session_id', type: 'uuid', required: true, desc: 'ID retornado pelo /catalog-session' },
                  { name: 'position', type: 'number', required: true, desc: 'Posição do item (1, 2, 3...)' },
                  { name: 'sku', type: 'string', required: true, desc: 'Código SKU do produto' },
                  { name: 'name', type: 'string', required: true, desc: 'Nome do produto' },
                  { name: 'media_type', type: 'string', required: true, desc: '"image" ou "video"' },
                  { name: 'media_url', type: 'string', required: true, desc: 'URL da mídia enviada' },
                  { name: 'price', type: 'number', desc: 'Preço do produto' },
                  { name: 'sizes', type: 'array', desc: 'Array de tamanhos ["36", "38"]' },
                ]} />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Resposta</h4>
                <CodeBlock id="item-response" code={`{ "success": true }`} />
              </div>
            </EndpointCard>

            <EndpointCard method="GET" path="/catalog-latest" description="Retorna sessão ativa e itens para interpretar referências">
              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">URL</h4>
                <CodeBlock code={`${BASE_URL}/catalog-latest?phone=5592999999999&line=tungstenio`} id="latest-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Parâmetros</h4>
                <ParamTable params={[
                  { name: 'phone', type: 'string', required: true, desc: 'Telefone E.164 sem +' },
                  { name: 'line', type: 'string', required: true, desc: 'Linha do catálogo' },
                ]} />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Resposta</h4>
                <CodeBlock
                  id="latest-response"
                  code={`{
  "success": true,
  "session": { "id": "...", "phone": "...", "line": "...", "intent": "..." },
  "items": [
    { "position": 1, "sku": "E0612040", "name": "...", "media_type": "image" },
    { "position": 2, "sku": "E0612041", "name": "...", "media_type": "video" }
  ]
}`}
                />
              </div>
            </EndpointCard>
          </TabsContent>

          {/* ORDERS TAB */}
          <TabsContent value="orders" id="orders" className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Pedidos Pendentes</h2>
                <p className="text-slate-600 dark:text-slate-400">Gerencie pedidos prontos para fechamento pelo atendente</p>
              </div>
            </div>

            <EndpointCard method="POST" path="/orders-pending" description="Cria ou atualiza pedido pendente (UPSERT: atualiza se existir nas últimas 6h)">
              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">URL</h4>
                <CodeBlock code={`${BASE_URL}/orders-pending`} id="orders-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Corpo da Requisição</h4>
                <ParamTable params={[
                  { name: 'phone', type: 'string', required: true, desc: 'Telefone E.164 sem +' },
                  { name: 'summary_text', type: 'string', required: true, desc: 'Resumo do pedido para atendente' },
                  { name: 'session_id', type: 'uuid', desc: 'ID da sessão de catálogo' },
                  { name: 'selected_sku', type: 'string', desc: 'SKU do produto escolhido' },
                  { name: 'selected_name', type: 'string', desc: 'Nome do produto' },
                  { name: 'selected_size_1', type: 'string', desc: 'Tamanho 1' },
                  { name: 'selected_size_2', type: 'string', desc: 'Tamanho 2 (par)' },
                  { name: 'unit_or_pair', type: 'string', desc: '"unidade" ou "par"' },
                  { name: 'unit_price', type: 'number', desc: 'Preço unitário' },
                  { name: 'total_price', type: 'number', desc: 'Preço total' },
                  { name: 'payment_method', type: 'string', desc: 'pix, cartão' },
                  { name: 'delivery_method', type: 'string', desc: 'retirada, envio' },
                ]} />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Resposta</h4>
                <CodeBlock id="orders-response" code={`{ "success": true, "order_id": "uuid", "status": "pending" }`} />
              </div>
            </EndpointCard>

            <EndpointCard method="GET" path="/orders-pending" description="Lista pedidos por status">
              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">URL</h4>
                <CodeBlock code={`${BASE_URL}/orders-pending?status=pending`} id="orders-list-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Parâmetros</h4>
                <ParamTable params={[
                  { name: 'status', type: 'string', desc: 'pending, in_progress, done, canceled' },
                  { name: 'phone', type: 'string', desc: 'Filtrar por telefone' },
                ]} />
              </div>
            </EndpointCard>

            <EndpointCard method="GET" path="/order-detail" description="Detalhes completos do pedido com itens do catálogo">
              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">URL</h4>
                <CodeBlock code={`${BASE_URL}/order-detail?id=uuid-do-pedido`} id="order-detail-url" />
              </div>
            </EndpointCard>
          </TabsContent>

          {/* MESSAGES TAB */}
          <TabsContent value="messages" id="messages" className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Mensagens</h2>
                <p className="text-slate-600 dark:text-slate-400">Envie e receba mensagens via WhatsApp/Instagram</p>
              </div>
            </div>

            <EndpointCard method="POST" path="/automation-send" description="Envia mensagens para clientes via Z-API">
              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">URL</h4>
                <CodeBlock code={`${BASE_URL}/automation-send`} id="send-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Corpo da Requisição</h4>
                <ParamTable params={[
                  { name: 'phone', type: 'string', required: true, desc: 'Número com código do país' },
                  { name: 'message', type: 'string', desc: 'Conteúdo da mensagem' },
                  { name: 'platform', type: 'string', desc: '"whatsapp" ou "instagram"' },
                  { name: 'message_type', type: 'string', desc: '"text", "image", "video", "audio"' },
                  { name: 'media_url', type: 'string', desc: 'URL da mídia' },
                ]} />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Exemplo - Imagem</h4>
                <CodeBlock
                  id="send-image"
                  code={`{
  "phone": "5511999999999",
  "message": "Aliança Abaulada - R$ 419,00",
  "message_type": "image",
  "media_url": "https://exemplo.com/foto.jpg",
  "platform": "whatsapp"
}`}
                />
              </div>
            </EndpointCard>

            <EndpointCard method="POST" path="/automation-webhook" description="Recebe mensagens de clientes (configure no Z-API)">
              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">URL (Configure na Automação)</h4>
                <CodeBlock code={`${BASE_URL}/automation-webhook`} id="webhook-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Payload Esperado</h4>
                <CodeBlock
                  id="webhook-payload"
                  code={`{
  "platform": "whatsapp",
  "contact_number": "5511999999999",
  "contact_name": "João Silva",
  "message": "Quero ver aliança dourada até R$ 500",
  "message_type": "text",
  "fromMe": false
}`}
                />
              </div>
            </EndpointCard>
          </TabsContent>

          {/* WORKFLOW TAB */}
          <TabsContent value="workflow" id="workflow" className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center shadow-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Fluxo Completo</h2>
                <p className="text-slate-600 dark:text-slate-400">Exemplo de integração ponta a ponta</p>
              </div>
            </div>

            <Card className="border-slate-200 dark:border-slate-700">
              <CardContent className="p-6">
                <div className="space-y-4">
                  {[
                    { step: '1', color: 'bg-blue-500', title: 'Cliente envia mensagem', desc: '/automation-webhook recebe a mensagem' },
                    { step: '2', color: 'bg-emerald-500', title: 'Buscar produtos', desc: 'GET /catalog-api com filtros' },
                    { step: '3', color: 'bg-yellow-500', title: 'Criar sessão', desc: 'POST /catalog-session' },
                    { step: '4', color: 'bg-orange-500', title: 'Enviar produtos', desc: 'For Each: /automation-send + /catalog-item' },
                    { step: '5', color: 'bg-purple-500', title: 'Cliente escolhe', desc: 'GET /catalog-latest para identificar item' },
                    { step: '6', color: 'bg-pink-500', title: 'Criar pedido', desc: 'POST /orders-pending com resumo' },
                    { step: '7', color: 'bg-green-500', title: 'Atendente finaliza', desc: 'CRM mostra em /pedidos/pendentes' },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                      <div className={`w-8 h-8 ${item.color} rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                        {item.step}
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800 dark:text-slate-200">{item.title}</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Acium CRM API Documentation v1.0 • Base URL: <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{BASE_URL}</code>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PublicApiDocs;
