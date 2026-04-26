import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const tools = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: `OBRIGATÓRIO usar para mostrar produtos ao cliente quando já houver informações suficientes.
      
REGRAS:
- Os produtos são enviados como cards visuais pelo sistema.
- Nunca listar produtos no texto da resposta.
- Para alianças de casamento, usar somente depois que tiver a cor.
- Para alianças de namoro, usar somente depois que tiver a cor.
- Para pingentes, usar somente depois que tiver a cor.
- Se o cliente pedir "outras cores" ou "mais opções", use exclude_shown_colors=true.

PARÂMETROS:
- category: "aliancas", "pingente" ou "aneis"
- color: use quando o cliente especificar cor
- only_available: use true para mostrar só estoque disponível`,
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Busca livre por nome ou descrição.",
          },
          category: {
            type: "string",
            enum: ["aliancas", "pingente", "aneis"],
            description: "Categoria do produto.",
          },
          color: {
            type: "string",
            enum: ["dourada", "prata", "preta", "azul", "rose"],
            description: "Cor desejada quando o cliente informar uma cor.",
          },
          min_price: {
            type: "number",
            description: "Preço mínimo.",
          },
          max_price: {
            type: "number",
            description: "Preço máximo.",
          },
          only_available: {
            type: "boolean",
            description: "Mostrar apenas produtos disponíveis.",
          },
          exclude_shown_colors: {
            type: "boolean",
            description: "Exclui cores já mostradas quando cliente pedir outras cores/opções.",
          },
        },
        required: ["category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Buscar detalhes de um produto específico por SKU.",
      parameters: {
        type: "object",
        properties: {
          sku: {
            type: "string",
            description: "Código SKU do produto.",
          },
        },
        required: ["sku"],
      },
    },
  },
];

const ALINE_SYSTEM_PROMPT = `# Aline e Keila | ACIUM Manaus

## PAPÉIS
Você atende como duas especialistas:

### Aline
Aline faz a TRIAGEM inicial.
Ela precisa identificar rapidamente se o cliente quer:
- alianças de namoro
- alianças de casamento
- pingentes dourados
- pingentes prata

### Keila
Keila é a especialista em alianças de casamento.
Quando o cliente estiver buscando alianças de casamento, Aline deve dizer que vai transferir para a Keila e, a partir daí, a conversa segue como Keila.

---

## TOM
- Respostas curtas, elegantes e acolhedoras
- Máximo 2 a 4 linhas por resposta
- Nunca escrever textão
- Nunca listar produtos no texto
- Poucos emojis

---

## REGRAS ABSOLUTAS
1. Nunca invente preço, estoque ou condições.
2. Nunca descreva catálogo em lista no texto.
3. Quando houver catálogo, diga só uma introdução curta.
4. Os cards com foto, cor, código e preço são enviados pelo sistema.
5. Quando o cliente perguntar sobre preço de aliança, você pode lembrar:
   "O valor do card é da unidade. O par sai pelo dobro. 💍"
6. Se o cliente perguntar endereço, responda o endereço da loja.
7. Se o cliente pedir algo ambíguo, pergunte antes de buscar catálogo.

---

## FLUXO DA ALINE
### Se for alianças de casamento
Aline deve responder algo no estilo:
"Perfeito! Vou te transferir para a Keila, nossa especialista em alianças de casamento. 💍"

Depois disso, o fluxo segue como Keila.

### Se for alianças de namoro
Aline conduz assim:
1. confirmar que é namoro/compromisso
2. perguntar a cor
3. quando tiver a cor, buscar catálogo

### Se for pingentes
Aline conduz assim:
1. perguntar a cor, se ainda não tiver
2. quando tiver a cor, buscar catálogo

---

## FLUXO DA KEILA
Keila deve conduzir alianças de casamento nesta ordem:

1. perguntar para quando o cliente deseja fechar
2. perguntar quanto quer investir
3. perguntar se deseja o par ou a unidade
4. perguntar a numeração
5. se o cliente não souber a numeração, tranquilizar:
   "Tudo bem, se você ainda não souber a numeração agora, eu sigo com você mesmo assim 😊"

Depois que essas respostas estiverem coletadas:
- buscar os produtos no catálogo
- enviar cards da cor escolhida
- sempre informar:
  "O valor do card é da unidade. O par sai pelo dobro. 💍"
- depois dos cards, perguntar:
  "Gostou de algum modelo? 😊"

---

## CORES
### Alianças de namoro
- dourada
- prata

Se pedirem preta, azul ou outra:
"Para namoro temos dourada e prata. Qual você prefere? 💍"

### Alianças de casamento
- dourada
- prata
- preta
- azul

### Pingentes
- dourada
- prata

---

## ENDEREÇO
Shopping Sumaúma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM

---

## NÓS TÉCNICOS
Use no final da resposta um destes nós:
- #node: abertura
- #node: escolha_tipo
- #node: escolha_finalidade
- #node: escolha_cor
- #node: transferencia_keila
- #node: keila_prazo
- #node: keila_orcamento
- #node: keila_par_ou_unidade
- #node: keila_numeracao
- #node: catalogo
- #node: selecao
- #node: coleta_dados
- #node: finalizado`;

