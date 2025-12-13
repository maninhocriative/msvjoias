import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, ExternalLink, Code, Send, Database, Image, Video } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/layout/Header';

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
      <Header />
      <main className="pt-16 p-6 max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Documentação da API</h1>
          <p className="text-muted-foreground mt-2">
            Integre seu catálogo com automações externas (Fiqon, n8n, Make, Zapier)
          </p>
        </div>

        <Tabs defaultValue="catalog" className="space-y-6">
          <TabsList>
            <TabsTrigger value="catalog" className="gap-2">
              <Database className="w-4 h-4" />
              Catálogo
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
                      { name: 'category', type: 'string', desc: 'Filtra por categoria (busca parcial)', example: '?category=Camisetas' },
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
