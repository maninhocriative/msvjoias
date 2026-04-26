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
      description: `Use para buscar produtos quando já houver contexto suficiente.
- Nunca listar produtos manualmente na resposta.
- O sistema envia os cards separadamente.
- Use color quando o cliente informar a cor.
- Para alianças de casamento, use quando a Keila já tiver as informações necessárias.`,
      parameters: {
        type: "object",
        properties: {
          search: { type: "string" },
          category: {
            type: "string",
            enum: ["aliancas", "pingente", "aneis"],
          },
          color: {
            type: "string",
            enum: ["dourada", "prata", "preta", "azul", "rose"],
          },
          min_price: { type: "number" },
          max_price: { type: "number" },
          only_available: { type: "boolean" },
          exclude_shown_colors: { type: "boolean" },
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
          sku: { type: "string" },
        },
        required: ["sku"],
      },
    },
  },
];

const DEFAULT_MULTI_AGENT_PROMPT = `# Aline e Keila | ACIUM Manaus

## PAPÉIS
Você atende como duas especialistas:

### Aline
Aline faz a triagem inicial.
Ela identifica se o cliente quer:
- alianças de namoro
- alianças de casamento
- pingentes dourados
- pingentes prata

### Keila
Keila é a especialista em alianças de casamento.
Quando o assunto for alianças de casamento, o atendimento deve seguir como Keila.

---

## TOM
- curto
- elegante
- acolhedor
- comercial
- nunca escrever textão
- nunca listar catálogo manualmente

---

## REGRAS
1. Nunca inventar preços.
2. Nunca listar produtos no texto.
3. Quando houver cards, usar só uma frase curta de introdução.
4. Para alianças de casamento, lembrar:
   "O valor do card é da unidade. O par sai pelo dobro. 💍"
5. Aline faz triagem.
6. Keila conduz casamento com perguntas objetivas.

---

## FLUXO DA KEILA
Perguntar nesta ordem:
1. para quando deseja fechar
2. quanto quer investir
3. se deseja o par ou a unidade
4. a numeração

Se não souber a numeração:
" Tudo bem, se você ainda não souber a numeração agora, eu sigo com você mesmo assim 😊"

Depois:
- buscar catálogo da cor escolhida
- informar que o valor do card é da unidade e o par é o dobro
- perguntar se gostou de algum modelo

---

## ENDEREÇO
Shopping Sumaúma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM.`;

function normalizeText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectColor(text: string): string | null {
  const normalized = normalizeText(text);

  if (/(dourada|dourado|ouro|gold|amarela|amarelo)/.test(normalized)) return "dourada";
  if (/(prata|prateada|prateado|aco|aço|silver|cinza)/.test(normalized)) return "prata";
  if (/(preta|preto|black|escura|escuro)/.test(normalized)) return "preta";
  if (/(azul|blue)/.test(normalized)) return "azul";
  if (/(rose|ros[eé]|rosa)/.test(normalized)) return "rose";

  return null;
}