function normalizeText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectColor(text: string): string | null {
  const normalized = normalizeText(text);

  if (/(dourada|dourado|ouro|gold|amarela|amarelo)/i.test(normalized)) return "dourada";
  if (/(prata|prateada|prateado|aco|aço|silver|cinza)/i.test(normalized)) return "prata";
  if (/(preta|preto|black|escura|escuro)/i.test(normalized)) return "preta";
  if (/(azul|blue)/i.test(normalized)) return "azul";
  if (/(rose|ros[eé]|rosa)/i.test(normalized)) return "rose";

  return null;
}

function inferCategory(text: string, currentState: any): string | null {
  const normalized = normalizeText(text);

  if (/pingente|pingentes|medalha|medalhas|medalhinha|colar|cordao|cordão|corrente/.test(normalized)) {
    return "pingente";
  }

  if (/alianc/.test(normalized)) {
    return "aliancas";
  }

  if (/anel|aneis|an[eé]is/.test(normalized)) {
    return "aneis";
  }

  return currentState?.categoria || null;
}

function inferAllianceType(text: string, currentState: any): string | null {
  const normalized = normalizeText(text);

  if (/casamento|casar|noiva|noivo|noivado|tungsten/.test(normalized)) {
    return "casamento";
  }

  if (/namoro|compromisso|namorada|namorado/.test(normalized)) {
    return "namoro";
  }

  return currentState?.tipo_alianca || null;
}

function inferSuggestedAgent(text: string, currentState: any): "aline" | "keila" {
  const normalized = normalizeText(text);
  const category = inferCategory(text, currentState);
  const allianceType = inferAllianceType(text, currentState);

  const explicitMarriage = /casamento|casar|noiva|noivo|noivado|tungsten/.test(normalized);
  const marriageContext =
    category === "aliancas" &&
    (allianceType === "casamento" || explicitMarriage || currentState?.stage?.includes?.("keila"));

  return marriageContext ? "keila" : "aline";
}

function inferClassification(text: string, currentState: any): string | null {
  const normalized = normalizeText(text);
  const category = inferCategory(text, currentState);
  const color = detectColor(text);
  const allianceType = inferAllianceType(text, currentState);

  if (category === "aliancas" && allianceType === "casamento") {
    return "aliancas_casamento";
  }

  if (category === "aliancas" && allianceType === "namoro") {
    return "aliancas_namoro";
  }

  if (category === "pingente" && color === "dourada") {
    return "pingentes_dourados";
  }

  if (category === "pingente" && color === "prata") {
    return "pingentes_prata";
  }

  if (/casamento/.test(normalized) && /alianc/.test(normalized)) {
    return "aliancas_casamento";
  }

  if (/namoro|compromisso/.test(normalized) && /alianc/.test(normalized)) {
    return "aliancas_namoro";
  }

  return null;
}

