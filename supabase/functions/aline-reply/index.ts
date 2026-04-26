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
      description:
        "Use para buscar produtos do catálogo. Quando houver produtos, o sistema envia cards visuais com foto, código e preço.",
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
      description: "Use para buscar detalhes de um produto por SKU.",
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

const ALINE_SYSTEM_PROMPT = `# Aline | ACIUM Manaus

Você é Aline, consultora virtual da ACIUM Manaus.

Regras:
- Responda sempre de forma curta, natural e comercial.
- Nunca liste produtos no texto; o sistema envia os cards separadamente.
- Quando houver catálogo, responda só com uma frase curta de introdução.
- Se o cliente falar de alianças e ainda não disser se é namoro ou casamento, pergunte isso.
- Se o cliente falar de pingentes e não disser a cor, pergunte dourada ou prata.
- Se o cliente perguntar endereço, responda com o endereço da loja.
- Tom acolhedor, objetivo e elegante.
- Use poucos emojis.

Endereço:
Shopping Sumaúma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM.

Nunca invente estoque, preço ou prazo se a informação não vier do sistema.`;

type ConversationData = Record<string, unknown>;

interface ResolvedConversation {
  conversation: any | null;
  skippedResponse?: Response;
}

interface CatalogProduct {
  id: string;
  sku: string | null;
  name: string;
  description: string;
  price: number | null;
  price_formatted: string | null;
  color: string | null;
  category: string | null;
  image_url: string | null;
  video_url: string | null;
  media_url: string | null;
  media_type: "image" | "video";
  has_video: boolean;
  sizes: string[];
  sizes_formatted: string;
  stock: number;
  in_stock: boolean;
  caption: string;
  index?: number;
  button_id?: string;
  button_label?: string;
}

function normalizeText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formatCurrency(value: unknown): string | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return `R$ ${number.toFixed(2).replace(".", ",")}`;
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

function detectLeadClassification(text: string, data: ConversationData): string | null {
  const normalized = normalizeText(text);
  const hasAllianceText = /alianc/.test(normalized) || data.categoria === "aliancas";
  const hasPendantText =
    /pingente|pingentes|medalha|medalhas|medalhinha|colar|cordao|cordão|corrente/.test(normalized) ||
    data.categoria === "pingente";

  if (hasAllianceText && /casamento|casar|noiva|noivo|noivado|tungsten/.test(normalized)) {
    return "aliancas_casamento";
  }

  if (hasAllianceText && /namoro|compromisso|namorada|namorado/.test(normalized)) {
    return "aliancas_namoro";
  }

  if (hasPendantText && detectColor(normalized) === "dourada") {
    return "pingentes_dourados";
  }

  if (hasPendantText && detectColor(normalized) === "prata") {
    return "pingentes_prata";
  }

  return null;
}

function detectMarriageIntent(text: string, data: ConversationData, currentNode: string): boolean {
  const normalized = normalizeText(text);
  const hasMarriageSignal = /casamento|casar|noiva|noivo|noivado|tungsten/.test(normalized);
  const hasAllianceContext =
    /alianc/.test(normalized) ||
    data.categoria === "aliancas" ||
    data.finalidade === "casamento" ||
    data.triagem_categoria === "aliancas_casamento" ||
    currentNode === "escolha_finalidade";

  return hasMarriageSignal && hasAllianceContext;
}

function extractTimelineAnswer(text: string, currentNode: string): string | null {
  const normalized = normalizeText(text);
  const hasDateHint =
    /hoje|amanha|amanhã|depois de amanha|semana|mes|mês|fim de semana|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo|dia \d{1,2}|mes que vem|m[eê]s que vem|proximo mes|próximo mês/.test(
      normalized,
    );

  if (!String(currentNode || "").includes("prazo") && !hasDateHint) {
    return null;
  }

  return text.trim() || null;
}

function extractBudgetInfo(text: string, currentNode: string): { value: number; raw: string } | null {
  const normalized = normalizeText(text);
  const isBudgetContext =
    String(currentNode || "").includes("orcamento") ||
    /orcamento|orçamento|invest|valor|faixa|ate |até |r\$|reais|real/.test(normalized);

  if (!isBudgetContext) return null;

  const match = text.match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/);
  if (!match) return null;

  const parsed = Number(match[1].replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return {
    value: parsed,
    raw: text.trim(),
  };
}

function extractPairOrUnit(text: string): "par" | "unidade" | null {
  const normalized = normalizeText(text);

  if (/\bpar\b|casal|duas|dois|os dois|as duas/.test(normalized)) return "par";
  if (/\bunidade\b|uma so|uma só|apenas uma|avulsa|avulso|so uma|só uma/.test(normalized)) {
    return "unidade";
  }

  return null;
}

function customerDoesNotKnowSize(text: string): boolean {
  const normalized = normalizeText(text);
  return /nao sei|não sei|nao sabemos|não sabemos|nao tenho|não tenho|depois vejo|depois vejo isso|ainda nao sei|ainda não sei/.test(
    normalized,
  );
}

