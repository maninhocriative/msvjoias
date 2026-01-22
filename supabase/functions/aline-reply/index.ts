import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tools for the AI assistant - BUSCA INTELIGENTE DE CATÁLOGO
const tools = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: `OBRIGATÓRIO usar para mostrar produtos ao cliente. Busca produtos por categoria, cor, preço e outros filtros.
      
      QUANDO USAR:
      - Cliente escolheu categoria (alianças ou pingentes) E cor
      - Cliente pediu para "ver", "mostrar", "quero ver" produtos
      - Cliente mencionou tipo específico (casamento, namoro, compromisso)
      
      PARÂMETROS IMPORTANTES:
      - category: "aliancas" para todas as alianças, "pingente" para pingentes
      - color: cor normalizada (dourada, aco, prata, preta, azul)
      - search: use para buscar por nome ou descrição específica
      - only_available: sempre use true para mostrar apenas produtos em estoque`,
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Termo de busca livre para nome ou descrição do produto."
          },
          category: {
            type: "string",
            enum: ["aliancas", "pingente", "aneis"],
            description: "Categoria do produto. OBRIGATÓRIO."
          },
          color: {
            type: "string",
            enum: ["dourada", "aco", "preta", "azul", "prata", "rose"],
            description: "Cor do produto. Use quando o cliente especificar preferência de cor."
          },
          min_price: {
            type: "number",
            description: "Preço mínimo para filtrar produtos"
          },
          max_price: {
            type: "number",
            description: "Preço máximo para filtrar produtos"
          },
          only_available: {
            type: "boolean",
            description: "Mostrar apenas produtos com estoque. Use sempre true."
          }
        },
        required: ["category"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Obter detalhes completos de um produto específico por SKU. Use quando o cliente perguntar sobre um produto específico.",
      parameters: {
        type: "object",
        properties: {
          sku: {
            type: "string",
            description: "Código SKU do produto (ex: AC-001, PG-005)"
          }
        },
        required: ["sku"]
      }
    }
  }
];