function shouldForceCatalog(text: string, currentState: any): boolean {
  const normalized = normalizeText(text);
  const category = inferCategory(text, currentState);
  const color = detectColor(text) || currentState?.cor_preferida || null;
  const allianceType = inferAllianceType(text, currentState);

  const wantsToSee = /quero ver|mostra|mostrar|manda op|opcoes|opções|catalogo|catálogo|mais opcoes|mais opções/.test(normalized);
  const asksOtherOptions = /outras cores|outras opcoes|outras opções|mais opcoes|mais opções/.test(normalized);

  if (category === "pingente" && color && wantsToSee) return true;
  if (category === "pingente" && color && currentState?.stage === "escolha_cor") return true;

  if (category === "aliancas" && allianceType === "namoro" && color && wantsToSee) return true;
  if (category === "aliancas" && allianceType === "casamento" && color && wantsToSee) return true;

  if (category === "aliancas" && allianceType && color && asksOtherOptions) return true;

  return false;
}

function formatProductCaption(
  product: any,
  options: { includePrice: boolean; includeSizes: boolean; includeStock: boolean },
): string {
  const lines: string[] = [];

  lines.push(`*${product.name}*`);

  if (product.description) {
    lines.push(product.description);
  }

  const price = product.current_price || product.price || product.price_current || 0;
  if (options.includePrice && price) {
    const formatted = `R$ ${Number(price).toFixed(2).replace(".", ",")}`;
    lines.push(`💰 *${formatted}*`);
  }

  if (product.color || product.specs?.color) {
    lines.push(`🎨 Cor: ${product.color || product.specs?.color}`);
  }

  const sizes =
    product.available_sizes ||
    product.sizes?.map((item: any) => item.size || item) ||
    [];

  if (options.includeSizes && Array.isArray(sizes) && sizes.length > 0) {
    lines.push(`📏 Tamanhos: ${sizes.join(", ")}`);
  }

  if (options.includeStock) {
    const stock = Number(product.total_stock || product.stock_available || 0);
    lines.push(stock > 0 ? "✅ Em estoque" : "⚠️ Sob consulta");
  }

  if (product.sku) {
    lines.push(`📦 Cód: ${product.sku}`);
  }

  return lines.join("\n");
}