function extractRingSizes(text: string, currentNode: string): { size1: string | null; size2: string | null } {
  const normalized = normalizeText(text);
  const sizeContext =
    String(currentNode || "").includes("numeracao") ||
    String(currentNode || "").includes("tamanho") ||
    /tamanho|tam\.?|numeracao|numeração|numero|número|aro|medida/.test(normalized);

  const pairMatch = normalized.match(/(\d{1,2})\s*(?:e|,|\/|-)\s*(\d{1,2})/);
  if (pairMatch) {
    const size1 = Number(pairMatch[1]);
    const size2 = Number(pairMatch[2]);

    if (size1 >= 8 && size1 <= 35 && size2 >= 8 && size2 <= 35) {
      return { size1: String(size1), size2: String(size2) };
    }
  }

  if (sizeContext) {
    const singleMatch = normalized.match(/\b(\d{1,2})\b/);
    if (singleMatch) {
      const size = Number(singleMatch[1]);
      if (size >= 8 && size <= 35) {
        return { size1: String(size), size2: null };
      }
    }
  }

  return { size1: null, size2: null };
}

function formatProductCaption(
  product: Partial<CatalogProduct>,
  options: { includePrice?: boolean; includeSizes?: boolean; includeStock?: boolean },
): string {
  const lines: string[] = [];

  if (product.name) lines.push(`*${product.name}*`);
  if (product.description) lines.push(product.description);

  if (options.includePrice !== false) {
    const priceFormatted = product.price_formatted || formatCurrency(product.price);
    if (priceFormatted) lines.push(`💰 ${priceFormatted}`);
  }

  if (product.color) lines.push(`🎨 Cor: ${product.color}`);
  if (options.includeSizes !== false && product.sizes && product.sizes.length > 0) {
    lines.push(`📏 Tamanhos: ${product.sizes.join(", ")}`);
  }

  if (options.includeStock !== false) {
    lines.push(product.in_stock ? "✅ Em estoque" : "⚠️ Sob consulta");
  }

  if (product.sku) lines.push(`📦 Cód: ${product.sku}`);

  return lines.join("\n");
}

function resetCatalogChoice(data: ConversationData) {
  delete data.catalogo_keila_enviado;
  delete data.last_catalog;
  delete data.selected_product;
  delete data.selected_sku;
  delete data.selected_name;
  delete data.selected_price;
}

function findCatalogSelection(token: string | null, lastCatalog: any[]): any | null {
  if (!token || !Array.isArray(lastCatalog) || lastCatalog.length === 0) return null;

  const normalized = normalizeText(token);
  const explicitButton = normalized.match(/^select[_-]([a-z0-9-]+)/i);
  if (explicitButton) {
    const targetSku = explicitButton[1].toUpperCase();
    return lastCatalog.find((item: any) => String(item.sku || "").toUpperCase() === targetSku) || null;
  }

  const exactSku = lastCatalog.find((item: any) => {
    const sku = String(item.sku || "").toUpperCase();
    return sku && normalized.includes(sku.toLowerCase());
  });
  if (exactSku) return exactSku;

  const numericSelection = normalized.match(/^\s*(\d{1,2})\s*$/);
  if (numericSelection) {
    const index = Number(numericSelection[1]) - 1;
    if (index >= 0 && index < lastCatalog.length) return lastCatalog[index];
  }

  const wantsThis = /quero esta|quero esse|gostei dessa|gostei desse|vou querer essa|vou querer esse/.test(normalized);
  if (wantsThis && lastCatalog.length === 1) {
    return lastCatalog[0];
  }

  return null;
}

function buildKeilaCards(products: CatalogProduct[]): CatalogProduct[] {
  return products.map((product, index) => {
    const priceFormatted = product.price_formatted || formatCurrency(product.price) || "Sob consulta";
    const captionLines = [
      `*${product.name}*`,
      product.color ? `🎨 Cor: ${product.color}` : null,
      product.sku ? `📦 Cód: ${product.sku}` : null,
      `💰 Valor da unidade: ${priceFormatted}`,
      `💍 O par sai pelo dobro.`,
    ].filter(Boolean);

    return {
      ...product,
      index: index + 1,
      caption: captionLines.join("\n"),
      button_id: `select_${product.sku || product.id}`,
      button_label: "Quero esta",
    };
  });
}