// System prompt da Aline - VERSÃO HUMANIZADA E INTELIGENTE
const ALINE_SYSTEM_PROMPT = `# PROMPT OFICIAL — ALINE | ACIUM MANAUS
(Versão Inteligente, Humanizada e com Memória)

---

## 1. IDENTIDADE E PAPEL

Você é **Aline**, Consultora Especialista em Joias da **ACIUM Manaus**.

Seu papel é exclusivamente de **atendimento ao cliente no WhatsApp**.  
Você NÃO executa vendas finais.  
Você NÃO recebe pagamentos.  
Você coleta e organiza informações para o vendedor humano dar continuidade.

Você trabalha com as seguintes categorias:
- **Alianças de Namoro ou Compromisso** (referentes às peças de aço)
- **Alianças de Casamento** (referentes às peças de tungstênio)
- **Pingentes** (com opção de fotogravação)

**Tom de voz:**  
Elegante, profissional, segura e acessível.  
Utilize frases curtas, bem pontuadas e separadas.  
Evite parágrafos grandes.  
Nunca seja robótica.  
Nunca apresse o cliente.
Seja empática e compreensiva.
Use emojis com moderação (💍✨🎁).

---

## 2. MEMÓRIA E CONTEXTO

Você tem MEMÓRIA da conversa. Use as informações já coletadas:
- Não pergunte novamente o que o cliente já informou
- Lembre do nome do cliente se ele disse
- Lembre das preferências já mencionadas
- Seja natural: "Como você mencionou que prefere dourada..."

---

## 3. REGRA DE OURO (ANTI-DUPLICAÇÃO / ANTI-SPAM)

- Você deve enviar **APENAS 1 mensagem por vez**.
- É **PROIBIDO** repetir o mesmo menu duas vezes seguidas.
- É **PROIBIDO** enviar menu "sobrando" no final do catálogo.
- Quando precisar de escolha do cliente, você envia **SÓ o menu da etapa** e para.
- Só continue após a resposta do cliente.

---

## 4. COMPORTAMENTO INTELIGENTE

### Se o cliente já sabe o que quer:
Se na primeira mensagem ele mencionar categoria + cor (ex: "quero aliança dourada de casamento"):
1. Cumprimente brevemente
2. Chame search_catalog IMEDIATAMENTE
3. Apresente os produtos

### Se o cliente precisa de orientação:
Siga o fluxo guiado com perguntas naturais.

---

## 5. ABERTURA OBRIGATÓRIA (APRESENTAÇÃO)

Sempre que iniciar uma conversa, se apresente de forma acolhedora:

"Olá! 😊

Sou a Aline, consultora da ACIUM Manaus.  
Vou te ajudar a encontrar a joia perfeita para esse momento especial!

Me conta: você está procurando...
1️⃣ Alianças  
2️⃣ Pingentes

Pode responder com o número ou o nome!"

Nunca pule esta etapa.  
Nunca dispare catálogo nesta fase.

---

## 6. FLUXO PARA ALIANÇAS

Se o cliente escolher **Alianças**, pergunte o objetivo:

"Que lindo! 💍 Qual o momento especial que vocês estão celebrando?

1️⃣ Namoro ou Compromisso  
2️⃣ Casamento"

Depois pergunte a cor:

"Perfeito! Qual cor vocês preferem?

1️⃣ Dourada  
2️⃣ Aço (prata)  
3️⃣ Preta  
4️⃣ Azul"

---

## 7. FLUXO PARA PINGENTES

Se o cliente escolher **Pingentes**, pergunte a cor:

"Ótima escolha! 💫 Nossos pingentes são lindos!

Qual cor você prefere?
1️⃣ Dourada  
2️⃣ Prata (Aço)"

---

## 8. REGRA DE DISPARO DE CATÁLOGO (OBRIGATÓRIO)

Somente APÓS o cliente informar Categoria, Finalidade (se aliança) e Cor.

Antes de mostrar produtos, você DEVE chamar a ferramenta **search_catalog**.

Texto após buscar produtos:

"Perfeito! ✨ Vou te mostrar algumas opções maravilhosas!

Os produtos serão enviados a seguir. Veja com calma e me diz qual chamou mais sua atenção! 💍"

[SYSTEM_ACTION action:"show_catalog"]

---

## 9. PINGENTES COM FOTOGRAVAÇÃO

**REGRA IMPORTANTE:**
- A gravação de **UM LADO é GRATUITA** (já inclusa no preço)
- A gravação nos **DOIS LADOS tem custo adicional**

Quando o cliente escolher um pingente:

"Ótima escolha! Esse pingente permite fotogravação personalizada! 📸

A gravação de um lado é **gratuita** (já inclusa no valor).
Se quiser gravar nos dois lados, há um pequeno acréscimo.

Para um resultado perfeito, me envie a foto que você quer gravar.
Pode ser direto aqui pelo WhatsApp! 📷"

Aguarde a foto antes de prosseguir.

---

## 10. SELEÇÃO DE PRODUTO

Quando o cliente escolher (por número, nome ou código):
- Confirme a escolha com entusiasmo
- Para alianças: pergunte os tamanhos de cada pessoa
- Para pingentes: confirme sobre a fotogravação e peça a foto

Exemplo:
"Excelente escolha! Esse modelo é lindo mesmo! 💍

Me diz: qual o tamanho da aliança de cada um?"

---

## 11. PRÉ-FECHAMENTO (COLETA DE DADOS)

Após confirmar produto e tamanhos:

"Maravilha! Só preciso de duas informações rápidas para organizar tudo:

📦 Prefere receber em casa (delivery) ou buscar na nossa loja no Shopping Sumaúma?

💳 Vai pagar com Pix ou Cartão?"

---

## 12. FINALIZAÇÃO

Quando tiver todas as informações:

"Perfeito! Já tenho todas as informações! 🎉

Vou passar seu pedido para nosso vendedor finalizar.
Ele entrará em contato em instantes para confirmar os detalhes! 🙏

Foi um prazer te atender! 💍"

[SYSTEM_ACTION action:"register_lead_crm"]

---

## 13. SAÍDA TÉCNICA (#node)

No final de CADA resposta, adicione o nó correspondente:
- #node: abertura
- #node: escolha_tipo
- #node: escolha_finalidade
- #node: escolha_cor
- #node: catalogo
- #node: aguardando_foto (para pingentes)
- #node: selecao
- #node: coleta_dados
- #node: finalizado

---

## 14. INFORMAÇÕES IMPORTANTES DA LOJA

**ENDEREÇO:** Shopping Sumaúma - Av. Noel Nutels - Cidade Nova, Manaus - AM, 69090-970
- NUNCA invente outros endereços

**PRAZO DE ENTREGA:** 10 HORAS após fechamento do pedido
- Isso é nosso diferencial! Entrega super rápida!
- NUNCA diga prazos como "7 a 10 dias úteis"

**HORÁRIO DE FUNCIONAMENTO:** Segunda a Sábado, 10h às 22h

---

## 15. COMPORTAMENTO HUMANIZADO

- Use o nome do cliente se souber
- Demonstre interesse genuíno ("Que momento especial!")
- Celebre as escolhas ("Excelente gosto!")
- Seja paciente com dúvidas
- Ofereça ajuda adicional quando apropriado
- Evite respostas genéricas ou robóticas`;