function detectCategory(text: string, currentState: any): string | null {
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

function detectAllianceType(text: string, currentState: any): string | null {
  const normalized = normalizeText(text);

  if (/casamento|casar|noiva|noivo|noivado|tungsten/.test(normalized)) {
    return "casamento";
  }

  if (/namoro|compromisso|namorada|namorado/.test(normalized)) {
    return "namoro";
  }

  return currentState?.tipo_alianca || null;
}

function chooseAgent(text: string, currentState: any, agentOverride?: string | null): "aline" | "keila" {
  if (agentOverride === "keila") return "keila";
  if (agentOverride === "aline") return "aline";

  const category = detectCategory(text, currentState);
  const allianceType = detectAllianceType(text, currentState);
  const normalized = normalizeText(text);

  const explicitMarriage = /casamento|casar|noiva|noivo|noivado|tungsten/.test(normalized);
  const marriageContext =
    category === "aliancas" &&
    (allianceType === "casamento" || explicitMarriage || String(currentState?.stage || "").includes("keila"));

  return marriageContext ? "keila" : "aline";
}

function shouldForceCatalog(text: string, currentState: any, agent: "aline" | "keila"): boolean {
  const normalized = normalizeText(text);
  const category = detectCategory(text, currentState);
  const color = detectColor(text) || currentState?.cor_preferida || null;
  const allianceType = detectAllianceType(text, currentState);

  const wantsToSee = /quero ver|mostra|mostrar|manda op|opcoes|opções|catalogo|catálogo|me mostra|mais opções/.test(normalized);

  if (agent === "keila") {
    const hasBudget = !!currentState?.orcamento_valor || !!currentState?.orcamento_texto;
    const hasQuantityType = !!currentState?.quantidade_tipo;
    const hasSize =
      !!currentState?.tamanho_1 ||
      currentState?.numeracao_status === "nao_sabe";

    return category === "aliancas" && allianceType === "casamento" && color && hasBudget && hasQuantityType && hasSize;
  }

  if (category === "pingente" && color && wantsToSee) return true;
  if (category === "aliancas" && allianceType && color && wantsToSee) return true;

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
    lines.push(`💰 *R$ ${Number(price).toFixed(2).replace(".", ",")}*`);
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

async function callCatalogSearch(params: Record<string, any>, supabaseUrl: string, supabaseKey: string) {
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

async function getAgentConfig(supabase: any, agent: "aline" | "keila") {
  const targetName = agent === "keila" ? "Keila" : "Aline";

  const { data } = await supabase
    .from("ai_agent_config")
    .select("*")
    .ilike("name", targetName)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (data) return data;

  const { data: fallback } = await supabase
    .from("ai_agent_config")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return fallback || null;
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
          default_prompt: DEFAULT_MULTI_AGENT_PROMPT,
          prompt_length: DEFAULT_MULTI_AGENT_PROMPT.length,
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
    const agentOverride = body.agent_override || null;
    const memoryContext = body.memory_context || null;
    const conversationSnapshot = body.conversation_snapshot || null;

    let currentState: any = null;
    if (phone) {
      const { data: state } = await supabase
        .from("conversation_state")
        .select("*")
        .eq("phone", phone)
        .single();

      currentState = state;
    }

    const effectiveState = {
      ...(currentState || {}),
      ...(conversationSnapshot || {}),
    };

    const lastUserMessage = String(newMessage || messages[messages.length - 1]?.content || "");
    const agent = chooseAgent(lastUserMessage, effectiveState, agentOverride);
    const aiConfig = await getAgentConfig(supabase, agent);

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
            agente_atual: agent,
          },
        });
      }
    }

    const inferredCategory = detectCategory(lastUserMessage, effectiveState);
    const inferredAllianceType = detectAllianceType(lastUserMessage, effectiveState);
    const inferredColor = detectColor(lastUserMessage) || effectiveState?.cor_preferida || null;

    let contextInfo = "";

    if (contactName) {
      contextInfo += `\nCliente: ${contactName}`;
    }

    contextInfo += `\nAgente em uso: ${agent}`;
    if (inferredCategory) contextInfo += `\nCategoria: ${inferredCategory}`;
    if (inferredAllianceType) contextInfo += `\nTipo de aliança: ${inferredAllianceType}`;
    if (inferredColor) contextInfo += `\nCor: ${inferredColor}`;

    if (effectiveState) {
      contextInfo += `\n\nEstado atual:`;
      if (effectiveState.stage) contextInfo += `\n- Etapa: ${effectiveState.stage}`;
      if (effectiveState.categoria) contextInfo += `\n- Categoria atual: ${effectiveState.categoria}`;
      if (effectiveState.tipo_alianca) contextInfo += `\n- Tipo atual: ${effectiveState.tipo_alianca}`;
      if (effectiveState.cor_preferida) contextInfo += `\n- Cor atual: ${effectiveState.cor_preferida}`;
      if (effectiveState.orcamento_valor) contextInfo += `\n- Orçamento: ${effectiveState.orcamento_valor}`;
      if (effectiveState.quantidade_tipo) contextInfo += `\n- Par ou unidade: ${effectiveState.quantidade_tipo}`;
      if (effectiveState.selected_sku) contextInfo += `\n- Produto selecionado: ${effectiveState.selected_sku}`;
    }

    if (memoryContext) {
      contextInfo += `\n\nMemória do cliente: ${memoryContext}`;
    }

    if (agent === "keila") {
      contextInfo += `\n\nRegra extra da Keila:
- manter foco em alianças de casamento
- usar memória do cliente quando existir
- sempre lembrar que o valor do card é da unidade e o par sai pelo dobro`;
    }

    if (/endere[cç]o|onde fica|shopping/.test(normalizeText(lastUserMessage))) {
      contextInfo += `\n\nO cliente pediu endereço. Responda diretamente com o endereço da loja, sem catálogo.`;
    }

    const systemPrompt = aiConfig?.system_prompt || DEFAULT_MULTI_AGENT_PROMPT;
    const model = aiConfig?.model || "gpt-4o-mini";
    const fullSystemPrompt = `${systemPrompt}${contextInfo}`;

    let toolChoice: any = "auto";
    if (shouldForceCatalog(lastUserMessage, effectiveState, agent)) {
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
          result = await callCatalogSearch(functionArgs, supabaseUrl, supabaseServiceKey);

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
          result = await callCatalogSearch({ sku: functionArgs.sku }, supabaseUrl, supabaseServiceKey);
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
      cleanMessage =
        agent === "keila"
          ? "Separei opções na cor que você pediu. O valor do card é da unidade e o par sai pelo dobro. 💍"
          : inferredCategory === "pingente"
          ? "Vou te mostrar algumas opções lindas! ✨"
          : "Separei algumas opções para você! 💍";
    }

    const inferredNode =
      nodeMatch?.[1] ||
      (catalogProducts.length > 0
        ? "catalogo"
        : agent === "keila"
        ? "keila"
        : inferredCategory === "aliancas" && !inferredAllianceType
        ? "escolha_finalidade"
        : inferredCategory && !inferredColor
        ? "escolha_cor"
        : "abertura");

    const intencao =
      agent === "keila"
        ? "aliancas_casamento"
        : inferredCategory || "conversa";

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
          agente_atual: agent,
        },
      });

      await supabase.rpc("upsert_conversation_state", {
        p_phone: phone,
        p_stage: inferredNode,
        p_categoria: inferredCategory || null,
        p_tipo_alianca: inferredAllianceType || null,
        p_cor_preferida: inferredColor || null,
        p_selected_sku: effectiveState?.selected_sku || null,
        p_selected_name: effectiveState?.selected_name || null,
        p_selected_price: effectiveState?.selected_price || null,
        p_crm_entrega: effectiveState?.crm_entrega || null,
        p_crm_pagamento: effectiveState?.crm_pagamento || null,
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
          agente_atual: agent,
          transferir_para_keila: agent === "keila",
          acao_sugerida: catalogProducts.length > 0 ? "enviar_catalogo" : "continuar_conversa",
          enviar_catalogo: catalogProducts.length > 0,
          node: inferredNode,
          acao_sistema: actionMatch?.[1] || null,
        },
        produtos: catalogProducts,
        total_produtos: catalogProducts.length,
        tem_produtos: catalogProducts.length > 0,
        produto_selecionado: null,
        tem_produto_selecionado: false,
        crm: {
          entrega: effectiveState?.crm_entrega || null,
          pagamento: effectiveState?.crm_pagamento || null,
          dados_completos: !!(effectiveState?.crm_entrega && effectiveState?.crm_pagamento),
        },
        memoria: {
          phone,
          agente_atual: agent,
          stage: inferredNode,
          categoria: inferredCategory,
          tipo_alianca: inferredAllianceType,
          cor: inferredColor,
          produto_sku: effectiveState?.selected_sku || null,
          produto_nome: effectiveState?.selected_name || null,
          entrega: effectiveState?.crm_entrega || null,
          pagamento: effectiveState?.crm_pagamento || null,
        },
        node_tecnico: inferredNode,
        acao_nome: actionMatch?.[1] || null,
        categoria_crm: inferredCategory,
        cor_crm: inferredColor,
        tem_acao: !!actionMatch?.[1],
        usage: responseData.usage,
        ai_model: model,
        ai_name: aiConfig?.name || (agent === "keila" ? "Keila" : "Aline"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("AI Chat error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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