function buildResponsePayload(args: {
  phone: string;
  message: string;
  node: string;
  products?: CatalogProduct[];
  selectedProduct?: any | null;
  actionName?: string | null;
  collectedData: ConversationData;
  model?: string;
  usage?: unknown;
  useProductButtons?: boolean;
  postCatalogMessage?: string | null;
  agenteAtual?: string;
}) {
  const {
    phone,
    message,
    node,
    products = [],
    selectedProduct = null,
    actionName = null,
    collectedData,
    model = "gpt-4o-mini",
    usage = null,
    useProductButtons = false,
    postCatalogMessage = null,
    agenteAtual = "aline",
  } = args;

  const singleLine = message.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();

  return {
    success: true,
    response: message,
    mensagem_whatsapp: message,
    reply_text: singleLine,
    mensagem_linha_unica: singleLine,
    node_tecnico: node,
    acao_nome: actionName,
    tem_acao: actionName !== null,
    produtos: products,
    total_produtos: products.length,
    tem_produtos: products.length > 0,
    mensagem_pos_catalogo: postCatalogMessage,
    enviar_mensagem_pos_catalogo: !!postCatalogMessage,
    produto_selecionado: selectedProduct,
    tem_produto_selecionado: !!selectedProduct,
    categoria_crm: collectedData.categoria || null,
    cor_crm: collectedData.cor || null,
    memoria: {
      phone,
      agente_atual: agenteAtual,
      stage: node,
      categoria: collectedData.categoria || null,
      finalidade: collectedData.finalidade || null,
      cor: collectedData.cor || null,
      produto_sku: collectedData.selected_sku || null,
      produto_nome: collectedData.selected_name || null,
      produto_preco: collectedData.selected_price || null,
      prazo_fechamento: collectedData.prazo_fechamento || null,
      orcamento_valor: collectedData.orcamento_valor || null,
      quantidade_tipo: collectedData.quantidade_tipo || null,
      tamanho_1: collectedData.tamanho_1 || null,
      tamanho_2: collectedData.tamanho_2 || null,
      numeracao_status: collectedData.numeracao_status || null,
    },
    tamanhos: {
      tamanho_1: collectedData.tamanho_1 || null,
      tamanho_2: collectedData.tamanho_2 || null,
      tem_tamanhos: !!(collectedData.tamanho_1 || collectedData.tamanho_2),
      quantidade_tipo: collectedData.quantidade_tipo || null,
    },
    use_product_buttons: useProductButtons,
    agente_atual: agenteAtual,
    ai_model: model,
    usage,
  };
}

async function searchCatalog(
  params: Record<string, any>,
  supabase: any,
  collectedData?: ConversationData,
): Promise<{ success: boolean; products: CatalogProduct[]; total?: number; error?: string }> {
  const finalidade = String(collectedData?.finalidade || params.finalidade || "").toLowerCase();
  const requestedColor = detectColor(String(params.color || collectedData?.cor || ""));
  const requestedCategory = String(params.category || "").toLowerCase();
  const maxPrice = params.max_price ? Number(params.max_price) : null;
  const minPrice = params.min_price ? Number(params.min_price) : null;
  const onlyAvailable = params.only_available === true;
  const searchTerm = normalizeText(String(params.search || ""));
  const limit = Math.max(1, Math.min(Number(params.limit || 8), 20));

  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      sku,
      price,
      image_url,
      video_url,
      category,
      color,
      description,
      product_variants(size, stock)
    `)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message, products: [] };
  }

  let products = (data || []).filter((product: any) => {
    const category = normalizeText(product.category || "");
    const name = normalizeText(product.name || "");
    const color = detectColor(product.color || "");

    if (requestedCategory === "aliancas") {
      const isAlliance =
        category.includes("alianca") ||
        category.includes("aliancas") ||
        category.includes("tungstenio") ||
        name.includes("alianca");

      if (!isAlliance) return false;

      if (finalidade === "casamento") {
        const isTungsten =
          category.includes("tungstenio") ||
          category.includes("tungsten") ||
          name.includes("tungstenio") ||
          name.includes("tungsten");
        if (!isTungsten) return false;
      }

      if (finalidade === "namoro") {
        const isTungsten =
          category.includes("tungstenio") ||
          category.includes("tungsten") ||
          name.includes("tungstenio") ||
          name.includes("tungsten");
        if (isTungsten) return false;
      }
    }

    if (requestedCategory === "pingente") {
      const isPendant = category.includes("pingente") || name.includes("pingente") || name.includes("medalha");
      if (!isPendant) return false;
    }

    if (requestedCategory === "aneis") {
      const isRing = category.includes("anel") || category.includes("aneis") || name.includes("anel");
      if (!isRing) return false;
    }

    if (requestedColor && color !== requestedColor) return false;

    const price = Number(product.price || 0);
    if (minPrice !== null && Number.isFinite(minPrice) && price < minPrice) return false;
    if (maxPrice !== null && Number.isFinite(maxPrice) && price > maxPrice) return false;

    if (searchTerm) {
      const haystack = `${normalizeText(product.name || "")} ${normalizeText(product.description || "")}`;
      if (!haystack.includes(searchTerm)) return false;
    }

    const stock = (product.product_variants || []).reduce((sum: number, item: any) => sum + Number(item.stock || 0), 0);
    if (onlyAvailable && stock <= 0) return false;

    return true;
  });

  products = products.slice(0, limit);

  const mapped: CatalogProduct[] = products.map((product: any) => {
    const sizes = (product.product_variants || [])
      .filter((variant: any) => Number(variant.stock || 0) > 0)
      .map((variant: any) => String(variant.size));

    const stock = (product.product_variants || []).reduce((sum: number, item: any) => sum + Number(item.stock || 0), 0);
    const price = Number(product.price || 0);

    const mappedProduct: CatalogProduct = {
      id: product.id,
      sku: product.sku || null,
      name: product.name || "Produto",
      description: product.description || "",
      price: Number.isFinite(price) ? price : null,
      price_formatted: formatCurrency(price),
      color: product.color || null,
      category: product.category || null,
      image_url: product.image_url || null,
      video_url: product.video_url || null,
      media_url: product.video_url || product.image_url || null,
      media_type: product.video_url ? "video" : "image",
      has_video: !!product.video_url,
      sizes,
      sizes_formatted: sizes.join(", "),
      stock,
      in_stock: stock > 0,
      caption: "",
    };

    mappedProduct.caption = formatProductCaption(mappedProduct, {
      includePrice: true,
      includeSizes: true,
      includeStock: true,
    });

    return mappedProduct;
  });

  return {
    success: true,
    products: mapped,
    total: mapped.length,
  };
}

async function getProductDetails(sku: string, supabase: any) {
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      sku,
      price,
      image_url,
      video_url,
      category,
      color,
      description,
      product_variants(size, stock)
    `)
    .eq("sku", sku)
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: "Produto não encontrado" };
  }

  const stock = (data.product_variants || []).reduce((sum: number, item: any) => sum + Number(item.stock || 0), 0);
  const sizes = (data.product_variants || [])
    .filter((item: any) => Number(item.stock || 0) > 0)
    .map((item: any) => String(item.size));

  return {
    success: true,
    product: {
      id: data.id,
      sku: data.sku || null,
      name: data.name || "Produto",
      description: data.description || "",
      price: Number(data.price || 0),
      price_formatted: formatCurrency(data.price),
      color: data.color || null,
      category: data.category || null,
      image_url: data.image_url || null,
      video_url: data.video_url || null,
      sizes,
      stock,
      in_stock: stock > 0,
    },
  };
}

