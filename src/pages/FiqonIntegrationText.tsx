import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, ArrowLeft, Bot, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const FIQON_INTEGRATION_TEXT = `# INTEGRAÇÃO FIQON + ALINE (IA) - GUIA COMPLETO

## VISÃO GERAL DO FLUXO

O fluxo de automação FiqOn integra com a IA Aline para atendimento via WhatsApp:

1. WEBHOOK recebe mensagem do WhatsApp
2. JS identifica se é anúncio ou mensagem normal
3. HTTP REQUEST chama a Aline (ai-chat)
4. FILTRO verifica se tem catálogo para enviar
5. FOR EACH itera produtos e envia via Z-API
6. FILTROS adicionais para finalização de venda

---

## CONFIGURAÇÃO DOS NÓS

### 1. WEBHOOK - Receber Mensagem
**Campos que chegam:**
- phone: número do cliente
- message: texto da mensagem
- senderName: nome do contato
- isAd: true/false se veio de anúncio

---

### 2. JS - IDENTIFICAR ORIGEM

\`\`\`javascript
// Extrair dados do webhook
const phone = $input.first().json.phone || $input.first().json.from;
const message = $input.first().json.message || $input.first().json.text || "";
const senderName = $input.first().json.senderName || $input.first().json.pushName || "";
const isAd = $input.first().json.isAd === true || $input.first().json.isAd === "true";

// Limpar telefone (remover + e espaços)
const cleanPhone = phone.replace(/[^0-9]/g, "");

return {
  phone: cleanPhone,
  message: message,
  senderName: senderName,
  isAd: isAd,
  rota: isAd ? "anuncio" : "normal"
};
\`\`\`

---

### 3. FILTRO - ANÚNCIO VS NORMAL

**Condição:**
\`{{$json.isAd}} == true\`

- **TRUE (Anúncio)**: Vai para fluxo de boas-vindas de anúncio
- **FALSE (Normal)**: Vai para chamar a Aline

---

### 4. HTTP REQUEST - CHAMAR ALINE (ai-chat)

**Configuração:**
- **Method**: POST
- **URL**: \`https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/ai-chat\`
- **Headers**:
  - Content-Type: application/json
  - Authorization: Bearer {{SUA_ANON_KEY}}

**Body (JSON):**
\`\`\`json
{
  "phone": "{{$json.phone}}",
  "message": "{{$json.message}}",
  "contact_name": "{{$json.senderName}}"
}
\`\`\`

**Resposta da Aline:**
\`\`\`json
{
  "mensagem_whatsapp": "Texto limpo para enviar ao cliente",
  "tem_produtos": true,
  "produtos": [
    {
      "position": 1,
      "sku": "E0612040",
      "name": "Aliança Abaulada Dourada 3mm",
      "media_url": "https://...",
      "media_type": "video",
      "image_url": "https://...",
      "video_url": "https://...",
      "caption": "✨ 1. Aliança Abaulada Dourada 3mm\\n💰 R$ 419,00\\n📏 Tamanhos: 16, 17, 18..."
    }
  ],
  "filtros": {
    "intencao": "comprar",
    "categoria": "aliancas",
    "cor": "dourada",
    "tipo_alianca": "namoro",
    "enviar_catalogo": true,
    "finalizar_venda": false,
    "transferir_humano": false,
    "acao_sugerida": "enviar_catalogo"
  },
  "produto_selecionado": {
    "sku": "E0612040",
    "name": "Aliança Abaulada",
    "price": 419.00,
    "position": 1
  },
  "crm": {
    "entrega": "envio",
    "pagamento": "pix"
  },
  "memoria": {
    "phone": "5592999999999",
    "stage": "catalogo_enviado",
    "categoria": "aliancas",
    "cor": "dourada",
    "tipo_alianca": "namoro"
  }
}
\`\`\`

---

### 5. FILTRO - TEM CATÁLOGO?

**Condição:**
\`{{$json.tem_produtos}} == true\`

- **TRUE**: Vai para enviar texto + FOR EACH de produtos
- **FALSE**: Apenas envia a mensagem de texto

---

### 6. Z-API - ENVIAR TEXTO (Sem catálogo)

**Configuração:**
- **Phone**: \`{{$json.memoria.phone}}\`
- **Message**: \`{{$json.mensagem_whatsapp}}\`

---

### 7. FOR EACH - ITERAR PRODUTOS

**Configuração:**
- **Items**: \`{{$json.produtos}}\`

Dentro do loop, cada item terá:
- \`{{$json.produto.sku}}\`
- \`{{$json.produto.name}}\`
- \`{{$json.produto.media_url}}\`
- \`{{$json.produto.media_type}}\`
- \`{{$json.produto.image_url}}\`
- \`{{$json.produto.video_url}}\`
- \`{{$json.produto.caption}}\`

---

### 8. JS - PREPARAR MÍDIA (Dentro do For Each)

\`\`\`javascript
const produto = $input.first().json;
const phone = $input.first().json.phone || $("Chamar Aline").first().json.memoria.phone;

return {
  phone: phone,
  mediaType: produto.media_type,
  mediaUrl: produto.media_url,
  caption: produto.caption,
  imageUrl: produto.image_url,
  videoUrl: produto.video_url,
  hasVideo: produto.media_type === "video" && produto.video_url
};
\`\`\`

---

### 9. FILTRO - VÍDEO OU IMAGEM?

**Condição:**
\`{{$json.hasVideo}} == true\`

- **TRUE**: Vai para Z-API Enviar Vídeo
- **FALSE**: Vai para Z-API Enviar Imagem

---

### 10. Z-API - ENVIAR IMAGEM

**Configuração:**
- **Phone**: \`{{$json.phone}}\`
- **Image URL**: \`{{$json.imageUrl}}\`
- **Caption**: \`{{$json.caption}}\`

---

### 11. Z-API - ENVIAR VÍDEO

**Configuração:**
- **Phone**: \`{{$json.phone}}\`
- **Video URL**: \`{{$json.videoUrl}}\`
- **Caption**: \`{{$json.caption}}\`

---

### 12. FILTRO - FINALIZAR VENDA?

**Condição:**
\`{{$json.filtros.finalizar_venda}} == true\`

- **TRUE**: Vai para fluxo de criação de pedido
- **FALSE**: Continua no fluxo normal

---

### 13. FILTRO - TRANSFERIR HUMANO?

**Condição:**
\`{{$json.filtros.transferir_humano}} == true\`

- **TRUE**: Notifica atendente humano
- **FALSE**: Continua automação

---

## CAMPOS DISPONÍVEIS DA ALINE

### Mensagem Principal
| Campo | Tipo | Descrição |
|-------|------|-----------|
| mensagem_whatsapp | string | Texto limpo para enviar |
| tem_produtos | boolean | Se tem catálogo para enviar |

### Array de Produtos
| Campo | Tipo | Descrição |
|-------|------|-----------|
| produtos[].position | number | Posição do produto (1, 2, 3...) |
| produtos[].sku | string | Código SKU |
| produtos[].name | string | Nome do produto |
| produtos[].media_url | string | URL principal da mídia |
| produtos[].media_type | string | "image" ou "video" |
| produtos[].image_url | string | URL da imagem |
| produtos[].video_url | string | URL do vídeo (se tiver) |
| produtos[].caption | string | Legenda formatada |

### Filtros para Roteamento
| Campo | Tipo | Descrição |
|-------|------|-----------|
| filtros.intencao | string | comprar, informacao, suporte, saudacao, troca, reclamacao |
| filtros.categoria | string | aliancas, pingentes, aneis, etc |
| filtros.cor | string | dourada, prata, rose |
| filtros.tipo_alianca | string | namoro, noivado, casamento |
| filtros.enviar_catalogo | boolean | Se deve enviar catálogo |
| filtros.finalizar_venda | boolean | Se deve finalizar venda |
| filtros.transferir_humano | boolean | Se deve transferir para humano |
| filtros.acao_sugerida | string | Próxima ação recomendada |

### Produto Selecionado
| Campo | Tipo | Descrição |
|-------|------|-----------|
| produto_selecionado.sku | string | SKU escolhido |
| produto_selecionado.name | string | Nome do produto |
| produto_selecionado.price | number | Preço |
| produto_selecionado.position | number | Posição no catálogo |

### CRM / Dados de Venda
| Campo | Tipo | Descrição |
|-------|------|-----------|
| crm.entrega | string | "envio" ou "retirada" |
| crm.pagamento | string | "pix", "cartao", "boleto" |

### Memória da Conversa
| Campo | Tipo | Descrição |
|-------|------|-----------|
| memoria.phone | string | Telefone do cliente |
| memoria.stage | string | Estágio atual da conversa |
| memoria.categoria | string | Categoria escolhida |
| memoria.cor | string | Cor preferida |
| memoria.tipo_alianca | string | Tipo de aliança |

---

## DICAS DE USO

1. **Sempre use \`filtros.enviar_catalogo\`** para decidir se entra no For Each de produtos

2. **Use \`memoria.phone\`** para enviar mensagens, pois já está formatado

3. **Priorize vídeo** quando disponível (hasVideo = true)

4. **Caption já vem formatada** com emojis e informações do produto

5. **Filtros booleanos** facilitam criação de branches no fluxo

6. **A Aline mantém contexto** da conversa automaticamente
`;

