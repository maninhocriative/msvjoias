import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, ExternalLink, Code, Send, Database, Image, ShoppingCart, Layers } from 'lucide-react';
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
    <div className="relative group">
      <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => copyToClipboard(code, id)}
      >
        {copiedId === id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="p-6 max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Documentação da API</h1>
          <p className="text-muted-foreground mt-2">
            Integre seu catálogo com automações externas (Fiqon, n8n, Make, Zapier)
          </p>
        </div>

        <Tabs defaultValue="catalog" className="space-y-6">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="catalog" className="gap-2">
              <Database className="w-4 h-4" />
              Catálogo
            </TabsTrigger>
            <TabsTrigger value="catalog-session" className="gap-2">
              <Layers className="w-4 h-4" />
              Sessões
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <ShoppingCart className="w-4 h-4" />
              Pedidos
            </TabsTrigger>
            <TabsTrigger value="send" className="gap-2">
              <Send className="w-4 h-4" />
              Enviar Mensagem
            </TabsTrigger>
          </TabsList>

          <TabsContent value="catalog" className="space-y-6">
            {/* Catalog API */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">GET</Badge>
                  <CardTitle className="text-lg font-mono">/catalog-api</CardTitle>
                </div>
                <CardDescription>
                  Retorna produtos do catálogo com fotos, vídeos, preços e estoque
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">URL Base</h4>
                  <CodeBlock code={`${BASE_URL}/catalog-api`} id="catalog-url" />
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Parâmetros (Query String)</h4>
                  <div className="space-y-3">
                    {[
                      { name: 'sku', type: 'string', desc: 'Busca produto pelo código/SKU exato', example: '?sku=CAM-001' },
                      { name: 'product_id', type: 'uuid', desc: 'Busca produto pelo ID', example: '?product_id=abc-123...' },
                      { name: 'category', type: 'string', desc: 'Filtra por categoria (busca EXATA por padrão)', example: '?category=Camisetas' },
                      { name: 'exact_category', type: 'boolean', desc: 'Se false, busca parcial na categoria', example: '?exact_category=false' },
                      { name: 'cor', type: 'string', desc: 'Filtra por cor (busca parcial)', example: '?cor=branco' },
                      { name: 'search', type: 'string', desc: 'Busca em nome, descrição e SKU', example: '?search=branco' },
                      { name: 'only_available', type: 'boolean', desc: 'Retorna apenas produtos com estoque', example: '?only_available=true' },
                    ].map((param) => (
                      <div key={param.name} className="flex items-start gap-4 p-3 bg-muted/50 rounded-lg">
                        <code className="text-sm font-mono bg-background px-2 py-1 rounded">{param.name}</code>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{param.type}</Badge>
                            <span className="text-sm text-muted-foreground">{param.desc}</span>
                          </div>
                          <code className="text-xs text-muted-foreground">{param.example}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Exemplo de Requisição</h4>
                  <CodeBlock
                    id="catalog-request"
                    language="bash"
                    code={`curl "${BASE_URL}/catalog-api?category=Camisetas&only_available=true"`}
                  />
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Resposta (Lista de Produtos)</h4>
                  <CodeBlock
                    id="catalog-response"
                    code={`{
  "success": true,
  "count": 2,
  "products": [
    {
      "id": "uuid-do-produto",
      "sku": "CAM-001",
      "name": "Camiseta Básica Branca",
      "description": "Camiseta 100% algodão",
      "price": 59.90,
      "price_formatted": "R$ 59,90",
      "category": "Camisetas",
      "image_url": "https://...",
      "video_url": "https://...",
      "images": ["https://foto2.jpg", "https://foto3.jpg"],
      "all_media": [
        { "type": "image", "url": "https://...", "is_main": true },
        { "type": "image", "url": "https://...", "is_main": false },
        { "type": "video", "url": "https://..." }
      ],
      "total_stock": 25,
      "available": true,
      "sizes": [
        { "size": "P", "stock": 10 },
        { "size": "M", "stock": 15 }
      ],
      "all_sizes": [
        { "size": "P", "stock": 10, "available": true },
        { "size": "M", "stock": 15, "available": true },
        { "size": "G", "stock": 0, "available": false }
      ]
    }
  ]
}`}
                  />
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Resposta (Produto Único - quando usa sku ou product_id)</h4>
                  <CodeBlock
                    id="catalog-single"
                    code={`{
  "success": true,
  "product": {
    "id": "uuid",
    "sku": "CAM-001",
    "name": "Camiseta Básica",
    "price_formatted": "R$ 59,90",
    ...
  }
}`}
                  />
                </div>

                <Card className="bg-muted/30 border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      Campos de Mídia
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p><strong>image_url</strong>: Imagem principal do produto</p>
                    <p><strong>images[]</strong>: Array de URLs de imagens adicionais</p>
                    <p><strong>video_url</strong>: URL do vídeo do produto</p>
                    <p><strong>all_media[]</strong>: Array unificado de toda mídia com tipo e flag de principal</p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            {/* Catalog Categories API */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">GET</Badge>
                  <CardTitle className="text-lg font-mono">/catalog-categories</CardTitle>
                </div>
                <CardDescription>
                  Lista todas as categorias disponíveis no banco de dados com contagem de produtos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">URL Base</h4>
                  <CodeBlock code={`${BASE_URL}/catalog-categories`} id="categories-url" />
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Exemplo de Requisição</h4>
                  <CodeBlock
                    id="categories-request"
                    language="bash"
                    code={`curl "${BASE_URL}/catalog-categories"`}
                  />
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Resposta</h4>
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
    "description": "Use o campo 'name' exato para filtrar no /catalog-api",
    "example": "?category=Pingente"
  }
}`}
                  />
                </div>

                <Card className="bg-muted/30 border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Uso na Automação</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p>• Chame este endpoint para descobrir as categorias disponíveis</p>
                    <p>• Use o campo <strong>name</strong> no parâmetro category do /catalog-api</p>
                    <p>• O campo <strong>aliases</strong> mapeia variações para o nome correto</p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Catalog Sessions API */}
          <TabsContent value="catalog-session" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">POST</Badge>
                  <CardTitle className="text-lg font-mono">/catalog-session</CardTitle>
                </div>
                <CardDescription>
                  Cria uma nova sessão de catálogo para rastrear itens enviados ao cliente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">URL</h4>
                  <CodeBlock code={`${BASE_URL}/catalog-session`} id="session-url" />
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Corpo da Requisição (JSON)</h4>
                  <div className="space-y-3">
                    {[
                      { name: 'phone', type: 'string', required: true, desc: 'Telefone E.164 sem + (ex: 5592999999999)' },
                      { name: 'line', type: 'string', required: true, desc: 'Linha do catálogo (ex: tungstenio, oui)' },
                      { name: 'intent', type: 'string', required: false, desc: 'Intenção do cliente (ex: aliancas, anel)' },
                      { name: 'preferred_color', type: 'string', required: false, desc: 'Cor preferida (ex: dourada, prata)' },
                      { name: 'budget_max', type: 'number', required: false, desc: 'Orçamento máximo do cliente' },
                    ].map((param) => (
                      <div key={param.name} className="flex items-start gap-4 p-3 bg-muted/50 rounded-lg">
                        <code className="text-sm font-mono bg-background px-2 py-1 rounded">{param.name}</code>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={param.required ? 'default' : 'secondary'} className="text-xs">
                              {param.required ? 'obrigatório' : 'opcional'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{param.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{param.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Exemplo de Requisição</h4>
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
                  <h4 className="font-semibold mb-2">Resposta de Sucesso</h4>
                  <CodeBlock
                    id="session-response"
                    code={`{
  "success": true,
  "session_id": "uuid-da-sessao"
}`}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">POST</Badge>
                  <CardTitle className="text-lg font-mono">/catalog-item</CardTitle>
                </div>
                <CardDescription>
                  Registra um item enviado dentro de uma sessão de catálogo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">URL</h4>
                  <CodeBlock code={`${BASE_URL}/catalog-item`} id="item-url" />
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Corpo da Requisição (JSON)</h4>
                  <div className="space-y-3">
                    {[
                      { name: 'session_id', type: 'uuid', required: true, desc: 'ID da sessão retornado pelo /catalog-session' },
                      { name: 'position', type: 'number', required: true, desc: 'Posição do item (1, 2, 3...)' },
                      { name: 'sku', type: 'string', required: true, desc: 'Código SKU do produto' },
                      { name: 'name', type: 'string', required: true, desc: 'Nome do produto' },
                      { name: 'media_type', type: 'string', required: true, desc: 'Tipo: "image" ou "video"' },
                      { name: 'media_url', type: 'string', required: true, desc: 'URL da mídia enviada' },
                      { name: 'price', type: 'number', required: false, desc: 'Preço do produto' },
                      { name: 'price_formatted', type: 'string', required: false, desc: 'Preço formatado (ex: R$ 419,00)' },
                      { name: 'sizes', type: 'array', required: false, desc: 'Array de tamanhos disponíveis' },
                      { name: 'image_url', type: 'string', required: false, desc: 'URL da imagem principal' },
                      { name: 'video_url', type: 'string', required: false, desc: 'URL do vídeo' },
                      { name: 'stock_total', type: 'number', required: false, desc: 'Estoque total disponível' },
                    ].map((param) => (
                      <div key={param.name} className="flex items-start gap-4 p-3 bg-muted/50 rounded-lg">
                        <code className="text-sm font-mono bg-background px-2 py-1 rounded">{param.name}</code>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={param.required ? 'default' : 'secondary'} className="text-xs">
                              {param.required ? 'obrigatório' : 'opcional'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{param.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{param.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Exemplo de Requisição</h4>
                  <CodeBlock
                    id="item-request"
                    code={`{
  "session_id": "uuid-da-sessao",
  "position": 1,
  "sku": "E0612040",
  "name": "Abaulada Diamantada Dourada 3mm",
  "price": 419,
  "price_formatted": "R$ 419,00",
  "sizes": ["36", "38"],
  "image_url": "https://...",
  "media_type": "image",
  "media_url": "https://..."
}`}
                  />
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Resposta de Sucesso</h4>
                  <CodeBlock
                    id="item-response"
                    code={`{ "success": true }`}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">GET</Badge>
                  <CardTitle className="text-lg font-mono">/catalog-latest</CardTitle>
                </div>
                <CardDescription>
                  Retorna a sessão mais recente ativa e seus itens (para interpretar "o segundo", "o do vídeo")
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">URL</h4>
                  <CodeBlock code={`${BASE_URL}/catalog-latest?phone=5592999999999&line=tungstenio`} id="latest-url" />
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Parâmetros (Query String)</h4>
                  <div className="space-y-3">
                    {[
                      { name: 'phone', type: 'string', required: true, desc: 'Telefone E.164 sem +' },
                      { name: 'line', type: 'string', required: true, desc: 'Linha do catálogo' },
                    ].map((param) => (
                      <div key={param.name} className="flex items-start gap-4 p-3 bg-muted/50 rounded-lg">
                        <code className="text-sm font-mono bg-background px-2 py-1 rounded">{param.name}</code>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="text-xs">obrigatório</Badge>
                            <Badge variant="outline" className="text-xs">{param.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{param.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Resposta de Sucesso</h4>
                  <CodeBlock
                    id="latest-response"
                    code={`{
  "success": true,
  "session": {
    "id": "uuid-da-sessao",
    "phone": "5592999999999",
    "line": "tungstenio",
    "intent": "aliancas",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "items": [
    {
      "position": 1,
      "sku": "E0612040",
      "name": "Abaulada Diamantada Dourada 3mm",
      "media_type": "image",
      "media_url": "https://...",
      "sizes": ["36", "38"],
      "price_formatted": "R$ 419,00"
    }
  ]
}`}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders API */}
          <TabsContent value="orders" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">POST</Badge>
                  <CardTitle className="text-lg font-mono">/orders-pending</CardTitle>
                </div>
                <CardDescription>
                  Cria ou atualiza um pedido pendente (quando cliente está quase fechando)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">URL</h4>
                  <CodeBlock code={`${BASE_URL}/orders-pending`} id="orders-url" />
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Corpo da Requisição (JSON)</h4>
                  <div className="space-y-3">
                    {[
                      { name: 'phone', type: 'string', required: true, desc: 'Telefone E.164 sem +' },
                      { name: 'session_id', type: 'uuid', required: false, desc: 'ID da sessão de catálogo' },
                      { name: 'selected_sku', type: 'string', required: false, desc: 'SKU do produto selecionado' },
                      { name: 'selected_name', type: 'string', required: false, desc: 'Nome do produto selecionado' },
                      { name: 'selected_size_1', type: 'string', required: false, desc: 'Tamanho 1 (ex: 18)' },
                      { name: 'selected_size_2', type: 'string', required: false, desc: 'Tamanho 2 para par (ex: 20)' },
                      { name: 'unit_or_pair', type: 'string', required: false, desc: '"unidade" ou "par"' },
                      { name: 'quantity', type: 'number', required: false, desc: 'Quantidade (default: 1)' },
                      { name: 'unit_price', type: 'number', required: false, desc: 'Preço unitário' },
                      { name: 'total_price', type: 'number', required: false, desc: 'Preço total' },
                      { name: 'payment_method', type: 'string', required: false, desc: 'Método de pagamento (pix, cartão)' },
                      { name: 'delivery_method', type: 'string', required: false, desc: 'Método de entrega (retirada, envio)' },
                      { name: 'delivery_address', type: 'string', required: false, desc: 'Endereço de entrega' },
                      { name: 'notes', type: 'string', required: false, desc: 'Observações' },
                      { name: 'summary_text', type: 'string', required: true, desc: 'Resumo do pedido para atendente' },
                    ].map((param) => (
                      <div key={param.name} className="flex items-start gap-4 p-3 bg-muted/50 rounded-lg">
                        <code className="text-sm font-mono bg-background px-2 py-1 rounded">{param.name}</code>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={param.required ? 'default' : 'secondary'} className="text-xs">
                              {param.required ? 'obrigatório' : 'opcional'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{param.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{param.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Exemplo de Requisição</h4>
                  <CodeBlock
                    id="orders-request"
                    code={`{
  "phone": "5592999999999",
  "session_id": "uuid-da-sessao",
  "selected_sku": "E0612040",
  "selected_name": "Abaulada Diamantada Dourada 3mm",
  "selected_size_1": "36",
  "unit_or_pair": "unidade",
  "unit_price": 419,
  "total_price": 419,
  "payment_method": "pix",
  "delivery_method": "retirada",
  "summary_text": "Pedido pendente: SKU E0612040 (Abaulada), tam 36, unidade, Pix, retirada. Próximo: confirmar estoque e enviar link."
}`}
                  />
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Resposta de Sucesso</h4>
                  <CodeBlock
                    id="orders-response"
                    code={`{
  "success": true,
  "order_id": "uuid-do-pedido",
  "status": "pending_human"
}`}
                  />
                </div>

                <Card className="bg-muted/30 border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Regra de UPSERT</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Se existir um pedido com <code>status='pending'</code> para o mesmo telefone criado nas últimas 6 horas, 
                    ele será atualizado. Caso contrário, um novo pedido será criado.
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">GET</Badge>
                  <CardTitle className="text-lg font-mono">/orders-pending</CardTitle>
                </div>
                <CardDescription>
                  Lista pedidos por status (para página de pendentes)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">URL</h4>
                  <CodeBlock code={`${BASE_URL}/orders-pending?status=pending`} id="orders-list-url" />
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Parâmetros (Query String)</h4>
                  <div className="space-y-3">
                    {[
                      { name: 'status', type: 'string', required: false, desc: 'Filtrar por status: pending, in_progress, done, canceled' },
                      { name: 'phone', type: 'string', required: false, desc: 'Filtrar por telefone' },
                    ].map((param) => (
                      <div key={param.name} className="flex items-start gap-4 p-3 bg-muted/50 rounded-lg">
                        <code className="text-sm font-mono bg-background px-2 py-1 rounded">{param.name}</code>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">opcional</Badge>
                            <Badge variant="outline" className="text-xs">{param.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{param.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Resposta de Sucesso</h4>
                  <CodeBlock
                    id="orders-list-response"
                    code={`{
  "success": true,
  "orders": [
    {
      "id": "uuid",
      "customer_phone": "5592999999999",
      "status": "pending",
      "summary_text": "Pedido pendente: SKU X...",
      "created_at": "2024-01-15T10:30:00Z",
      "assigned_to": null
    }
  ]
}`}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">GET</Badge>
                  <CardTitle className="text-lg font-mono">/order-detail</CardTitle>
                </div>
                <CardDescription>
                  Retorna detalhes completos de um pedido, incluindo itens do catálogo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">URL</h4>
                  <CodeBlock code={`${BASE_URL}/order-detail?id=uuid-do-pedido`} id="order-detail-url" />
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Resposta de Sucesso</h4>
                  <CodeBlock
                    id="order-detail-response"
                    code={`{
  "success": true,
  "order": {
    "id": "uuid",
    "customer_phone": "5592999999999",
    "status": "pending",
    "selected_sku": "E0612040",
    "selected_name": "Abaulada Diamantada Dourada",
    "selected_size_1": "36",
    "unit_or_pair": "unidade",
    "payment_method": "pix",
    "delivery_method": "retirada",
    "summary_text": "...",
    "created_at": "..."
  },
  "session": {
    "id": "uuid-sessao",
    "line": "tungstenio",
    "intent": "aliancas"
  },
  "catalog_items": [
    {
      "position": 1,
      "sku": "E0612040",
      "name": "Abaulada Diamantada",
      "media_type": "image",
      "media_url": "https://..."
    }
  ]
}`}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="send" className="space-y-6">
            {/* Send Message API */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">POST</Badge>
                  <CardTitle className="text-lg font-mono">/automation-send</CardTitle>
                </div>
                <CardDescription>
                  Envia mensagens para clientes via automação (salva no CRM e encaminha para webhook)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">URL</h4>
                  <CodeBlock code={`${BASE_URL}/automation-send`} id="send-url" />
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Corpo da Requisição (JSON)</h4>
                  <div className="space-y-3">
                    {[
                      { name: 'phone', type: 'string', required: true, desc: 'Número do telefone (com código do país)', example: '"5511999999999"' },
                      { name: 'message', type: 'string', required: false, desc: 'Conteúdo da mensagem', example: '"Olá! Segue o catálogo..."' },
                      { name: 'platform', type: 'string', required: false, desc: 'Plataforma: "whatsapp" ou "instagram"', example: '"whatsapp"' },
                      { name: 'message_type', type: 'string', required: false, desc: 'Tipo: "text", "image", "audio", "video", "document"', example: '"image"' },
                      { name: 'media_url', type: 'string', required: false, desc: 'URL da mídia (para imagem, áudio, vídeo, documento)', example: '"https://..."' },
                      { name: 'conversation_id', type: 'uuid', required: false, desc: 'ID da conversa (opcional, resolve automaticamente pelo telefone)', example: '"uuid..."' },
                    ].map((param) => (
                      <div key={param.name} className="flex items-start gap-4 p-3 bg-muted/50 rounded-lg">
                        <code className="text-sm font-mono bg-background px-2 py-1 rounded">{param.name}</code>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={param.required ? 'default' : 'secondary'} className="text-xs">
                              {param.required ? 'obrigatório' : 'opcional'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{param.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{param.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Exemplo: Enviar Texto</h4>
                  <CodeBlock
                    id="send-text"
                    code={`{
  "phone": "5511999999999",
  "message": "Olá! Temos novidades no catálogo 🛍️",
  "platform": "whatsapp"
}`}
                  />
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Exemplo: Enviar Imagem do Catálogo</h4>
                  <CodeBlock
                    id="send-image"
                    code={`{
  "phone": "5511999999999",
  "message": "Confira nossa Camiseta Básica! R$ 59,90",
  "message_type": "image",
  "media_url": "https://url-da-imagem-do-produto.jpg",
  "platform": "whatsapp"
}`}
                  />
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Resposta de Sucesso</h4>
                  <CodeBlock
                    id="send-response"
                    code={`{
  "success": true,
  "message_id": "uuid-da-mensagem",
  "forwarded": true
}`}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Webhook Incoming */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">POST</Badge>
                  <CardTitle className="text-lg font-mono">/automation-webhook</CardTitle>
                </div>
                <CardDescription>
                  Recebe mensagens de clientes da sua automação (Fiqon/ZAPI)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">URL (configure na sua automação)</h4>
                  <CodeBlock code={`${BASE_URL}/automation-webhook`} id="webhook-url" />
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Payload Esperado</h4>
                  <CodeBlock
                    id="webhook-payload"
                    code={`{
  "platform": "whatsapp",
  "contact_number": "5511999999999",
  "contact_name": "João Silva",
  "message": "Quero ver o catálogo",
  "message_type": "text",
  "media_url": null,
  "fromMe": false
}`}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Integration Tips */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Code className="w-5 h-5" />
              Dicas de Integração
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-semibold">Fiqon / n8n / Make</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Use um nó HTTP Request para chamar a API do catálogo</li>
                <li>Parse o JSON de resposta para extrair os produtos</li>
                <li>Monte a mensagem com os dados do produto (nome, preço, imagem)</li>
                <li>Envie via automation-send ou diretamente pela sua integração de WhatsApp</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Fluxo Típico</h4>
              <div className="bg-background p-4 rounded-lg font-mono text-xs">
                Cliente pergunta → Webhook recebe → Busca catálogo → Monta resposta → Envia via API
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button variant="outline" asChild>
            <a href="/webhook-tester" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Testar API
            </a>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ApiDocs;