// Função para formatar legenda do produto para WhatsApp
function formatProductCaption(
  product: any,
  options: { includePrice: boolean; includeSizes: boolean; includeStock: boolean }
): string {
  const lines: string[] = [];
  
  lines.push(`*${product.name}*`);
  
  if (product.description) {
    lines.push(`${product.description}`);
  }
  
  if (options.includePrice && product.price) {
    const priceFormatted = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
    lines.push(`💰 *${priceFormatted}*`);
  }
  
  if (options.includeSizes && product.sizes?.length > 0) {
    lines.push(`📏 Tamanhos: ${product.sizes.join(', ')}`);
  }
  
  if (product.color) {
    lines.push(`🎨 Cor: ${product.color}`);
  }
  
  if (options.includeStock) {
    const stock = product.stock || 0;
    lines.push(stock > 0 ? `✅ Em estoque` : `⚠️ Sob consulta`);
  }
  
  if (product.sku) {
    lines.push(`📦 Cód: ${product.sku}`);
  }
  
  return lines.join('\n');
}

// Função para buscar catálogo
async function searchCatalog(
  params: Record<string, any>,
  supabase: any
): Promise<any> {
  console.log(`[ALINE-REPLY] Buscando catálogo:`, params);
  
  let query = supabase
    .from('products')
    .select(`
      id, name, sku, price, image_url, video_url, category, color, description,
      product_variants(size, stock)
    `)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(params.limit || 10);
  
  if (params.category) {
    query = query.ilike('category', `%${params.category}%`);
  }
  
  if (params.color) {
    query = query.ilike('color', `%${params.color}%`);
  }
  
  if (params.search) {
    query = query.or(`name.ilike.%${params.search}%,description.ilike.%${params.search}%`);
  }
  
  if (params.min_price) {
    query = query.gte('price', params.min_price);
  }
  
  if (params.max_price) {
    query = query.lte('price', params.max_price);
  }
  
  const { data: products, error } = await query;
  
  if (error) {
    console.error(`[ALINE-REPLY] Erro ao buscar produtos:`, error);
    return { success: false, error: error.message, products: [] };
  }
  
  // Processar produtos
  const processedProducts = (products || []).map((p: any, index: number) => {
    const sizes = (p.product_variants || []).map((v: any) => v.size);
    const totalStock = (p.product_variants || []).reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
    
    return {
      index: index + 1,
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      price: p.price,
      price_formatted: p.price ? `R$ ${p.price.toFixed(2).replace('.', ',')}` : null,
      color: p.color,
      category: p.category,
      image_url: p.image_url,
      video_url: p.video_url,
      has_video: !!p.video_url,
      media_url: p.video_url || p.image_url,
      media_type: p.video_url ? 'video' : 'image',
      sizes,
      sizes_formatted: sizes.join(', '),
      stock: totalStock,
      in_stock: totalStock > 0,
    };
  });
  
  console.log(`[ALINE-REPLY] Encontrados ${processedProducts.length} produtos`);
  
  return {
    success: true,
    products: processedProducts,
    total: processedProducts.length,
  };
}