async function searchCatalog(
  params: Record<string, any>,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<any> {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const response = await fetch(
    `${supabaseUrl}/functions/v1/ai-catalog-search?${searchParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
    },
  );

  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();

    if (body.action === "get_default_prompt") {
      return new Response(
        JSON.stringify({
          success: true,
          default_prompt: ALINE_SYSTEM_PROMPT,
          prompt_length: ALINE_SYSTEM_PROMPT.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!openAIApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    let messages = body.messages || [];
    const phone = body.phone?.replace(/\D/g, "") || null;
    const newMessage = body.message || body.text || null;
    const contactName = body.contact_name || body.senderName || null;
    const saveHistory = body.save_history !== false;

    const { data: aiConfig } = await supabase
      .from("ai_agent_config")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (phone && newMessage) {
      const { data: alineConversation } = await supabase
        .from("aline_conversations")
        .select("id")
        .eq("phone", phone)
        .single();

      let historyMessages: { role: string; content: string }[] = [];

      if (alineConversation?.id) {
        const { data: alineHistory } = await supabase
          .from("aline_messages")
          .select("role, message, created_at")
          .eq("conversation_id", alineConversation.id)
          .order("created_at", { ascending: true })
          .limit(50);

        if (alineHistory?.length) {
          historyMessages = alineHistory
            .map((msg: any) => ({
              role: msg.role === "user" ? "user" : "assistant",
              content: msg.message,
            }))
            .filter((msg: any) => msg.content);
        }
      }

      if (!historyMessages.length) {
        const { data: history } = await supabase
          .from("conversation_events")
          .select("*")
          .eq("phone", phone)
          .in("type", ["text", "message"])
          .order("ts", { ascending: true })
          .limit(50);

        if (history?.length) {
          historyMessages = history
            .map((event: any) => ({
              role: event.direction === "in" ? "user" : "assistant",
              content: event.payload?.text || event.payload?.message || "",
            }))
            .filter((msg: any) => msg.content);
        }
      }

      messages = historyMessages;
      messages.push({ role: "user", content: newMessage });

      if (saveHistory) {
        await supabase.from("conversation_events").insert({
          phone,
          type: "text",
          direction: "in",
          payload: {
            text: newMessage,
            senderName: contactName,
          },
        });
      }
    }

    let currentState: any = null;
    if (phone) {
      const { data: state } = await supabase
        .from("conversation_state")
        .select("*")
        .eq("phone", phone)
        .single();

      currentState = state;
    }

    const lastUserMessage = String(newMessage || messages[messages.length - 1]?.content || "");
    const normalizedLastUserMessage = normalizeText(lastUserMessage);

    const inferredCategory = inferCategory(lastUserMessage, currentState);
    const inferredAllianceType = inferAllianceType(lastUserMessage, currentState);
    const inferredColor = detectColor(lastUserMessage) || currentState?.cor_preferida || null;
    const inferredAgent = inferSuggestedAgent(lastUserMessage, currentState);
    const inferredClassification = inferClassification(lastUserMessage, currentState);

    let contextInfo = "";

    if (contactName) {
      contextInfo += `\nNome do cliente: ${contactName}`;
    }

    contextInfo += `\nAgente sugerida para esta etapa: ${inferredAgent}`;
    if (inferredClassification) {
      contextInfo += `\nClassificação atual da busca: ${inferredClassification}`;
    }
    if (inferredCategory) {
      contextInfo += `\nCategoria atual inferida: ${inferredCategory}`;
    }
    if (inferredAllianceType) {
      contextInfo += `\nTipo de aliança inferido: ${inferredAllianceType}`;
    }
    if (inferredColor) {
      contextInfo += `\nCor inferida: ${inferredColor}`;
    }

    if (currentState) {
      contextInfo += `\n\nESTADO ATUAL DA CONVERSA:`;
      if (currentState.stage) contextInfo += `\n- Etapa: ${currentState.stage}`;
      if (currentState.categoria) contextInfo += `\n- Categoria: ${currentState.categoria}`;
      if (currentState.tipo_alianca) contextInfo += `\n- Tipo de aliança: ${currentState.tipo_alianca}`;
      if (currentState.cor_preferida) contextInfo += `\n- Cor preferida: ${currentState.cor_preferida}`;
      if (currentState.selected_sku) contextInfo += `\n- Produto selecionado: ${currentState.selected_sku}`;
      if (currentState.selected_name) contextInfo += `\n- Nome selecionado: ${currentState.selected_name}`;
      if (currentState.crm_entrega) contextInfo += `\n- Entrega: ${currentState.crm_entrega}`;
      if (currentState.crm_pagamento) contextInfo += `\n- Pagamento: ${currentState.crm_pagamento}`;
    }

    if (inferredAgent === "keila") {
      contextInfo += `\n\nINSTRUÇÃO CRÍTICA:
- Você está no fluxo da Keila.
- Se ainda não houve transferência explícita, primeiro diga que Aline vai transferir para a Keila.
- Depois siga a ordem: prazo, orçamento, par/unidade, numeração.
- Só busque catálogo quando essas respostas estiverem coletadas ou quando o sistema já tiver esse contexto salvo.`;
    }

    if (/endere[cç]o|onde fica|shopping/.test(normalizedLastUserMessage)) {
      contextInfo += `\n\nINSTRUÇÃO CRÍTICA:
- O cliente pediu endereço.
- Responda diretamente com o endereço da loja, sem buscar catálogo.`;
    }

    const systemPrompt = aiConfig?.system_prompt || ALINE_SYSTEM_PROMPT;
    const model = aiConfig?.model || "gpt-4o-mini";
    const fullSystemPrompt = `${systemPrompt}${contextInfo}`;

    let toolChoice: any = "auto";
    if (shouldForceCatalog(lastUserMessage, currentState)) {
      toolChoice = { type: "function", function: { name: "search_catalog" } };
    }

    const initialResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: fullSystemPrompt }, ...messages],
        tools,
        tool_choice: toolChoice,
        max_tokens: 1000,
      }),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      throw new Error(`OpenAI API error: ${initialResponse.status} - ${errorText}`);
    }

    let responseData = await initialResponse.json();
    let assistantMessage = responseData.choices[0].message;
    let catalogProducts: any[] = [];

    if (assistantMessage.tool_calls?.length) {
      const toolResults: any[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments || "{}");

        let result: any = null;

        if (functionName === "search_catalog") {
          result = await searchCatalog(functionArgs, supabaseUrl, supabaseServiceKey);

          if (result?.success && result.products) {
            const sendVideoPriority = aiConfig?.send_video_priority ?? true;
            const includeSizes = aiConfig?.include_sizes ?? true;
            const includeStock = aiConfig?.include_stock ?? true;
            const includePrice = aiConfig?.include_price ?? true;

            catalogProducts = result.products.map((product: any, index: number) => {
              const imageUrl = product.media?.image_url || product.image_url || null;
              const videoUrl = product.media?.video_url || product.video_url || null;
              const useVideo = sendVideoPriority && !!videoUrl;
              const currentPrice = product.price_current || product.current_price || product.price || 0;
              const availableSizes =
                product.sizes?.map((size: any) => size.size || size) ||
                product.available_sizes ||
                [];

              return {
                index: index + 1,
                product_id: product.id,
                id: product.id,
                sku: product.sku,
                name: product.name,
                description: product.description || "",
                color: product.specs?.color || product.color || "",
                category: product.specs?.category || product.category || "",
                price: includePrice ? currentPrice : null,
                price_formatted: includePrice
                  ? `R$ ${Number(currentPrice).toFixed(2).replace(".", ",")}`
                  : null,
                image_url: imageUrl,
                video_url: videoUrl,
                media_url: useVideo ? videoUrl : imageUrl,
                media_type: useVideo ? "video" : "image",
                has_video: !!videoUrl,
                sizes: includeSizes ? availableSizes : [],
                sizes_formatted: includeSizes ? availableSizes.join(", ") : "",
                total_stock: includeStock ? (product.stock_available || product.total_stock || 0) : null,
                in_stock: (product.stock_available || product.total_stock || 0) > 0 || product.is_available,
                caption: formatProductCaption(
                  {
                    ...product,
                    price: currentPrice,
                    color: product.specs?.color || product.color || "",
                    available_sizes: availableSizes,
                  },
                  { includePrice, includeSizes, includeStock },
                ),
              };
            });
          }
        } else if (functionName === "get_product_details") {
          result = await searchCatalog({ sku: functionArgs.sku }, supabaseUrl, supabaseServiceKey);
        } else {
          result = { error: "Unknown function" };
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(result),
        });
      }

      const finalResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: fullSystemPrompt },
            ...messages,
            {
              role: "assistant",
              content: assistantMessage.content || null,
              tool_calls: assistantMessage.tool_calls,
            },
            ...toolResults,
          ],
          max_tokens: 1200,
        }),
      });

      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        throw new Error(`OpenAI API error: ${finalResponse.status} - ${errorText}`);
      }

      responseData = await finalResponse.json();
      assistantMessage = responseData.choices[0].message;
    }

    const responseText =
      assistantMessage.content || "Desculpe, não consegui processar sua mensagem.";

    const nodeMatch = responseText.match(/#node:\s*([\w-]+)/i);
    const actionMatch = responseText.match(/\[SYSTEM_ACTION\s+action:"([^"]+)"\]/i);

    let cleanMessage = responseText
      .replace(/#node:\s*[\w-]+/gi, "")
      .replace(/\[SYSTEM_ACTION[^\]]*\]/gi, "")
      .trim();

    if (catalogProducts.length > 0) {
      if (inferredAgent === "keila") {
        cleanMessage =
          "Separei opções na cor que você pediu. O valor do card é da unidade e o par sai pelo dobro. 💍";
      } else {
        cleanMessage =
          inferredCategory === "pingente"
            ? "Vou te mostrar algumas opções lindas! ✨"
            : "Separei algumas opções para você! 💍";
      }
    }

    const inferredNode =
      nodeMatch?.[1] ||
      (inferredAgent === "keila" && !currentState?.cor_preferida
        ? "transferencia_keila"
        : catalogProducts.length > 0
        ? "catalogo"
        : inferredCategory === "aliancas" && !inferredAllianceType
        ? "escolha_finalidade"
        : inferredCategory && !inferredColor
        ? "escolha_cor"
        : "abertura");

    const intencao =
      inferredClassification ||
      (catalogProducts.length > 0 ? "catalogo" : inferredCategory || "conversa");

    const acaoSugerida =
      inferredAgent === "keila"
        ? "transferir_keila"
        : catalogProducts.length > 0
        ? "enviar_catalogo"
        : actionMatch?.[1] === "register_lead_crm"
        ? "finalizar_venda"
        : "continuar_conversa";

    if (phone && saveHistory) {
      await supabase.from("conversation_events").insert({
        phone,
        type: "text",
        direction: "out",
        payload: {
          text: cleanMessage,
          node: inferredNode,
          action: actionMatch?.[1] || null,
          intencao,
          acao_sugerida: acaoSugerida,
          agente_atual: inferredAgent,
        },
      });

      await supabase.rpc("upsert_conversation_state", {
        p_phone: phone,
        p_stage: inferredNode,
        p_categoria: inferredCategory || null,
        p_tipo_alianca: inferredAllianceType || null,
        p_cor_preferida: inferredColor || null,
        p_selected_sku: currentState?.selected_sku || null,
        p_selected_name: currentState?.selected_name || null,
        p_selected_price: currentState?.selected_price || null,
        p_crm_entrega: currentState?.crm_entrega || null,
        p_crm_pagamento: currentState?.crm_pagamento || null,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        response: cleanMessage,
        mensagem_whatsapp: cleanMessage,
        message: responseText,
        filtros: {
          intencao,
          categoria: inferredCategory,
          cor: inferredColor,
          tipo_alianca: inferredAllianceType,
          agente_atual: inferredAgent,
          transferir_para_keila: inferredAgent === "keila",
          acao_sugerida: acaoSugerida,
          enviar_catalogo: catalogProducts.length > 0,
          finalizar_venda: actionMatch?.[1] === "register_lead_crm",
          node: inferredNode,
          acao_sistema: actionMatch?.[1] || null,
        },
        produtos: catalogProducts,
        total_produtos: catalogProducts.length,
        tem_produtos: catalogProducts.length > 0,
        produto_selecionado: null,
        tem_produto_selecionado: false,
        crm: {
          entrega: currentState?.crm_entrega || null,
          pagamento: currentState?.crm_pagamento || null,
          dados_completos: !!(currentState?.crm_entrega && currentState?.crm_pagamento),
        },
        memoria: {
          phone,
          agente_atual: inferredAgent,
          stage: inferredNode,
          categoria: inferredCategory,
          tipo_alianca: inferredAllianceType,
          cor: inferredColor,
          produto_sku: currentState?.selected_sku || null,
          produto_nome: currentState?.selected_name || null,
          entrega: currentState?.crm_entrega || null,
          pagamento: currentState?.crm_pagamento || null,
        },
        node_tecnico: inferredNode,
        acao_nome: actionMatch?.[1] || null,
        categoria_crm: inferredCategory,
        cor_crm: inferredColor,
        tem_acao: !!actionMatch?.[1],
        usage: responseData.usage,
        ai_model: model,
        ai_name: aiConfig?.name || "Aline",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
          acao_sugerida: "continuar_conversa",
          transferir_para_keila: false,
          node: "erro",
        },
        produtos: [],
        tem_produtos: false,
        memoria: null,
        crm: null,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