async function resolveConversation(supabase: any, phone: string, contactName: string): Promise<ResolvedConversation> {
  const { data: existingConversation, error } = await supabase
    .from("aline_conversations")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!existingConversation) {
    const { data: created, error: createError } = await supabase
      .from("aline_conversations")
      .insert({
        phone,
        current_node: "abertura",
        collected_data: { contact_name: contactName || "Cliente", agente_atual: "aline" },
        status: "active",
      })
      .select()
      .single();

    if (createError) throw createError;
    return { conversation: created };
  }

  if (existingConversation.status === "human_takeover") {
    const lastMessageAt = existingConversation.last_message_at ? new Date(existingConversation.last_message_at) : null;
    const hoursWithoutReply = lastMessageAt ? (Date.now() - lastMessageAt.getTime()) / (1000 * 60 * 60) : 999;

    if (hoursWithoutReply < 4) {
      return {
        conversation: existingConversation,
        skippedResponse: new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            reason: "human_takeover",
            message: "Atendimento humano ativo, Aline não responde",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        ),
      };
    }

    const reactivatedData = {
      ...(existingConversation.collected_data || {}),
      agente_atual: "aline",
    };

    const { data: reactivated } = await supabase
      .from("aline_conversations")
      .update({
        status: "active",
        current_node: "abertura",
        last_node: null,
        collected_data: reactivatedData,
        last_message_at: new Date().toISOString(),
        followup_count: 0,
        assigned_seller_id: null,
        assigned_seller_name: null,
      })
      .eq("id", existingConversation.id)
      .select()
      .single();

    return { conversation: reactivated };
  }

  if (existingConversation.status === "finished") {
    const reactivatedData = {
      ...(existingConversation.collected_data || {}),
      agente_atual: "aline",
      contact_name: contactName || existingConversation.collected_data?.contact_name || "Cliente",
    };

    const { data: reopened } = await supabase
      .from("aline_conversations")
      .update({
        status: "active",
        current_node: "abertura",
        last_node: null,
        collected_data: reactivatedData,
        last_message_at: new Date().toISOString(),
        followup_count: 0,
      })
      .eq("id", existingConversation.id)
      .select()
      .single();

    return { conversation: reopened };
  }

  await supabase
    .from("aline_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      followup_count: 0,
    })
    .eq("id", existingConversation.id);

  return { conversation: existingConversation };
}