const FiqonIntegrationText = () => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(FIQON_INTEGRATION_TEXT);
    setCopied(true);
    toast({
      title: "Copiado!",
      description: "Texto completo copiado para a área de transferência. Cole na sua IA favorita.",
    });
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownload = () => {
    const blob = new Blob([FIQON_INTEGRATION_TEXT], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fiqon-aline-integration.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Download iniciado!",
      description: "Arquivo .txt baixado com sucesso.",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate('/docs')}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Integração FiqOn + Aline</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Texto para IA</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Baixar .txt</span>
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                className={`gap-2 ${copied ? 'bg-green-600 hover:bg-green-700' : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700'} text-white shadow-lg`}
                onClick={handleCopy}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copiado!' : 'Copiar Tudo'}</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Info Card */}
        <Card className="mb-6 border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shrink-0">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-cyan-800 dark:text-cyan-200 mb-2">Como usar este documento</h3>
                <ul className="text-sm text-cyan-700 dark:text-cyan-300 space-y-1">
                  <li>1. Clique em <strong>"Copiar Tudo"</strong> acima</li>
                  <li>2. Cole no ChatGPT, Claude, ou qualquer IA</li>
                  <li>3. Peça para a IA explicar ou ajudar a configurar seu fluxo FiqOn</li>
                  <li>4. A IA terá todo o contexto necessário para te ajudar!</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Card */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle className="text-lg">Documento Completo</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="p-6 text-xs text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-[600px] overflow-y-auto">
              {FIQON_INTEGRATION_TEXT}
            </pre>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-16">
        <div className="max-w-4xl mx-auto px-6 py-8 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Acium CRM • Integração FiqOn + Aline v1.0
          </p>
        </div>
      </footer>
    </div>
  );
};

export default FiqonIntegrationText;