// Função para obter detalhes de produto por SKU
async function getProductDetails(sku: string, supabase: any): Promise<any> {
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      id, name, sku, price, image_url, video_url, category, color, description,
      product_variants(size, stock)
    `)
    .eq('sku', sku)
    .single();
  
  if (error || !product) {
    return { success: false, error: 'Produto não encontrado' };
  }
  
  const sizes = (product.product_variants || []).map((v: any) => v.size);
  const totalStock = (product.product_variants || []).reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
  
  return {
    success: true,
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      price: product.price,
      price_formatted: product.price ? `R$ ${product.price.toFixed(2).replace('.', ',')}` : null,
      color: product.color,
      category: product.category,
      image_url: product.image_url,
      video_url: product.video_url,
      sizes,
      stock: totalStock,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { phone, message, contact_name } = await req.json();

    if (!phone || !message) {
      throw new Error('phone and message are required');
    }

    console.log(`[ALINE-REPLY] ====== NOVA MENSAGEM ======`);
    console.log(`[ALINE-REPLY] Phone: ${phone}, Mensagem: "${message.substring(0, 100)}..."`);

    // ========================================
    // PASSO 1: RESOLVER CONVERSA ALINE
    // ========================================
    let conversation: any;
    
    const { data: existingConv, error: convError } = await supabase
      .from('aline_conversations')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (convError) {
      console.error('[ALINE-REPLY] Erro ao buscar conversa:', convError);
      throw convError;
    }

    if (existingConv) {
      // Se atendimento humano assumiu, NÃO responder
      if (existingConv.status === 'human_takeover') {
        console.log(`[ALINE-REPLY] Atendimento humano ativo para ${phone}, ignorando`);
        return new Response(JSON.stringify({
          success: true,
          skipped: true,
          reason: 'human_takeover',
          message: 'Atendimento humano ativo, Aline não responde',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Reativar conversa finalizada ou atualizar ativa
      if (existingConv.status === 'finished') {
        const { data: reactivatedConv } = await supabase
          .from('aline_conversations')
          .update({
            status: 'active',
            current_node: 'abertura',
            last_node: null,
            collected_data: { contact_name: contact_name || existingConv.collected_data?.contact_name || 'Cliente' },
            last_message_at: new Date().toISOString(),
            followup_count: 0,
          })
          .eq('id', existingConv.id)
          .select()
          .single();
        conversation = reactivatedConv;
        console.log(`[ALINE-REPLY] Conversa reativada: id=${conversation.id}`);
      } else {
        await supabase
          .from('aline_conversations')
          .update({
            last_message_at: new Date().toISOString(),
            followup_count: 0,
          })
          .eq('id', existingConv.id);
        conversation = existingConv;
        console.log(`[ALINE-REPLY] Conversa existente: node=${conversation.current_node}`);
      }
    } else {
      // Criar nova conversa
      const { data: newConv, error: createError } = await supabase
        .from('aline_conversations')
        .insert({
          phone,
          current_node: 'abertura',
          collected_data: { contact_name: contact_name || 'Cliente' },
          status: 'active',
        })
        .select()
        .single();

      if (createError) throw createError;
      conversation = newConv;
      console.log(`[ALINE-REPLY] Nova conversa criada: id=${conversation.id}`);
    }

    // Salvar mensagem do usuário
    await supabase.from('aline_messages').insert({
      conversation_id: conversation.id,
      role: 'user',
      message,
      node: conversation.current_node,
    });

    // ========================================
    // PASSO 2: SINCRONIZAR COM CRM (conversations + messages)
    // ========================================
    let crmConversationId: string | null = null;
    
    const { data: existingCrmConv } = await supabase
      .from('conversations')
      .select('id, unread_count')
      .eq('contact_number', phone)
      .maybeSingle();

    if (existingCrmConv) {
      crmConversationId = existingCrmConv.id;
      await supabase
        .from('conversations')
        .update({ 
          last_message: message,
          unread_count: (existingCrmConv.unread_count || 0) + 1
        })
        .eq('id', crmConversationId);
    } else {
      const { data: newCrmConv } = await supabase
        .from('conversations')
        .insert({
          contact_number: phone,
          contact_name: contact_name || conversation.collected_data?.contact_name || phone,
          platform: 'whatsapp',
          last_message: message,
          unread_count: 1,
          lead_status: 'novo'
        })
        .select()
        .single();
      
      if (newCrmConv) {
        crmConversationId = newCrmConv.id;
      }
    }

    // Salvar mensagem do cliente no CRM
    if (crmConversationId) {
      await supabase.from('messages').insert({
        conversation_id: crmConversationId,
        content: message,
        is_from_me: false,
        message_type: 'text',
        status: 'delivered'
      });
    }

    // ========================================
    // PASSO 3: BUSCAR HISTÓRICO PARA CONTEXTO
    // ========================================
    const { data: alineHistory } = await supabase
      .from('aline_messages')
      .select('role, message, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(30);

    const historyMessages = (alineHistory || []).map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.message
    })).filter((m: any) => m.content);

    // Adicionar nova mensagem do usuário
    historyMessages.push({ role: 'user', content: message });

    // ========================================
    // PASSO 4: MONTAR CONTEXTO
    // ========================================
    const collectedData = conversation.collected_data || {};
    let contextInfo = "";
    
    if (contact_name || collectedData.contact_name) {
      contextInfo += `\nO nome do cliente é: ${contact_name || collectedData.contact_name}`;
    }
    
    contextInfo += `\n\nESTADO ATUAL DA CONVERSA:`;
    contextInfo += `\n- Node atual: ${conversation.current_node}`;
    if (collectedData.categoria) contextInfo += `\n- Categoria escolhida: ${collectedData.categoria}`;
    if (collectedData.finalidade) contextInfo += `\n- Finalidade: ${collectedData.finalidade}`;
    if (collectedData.cor) contextInfo += `\n- Cor preferida: ${collectedData.cor}`;
    if (collectedData.selected_sku) contextInfo += `\n- Produto selecionado: ${collectedData.selected_sku}`;
    if (collectedData.delivery_method) contextInfo += `\n- Entrega: ${collectedData.delivery_method}`;
    if (collectedData.payment_method) contextInfo += `\n- Pagamento: ${collectedData.payment_method}`;

    // Buscar configuração da IA do banco de dados
    const { data: aiConfig } = await supabase
      .from('ai_agent_config')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    // Usar prompt do banco se disponível, senão usar o padrão
    const systemPrompt = aiConfig?.system_prompt || ALINE_SYSTEM_PROMPT;
    const model = "gpt-4o-mini"; // Modelo GPT-4o Mini (corrigido)
    const fullSystemPrompt = systemPrompt + contextInfo;

    console.log(`[ALINE-REPLY] Usando modelo: ${model}`);
    console.log(`[ALINE-REPLY] Histórico: ${historyMessages.length} mensagens`);

    // ========================================
    // PASSO 5: DETECTAR SE DEVE FORÇAR CATÁLOGO
    // ========================================
    const lastUserMessage = message.toLowerCase();
    const hasCategoryKeyword = /aliança|alianca|pingente|anel|aneis/i.test(lastUserMessage);
    const hasColorKeyword = /dourada|dourado|prata|aço|aco|preta|preto|azul/i.test(lastUserMessage);
    const hasActionKeyword = /quero|ver|mostrar|mostra|catálogo|catalogo|opções|opcoes/i.test(lastUserMessage);
    
    const shouldForceCatalog = (hasCategoryKeyword && hasColorKeyword) || 
                               (hasActionKeyword && hasCategoryKeyword) ||
                               (collectedData.cor && hasColorKeyword);
    
    let toolChoice: any = "auto";
    if (shouldForceCatalog) {
      console.log("[ALINE-REPLY] Forçando busca de catálogo - keywords detectadas");
      toolChoice = { type: "function", function: { name: "search_catalog" } };
    }

    // ========================================
    // PASSO 6: CHAMAR GPT-4.1 MINI (Chat Completions API)
    // ========================================
    console.log(`[ALINE-REPLY] Chamando OpenAI...`);

    const initialResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...historyMessages
        ],
        tools,
        tool_choice: toolChoice,
        max_tokens: 1000,
      }),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      console.error("[ALINE-REPLY] OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${initialResponse.status}`);
    }

    let responseData = await initialResponse.json();
    let assistantMessage = responseData.choices[0].message;

    console.log("[ALINE-REPLY] Resposta inicial recebida");

    // Variável para guardar os produtos do catálogo
    let catalogProducts: any[] = [];
    
    // ========================================
    // PASSO 7: PROCESSAR TOOL CALLS (se houver)
    // ========================================
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults: any[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[ALINE-REPLY] Executando tool: ${functionName}`, functionArgs);

        let result;
        if (functionName === "search_catalog") {
          result = await searchCatalog(functionArgs, supabase);
          
          if (result.success && result.products) {
            // Buscar configurações de exibição
            const sendVideoPriority = aiConfig?.send_video_priority ?? true;
            const includeSizes = aiConfig?.include_sizes ?? true;
            const includeStock = aiConfig?.include_stock ?? true;
            const includePrice = aiConfig?.include_price ?? true;
            
            catalogProducts = result.products.map((p: any, index: number) => ({
              ...p,
              index: index + 1,
              media_url: sendVideoPriority && p.video_url ? p.video_url : p.image_url,
              media_type: sendVideoPriority && p.video_url ? 'video' : 'image',
              caption: formatProductCaption(p, { includePrice, includeSizes, includeStock }),
            }));
            
            console.log(`[ALINE-REPLY] Catálogo: ${catalogProducts.length} produtos`);
          }
        } else if (functionName === "get_product_details") {
          result = await getProductDetails(functionArgs.sku, supabase);
        } else {
          result = { error: "Unknown function" };
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(result),
        });
      }

      // Segunda chamada com resultados das tools
      console.log("[ALINE-REPLY] Segunda chamada com resultados das tools...");
      
      const secondCallMessages = [
        { role: "system", content: fullSystemPrompt },
        ...historyMessages,
        {
          role: "assistant",
          content: assistantMessage.content || null,
          tool_calls: assistantMessage.tool_calls
        },
        ...toolResults,
      ];
      
      const finalResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: secondCallMessages,
          max_tokens: 1500,
        }),
      });

      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        console.error("[ALINE-REPLY] OpenAI API error (final):", errorText);
        throw new Error(`OpenAI API error: ${finalResponse.status}`);
      }

      responseData = await finalResponse.json();
      assistantMessage = responseData.choices[0].message;
    }

    const responseText = assistantMessage.content || "Desculpe, não consegui processar sua mensagem.";

    console.log("[ALINE-REPLY] Resposta final:", responseText.substring(0, 200) + "...");

    // ========================================
    // PASSO 8: EXTRAIR DADOS TÉCNICOS
    // ========================================
    const nodeMatch = responseText.match(/#node:\s*(\w+)/i);
    const nodeValue = nodeMatch ? nodeMatch[1] : conversation.current_node;

    const actionMatch = responseText.match(/\[SYSTEM_ACTION\s+action:"([^"]+)"\]/i);
    const actionValue = actionMatch ? actionMatch[1] : null;

    // Limpar mensagem de tags técnicas
    let cleanMessage = responseText
      .replace(/#node:\s*\w+/gi, "")
      .replace(/\[SYSTEM_ACTION[^\]]*\]/gi, "")
      .trim();

    // Remover linhas duplicadas
    const lines = cleanMessage.split('\n');
    const seenLines = new Set<string>();
    const uniqueLines: string[] = [];
    
    for (const line of lines) {
      const normalizedLine = line.trim().toLowerCase().replace(/\s+/g, ' ');
      if (line.trim() === '' || !seenLines.has(normalizedLine)) {
        uniqueLines.push(line);
        if (normalizedLine) seenLines.add(normalizedLine);
      }
    }
    cleanMessage = uniqueLines.join('\n').trim();

    console.log(`[ALINE-REPLY] Node: ${nodeValue}, Action: ${actionValue}`);

    // ========================================
    // PASSO 9: COLETAR DADOS DO USUÁRIO
    // ========================================
    const newCollectedData: Record<string, unknown> = { ...collectedData };
    const normalizedMsg = message.toLowerCase().trim();

    // Coletar categoria
    if (normalizedMsg === '1' || /aliança|alianca|alianças|aliancas/.test(normalizedMsg)) {
      newCollectedData.categoria = 'aliancas';
    } else if (normalizedMsg === '2' || /pingente|pingentes/.test(normalizedMsg)) {
      newCollectedData.categoria = 'pingente';
    }

    // Coletar finalidade
    if (/^1$|namoro|compromisso/.test(normalizedMsg)) {
      newCollectedData.finalidade = 'namoro';
    } else if (/^2$|casamento/.test(normalizedMsg) && !newCollectedData.finalidade) {
      newCollectedData.finalidade = 'casamento';
    }

    // Coletar cor
    const colorMap: Record<string, string> = {
      '1': 'dourada', 'dourada': 'dourada', 'dourado': 'dourada',
      '2': 'prata', 'prata': 'prata', 'aço': 'prata', 'aco': 'prata',
      '3': 'preta', 'preta': 'preta', 'preto': 'preta',
      '4': 'azul', 'azul': 'azul',
    };
    const colorKey = Object.keys(colorMap).find(key => normalizedMsg.includes(key) || normalizedMsg === key);
    if (colorKey) {
      newCollectedData.cor = colorMap[colorKey];
    }

    // Coletar seleção de produto
    const numberMatch = normalizedMsg.match(/^(\d)$|quero\s*o?\s*(\d)|escolho\s*o?\s*(\d)/);
    if (numberMatch && catalogProducts.length > 0) {
      const productIndex = parseInt(numberMatch[1] || numberMatch[2] || numberMatch[3]) - 1;
      if (productIndex >= 0 && productIndex < catalogProducts.length) {
        const selectedProduct = catalogProducts[productIndex];
        newCollectedData.selected_product = selectedProduct;
        newCollectedData.selected_sku = selectedProduct.sku;
        newCollectedData.selected_name = selectedProduct.name;
        newCollectedData.selected_price = selectedProduct.price;
        console.log(`[ALINE-REPLY] Produto selecionado: ${selectedProduct.name}`);
      }
    }

    // Coletar entrega
    if (/retirada|retirar|loja|buscar/.test(normalizedMsg)) {
      newCollectedData.delivery_method = 'retirada';
    } else if (/entrega|envio|delivery|enviar|casa/.test(normalizedMsg)) {
      newCollectedData.delivery_method = 'entrega';
    }

    // Coletar pagamento
    if (/pix/.test(normalizedMsg)) {
      newCollectedData.payment_method = 'pix';
    } else if (/cartão|cartao|credito|crédito/.test(normalizedMsg)) {
      newCollectedData.payment_method = 'cartao';
    }

    // Salvar catálogo no collected_data
    if (catalogProducts.length > 0) {
      newCollectedData.last_catalog = catalogProducts.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        image_url: p.image_url,
      }));
    }

    // ========================================
    // PASSO 10: ATUALIZAR CONVERSA E SALVAR RESPOSTA
    // ========================================
    await supabase
      .from('aline_conversations')
      .update({
        current_node: nodeValue,
        last_node: conversation.current_node,
        collected_data: newCollectedData,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    // Salvar resposta da Aline
    await supabase.from('aline_messages').insert({
      conversation_id: conversation.id,
      role: 'assistant',
      message: cleanMessage,
      node: nodeValue,
      actions_executed: actionValue ? [{ action: actionValue }] : null,
    });

    // Salvar no CRM também
    if (crmConversationId) {
      await supabase.from('messages').insert({
        conversation_id: crmConversationId,
        content: cleanMessage,
        is_from_me: true,
        message_type: 'text',
        status: 'sent'
      });

      // Atualizar última mensagem
      await supabase
        .from('conversations')
        .update({ last_message: cleanMessage.substring(0, 100) })
        .eq('id', crmConversationId);
    }

    // ========================================
    // PASSO 11: ENCAMINHAR AO VENDEDOR (se finalizado)
    // ========================================
    if (actionValue === 'register_lead_crm' || nodeValue === 'finalizado') {
      console.log(`[ALINE-REPLY] Finalizando atendimento e encaminhando ao vendedor...`);
      
      // Atualizar status da conversa
      await supabase
        .from('aline_conversations')
        .update({ status: 'finished' })
        .eq('id', conversation.id);

      // Atualizar lead_status no CRM
      if (crmConversationId) {
        await supabase
          .from('conversations')
          .update({ lead_status: 'comprador' })
          .eq('id', crmConversationId);
      }
    }

    // ========================================
    // RESPOSTA FINAL
    // ========================================
    console.log(`[ALINE-REPLY] ====== FIM ======`);
    
    // Versão da mensagem sem quebras de linha (para JSON seguro no Fiqon)
    const mensagemSemQuebras = cleanMessage.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    
    return new Response(
      JSON.stringify({
        success: true,
        
        // Mensagem principal
        response: cleanMessage,
        mensagem_whatsapp: cleanMessage,
        
        // NOVO: Mensagem sem quebras para uso seguro em JSON no Fiqon
        reply_text: mensagemSemQuebras,
        mensagem_linha_unica: mensagemSemQuebras,
        
        // Dados técnicos
        node_tecnico: nodeValue,
        acao_nome: actionValue,
        tem_acao: actionValue !== null,
        
        // Produtos (para FiqOn/Z-API)
        produtos: catalogProducts,
        total_produtos: catalogProducts.length,
        tem_produtos: catalogProducts.length > 0,
        
        // Produto selecionado
        produto_selecionado: newCollectedData.selected_product || null,
        tem_produto_selecionado: !!newCollectedData.selected_product,
        
        // Dados coletados
        categoria_crm: newCollectedData.categoria || null,
        cor_crm: newCollectedData.cor || null,
        
        // Memória
        memoria: {
          phone,
          stage: nodeValue,
          categoria: newCollectedData.categoria,
          finalidade: newCollectedData.finalidade,
          cor: newCollectedData.cor,
          produto_sku: newCollectedData.selected_sku,
          entrega: newCollectedData.delivery_method,
          pagamento: newCollectedData.payment_method,
        },
        
        // Debug
        ai_model: model,
        usage: responseData.usage,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[ALINE-REPLY] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        response: "Desculpe, ocorreu um erro. Por favor, tente novamente.",
        mensagem_whatsapp: "Desculpe, ocorreu um erro. Por favor, tente novamente.",
        produtos: [],
        tem_produtos: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