async function saveConversationState(
  supabase: any,
  conversationId: string,
  currentNode: string,
  lastNode: string | null,
  collectedData: ConversationData,
) {
  await supabase
    .from("aline_conversations")
    .update({
      current_node: currentNode,
      last_node: lastNode,
      collected_data: collectedData,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

async function saveAssistantReply(
  supabase: any,
  conversationId: string,
  role: string,
  message: string,
  node: string,
  actionsExecuted: Array<{ action: string }> | null = null,
) {
  await supabase.from("aline_messages").insert({
    conversation_id: conversationId,
    role,
    message,
    node,
    actions_executed: actionsExecuted,
  });
}

async function handleKeilaMarriageFlow(args: {
  supabase: any;
  conversation: any;
  phone: string;
  message: string;
  contactName: string;
  buttonResponseId: string | null;
}) {
  const { supabase, conversation, phone, message, contactName, buttonResponseId } = args;
  const data: ConversationData = { ...(conversation.collected_data || {}) };
  const normalized = normalizeText(message);
  const currentNode = String(conversation.current_node || "");
  const currentAgent = String(data.agente_atual || "aline");
  const classification = detectLeadClassification(message, data);

  if (classification) {
    data.triagem_categoria = classification;
  }

  const inKeilaFlow = currentAgent === "keila";
  const shouldTransferToKeila = !inKeilaFlow && detectMarriageIntent(message, data, currentNode);

  if (!inKeilaFlow && !shouldTransferToKeila) {
    return null;
  }

  let justTransferred = false;
  if (shouldTransferToKeila) {
    data.agente_atual = "keila";
    data.categoria = "aliancas";
    data.finalidade = "casamento";
    data.transferido_por = "aline";
    data.transferido_em = new Date().toISOString();
    justTransferred = true;
  }

  const detectedColor = detectColor(message);
  if (detectedColor && detectedColor !== data.cor) {
    if (detectedColor === "rose") {
      const invalidColorMessage = `${
        justTransferred ? "Perfeito! Vou te transferir para a Keila, nossa especialista em alianças de casamento. 💍\n\n" : ""
      }Para casamento eu consigo te mostrar dourada, prata, preta ou azul. Qual você prefere? 🎨`;

      await saveConversationState(
        supabase,
        conversation.id,
        "keila_pergunta_cor",
        conversation.current_node || null,
        { ...data, agente_atual: "keila", categoria: "aliancas", finalidade: "casamento" },
      );

      await saveAssistantReply(supabase, conversation.id, "keila", invalidColorMessage, "keila_pergunta_cor");

      return new Response(
        JSON.stringify(
          buildResponsePayload({
            phone,
            message: invalidColorMessage,
            node: "keila_pergunta_cor",
            collectedData: { ...data, agente_atual: "keila", categoria: "aliancas", finalidade: "casamento" },
            agenteAtual: "keila",
            model: "keila-specialist",
          }),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    data.cor = detectedColor;
    resetCatalogChoice(data);
  }

  const timeline = extractTimelineAnswer(message, currentNode);
  if (timeline && !data.prazo_fechamento) {
    data.prazo_fechamento = timeline;
  }

  const budget = extractBudgetInfo(message, currentNode);
  if (budget && Number(data.orcamento_valor || 0) !== budget.value) {
    data.orcamento_valor = budget.value;
    data.orcamento_texto = budget.raw;
    resetCatalogChoice(data);
  }

  const quantityType = extractPairOrUnit(message);
  if (quantityType && data.quantidade_tipo !== quantityType) {
    data.quantidade_tipo = quantityType;
    resetCatalogChoice(data);
  }

  let justAcknowledgedUnknownSize = false;
  if (customerDoesNotKnowSize(message)) {
    data.numeracao_status = "nao_sabe";
    justAcknowledgedUnknownSize = true;
  }

  const sizes = extractRingSizes(message, currentNode);
  if (sizes.size1) {
    data.tamanho_1 = sizes.size1;
    data.numeracao_status = "informada";
  }
  if (sizes.size2) {
    data.tamanho_2 = sizes.size2;
    data.numeracao_status = "informada";
  }

  const selectedProduct = findCatalogSelection(
    buttonResponseId || message,
    Array.isArray(data.last_catalog) ? (data.last_catalog as any[]) : [],
  );

  if (selectedProduct) {
    data.selected_product = selectedProduct;
    data.selected_sku = selectedProduct.sku;
    data.selected_name = selectedProduct.name;
    data.selected_price = selectedProduct.price;
  }

  const needsSecondSize =
    data.quantidade_tipo !== "unidade" &&
    !!data.tamanho_1 &&
    !data.tamanho_2 &&
    data.numeracao_status !== "nao_sabe";

  const hasColor = !!data.cor;
  const hasTimeline = !!data.prazo_fechamento;
  const hasBudget = !!data.orcamento_valor || !!data.orcamento_texto;
  const hasQuantityType = !!data.quantidade_tipo;
  const hasSizeInfo = !!data.tamanho_1 || data.numeracao_status === "nao_sabe";

  if (selectedProduct) {
    const reply = `Perfeito! Já identifiquei o modelo *${selectedProduct.name}*. 💍\nVou seguir com seu atendimento por essa opção.`;

    await saveConversationState(supabase, conversation.id, "keila_modelo_escolhido", conversation.current_node || null, data);
    await saveAssistantReply(supabase, conversation.id, "keila", reply, "keila_modelo_escolhido");

    return new Response(
      JSON.stringify(
        buildResponsePayload({
          phone,
          message: reply,
          node: "keila_modelo_escolhido",
          selectedProduct,
          collectedData: data,
          agenteAtual: "keila",
          model: "keila-specialist",
        }),
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!hasColor) {
    const reply = `${
      justTransferred ? "Perfeito! Vou te transferir para a Keila, nossa especialista em alianças de casamento. 💍\n\n" : ""
    }Oi! Sou a Keila. Qual cor você prefere: dourada, prata, preta ou azul? 🎨`;

    await saveConversationState(
      supabase,
      conversation.id,
      "keila_pergunta_cor",
      conversation.current_node || null,
      { ...data, agente_atual: "keila", categoria: "aliancas", finalidade: "casamento", contact_name: contactName || data.contact_name || "Cliente" },
    );
    await saveAssistantReply(supabase, conversation.id, "keila", reply, "keila_pergunta_cor");

    return new Response(
      JSON.stringify(
        buildResponsePayload({
          phone,
          message: reply,
          node: "keila_pergunta_cor",
          collectedData: { ...data, agente_atual: "keila", categoria: "aliancas", finalidade: "casamento" },
          agenteAtual: "keila",
          model: "keila-specialist",
        }),
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!hasTimeline) {
    const reply = `${
      justTransferred ? "Perfeito! Vou te transferir para a Keila, nossa especialista em alianças de casamento. 💍\n\n" : ""
    }Oi! Sou a Keila. Para quando você quer fechar essas alianças? ⏰`;

    await saveConversationState(
      supabase,
      conversation.id,
      "keila_pergunta_prazo",
      conversation.current_node || null,
      { ...data, agente_atual: "keila", categoria: "aliancas", finalidade: "casamento" },
    );
    await saveAssistantReply(supabase, conversation.id, "keila", reply, "keila_pergunta_prazo");

    return new Response(
      JSON.stringify(
        buildResponsePayload({
          phone,
          message: reply,
          node: "keila_pergunta_prazo",
          collectedData: { ...data, agente_atual: "keila", categoria: "aliancas", finalidade: "casamento" },
          agenteAtual: "keila",
          model: "keila-specialist",
        }),
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!hasBudget) {
    const reply = "Perfeito! E qual valor você quer investir nas alianças? 💰";

    await saveConversationState(
      supabase,
      conversation.id,
      "keila_pergunta_orcamento",
      conversation.current_node || null,
      data,
    );
    await saveAssistantReply(supabase, conversation.id, "keila", reply, "keila_pergunta_orcamento");

    return new Response(
      JSON.stringify(
        buildResponsePayload({
          phone,
          message: reply,
          node: "keila_pergunta_orcamento",
          collectedData: data,
          agenteAtual: "keila",
          model: "keila-specialist",
        }),
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!hasQuantityType) {
    const reply = "Você quer o par ou só a unidade? 💍";

    await saveConversationState(
      supabase,
      conversation.id,
      "keila_pergunta_quantidade",
      conversation.current_node || null,
      data,
    );
    await saveAssistantReply(supabase, conversation.id, "keila", reply, "keila_pergunta_quantidade");

    return new Response(
      JSON.stringify(
        buildResponsePayload({
          phone,
          message: reply,
          node: "keila_pergunta_quantidade",
          collectedData: data,
          agenteAtual: "keila",
          model: "keila-specialist",
        }),
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!hasSizeInfo) {
    const reply =
      "E qual a numeração? Se ainda não souber, tudo bem, eu sigo com você mesmo assim 😊";

    await saveConversationState(
      supabase,
      conversation.id,
      "keila_pergunta_numeracao",
      conversation.current_node || null,
      data,
    );
    await saveAssistantReply(supabase, conversation.id, "keila", reply, "keila_pergunta_numeracao");

    return new Response(
      JSON.stringify(
        buildResponsePayload({
          phone,
          message: reply,
          node: "keila_pergunta_numeracao",
          collectedData: data,
          agenteAtual: "keila",
          model: "keila-specialist",
        }),
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (needsSecondSize) {
    const reply = "Perfeito! E a outra numeração, você já sabe? 💍";

    await saveConversationState(
      supabase,
      conversation.id,
      "keila_pergunta_segunda_numeracao",
      conversation.current_node || null,
      data,
    );
    await saveAssistantReply(supabase, conversation.id, "keila", reply, "keila_pergunta_segunda_numeracao");

    return new Response(
      JSON.stringify(
        buildResponsePayload({
          phone,
          message: reply,
          node: "keila_pergunta_segunda_numeracao",
          collectedData: data,
          agenteAtual: "keila",
          model: "keila-specialist",
        }),
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!data.catalogo_keila_enviado) {
    const searchParams: Record<string, any> = {
      category: "aliancas",
      color: data.cor,
      only_available: true,
      limit: 8,
    };

    if (Number.isFinite(Number(data.orcamento_valor || 0)) && Number(data.orcamento_valor || 0) > 0) {
      const budgetValue = Number(data.orcamento_valor || 0);
      searchParams.max_price = data.quantidade_tipo === "par" ? budgetValue / 2 : budgetValue;
    }

    const searchResult = await searchCatalog(searchParams, supabase, data);

    if (!searchResult.success || searchResult.products.length === 0) {
      const reply =
        "Não encontrei modelos de casamento nessa cor dentro desse filtro agora. Se quiser, posso te mostrar outra cor. 💍";

      await saveConversationState(
        supabase,
        conversation.id,
        "keila_sem_resultado",
        conversation.current_node || null,
        data,
      );
      await saveAssistantReply(supabase, conversation.id, "keila", reply, "keila_sem_resultado");

      return new Response(
        JSON.stringify(
          buildResponsePayload({
            phone,
            message: reply,
            node: "keila_sem_resultado",
            collectedData: data,
            agenteAtual: "keila",
            model: "keila-specialist",
          }),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cards = buildKeilaCards(searchResult.products);
    data.catalogo_keila_enviado = true;
    data.last_catalog = cards.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      color: product.color,
      image_url: product.image_url,
      video_url: product.video_url,
    }));

    const introPrefix = justTransferred
      ? "Perfeito! Vou te transferir para a Keila, nossa especialista em alianças de casamento. 💍\n\n"
      : "";

    const sizePrefix = justAcknowledgedUnknownSize
      ? "Tudo bem, se você ainda não souber a numeração agora, isso não impede a gente de avançar. 💍\n\n"
      : "";

    const reply = `${introPrefix}${sizePrefix}Separei opções na cor ${String(data.cor)}. 💍\nO valor do card é da unidade. O par sai pelo dobro.`;

    await saveConversationState(
      supabase,
      conversation.id,
      "keila_catalogo",
      conversation.current_node || null,
      data,
    );
    await saveAssistantReply(supabase, conversation.id, "keila", reply, "keila_catalogo");

    return new Response(
      JSON.stringify(
        buildResponsePayload({
          phone,
          message: reply,
          node: "keila_catalogo",
          products: cards,
          collectedData: data,
          agenteAtual: "keila",
          model: "keila-specialist",
          useProductButtons: true,
          postCatalogMessage:
            "Lembrando que o valor do card é da unidade e o par sai pelo dobro. Gostou de algum modelo? 😊",
        }),
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const reply =
    "Lembrando que o valor do card é da unidade e o par sai pelo dobro. Gostou de algum modelo? 😊";

  await saveConversationState(
    supabase,
    conversation.id,
    "keila_pos_catalogo",
    conversation.current_node || null,
    data,
  );
  await saveAssistantReply(supabase, conversation.id, "keila", reply, "keila_pos_catalogo");

  return new Response(
    JSON.stringify(
      buildResponsePayload({
        phone,
        message: reply,
        node: "keila_pos_catalogo",
        collectedData: data,
        agenteAtual: "keila",
        model: "keila-specialist",
      }),
    ),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function runAiFallback(args: {
  supabase: any;
  openaiApiKey: string;
  conversation: any;
  phone: string;
  message: string;
  contactName: string;
}) {
  const { supabase, openaiApiKey, conversation, phone, message, contactName } = args;

  const { data: aiConfig } = await supabase
    .from("ai_agent_config")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const historyResult = await supabase
    .from("aline_messages")
    .select("role, message, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(30);

  const historyMessages = (historyResult.data || [])
    .map((item: any) => ({
      role: item.role === "user" ? "user" : "assistant",
      content: item.message,
    }))
    .filter((item: any) => item.content);

  const collectedData: ConversationData = { ...(conversation.collected_data || {}) };
  const normalizedMessage = normalizeText(message);
  const classification = detectLeadClassification(message, collectedData);
  if (classification) collectedData.triagem_categoria = classification;

  if (/pingente|medalha|medalhinha|colar|cordao|cordão|corrente/.test(normalizedMessage)) {
    collectedData.categoria = "pingente";
  } else if (/alianc/.test(normalizedMessage)) {
    collectedData.categoria = "aliancas";
  } else if (/anel|aneis|an[eé]is/.test(normalizedMessage)) {
    collectedData.categoria = "aneis";
  }

  if (/casamento|casar|noivo|noiva|tungsten/.test(normalizedMessage)) {
    collectedData.finalidade = "casamento";
  } else if (/namoro|compromisso/.test(normalizedMessage)) {
    collectedData.finalidade = "namoro";
  }

  const color = detectColor(message);
  if (color) collectedData.cor = color;

  const contextLines = [
    `Cliente: ${contactName || collectedData.contact_name || "Cliente"}`,
    `Categoria atual: ${String(collectedData.categoria || "não definida")}`,
    `Finalidade: ${String(collectedData.finalidade || "não definida")}`,
    `Cor: ${String(collectedData.cor || "não definida")}`,
    `Classificação: ${String(collectedData.triagem_categoria || "não definida")}`,
  ];

  const systemPrompt = `${aiConfig?.system_prompt || ALINE_SYSTEM_PROMPT}

Contexto atual:
${contextLines.join("\n")}`;

  const wantsCatalog =
    /quero ver|mostra|mostrar|opcoes|opções|catalogo|catálogo|me mostra|quero conhecer/.test(normalizedMessage);
  const hasCategory = !!collectedData.categoria || /alianc|pingente|medalha|anel/.test(normalizedMessage);
  const hasColor = !!collectedData.cor || !!color;
  const toolChoice =
    wantsCatalog && hasCategory && (hasColor || collectedData.categoria === "aneis")
      ? { type: "function", function: { name: "search_catalog" } }
      : "auto";

  const initialResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...historyMessages],
      tools,
      tool_choice: toolChoice,
      max_tokens: 800,
    }),
  });

  if (!initialResponse.ok) {
    const errorText = await initialResponse.text();
    throw new Error(`OpenAI API error: ${initialResponse.status} - ${errorText}`);
  }

  let responseData = await initialResponse.json();
  let assistantMessage = responseData.choices?.[0]?.message || {};
  let catalogProducts: CatalogProduct[] = [];

  if (assistantMessage.tool_calls?.length) {
    const toolResults: any[] = [];

    for (const toolCall of assistantMessage.tool_calls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments || "{}");

      if (functionName === "search_catalog") {
        const searchResult = await searchCatalog(functionArgs, supabase, collectedData);
        if (searchResult.success) {
          catalogProducts = searchResult.products.map((product, index) => ({
            ...product,
            index: index + 1,
            caption: formatProductCaption(product, {
              includePrice: true,
              includeSizes: true,
              includeStock: true,
            }),
          }));
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(searchResult),
        });
      } else if (functionName === "get_product_details") {
        const detailResult = await getProductDetails(functionArgs.sku, supabase);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(detailResult),
        });
      }
    }

    const finalResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          {
            role: "assistant",
            content: assistantMessage.content || null,
            tool_calls: assistantMessage.tool_calls,
          },
          ...toolResults,
        ],
        max_tokens: 1000,
      }),
    });

    if (!finalResponse.ok) {
      const errorText = await finalResponse.text();
      throw new Error(`OpenAI API error: ${finalResponse.status} - ${errorText}`);
    }

    responseData = await finalResponse.json();
    assistantMessage = responseData.choices?.[0]?.message || {};
  }

  const rawText = String(assistantMessage.content || "Desculpe, não consegui processar sua mensagem.");
  const actionMatch = rawText.match(/\[SYSTEM_ACTION\s+action:"([^"]+)"\]/i);
  const nodeMatch = rawText.match(/#node:\s*([\w-]+)/i);

  let cleanMessage = rawText
    .replace(/#node:\s*[\w-]+/gi, "")
    .replace(/\[SYSTEM_ACTION[^\]]*\]/gi, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .trim();

  if (catalogProducts.length > 0) {
    collectedData.last_catalog = catalogProducts.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      color: product.color,
      image_url: product.image_url,
      video_url: product.video_url,
    }));

    cleanMessage = collectedData.categoria === "pingente"
      ? "Vou te mostrar algumas opções lindas! ✨"
      : "Separei algumas opções para você! 💍";
  }

  if (/endere[cç]o|onde fica|shopping/.test(normalizedMessage)) {
    cleanMessage =
      "Estamos no Shopping Sumaúma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM. 🛍️";
  }

  const node =
    nodeMatch?.[1] ||
    (catalogProducts.length > 0
      ? "catalogo"
      : collectedData.categoria === "aliancas" && !collectedData.finalidade
      ? "escolha_finalidade"
      : collectedData.categoria && !collectedData.cor
      ? "escolha_cor"
      : conversation.current_node || "abertura");

  await saveConversationState(
    supabase,
    conversation.id,
    node,
    conversation.current_node || null,
    collectedData,
  );

  await saveAssistantReply(
    supabase,
    conversation.id,
    "aline",
    cleanMessage,
    node,
    actionMatch ? [{ action: actionMatch[1] }] : null,
  );

  return new Response(
    JSON.stringify(
      buildResponsePayload({
        phone,
        message: cleanMessage,
        node,
        actionName: actionMatch ? actionMatch[1] : null,
        products: catalogProducts,
        collectedData,
        agenteAtual: "aline",
        model: "gpt-4o-mini",
        usage: responseData.usage || null,
        useProductButtons: false,
        postCatalogMessage: catalogProducts.length > 0 ? "Gostou de algum modelo? 😊" : null,
      }),
    ),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const phone = String(body.phone || "").replace(/\D/g, "");
    const message = String(body.message || "");
    const contactName = String(body.contact_name || "Cliente");
    const buttonResponseId = body.button_response_id ? String(body.button_response_id) : null;

    if (!phone || !message) {
      throw new Error("phone and message are required");
    }

    console.log(`[ALINE-REPLY] Phone=${phone} Message="${message.substring(0, 120)}"`);

    const resolved = await resolveConversation(supabase, phone, contactName);
    if (resolved.skippedResponse) {
      return resolved.skippedResponse;
    }

    const conversation = resolved.conversation;
    if (!conversation?.id) {
      throw new Error("Unable to resolve conversation");
    }

    await supabase.from("aline_messages").insert({
      conversation_id: conversation.id,
      role: "user",
      message,
      node: conversation.current_node || "abertura",
    });

    const keilaResponse = await handleKeilaMarriageFlow({
      supabase,
      conversation,
      phone,
      message,
      contactName,
      buttonResponseId,
    });

    if (keilaResponse) {
      return keilaResponse;
    }

    return await runAiFallback({
      supabase,
      openaiApiKey,
      conversation,
      phone,
      message,
      contactName,
    });
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
