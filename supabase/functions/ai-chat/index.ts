import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tools for the AI assistant
const tools = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "OBRIGATÓRIO usar quando o cliente informar a cor desejada. Busca produtos no catálogo por categoria e cor. Você DEVE chamar esta função antes de mostrar qualquer produto ao cliente.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Termo de busca para nome ou descrição do produto"
          },
          category: {
            type: "string",
            description: "Categoria do produto: aliancas, pingente, aneis. OBRIGATÓRIO quando o cliente escolheu categoria."
          },
          color: {
            type: "string",
            description: "Cor do produto: dourada, aco, preta, azul. OBRIGATÓRIO quando o cliente escolheu cor."
          },
          min_price: {
            type: "number",
            description: "Preço mínimo"
          },
          max_price: {
            type: "number",
            description: "Preço máximo"
          },
          only_available: {
            type: "boolean",
            description: "Mostrar apenas produtos com estoque. Recomendado: true"
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
      description: "Obter detalhes de um produto específico por ID ou SKU quando o cliente perguntar sobre um produto específico",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "string",
            description: "UUID do produto"
          },
          sku: {
            type: "string",
            description: "Código SKU do produto"
          }
        },
        required: []
      }
    }
  }
];

// Função para formatar legenda do produto para WhatsApp
function formatProductCaption(
  product: any, 
  options: { includePrice: boolean; includeSizes: boolean; includeStock: boolean }
): string {
  const lines: string[] = [];
  
  // Nome em negrito
  lines.push(`*${product.name}*`);
  
  // Descrição
  if (product.description) {
    lines.push(`${product.description}`);
  }
  
  // Preço
  if (options.includePrice && (product.current_price || product.price)) {
    const price = product.current_price || product.price;
    const priceFormatted = `R$ ${price.toFixed(2).replace('.', ',')}`;
    
    if (product.on_sale && product.original_price) {
      const originalFormatted = `R$ ${product.original_price.toFixed(2).replace('.', ',')}`;
      lines.push(`💰 ~${originalFormatted}~ *${priceFormatted}*`);
      if (product.discount_percent) {
        lines.push(`🏷️ ${product.discount_percent}% OFF`);
      }
    } else {
      lines.push(`💰 *${priceFormatted}*`);
    }
  }
  
  // Tamanhos
  if (options.includeSizes && product.available_sizes?.length > 0) {
    lines.push(`📏 Tamanhos: ${product.available_sizes.join(', ')}`);
  }
  
  // Cor
  if (product.color) {
    lines.push(`🎨 Cor: ${product.color}`);
  }
  
  // Estoque
  if (options.includeStock) {
    const stock = product.total_stock || 0;
    if (stock > 0) {
      lines.push(`✅ Em estoque`);
    } else {
      lines.push(`⚠️ Sob consulta`);
    }
  }
  
  // Código
  if (product.sku) {
    lines.push(`📦 Cód: ${product.sku}`);
  }
  
  return lines.join('\n');
}

