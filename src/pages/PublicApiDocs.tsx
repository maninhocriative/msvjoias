import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Database, Send, ShoppingCart, Layers, MessageSquare, Package } from 'lucide-react';

const BASE_URL = 'https://ahbjwpkpxqqrpvpzmqwa.functions.supabase.co';

const PublicApiDocs = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const CodeBlock = ({ code, id }: { code: string; id: string }) => (
    <div className="relative group">
      <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-white"
        onClick={() => copyToClipboard(code, id)}
      >
        {copiedId === id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="border-b border-zinc-800 pb-6">
          <h1 className="text-4xl font-bold text-white mb-2">📚 API Documentation</h1>
          <p className="text-zinc-400 text-lg">
            Documentação completa das APIs do CRM Acium para integração com automações (FiqOn, n8n, Make, Zapier)
          </p>
          <div className="mt-4 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
            <p className="text-sm text-zinc-300">
              <strong>Base URL:</strong> <code className="bg-zinc-800 px-2 py-1 rounded">{BASE_URL}</code>
            </p>
          </div>
        </div>

        {/* Table of Contents */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">📋 Índice de APIs</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-zinc-300 flex items-center gap-2"><Database className="w-4 h-4" /> Catálogo de Produtos</h4>
              <ul className="text-sm text-zinc-400 space-y-1 ml-6">
                <li>• GET /catalog-api - Buscar produtos</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-zinc-300 flex items-center gap-2"><Layers className="w-4 h-4" /> Sessões de Catálogo</h4>
              <ul className="text-sm text-zinc-400 space-y-1 ml-6">
                <li>• POST /catalog-session - Criar sessão</li>
                <li>• POST /catalog-item - Registrar item enviado</li>
                <li>• GET /catalog-latest - Buscar sessão ativa</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-zinc-300 flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Pedidos</h4>
              <ul className="text-sm text-zinc-400 space-y-1 ml-6">
                <li>• POST /orders-pending - Criar/atualizar pedido</li>
                <li>• GET /orders-pending - Listar pedidos</li>
                <li>• GET /order-detail - Detalhe do pedido</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-zinc-300 flex items-center gap-2"><Send className="w-4 h-4" /> Mensagens</h4>
              <ul className="text-sm text-zinc-400 space-y-1 ml-6">
                <li>• POST /automation-send - Enviar mensagem</li>
                <li>• POST /automation-webhook - Receber mensagem</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* ==================== CATALOG API ==================== */}
        <div id="catalog-api">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <Database className="w-6 h-6" /> 1. Catálogo de Produtos
          </h2>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-600">GET</Badge>
                <CardTitle className="text-lg font-mono text-white">/catalog-api</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Retorna produtos do catálogo com fotos, vídeos, preços e estoque
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2 text-white">URL Completa</h4>
                <CodeBlock code={`${BASE_URL}/catalog-api`} id="catalog-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-white">Parâmetros (Query String)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left p-2 text-zinc-300">Parâmetro</th>
                        <th className="text-left p-2 text-zinc-300">Tipo</th>
                        <th className="text-left p-2 text-zinc-300">Descrição</th>
                        <th className="text-left p-2 text-zinc-300">Exemplo</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-400">
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>sku</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">Busca produto pelo SKU exato</td>
                        <td className="p-2"><code>?sku=CAM-001</code></td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>product_id</code></td>
                        <td className="p-2">uuid</td>
                        <td className="p-2">Busca produto pelo ID</td>
                        <td className="p-2"><code>?product_id=abc-123</code></td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>category</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">Filtra por categoria (busca parcial)</td>
                        <td className="p-2"><code>?category=Camisetas</code></td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>search</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">Busca em nome, descrição e SKU</td>
                        <td className="p-2"><code>?search=branco</code></td>
                      </tr>
                      <tr>
                        <td className="p-2"><code>only_available</code></td>
                        <td className="p-2">boolean</td>
                        <td className="p-2">Retorna apenas produtos com estoque</td>
                        <td className="p-2"><code>?only_available=true</code></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Exemplo de Requisição (cURL)</h4>
                <CodeBlock
                  id="catalog-curl"
                  code={`curl -X GET "${BASE_URL}/catalog-api?category=Aliancas&only_available=true"`}
                />
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Resposta de Sucesso (Lista)</h4>
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
      "description": "Aliança em ouro 18k",
      "price": 419.00,
      "price_formatted": "R$ 419,00",
      "category": "Aliancas",
      "image_url": "https://...",
      "video_url": "https://...",
      "images": ["https://foto1.jpg", "https://foto2.jpg"],
      "all_media": [
        { "type": "image", "url": "https://...", "is_main": true },
        { "type": "video", "url": "https://..." }
      ],
      "total_stock": 25,
      "available": true,
      "sizes": [
        { "size": "36", "stock": 10 },
        { "size": "38", "stock": 15 }
      ],
      "all_sizes": [
        { "size": "36", "stock": 10, "available": true },
        { "size": "38", "stock": 15, "available": true },
        { "size": "40", "stock": 0, "available": false }
      ]
    }
  ]
}`}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ==================== CATALOG SESSIONS ==================== */}
        <div id="catalog-sessions">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <Layers className="w-6 h-6" /> 2. Sessões de Catálogo
          </h2>
          <p className="text-zinc-400 mb-4">
            Rastreia quais produtos foram enviados ao cliente via WhatsApp. Permite interpretar referências como "o segundo", "o do vídeo".
          </p>

          {/* POST /catalog-session */}
          <Card className="bg-zinc-900 border-zinc-800 mb-4">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge className="bg-blue-600">POST</Badge>
                <CardTitle className="text-lg font-mono text-white">/catalog-session</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Cria uma nova sessão de catálogo ao iniciar envio de produtos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2 text-white">URL</h4>
                <CodeBlock code={`${BASE_URL}/catalog-session`} id="session-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-white">Corpo da Requisição (JSON)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left p-2 text-zinc-300">Campo</th>
                        <th className="text-left p-2 text-zinc-300">Tipo</th>
                        <th className="text-left p-2 text-zinc-300">Obrigatório</th>
                        <th className="text-left p-2 text-zinc-300">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-400">
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>phone</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">Telefone E.164 sem + (ex: 5592999999999)</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>line</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">Linha do catálogo (ex: tungstenio, oui)</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>intent</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Intenção do cliente (ex: aliancas, anel)</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>preferred_color</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Cor preferida (ex: dourada, prata)</td>
                      </tr>
                      <tr>
                        <td className="p-2"><code>budget_max</code></td>
                        <td className="p-2">number</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Orçamento máximo do cliente</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Exemplo de Requisição</h4>
                <CodeBlock
                  id="session-request"
                  code={`curl -X POST "${BASE_URL}/catalog-session" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "5592999999999",
    "line": "tungstenio",
    "intent": "aliancas",
    "preferred_color": "dourada",
    "budget_max": 500
  }'`}
                />
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Resposta de Sucesso</h4>
                <CodeBlock
                  id="session-response"
                  code={`{
  "success": true,
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}`}
                />
              </div>
            </CardContent>
          </Card>

          {/* POST /catalog-item */}
          <Card className="bg-zinc-900 border-zinc-800 mb-4">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge className="bg-blue-600">POST</Badge>
                <CardTitle className="text-lg font-mono text-white">/catalog-item</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Registra um item enviado dentro da sessão (chamar para cada produto enviado)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2 text-white">URL</h4>
                <CodeBlock code={`${BASE_URL}/catalog-item`} id="item-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-white">Corpo da Requisição (JSON)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left p-2 text-zinc-300">Campo</th>
                        <th className="text-left p-2 text-zinc-300">Tipo</th>
                        <th className="text-left p-2 text-zinc-300">Obrigatório</th>
                        <th className="text-left p-2 text-zinc-300">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-400">
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>session_id</code></td>
                        <td className="p-2">uuid</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">ID retornado pelo /catalog-session</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>position</code></td>
                        <td className="p-2">number</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">Posição do item (1, 2, 3...)</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>sku</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">Código SKU do produto</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>name</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">Nome do produto</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>media_type</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">"image" ou "video"</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>media_url</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">URL da mídia enviada ao cliente</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>price</code></td>
                        <td className="p-2">number</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Preço do produto</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>price_formatted</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Preço formatado (R$ 419,00)</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>sizes</code></td>
                        <td className="p-2">array</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Array de tamanhos ["36", "38"]</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>image_url</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">URL da imagem principal</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>video_url</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">URL do vídeo</td>
                      </tr>
                      <tr>
                        <td className="p-2"><code>stock_total</code></td>
                        <td className="p-2">number</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Estoque total disponível</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Exemplo de Requisição</h4>
                <CodeBlock
                  id="item-request"
                  code={`curl -X POST "${BASE_URL}/catalog-item" \\
  -H "Content-Type: application/json" \\
  -d '{
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "position": 1,
    "sku": "E0612040",
    "name": "Abaulada Diamantada Dourada 3mm",
    "price": 419,
    "price_formatted": "R$ 419,00",
    "sizes": ["36", "38"],
    "image_url": "https://exemplo.com/foto.jpg",
    "media_type": "image",
    "media_url": "https://exemplo.com/foto.jpg",
    "stock_total": 15
  }'`}
                />
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Resposta de Sucesso</h4>
                <CodeBlock id="item-response" code={`{ "success": true }`} />
              </div>
            </CardContent>
          </Card>

          {/* GET /catalog-latest */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-600">GET</Badge>
                <CardTitle className="text-lg font-mono text-white">/catalog-latest</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Retorna a sessão ativa mais recente e seus itens (para interpretar "o segundo", "o do vídeo")
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2 text-white">URL</h4>
                <CodeBlock code={`${BASE_URL}/catalog-latest?phone=5592999999999&line=tungstenio`} id="latest-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-white">Parâmetros (Query String)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left p-2 text-zinc-300">Parâmetro</th>
                        <th className="text-left p-2 text-zinc-300">Tipo</th>
                        <th className="text-left p-2 text-zinc-300">Obrigatório</th>
                        <th className="text-left p-2 text-zinc-300">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-400">
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>phone</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">Telefone E.164 sem +</td>
                      </tr>
                      <tr>
                        <td className="p-2"><code>line</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">Linha do catálogo</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Exemplo de Requisição</h4>
                <CodeBlock
                  id="latest-curl"
                  code={`curl -X GET "${BASE_URL}/catalog-latest?phone=5592999999999&line=tungstenio"`}
                />
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Resposta de Sucesso</h4>
                <CodeBlock
                  id="latest-response"
                  code={`{
  "success": true,
  "session": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "phone": "5592999999999",
    "line": "tungstenio",
    "intent": "aliancas",
    "preferred_color": "dourada",
    "budget_max": 500,
    "created_at": "2024-01-15T10:30:00Z"
  },
  "items": [
    {
      "position": 1,
      "sku": "E0612040",
      "name": "Abaulada Diamantada Dourada 3mm",
      "media_type": "image",
      "media_url": "https://exemplo.com/foto1.jpg",
      "sizes": ["36", "38"],
      "price": 419,
      "price_formatted": "R$ 419,00"
    },
    {
      "position": 2,
      "sku": "E0612041",
      "name": "Reta Polida Prata 4mm",
      "media_type": "video",
      "media_url": "https://exemplo.com/video.mp4",
      "sizes": ["36", "40"],
      "price": 350,
      "price_formatted": "R$ 350,00"
    }
  ]
}`}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ==================== ORDERS API ==================== */}
        <div id="orders-api">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6" /> 3. Pedidos Pendentes
          </h2>
          <p className="text-zinc-400 mb-4">
            Gerencia pedidos que estão quase fechando. Quando o cliente escolhe produto, tamanho e forma de pagamento, cria-se um pedido pendente para o atendente humano finalizar.
          </p>

          {/* POST /orders-pending */}
          <Card className="bg-zinc-900 border-zinc-800 mb-4">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge className="bg-blue-600">POST</Badge>
                <CardTitle className="text-lg font-mono text-white">/orders-pending</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Cria ou atualiza um pedido pendente (UPSERT: se existir pedido nas últimas 6h, atualiza)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2 text-white">URL</h4>
                <CodeBlock code={`${BASE_URL}/orders-pending`} id="orders-post-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-white">Corpo da Requisição (JSON)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left p-2 text-zinc-300">Campo</th>
                        <th className="text-left p-2 text-zinc-300">Tipo</th>
                        <th className="text-left p-2 text-zinc-300">Obrigatório</th>
                        <th className="text-left p-2 text-zinc-300">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-400">
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>phone</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">Telefone E.164 sem +</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>summary_text</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">Resumo do pedido para atendente</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>session_id</code></td>
                        <td className="p-2">uuid</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">ID da sessão de catálogo</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>selected_sku</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">SKU do produto escolhido</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>selected_name</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Nome do produto escolhido</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>selected_size_1</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Tamanho 1 (ex: "18")</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>selected_size_2</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Tamanho 2 para par (ex: "20")</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>unit_or_pair</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">"unidade" ou "par"</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>quantity</code></td>
                        <td className="p-2">number</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Quantidade (default: 1)</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>unit_price</code></td>
                        <td className="p-2">number</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Preço unitário</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>total_price</code></td>
                        <td className="p-2">number</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Preço total</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>payment_method</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Método de pagamento (pix, cartão)</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>delivery_method</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Método de entrega (retirada, envio)</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>delivery_address</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Endereço de entrega</td>
                      </tr>
                      <tr>
                        <td className="p-2"><code>notes</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Observações</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Exemplo de Requisição</h4>
                <CodeBlock
                  id="orders-post-request"
                  code={`curl -X POST "${BASE_URL}/orders-pending" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "5592999999999",
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "selected_sku": "E0612040",
    "selected_name": "Abaulada Diamantada Dourada 3mm",
    "selected_size_1": "36",
    "unit_or_pair": "unidade",
    "unit_price": 419,
    "total_price": 419,
    "payment_method": "pix",
    "delivery_method": "retirada",
    "summary_text": "Pedido pendente: SKU E0612040 (Abaulada Diamantada), tam 36, unidade, Pix, retirada. Próximo: confirmar estoque e enviar link."
  }'`}
                />
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Resposta de Sucesso</h4>
                <CodeBlock
                  id="orders-post-response"
                  code={`{
  "success": true,
  "order_id": "xyz-789-order-id",
  "status": "pending"
}`}
                />
              </div>

              <div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700">
                <h4 className="font-semibold text-amber-400 mb-2">⚠️ Regra de UPSERT</h4>
                <p className="text-sm text-zinc-300">
                  Se existir um pedido com <code>status='pending'</code> para o mesmo telefone criado nas últimas 6 horas, ele será <strong>atualizado</strong>. Caso contrário, um novo pedido será criado.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* GET /orders-pending */}
          <Card className="bg-zinc-900 border-zinc-800 mb-4">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-600">GET</Badge>
                <CardTitle className="text-lg font-mono text-white">/orders-pending</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Lista pedidos por status (para página de pendentes no CRM)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2 text-white">URL</h4>
                <CodeBlock code={`${BASE_URL}/orders-pending?status=pending`} id="orders-get-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-white">Parâmetros (Query String)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left p-2 text-zinc-300">Parâmetro</th>
                        <th className="text-left p-2 text-zinc-300">Tipo</th>
                        <th className="text-left p-2 text-zinc-300">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-400">
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>status</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">Filtrar: pending, in_progress, done, canceled</td>
                      </tr>
                      <tr>
                        <td className="p-2"><code>phone</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">Filtrar por telefone</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Resposta de Sucesso</h4>
                <CodeBlock
                  id="orders-get-response"
                  code={`{
  "success": true,
  "orders": [
    {
      "id": "xyz-789-order-id",
      "customer_phone": "5592999999999",
      "status": "pending",
      "selected_sku": "E0612040",
      "selected_name": "Abaulada Diamantada",
      "summary_text": "Pedido pendente: SKU E0612040...",
      "created_at": "2024-01-15T10:30:00Z",
      "assigned_to": null
    }
  ]
}`}
                />
              </div>
            </CardContent>
          </Card>

          {/* GET /order-detail */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge className="bg-green-600">GET</Badge>
                <CardTitle className="text-lg font-mono text-white">/order-detail</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Retorna detalhes completos de um pedido, incluindo itens do catálogo enviados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2 text-white">URL</h4>
                <CodeBlock code={`${BASE_URL}/order-detail?id=xyz-789-order-id`} id="order-detail-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Resposta de Sucesso</h4>
                <CodeBlock
                  id="order-detail-response"
                  code={`{
  "success": true,
  "order": {
    "id": "xyz-789-order-id",
    "customer_phone": "5592999999999",
    "status": "pending",
    "selected_sku": "E0612040",
    "selected_name": "Abaulada Diamantada Dourada",
    "selected_size_1": "36",
    "selected_size_2": null,
    "unit_or_pair": "unidade",
    "quantity": 1,
    "unit_price": 419,
    "total_price": 419,
    "payment_method": "pix",
    "delivery_method": "retirada",
    "delivery_address": null,
    "notes": null,
    "summary_text": "Pedido pendente: SKU E0612040...",
    "assigned_to": null,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:35:00Z"
  },
  "session": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "line": "tungstenio",
    "intent": "aliancas",
    "preferred_color": "dourada",
    "budget_max": 500
  },
  "catalog_items": [
    {
      "position": 1,
      "sku": "E0612040",
      "name": "Abaulada Diamantada Dourada 3mm",
      "media_type": "image",
      "media_url": "https://exemplo.com/foto1.jpg",
      "price_formatted": "R$ 419,00"
    },
    {
      "position": 2,
      "sku": "E0612041",
      "name": "Reta Polida Prata 4mm",
      "media_type": "video",
      "media_url": "https://exemplo.com/video.mp4",
      "price_formatted": "R$ 350,00"
    }
  ]
}`}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ==================== MESSAGING API ==================== */}
        <div id="messaging-api">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <MessageSquare className="w-6 h-6" /> 4. Mensagens (WhatsApp/Instagram)
          </h2>

          {/* POST /automation-send */}
          <Card className="bg-zinc-900 border-zinc-800 mb-4">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge className="bg-blue-600">POST</Badge>
                <CardTitle className="text-lg font-mono text-white">/automation-send</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Envia mensagens para clientes (salva no CRM e encaminha para Z-API)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2 text-white">URL</h4>
                <CodeBlock code={`${BASE_URL}/automation-send`} id="send-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-white">Corpo da Requisição (JSON)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left p-2 text-zinc-300">Campo</th>
                        <th className="text-left p-2 text-zinc-300">Tipo</th>
                        <th className="text-left p-2 text-zinc-300">Obrigatório</th>
                        <th className="text-left p-2 text-zinc-300">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-400">
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>phone</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">✅ Sim</td>
                        <td className="p-2">Número com código do país (5511999999999)</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>message</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">Conteúdo da mensagem</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>platform</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">"whatsapp" ou "instagram"</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>message_type</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">"text", "image", "audio", "video", "document"</td>
                      </tr>
                      <tr className="border-b border-zinc-800">
                        <td className="p-2"><code>media_url</code></td>
                        <td className="p-2">string</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">URL da mídia (para imagem, áudio, vídeo)</td>
                      </tr>
                      <tr>
                        <td className="p-2"><code>conversation_id</code></td>
                        <td className="p-2">uuid</td>
                        <td className="p-2">❌ Não</td>
                        <td className="p-2">ID da conversa (resolve automaticamente pelo phone)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Exemplo: Enviar Texto</h4>
                <CodeBlock
                  id="send-text"
                  code={`curl -X POST "${BASE_URL}/automation-send" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "5511999999999",
    "message": "Olá! Segue o catálogo solicitado 🛍️",
    "platform": "whatsapp"
  }'`}
                />
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Exemplo: Enviar Imagem com Legenda</h4>
                <CodeBlock
                  id="send-image"
                  code={`curl -X POST "${BASE_URL}/automation-send" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "5511999999999",
    "message": "Aliança Abaulada Diamantada - R$ 419,00",
    "message_type": "image",
    "media_url": "https://exemplo.com/produto.jpg",
    "platform": "whatsapp"
  }'`}
                />
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Resposta de Sucesso</h4>
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

          {/* POST /automation-webhook */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge className="bg-purple-600">POST</Badge>
                <CardTitle className="text-lg font-mono text-white">/automation-webhook</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Recebe mensagens de clientes (configure na sua automação Z-API/FiqOn)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2 text-white">URL (configure no Z-API/FiqOn)</h4>
                <CodeBlock code={`${BASE_URL}/automation-webhook`} id="webhook-url" />
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-white">Payload Esperado</h4>
                <CodeBlock
                  id="webhook-payload"
                  code={`{
  "platform": "whatsapp",
  "contact_number": "5511999999999",
  "contact_name": "João Silva",
  "message": "Quero ver aliança dourada até R$ 500",
  "message_type": "text",
  "media_url": null,
  "fromMe": false
}`}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ==================== WORKFLOW EXAMPLE ==================== */}
        <div id="workflow">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <Package className="w-6 h-6" /> 5. Fluxo Completo de Automação
          </h2>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Exemplo de Fluxo FiqOn/n8n</CardTitle>
              <CardDescription className="text-zinc-400">
                Como usar as APIs em sequência para atendimento automatizado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="p-4 bg-zinc-800 rounded-lg border-l-4 border-blue-500">
                  <h4 className="font-semibold text-blue-400 mb-2">1️⃣ Cliente envia mensagem</h4>
                  <p className="text-sm text-zinc-300">
                    <code>/automation-webhook</code> recebe: "Quero ver aliança dourada até R$ 500"
                  </p>
                </div>

                <div className="p-4 bg-zinc-800 rounded-lg border-l-4 border-green-500">
                  <h4 className="font-semibold text-green-400 mb-2">2️⃣ Buscar produtos</h4>
                  <p className="text-sm text-zinc-300">
                    <code>GET /catalog-api?category=Aliancas&only_available=true</code>
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Filtra por cor dourada e preço ≤ 500 na automação</p>
                </div>

                <div className="p-4 bg-zinc-800 rounded-lg border-l-4 border-yellow-500">
                  <h4 className="font-semibold text-yellow-400 mb-2">3️⃣ Criar sessão de catálogo</h4>
                  <p className="text-sm text-zinc-300">
                    <code>POST /catalog-session</code> com phone, line, intent, preferred_color, budget_max
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Salva session_id para usar nos próximos passos</p>
                </div>

                <div className="p-4 bg-zinc-800 rounded-lg border-l-4 border-orange-500">
                  <h4 className="font-semibold text-orange-400 mb-2">4️⃣ Enviar produtos (For Each)</h4>
                  <p className="text-sm text-zinc-300">
                    Para cada produto (máx 5):
                  </p>
                  <ul className="text-xs text-zinc-400 mt-2 space-y-1 ml-4">
                    <li>• <code>POST /automation-send</code> com imagem/vídeo + legenda</li>
                    <li>• <code>POST /catalog-item</code> com session_id e position (1, 2, 3...)</li>
                  </ul>
                </div>

                <div className="p-4 bg-zinc-800 rounded-lg border-l-4 border-purple-500">
                  <h4 className="font-semibold text-purple-400 mb-2">5️⃣ Cliente responde "quero o segundo"</h4>
                  <p className="text-sm text-zinc-300">
                    <code>GET /catalog-latest?phone=...&line=...</code>
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Retorna items[1] (position=2) para identificar o produto</p>
                </div>

                <div className="p-4 bg-zinc-800 rounded-lg border-l-4 border-pink-500">
                  <h4 className="font-semibold text-pink-400 mb-2">6️⃣ Cliente quase fechando</h4>
                  <p className="text-sm text-zinc-300">
                    Quando tiver: SKU + tamanho + (pagamento OU entrega)
                  </p>
                  <p className="text-sm text-zinc-300 mt-2">
                    <code>POST /orders-pending</code> com resumo completo
                  </p>
                </div>

                <div className="p-4 bg-zinc-800 rounded-lg border-l-4 border-emerald-500">
                  <h4 className="font-semibold text-emerald-400 mb-2">7️⃣ Atendente humano finaliza</h4>
                  <p className="text-sm text-zinc-300">
                    CRM mostra pedido em /pedidos/pendentes → confirma estoque → envia link de pagamento
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 pt-6 text-center text-zinc-500 text-sm">
          <p>Acium CRM API Documentation v1.0</p>
          <p className="mt-1">Base URL: <code className="bg-zinc-800 px-2 py-1 rounded">{BASE_URL}</code></p>
        </div>
      </div>
    </div>
  );
};

export default PublicApiDocs;