async function searchCatalog(params: Record<string, any>, supabaseUrl: string, supabaseKey: string): Promise<any> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });

  const response = await fetch(
    `${supabaseUrl}/functions/v1/ai-catalog-search?${searchParams.toString()}`,
    {
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  return await response.json();
}

// System prompt da Aline
const ALINE_SYSTEM_PROMPT = `# PROMPT OFICIAL — ALINE | ACIUM MANAUS
(Versão Guiada por Etapas, Estável, Anti-Loop e Amigável)

---

## 1. IDENTIDADE E PAPEL

Você é **Aline**, Consultora Especialista em Joias da **ACIUM Manaus**.

Seu papel é exclusivamente de **atendimento ao cliente no WhatsApp**.  
Você NÃO executa vendas finais.  
Você NÃO recebe pagamentos.  
Você NÃO executa ações internas.  
Você coleta e organiza informações para o vendedor humano dar continuidade.

Você trabalha com as seguintes categorias:
- **Alianças de Namoro ou Compromisso** (referentes às peças de aço)
- **Alianças de Casamento** (referentes às peças de tungstênio)
- **Pingentes**

Tom de voz:  
Elegante, profissional, segura e acessível.  
Utilize frases curtas, bem pontuadas e separadas.  
Evite parágrafos grandes.  
Nunca seja robótica.  
Nunca apresse o cliente.

---

## 2. REGRA DE OURO (ANTI-DUPLICAÇÃO / ANTI-SPAM)

- Você deve enviar **APENAS 1 mensagem por vez**.
- É **PROIBIDO** repetir o mesmo menu duas vezes seguidas.
- É **PROIBIDO** enviar menu "sobrando" no final do catálogo.
- Quando precisar de escolha do cliente, você envia **SÓ o menu da etapa** e para.
- Só continue após a resposta do cliente.

---

## 3. ABERTURA OBRIGATÓRIA (APRESENTAÇÃO)

Sempre que iniciar uma conversa (ou se o estado técnico for abertura), você DEVE se apresentar antes de qualquer pergunta.

Modelo obrigatório de abertura:  
"Olá.  
Sou a Aline, consultora da ACIUM Manaus.  
Vou te ajudar a encontrar a joia ideal."

Após a apresentação, você DEVE exibir o menu inicial (com número):

"Você está procurando:  
1️⃣ Alianças  
2️⃣ Pingentes  

Responda com o **número** (1 ou 2) ou com a **opção**."

Nunca pule esta etapa.  
Nunca dispare catálogo nesta fase.

---

## 4. PRIMEIRA ESCOLHA — CATEGORIA PRINCIPAL

Aguarde o cliente responder escolhendo **Alianças** ou **Pingentes**.

### Normalização:
- Alianças: aliança, casamento, namoro, compromisso, noivado.
- Pingentes: pingente, corrente, colar.

---

## 5. SEGUNDA ESCOLHA — FINALIDADE DA ALIANÇA (SOMENTE SE FOR ALIANÇAS)

Se o cliente escolher **Alianças**, você DEVE perguntar o objetivo (com número):

"Perfeito. Qual o momento especial que vocês estão celebrando:  
1️⃣ Namoro ou Compromisso  
2️⃣ Casamento  

Responda com o número (1 ou 2) ou com a opção."

---

## 6. TERCEIRA ESCOLHA — COR (OBRIGATÓRIA)

### 6.1 Para ALIANÇAS (Dourada, Aço, Preta, Azul)

Após a escolha da finalidade, pergunte:

"Qual cor você prefere:  
1️⃣ Dourada  
2️⃣ Aço (prata)  
3️⃣ Preta  
4️⃣ Azul  

Responda com o número (1 a 4) ou com a opção."

### 6.2 Para PINGENTES (Dourada, Prata)

"Qual cor você prefere:  
1️⃣ Dourada  
2️⃣ Prata (Aço)  

Responda com o número (1 ou 2) ou com a opção."

---

## 7. REGRA DE DISPARO DE CATÁLOGO (OBRIGATÓRIO USAR FERRAMENTA)

**ATENÇÃO CRÍTICA:** Quando o cliente informar a COR, você DEVE OBRIGATORIAMENTE:

1. Primeiro, dizer: "Aguarde um momento. Vou buscar no nosso catálogo alguns modelos que atendem sua necessidade."

2. Depois, você DEVE chamar a ferramenta search_catalog com os parâmetros:
   - category: "pingente" ou "aliancas"
   - color: a cor escolhida pelo cliente (dourada, aco, preta, azul)
   - only_available: true

3. Após receber os produtos da ferramenta, apresente-os de forma elegante:
   - Liste cada produto com nome, preço e tamanhos disponíveis
   - Se tiver promoção, destaque o desconto
   - Se tiver brinde, mencione
   - Mostre as URLs das imagens para o cliente visualizar

4. NÃO PULE ESTA ETAPA! É proibido ir direto para fotogravação ou coleta de dados sem mostrar produtos.

5. Após apresentar o catálogo, inclua: [SYSTEM_ACTION action:"show_catalog"]

**EXEMPLO DE USO DA FERRAMENTA:**
Quando cliente disser "Dourada" após escolher Pingentes:
- Você DEVE chamar: search_catalog({ category: "pingente", color: "dourada", only_available: true })
- Esperar o resultado
- Mostrar os produtos encontrados

---

## 8. PINGENTES COM FOTOGRAVAÇÃO

SOMENTE após o cliente ESCOLHER um produto específico do catálogo:

"Ótima escolha! Esse pingente permite fotogravação. Para um resultado perfeito, envie a foto na melhor resolução possível."

---

## 9. PRÉ-FECHAMENTO (COLETA DE DADOS)

Explique sempre:

"Vou te fazer duas perguntas rápidas apenas para organizar o atendimento do vendedor. Nenhum pagamento será feito nesta conversa."

### ETAPA 9.1 — ENTREGA E PAGAMENTO

Pergunte sobre **Delivery/Retirada** e depois sobre **Pix/Cartão**.

---

## 10. SAÍDA TÉCNICA PARA O CÉREBRO (SUPABASE)

**REGRA OBRIGATÓRIA:** No final de CADA resposta sua, você DEVE adicionar o nó técnico correspondente à etapa atual.

Formato: #node: [etapa]

Valores possíveis:
- #node: abertura (apresentação inicial)
- #node: escolha_tipo (aguardando escolha aliança/pingente)
- #node: escolha_finalidade (aguardando namoro/casamento)
- #node: escolha_cor (aguardando cor)
- #node: catalogo (enviando catálogo)
- #node: selecao (cliente escolhendo produto)
- #node: coleta_dados (coletando entrega/pagamento)
- #node: finalizado (atendimento concluído)

---

## 11. COMPORTAMENTO FINAL

Quando o cliente responder tudo e confirmar, finalize com:

[SYSTEM_ACTION action:"register_lead_crm"]

#node: finalizado`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!openAIApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const body = await req.json();
    
    // Suporta dois formatos:
    // 1. { messages: [...], contact_name } - formato original
    // 2. { phone, message, contact_name } - formato FiqOn (busca histórico automaticamente)
    
    let messages = body.messages || [];
    const phone = body.phone?.replace(/\D/g, '') || null;
    const newMessage = body.message || body.text || null;
    const contactName = body.contact_name || body.senderName || null;
    const saveHistory = body.save_history !== false; // Default: true

    console.log("AI Chat request:", { phone, newMessage, messagesCount: messages.length, contactName });

    // Buscar configuração da IA do banco de dados
    const { data: aiConfig } = await supabase
      .from('ai_agent_config')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    console.log("AI Config loaded:", aiConfig?.name, "Model:", aiConfig?.model);

    // Se recebeu phone + message, buscar histórico e montar mensagens
    if (phone && newMessage) {
      // Buscar histórico de mensagens do conversation_events
      const { data: history } = await supabase
        .from('conversation_events')
        .select('*')
        .eq('phone', phone)
        .in('type', ['text', 'message'])
        .order('ts', { ascending: true })
        .limit(20); // Últimas 20 mensagens para contexto

      if (history && history.length > 0) {
        messages = history.map(event => ({
          role: event.direction === 'in' ? 'user' : 'assistant',
          content: (event.payload as any)?.text || (event.payload as any)?.message || ''
        })).filter(m => m.content);
      }

      // Adicionar a nova mensagem do usuário
      messages.push({ role: 'user', content: newMessage });

      // Salvar a mensagem do usuário no histórico
      if (saveHistory) {
        await supabase.from('conversation_events').insert({
          phone,
          type: 'text',
          direction: 'in',
          payload: { text: newMessage, senderName: contactName }
        });
      }
    }

    // Buscar estado atual da conversa
    let currentState = null;
    if (phone) {
      const { data: state } = await supabase
        .from('conversation_state')
        .select('*')
        .eq('phone', phone)
        .single();
      currentState = state;
    }

    // Montar contexto adicional
    let contextInfo = "";
    if (contactName) {
      contextInfo += `\nO nome do cliente é: ${contactName}`;
    }
    if (currentState) {
      contextInfo += `\n\nESTADO ATUAL DA CONVERSA:`;
      if (currentState.stage) contextInfo += `\n- Etapa: ${currentState.stage}`;
      if (currentState.categoria) contextInfo += `\n- Categoria escolhida: ${currentState.categoria}`;
      if (currentState.tipo_alianca) contextInfo += `\n- Tipo de aliança: ${currentState.tipo_alianca}`;
      if (currentState.cor_preferida) contextInfo += `\n- Cor preferida: ${currentState.cor_preferida}`;
      if (currentState.selected_sku) contextInfo += `\n- Produto selecionado: ${currentState.selected_sku}`;
    }

    // Usar prompt do banco se disponível, senão usar o padrão
    const systemPrompt = aiConfig?.system_prompt || ALINE_SYSTEM_PROMPT;
    const model = aiConfig?.model || "gpt-4o-mini";
    const fullSystemPrompt = systemPrompt + contextInfo;

    // First API call to get the assistant's response
    const initialResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...messages
        ],
        tools,
        tool_choice: "auto",
        max_tokens: 1000,
      }),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${initialResponse.status}`);
    }

    let responseData = await initialResponse.json();
    let assistantMessage = responseData.choices[0].message;

    console.log("Initial response:", JSON.stringify(assistantMessage, null, 2));

    // Variável para guardar os produtos do catálogo
    let catalogProducts: any[] = [];
    
    // Handle tool calls if present
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults: any[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`Executing tool: ${functionName}`, functionArgs);

        let result;
        if (functionName === "search_catalog" || functionName === "get_product_details") {
          result = await searchCatalog(functionArgs, supabaseUrl, supabaseServiceKey);
          
          // Guardar os produtos para retornar no response
          if (result.success && result.products) {
            // Buscar configurações de exibição
            const sendVideoPriority = aiConfig?.send_video_priority ?? true;
            const includeSizes = aiConfig?.include_sizes ?? true;
            const includeStock = aiConfig?.include_stock ?? true;
            const includePrice = aiConfig?.include_price ?? true;
            
            catalogProducts = result.products.map((p: any, index: number) => {
              // Determinar mídia: priorizar vídeo se configurado
              const hasVideo = !!p.video_url;
              const useVideo = sendVideoPriority && hasVideo;
              
              return {
                // Identificação
                index: index + 1,
                sku: p.sku,
                product_id: p.id,
                
                // Informações básicas
                name: p.name,
                description: p.description || '',
                color: p.color || '',
                category: p.category || '',
                
                // Preço (condicional)
                price: includePrice ? (p.current_price || p.price) : null,
                price_formatted: includePrice ? `R$ ${(p.current_price || p.price || 0).toFixed(2).replace('.', ',')}` : null,
                original_price: includePrice ? p.original_price : null,
                discount_percent: p.discount_percent,
                has_promotion: p.on_sale || false,
                
                // Mídia - campos separados para FiqOn usar no Z-API
                image_url: p.image_url,
                video_url: p.video_url,
                has_video: hasVideo,
                // Mídia principal baseada na configuração
                media_url: useVideo ? p.video_url : p.image_url,
                media_type: useVideo ? 'video' : 'image',
                
                // Estoque e tamanhos (condicional)
                sizes: includeSizes ? (p.available_sizes || []) : [],
                sizes_formatted: includeSizes ? (p.available_sizes || []).join(', ') : '',
                stock_total: includeStock ? (p.total_stock || 0) : null,
                in_stock: (p.total_stock || 0) > 0,
                
                // Legenda formatada para WhatsApp
                caption: formatProductCaption(p, { includePrice, includeSizes, includeStock }),
              };
            });
            console.log(`Catalog products extracted: ${catalogProducts.length} items`);
          }
        } else {
          result = { error: "Unknown function" };
        }

        console.log(`Tool result for ${functionName}:`, JSON.stringify(result, null, 2).slice(0, 500));

        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(result),
        });
      }

      // Second API call with tool results
      console.log("Making second API call with tool results...");
      console.log("Tool results count:", toolResults.length);
      
      const secondCallMessages = [
        { role: "system", content: fullSystemPrompt },
        ...messages,
        {
          role: "assistant",
          content: assistantMessage.content || null,
          tool_calls: assistantMessage.tool_calls
        },
        ...toolResults,
      ];
      
      console.log("Second call messages structure:", secondCallMessages.map(m => ({ role: m.role, hasContent: !!m.content, hasTool: !!(m as any).tool_calls })));
      
      const finalResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
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
        console.error("OpenAI API error (final):", errorText);
        throw new Error(`OpenAI API error: ${finalResponse.status}`);
      }

      responseData = await finalResponse.json();
      assistantMessage = responseData.choices[0].message;
      
      console.log("Second API call response:", JSON.stringify(assistantMessage, null, 2).slice(0, 500));
      
      if (!assistantMessage.content || assistantMessage.content.length < 50) {
        console.error("Warning: Second API call returned empty or short response");
      }
    }

    const responseText = assistantMessage.content || "Desculpe, não consegui processar sua mensagem.";

    console.log("Final response:", responseText.slice(0, 200));

    // Extrair dados técnicos da resposta
    const nodeMatch = responseText.match(/#node:\s*(\w+)/i);
    const nodeValue = nodeMatch ? nodeMatch[1] : "abertura";

    const actionMatch = responseText.match(/\[SYSTEM_ACTION\s+action:"([^"]+)"\]/i);
    const actionValue = actionMatch ? actionMatch[1] : null;

    // Limpar mensagem de tags técnicas
    const cleanMessage = responseText
      .replace(/#node:\s*\w+/gi, "")
      .replace(/\[SYSTEM_ACTION[^\]]*\]/gi, "")
      .trim();

    // ===== DETECÇÃO DE INTENÇÃO (para filtros FiqOn) =====
    const lowerMessage = (newMessage || messages[messages.length - 1]?.content || "").toLowerCase();
    const lowerResponse = responseText.toLowerCase();
    
    // Detectar intenção do cliente
    let intencao = "conversa";
    if (lowerMessage.match(/comprar|quero|gostei|esse|essa|escolho|levo/)) intencao = "comprar";
    else if (lowerMessage.match(/preço|valor|quanto|custa|promoção|desconto/)) intencao = "preco";
    else if (lowerMessage.match(/tamanho|medida|numero|cabe/)) intencao = "tamanho";
    else if (lowerMessage.match(/troca|devolução|problema|reclamação|defeito/)) intencao = "reclamacao";
    else if (lowerMessage.match(/entrega|prazo|frete|envio/)) intencao = "entrega";
    else if (lowerMessage.match(/pix|cartão|pagamento|parcela/)) intencao = "pagamento";
    else if (lowerMessage.match(/olá|oi|bom dia|boa tarde|boa noite|opa/)) intencao = "saudacao";
    else if (catalogProducts.length > 0) intencao = "catalogo";

    // Extrair categoria e cor da conversa
    let categoria = currentState?.categoria || "";
    if (lowerResponse.includes("pingente") || lowerMessage.includes("pingente")) categoria = "pingente";
    else if (lowerResponse.includes("aliança") || lowerResponse.includes("alianca") || 
             lowerMessage.includes("aliança") || lowerMessage.includes("alianca")) categoria = "aliancas";

    let cor = currentState?.cor_preferida || "";
    if (lowerMessage.includes("dourada") || lowerResponse.includes("dourada")) cor = "dourada";
    else if (lowerMessage.includes("prata") || lowerMessage.includes("aço") || 
             lowerResponse.includes("prata") || lowerResponse.includes("aço")) cor = "aco";
    else if (lowerMessage.includes("preta") || lowerResponse.includes("preta")) cor = "preta";
    else if (lowerMessage.includes("azul") || lowerResponse.includes("azul")) cor = "azul";

    // Detectar tipo de aliança
    let tipoAlianca = currentState?.tipo_alianca || "";
    if (lowerMessage.includes("namoro") || lowerMessage.includes("compromisso")) tipoAlianca = "namoro";
    else if (lowerMessage.includes("casamento") || lowerMessage.includes("noivado")) tipoAlianca = "casamento";

    // Detectar se cliente selecionou produto (por número ou SKU)
    let produtoSelecionado = null;
    const numMatch = lowerMessage.match(/^(\d)$/);
    if (numMatch && catalogProducts.length > 0) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < catalogProducts.length) {
        produtoSelecionado = catalogProducts[idx];
      }
    }
    // Buscar por SKU mencionado
    const skuMatch = lowerMessage.match(/(?:ac|al|pg)-?\d+/i);
    if (skuMatch && catalogProducts.length > 0) {
      const found = catalogProducts.find(p => p.sku?.toLowerCase() === skuMatch[0].toLowerCase());
      if (found) produtoSelecionado = found;
    }

    // Detectar dados de CRM (entrega e pagamento)
    let crmEntrega = currentState?.crm_entrega || null;
    let crmPagamento = currentState?.crm_pagamento || null;
    if (lowerMessage.includes("delivery") || lowerMessage.includes("entrega")) crmEntrega = "delivery";
    else if (lowerMessage.includes("retirada") || lowerMessage.includes("buscar")) crmEntrega = "retirada";
    if (lowerMessage.includes("pix")) crmPagamento = "pix";
    else if (lowerMessage.includes("cartão") || lowerMessage.includes("cartao")) crmPagamento = "cartao";

    // Ação sugerida baseada no estado
    let acaoSugerida = "continuar_conversa";
    if (actionValue === "show_catalog" || catalogProducts.length > 0) acaoSugerida = "enviar_catalogo";
    else if (actionValue === "register_lead_crm") acaoSugerida = "finalizar_venda";
    else if (intencao === "reclamacao") acaoSugerida = "transferir_humano";
    else if (nodeValue === "coleta_dados") acaoSugerida = "coletar_dados";
    else if (nodeValue === "selecao" && produtoSelecionado) acaoSugerida = "confirmar_produto";

    // Salvar resposta da Aline no histórico
    if (phone && saveHistory) {
      await supabase.from('conversation_events').insert({
        phone,
        type: 'text',
        direction: 'out',
        payload: { 
          text: cleanMessage, 
          node: nodeValue, 
          action: actionValue,
          intencao,
          acao_sugerida: acaoSugerida
        }
      });

      // Atualizar estado da conversa
      await supabase.rpc('upsert_conversation_state', {
        p_phone: phone,
        p_stage: nodeValue,
        p_categoria: categoria || null,
        p_tipo_alianca: tipoAlianca || null,
        p_cor_preferida: cor || null,
        p_selected_sku: produtoSelecionado?.sku || currentState?.selected_sku || null,
        p_selected_name: produtoSelecionado?.name || currentState?.selected_name || null,
        p_selected_price: produtoSelecionado?.price || currentState?.selected_price || null,
        p_crm_entrega: crmEntrega,
        p_crm_pagamento: crmPagamento,
      });
    }

    // ===== RESPOSTA ESTRUTURADA PARA FIQON =====
    return new Response(
      JSON.stringify({
        success: true,
        
        // ===== MENSAGEM PRINCIPAL =====
        response: cleanMessage,
        mensagem_whatsapp: cleanMessage,
        message: responseText, // Versão com tags (debug)
        
        // ===== FILTROS PARA ROTEAMENTO FIQON =====
        filtros: {
          // Intenção detectada
          intencao,
          intencao_comprar: intencao === "comprar",
          intencao_preco: intencao === "preco",
          intencao_reclamacao: intencao === "reclamacao",
          intencao_saudacao: intencao === "saudacao",
          
          // Categoria
          categoria,
          categoria_aliancas: categoria === "aliancas",
          categoria_pingente: categoria === "pingente",
          
          // Cor
          cor,
          
          // Tipo aliança
          tipo_alianca: tipoAlianca,
          
          // Ação sugerida
          acao_sugerida: acaoSugerida,
          enviar_catalogo: acaoSugerida === "enviar_catalogo",
          finalizar_venda: acaoSugerida === "finalizar_venda",
          transferir_humano: acaoSugerida === "transferir_humano",
          
          // Node técnico
          node: nodeValue,
          acao_sistema: actionValue,
        },
        
        // ===== PRODUTOS PARA FOR EACH (Z-API) =====
        produtos: catalogProducts,
        total_produtos: catalogProducts.length,
        tem_produtos: catalogProducts.length > 0,
        
        // ===== PRODUTO SELECIONADO (se houver) =====
        produto_selecionado: produtoSelecionado ? {
          sku: produtoSelecionado.sku,
          name: produtoSelecionado.name,
          price: produtoSelecionado.price,
          price_formatted: produtoSelecionado.price_formatted,
          image_url: produtoSelecionado.image_url,
          video_url: produtoSelecionado.video_url,
          sizes: produtoSelecionado.sizes,
        } : null,
        tem_produto_selecionado: produtoSelecionado !== null,
        
        // ===== ESTADO DO CRM =====
        crm: {
          entrega: crmEntrega,
          pagamento: crmPagamento,
          dados_completos: !!(crmEntrega && crmPagamento),
        },
        
        // ===== MEMÓRIA / ESTADO DA CONVERSA =====
        memoria: {
          phone,
          stage: nodeValue,
          categoria,
          tipo_alianca: tipoAlianca,
          cor,
          produto_sku: produtoSelecionado?.sku || currentState?.selected_sku || null,
          produto_nome: produtoSelecionado?.name || currentState?.selected_name || null,
          entrega: crmEntrega,
          pagamento: crmPagamento,
        },
        
        // ===== CAMPOS LEGADOS (compatibilidade) =====
        node_tecnico: nodeValue,
        acao_nome: actionValue,
        categoria_crm: categoria,
        cor_crm: cor,
        tem_acao: actionValue !== null,
        
        // ===== DEBUG/USAGE =====
        usage: responseData.usage,
        ai_model: aiConfig?.model || "gpt-4o-mini",
        ai_name: aiConfig?.name || "Aline",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("AI Chat error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        response: "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.",
        mensagem_whatsapp: "Desculpe, ocorreu um erro. Por favor, tente novamente.",
        filtros: {
          intencao: "erro",
          acao_sugerida: "transferir_humano",
          transferir_humano: true,
          node: "erro",
        },
        produtos: [],
        tem_produtos: false,
        memoria: null,
        crm: null,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
