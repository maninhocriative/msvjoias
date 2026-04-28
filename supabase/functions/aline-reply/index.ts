import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MemoryAgent = "aline" | "keila";
type ConversationAgent = "aline" | "keila" | "human";
type AnyRecord = Record<string, any>;

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

  if (/(dourada|dourado|ouro|gold|amarela|amarelo)/.test(normalized)) return "dourada";
  if (/(prata|prateada|prateado|aco|aço|silver|cinza)/.test(normalized)) return "prata";
  if (/(preta|preto|black|escura|escuro)/.test(normalized)) return "preta";
  if (/(azul|blue)/.test(normalized)) return "azul";
  if (/(rose|ros[eé]|rosa)/.test(normalized)) return "rose";

  return null;
}

function detectCategory(text: string, data: AnyRecord): string | null {
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

  return data.categoria || null;
}

function detectAllianceType(text: string, data: AnyRecord): string | null {
  const normalized = normalizeText(text);

  if (/casamento|casar|noiva|noivo|noivado|tungsten/.test(normalized)) {
    return "casamento";
  }

  if (/namoro|compromisso|namorada|namorado/.test(normalized)) {
    return "namoro";
  }

  return data.finalidade || null;
}

function detectClassification(text: string, data: AnyRecord): string | null {
  const category = detectCategory(text, data);
  const allianceType = detectAllianceType(text, data);
  const color = detectColor(text);

  if (category === "aliancas" && allianceType === "casamento") return "aliancas_casamento";
  if (category === "aliancas" && allianceType === "namoro") return "aliancas_namoro";
  if (category === "pingente" && color === "dourada") return "pingentes_dourados";
  if (category === "pingente" && color === "prata") return "pingentes_prata";

  return null;
}

function detectMarriageIntent(text: string, data: AnyRecord, currentNode: string): boolean {
  const normalized = normalizeText(text);
  const explicitMarriage = /casamento|casar|noiva|noivo|noivado|tungsten/.test(normalized);
  const allianceContext =
    /alianc/.test(normalized) ||
    data.categoria === "aliancas" ||
    data.finalidade === "casamento" ||
    String(currentNode || "").includes("finalidade");

  return explicitMarriage && allianceContext;
}

function extractTimelineAnswer(text: string, currentNode: string): string | null {
  const normalized = normalizeText(text);
  const hasDateHint =
    /hoje|amanha|amanhã|depois de amanha|depois de amanhã|semana|mes|mês|fim de semana|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo|dia \d{1,2}|mes que vem|m[eê]s que vem|proximo mes|próximo mês/.test(
      normalized,
    );

  if (!String(currentNode || "").includes("prazo") && !hasDateHint) return null;
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

  return { value: parsed, raw: text.trim() };
}

function extractPairOrUnit(text: string): "par" | "unidade" | null {
  const normalized = normalizeText(text);

  if (/\bpar\b|casal|duas|dois|os dois|as duas/.test(normalized)) return "par";
  if (/\bunidade\b|uma so|uma só|apenas uma|avulsa|avulso|so uma|só uma/.test(normalized)) {
    return "unidade";
  }

  return null;
}

function extractDeliveryMethod(text: string): "retirada" | "entrega" | null {
  const normalized = normalizeText(text);

  if (/retirada|retirar|buscar|pegar na loja|vou na loja|shopping|sumauma|sumaúma/.test(normalized)) {
    return "retirada";
  }

  if (/entrega|delivery|receber em casa|enviar|envio|frete/.test(normalized)) {
    return "entrega";
  }

  return null;
}

function extractPaymentMethod(text: string): "pix" | "cartao" | null {
  const normalized = normalizeText(text);

  if (/\bpix\b/.test(normalized)) return "pix";
  if (/cartao|cartão|credito|crédito|debito|débito/.test(normalized)) return "cartao";

  return null;
}

function customerDoesNotKnowSize(text: string): boolean {
  const normalized = normalizeText(text);
  return /nao sei|não sei|nao sabemos|não sabemos|nao tenho|não tenho|ainda nao sei|ainda não sei|depois vejo/.test(
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

function resetCatalogChoice(data: AnyRecord) {
  delete data.catalogo_keila_enviado;
  delete data.catalogo_orcamento_relaxado;
  delete data.last_catalog;
  delete data.selected_product;
  delete data.selected_sku;
  delete data.selected_name;
  delete data.selected_price;
}

function isKeilaFlowNode(node: string): boolean {
  const normalized = String(node || "");
  return (
    normalized.startsWith("keila_") ||
    normalized === "catalogo" ||
    normalized === "selecao" ||
    normalized === "finalizado" ||
    normalized === "human_handoff_retirada"
  );
}

function resetKeilaFlowState(data: AnyRecord) {
  delete data.prazo_fechamento;
  delete data.orcamento_valor;
  delete data.orcamento_texto;
  delete data.quantidade_tipo;
  delete data.tamanho_1;
  delete data.tamanho_2;
  delete data.numeracao_status;
  delete data.cor;
  delete data.delivery_method;
  delete data.payment_method;
  delete data.keila_store_handoff_done;
  resetCatalogChoice(data);
}

function buildSummary(data: AnyRecord): string {
  const parts: string[] = [];

  if (data.categoria) parts.push(`categoria=${data.categoria}`);
  if (data.finalidade) parts.push(`finalidade=${data.finalidade}`);
  if (data.cor) parts.push(`cor=${data.cor}`);
  if (data.prazo_fechamento) parts.push(`prazo=${data.prazo_fechamento}`);
  if (data.orcamento_valor) parts.push(`orcamento=${data.orcamento_valor}`);
  if (data.quantidade_tipo) parts.push(`tipo=${data.quantidade_tipo}`);
  if (data.tamanho_1) parts.push(`tam1=${data.tamanho_1}`);
  if (data.tamanho_2) parts.push(`tam2=${data.tamanho_2}`);
  if (data.delivery_method) parts.push(`entrega=${data.delivery_method}`);
  if (data.payment_method) parts.push(`pagamento=${data.payment_method}`);
  if (data.selected_name) parts.push(`produto=${data.selected_name}`);

  return parts.join(" | ");
}

async function loadAgentMemory(supabase: any, phone: string, agentSlug: MemoryAgent) {
  const { data } = await supabase
    .from("customer_agent_memory")
    .select("*")
    .eq("phone", phone)
    .eq("agent_slug", agentSlug)
    .maybeSingle();

  return data || null;
}

async function saveAgentMemory(
  supabase: any,
  phone: string,
  agentSlug: MemoryAgent,
  customerName: string,
  data: AnyRecord,
) {
  const preferences = {
    categoria: data.categoria || null,
    finalidade: data.finalidade || null,
    cor: data.cor || null,
    prazo_fechamento: data.prazo_fechamento || null,
    orcamento_valor: data.orcamento_valor || null,
    orcamento_texto: data.orcamento_texto || null,
    quantidade_tipo: data.quantidade_tipo || null,
    tamanho_1: data.tamanho_1 || null,
    tamanho_2: data.tamanho_2 || null,
    numeracao_status: data.numeracao_status || null,
    delivery_method: data.delivery_method || null,
    payment_method: data.payment_method || null,
  };

  await supabase.from("customer_agent_memory").upsert(
    {
      phone,
      agent_slug: agentSlug,
      customer_name: customerName || data.contact_name || "Cliente",
      summary: buildSummary(data),
      preferences,
      last_interest: data.triagem_categoria || null,
      last_product_sku: data.selected_sku || null,
      last_product_name: data.selected_name || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "phone,agent_slug" },
  );
}

function hydrateDataWithMemory(data: AnyRecord, memory: AnyRecord | null) {
  if (!memory?.preferences) return data;

  const preferences = memory.preferences || {};

  if (!data.categoria && preferences.categoria) data.categoria = preferences.categoria;
  if (!data.finalidade && preferences.finalidade) data.finalidade = preferences.finalidade;
  if (!data.cor && preferences.cor) data.cor = preferences.cor;
  if (!data.prazo_fechamento && preferences.prazo_fechamento) data.prazo_fechamento = preferences.prazo_fechamento;
  if (!data.orcamento_valor && preferences.orcamento_valor) data.orcamento_valor = preferences.orcamento_valor;
  if (!data.orcamento_texto && preferences.orcamento_texto) data.orcamento_texto = preferences.orcamento_texto;
  if (!data.quantidade_tipo && preferences.quantidade_tipo) data.quantidade_tipo = preferences.quantidade_tipo;
  if (!data.tamanho_1 && preferences.tamanho_1) data.tamanho_1 = preferences.tamanho_1;
  if (!data.tamanho_2 && preferences.tamanho_2) data.tamanho_2 = preferences.tamanho_2;
  if (!data.numeracao_status && preferences.numeracao_status) data.numeracao_status = preferences.numeracao_status;
  if (!data.delivery_method && preferences.delivery_method) data.delivery_method = preferences.delivery_method;
  if (!data.payment_method && preferences.payment_method) data.payment_method = preferences.payment_method;
  if (!data.selected_sku && memory.last_product_sku) data.selected_sku = memory.last_product_sku;
  if (!data.selected_name && memory.last_product_name) data.selected_name = memory.last_product_name;

  return data;
}

function formatProductCaption(product: Partial<CatalogProduct>) {
  const lines: string[] = [];

  if (product.name) lines.push(`*${product.name}*`);
  if (product.description) lines.push(product.description);
  if (product.price_formatted) lines.push(`💰 ${product.price_formatted}`);
  if (product.color) lines.push(`🎨 Cor: ${product.color}`);
  if (product.sku) lines.push(`📦 Cód: ${product.sku}`);

  return lines.join("\n");
}

async function searchCatalog(
  supabase: any,
  params: Record<string, any>,
  data: AnyRecord,
): Promise<CatalogProduct[]> {
  const { data: products, error } = await supabase
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
    console.error("[ALINE-REPLY] searchCatalog error:", error);
    return [];
  }

  const requestedColor = String(params.color || data.cor || "").toLowerCase().trim();
  const requestedCategory = String(params.category || data.categoria || "").toLowerCase().trim();
  const requestedPurpose = String(data.finalidade || "").toLowerCase().trim();
  const maxPrice = params.max_price ? Number(params.max_price) : null;

  let filtered = (products || []).filter((product: any) => {
    const category = normalizeText(product.category || "");
    const name = normalizeText(product.name || "");
    const productColor = normalizeText(product.color || "");
    const isTungsten =
      category.includes("tungstenio") ||
      category.includes("tungsten") ||
      name.includes("tungstenio") ||
      name.includes("tungsten");

    if (requestedCategory === "aliancas") {
      const isAlliance =
        category.includes("alianca") ||
        category.includes("aliancas") ||
        category.includes("tungsten") ||
        name.includes("alianca");

      if (!isAlliance) return false;

      if (requestedPurpose === "casamento" && !isTungsten) return false;
      if (requestedPurpose === "namoro" && isTungsten) return false;
    }

    if (requestedCategory === "pingente") {
      const isPendant = category.includes("pingente") || name.includes("pingente") || name.includes("medalha");
      if (!isPendant) return false;
    }

    if (requestedColor) {
      const normalizedRequestedColor =
        requestedColor === "prata" ? ["prata", "aco", "aço"] : [requestedColor];

      const matchesColor = normalizedRequestedColor.some((color) => productColor.includes(color));
      if (!matchesColor) return false;
    }

    const stock = (product.product_variants || []).reduce(
      (sum: number, item: any) => sum + Number(item.stock || 0),
      0,
    );

    if (stock <= 0) return false;

    if (maxPrice !== null && Number(product.price || 0) > maxPrice) return false;

    return true;
  });

  filtered = filtered.slice(0, 8);

  return filtered.map((product: any, index: number) => {
    const sizes = (product.product_variants || [])
      .filter((variant: any) => Number(variant.stock || 0) > 0)
      .map((variant: any) => String(variant.size));

    const stock = (product.product_variants || []).reduce(
      (sum: number, item: any) => sum + Number(item.stock || 0),
      0,
    );

    const mapped: CatalogProduct = {
      id: product.id,
      sku: product.sku || null,
      name: product.name || "Produto",
      description: product.description || "",
      price: Number(product.price || 0) || null,
      price_formatted: formatCurrency(product.price),
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
      index: index + 1,
    };

    mapped.caption = formatProductCaption(mapped);
    return mapped;
  });
}

function buildKeilaCards(products: CatalogProduct[]): CatalogProduct[] {
  return products.map((product) => {
    const captionLines = [
      `*${product.name}*`,
      product.color ? `🎨 Cor: ${product.color}` : null,
      product.sku ? `📦 Cód: ${product.sku}` : null,
      product.price_formatted ? `💰 Valor da unidade: ${product.price_formatted}` : null,
      `💍 O valor do card é da unidade. O par sai pelo dobro.`,
    ].filter(Boolean);

    return {
      ...product,
      caption: captionLines.join("\n"),
      button_id: `select_${product.sku || product.id}`,
      button_label: "Quero esta",
    };
  });
}

function findCatalogSelection(token: string | null, catalog: any[]): any | null {
  if (!token || !Array.isArray(catalog) || catalog.length === 0) return null;

  const normalized = normalizeText(token);
  const explicitButton = normalized.match(/^select[_-]([a-z0-9-]+)/i);
  if (explicitButton) {
    const sku = explicitButton[1].toUpperCase();
    return catalog.find((item: any) => String(item.sku || "").toUpperCase() === sku) || null;
  }

  const exactSku = catalog.find((item: any) => {
    const sku = String(item.sku || "").toUpperCase();
    return sku && normalized.includes(sku.toLowerCase());
  });
  if (exactSku) return exactSku;

  const numeric = normalized.match(/^\s*(\d{1,2})\s*$/);
  if (numeric) {
    const index = Number(numeric[1]) - 1;
    if (index >= 0 && index < catalog.length) return catalog[index];
  }

  return null;
}

function buildResponsePayload(args: {
  phone: string;
  message: string;
  node: string;
  products?: CatalogProduct[];
  selectedProduct?: any | null;
  collectedData: AnyRecord;
  agent: ConversationAgent;
  useProductButtons?: boolean;
  postCatalogMessage?: string | null;
}) {
  const {
    phone,
    message,
    node,
    products = [],
    selectedProduct = null,
    collectedData,
    agent,
    useProductButtons = false,
    postCatalogMessage = null,
  } = args;

  const singleLine = message.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();

  return {
    success: true,
    response: message,
    mensagem_whatsapp: message,
    reply_text: singleLine,
    mensagem_linha_unica: singleLine,
    node_tecnico: node,
    acao_nome: null,
    tem_acao: false,
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
      agente_atual: agent,
      stage: node,
      categoria: collectedData.categoria || null,
      finalidade: collectedData.finalidade || null,
      cor: collectedData.cor || null,
      prazo_fechamento: collectedData.prazo_fechamento || null,
      orcamento_valor: collectedData.orcamento_valor || null,
      quantidade_tipo: collectedData.quantidade_tipo || null,
      produto_sku: collectedData.selected_sku || null,
      produto_nome: collectedData.selected_name || null,
      tamanho_1: collectedData.tamanho_1 || null,
      tamanho_2: collectedData.tamanho_2 || null,
      numeracao_status: collectedData.numeracao_status || null,
      entrega: collectedData.delivery_method || null,
      pagamento: collectedData.payment_method || null,
    },
    use_product_buttons: useProductButtons,
    agente_atual: agent,
  };
}

async function resolveConversation(supabase: any, phone: string, contactName: string) {
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
        active_agent: "aline",
        collected_data: {
          contact_name: contactName || "Cliente",
          agente_atual: "aline",
        },
        status: "active",
      })
      .select()
      .single();

    if (createError) throw createError;
    return created;
  }

  if (existingConversation.status === "human_takeover") {
    const lastMessageAt = existingConversation.last_message_at ? new Date(existingConversation.last_message_at) : null;
    const hoursWithoutReply = lastMessageAt
      ? (Date.now() - lastMessageAt.getTime()) / (1000 * 60 * 60)
      : 999;

    if (hoursWithoutReply < 4) {
      return {
        skipped: true,
        reason: "human_takeover",
      };
    }

    const { data: reopened } = await supabase
      .from("aline_conversations")
      .update({
        status: "active",
        current_node: "abertura",
        active_agent: "aline",
        last_node: null,
        collected_data: {
          ...(existingConversation.collected_data || {}),
          agente_atual: "aline",
          contact_name: contactName || existingConversation.collected_data?.contact_name || "Cliente",
        },
        last_message_at: new Date().toISOString(),
        followup_count: 0,
        assigned_seller_id: null,
        assigned_seller_name: null,
      })
      .eq("id", existingConversation.id)
      .select()
      .single();

    return reopened;
  }

  if (existingConversation.status === "finished") {
    const { data: reopened } = await supabase
      .from("aline_conversations")
      .update({
        status: "active",
        current_node: "abertura",
        active_agent: "aline",
        last_node: null,
        collected_data: {
          ...(existingConversation.collected_data || {}),
          agente_atual: "aline",
          contact_name: contactName || existingConversation.collected_data?.contact_name || "Cliente",
        },
        last_message_at: new Date().toISOString(),
        followup_count: 0,
      })
      .eq("id", existingConversation.id)
      .select()
      .single();

    return reopened;
  }

  await supabase
    .from("aline_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      followup_count: 0,
    })
    .eq("id", existingConversation.id);

  return existingConversation;
}

async function persistConversation(
  supabase: any,
  conversationId: string,
  activeAgent: ConversationAgent,
  currentNode: string,
  lastNode: string | null,
  data: AnyRecord,
) {
  await supabase
    .from("aline_conversations")
    .update({
      active_agent: activeAgent,
      current_node: currentNode,
      last_node: lastNode,
      collected_data: {
        ...data,
        agente_atual: activeAgent,
      },
      last_message_at: new Date().toISOString(),
      agent_handoff_at: activeAgent === "keila" ? new Date().toISOString() : null,
    })
    .eq("id", conversationId);
}

async function saveAssistantMessage(
  supabase: any,
  conversationId: string,
  role: string,
  message: string,
  node: string,
) {
  await supabase.from("aline_messages").insert({
    conversation_id: conversationId,
    role,
    message,
    node,
  });
}

async function handoffKeilaToHuman(args: {
  supabase: any;
  supabaseUrl: string;
  supabaseServiceKey: string;
  conversation: any;
  phone: string;
  contactName: string;
  data: AnyRecord;
}) {
  const { supabase, supabaseUrl, supabaseServiceKey, conversation, phone, contactName, data } = args;

  data.keila_store_handoff_done = true;

  await supabase
    .from("aline_conversations")
    .update({
      status: "human_takeover",
      active_agent: "human",
      assignment_reason: "Retirada na loja após atendimento da Keila",
      collected_data: {
        ...data,
        agente_atual: "human",
      },
      last_message_at: new Date().toISOString(),
      agent_handoff_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  const { data: crmConversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_number", phone)
    .maybeSingle();

  if (crmConversation?.id) {
    await supabase
      .from("conversations")
      .update({ lead_status: "comprador" })
      .eq("id", crmConversation.id);
  }

  try {
    await fetch(`${supabaseUrl}/functions/v1/aline-takeover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        phone,
        action: "auto_forward",
        reason: `Keila finalizou retirada na loja: ${data.selected_name || data.selected_sku || "aliança casamento"}`,
        send_intro: true,
      }),
    });
  } catch (error) {
    console.error("[ALINE-REPLY] Erro ao encaminhar para atendimento humano:", error);
  }

  const reply = `Perfeito! Como você vai retirar na loja, vou te encaminhar agora para nosso atendimento humano finalizar com você e acionar os vendedores. 💍`;

  await saveAssistantMessage(
    supabase,
    conversation.id,
    "keila",
    reply,
    "human_handoff_retirada",
  );

  await saveAgentMemory(supabase, phone, "keila", contactName, data);

  return buildResponsePayload({
    phone,
    message: reply,
    node: "human_handoff_retirada",
    selectedProduct: data.selected_product || null,
    collectedData: data,
    agent: "human",
  });
}

async function handleKeilaFlow(args: {
  supabase: any;
  supabaseUrl: string;
  supabaseServiceKey: string;
  conversation: any;
  phone: string;
  message: string;
  contactName: string;
  buttonResponseId: string | null;
}) {
  const {
    supabase,
    supabaseUrl,
    supabaseServiceKey,
    conversation,
    phone,
    message,
    contactName,
    buttonResponseId,
  } = args;

  const currentNode = String(conversation.current_node || "");
  const data: AnyRecord = {
    ...(conversation.collected_data || {}),
    agente_atual: "keila",
    categoria: "aliancas",
    finalidade: "casamento",
  };

  if (!isKeilaFlowNode(currentNode)) {
    resetKeilaFlowState(data);
  }

  const selectedFromCatalog = findCatalogSelection(
    buttonResponseId || message,
    Array.isArray(data.last_catalog) ? data.last_catalog : [],
  );

  if (selectedFromCatalog) {
    data.selected_product = selectedFromCatalog;
    data.selected_sku = selectedFromCatalog.sku;
    data.selected_name = selectedFromCatalog.name;
    data.selected_price = selectedFromCatalog.price;
  }

  const prazo = extractTimelineAnswer(message, currentNode);
  if (prazo && !data.prazo_fechamento) {
    data.prazo_fechamento = prazo;
  }

  const budget = extractBudgetInfo(message, currentNode);
  if (budget && Number(data.orcamento_valor || 0) !== budget.value) {
    data.orcamento_valor = budget.value;
    data.orcamento_texto = budget.raw;
    resetCatalogChoice(data);
  }

  const pairOrUnit = extractPairOrUnit(message);
  if (pairOrUnit && data.quantidade_tipo !== pairOrUnit) {
    data.quantidade_tipo = pairOrUnit;
    resetCatalogChoice(data);
  }

  const deliveryMethod = extractDeliveryMethod(message);
  if (deliveryMethod) {
    data.delivery_method = deliveryMethod;
  }

  const paymentMethod = extractPaymentMethod(message);
  if (paymentMethod) {
    data.payment_method = paymentMethod;
  }

  if (customerDoesNotKnowSize(message)) {
    data.numeracao_status = "nao_sabe";
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

  const color = detectColor(message);
  if (color && color !== "rose") {
    data.cor = color;
    resetCatalogChoice(data);
  }

  const hasTimeline = !!data.prazo_fechamento;
  const hasBudget = !!data.orcamento_valor || !!data.orcamento_texto;
  const hasQuantityType = !!data.quantidade_tipo;
  const hasSizeInfo = !!data.tamanho_1 || data.numeracao_status === "nao_sabe";
  const hasColor = !!data.cor;
  const hasSelectedProduct = !!data.selected_sku;
  const hasDelivery = !!data.delivery_method;
  const hasPayment = !!data.payment_method;

  if (!hasTimeline) {
    const reply = `Perfeito! Vou te transferir para a Keila, nossa especialista em alianças de casamento. 💍

Oi! Sou a Keila. Para quando você quer fechar essas alianças? ⏰`;

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_prazo",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", reply, "keila_prazo");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "keila_prazo",
      collectedData: data,
      agent: "keila",
    });
  }

  if (!hasBudget) {
    const reply = "Perfeito! E quanto você quer investir nas alianças? 💰";

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_orcamento",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", reply, "keila_orcamento");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "keila_orcamento",
      collectedData: data,
      agent: "keila",
    });
  }

  if (!hasQuantityType) {
    const reply = "Você quer o par ou só a unidade? 💍";

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_par_ou_unidade",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", reply, "keila_par_ou_unidade");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "keila_par_ou_unidade",
      collectedData: data,
      agent: "keila",
    });
  }

  if (!hasSizeInfo) {
    const reply =
      "E qual a numeração? Se você ainda não souber agora, tudo bem, eu sigo com você mesmo assim 😊";

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_numeracao",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", reply, "keila_numeracao");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "keila_numeracao",
      collectedData: data,
      agent: "keila",
    });
  }

  if (!hasColor) {
    const reply = "Antes de eu te mostrar, qual cor você prefere: dourada, prata, preta ou azul? 🎨";

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_cor",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", reply, "keila_cor");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "keila_cor",
      collectedData: data,
      agent: "keila",
    });
  }

  if (!data.catalogo_keila_enviado) {
    const searchParams: AnyRecord = {
      category: "aliancas",
      color: data.cor,
      only_available: true,
    };

    if (Number.isFinite(Number(data.orcamento_valor || 0)) && Number(data.orcamento_valor || 0) > 0) {
      const budgetValue = Number(data.orcamento_valor || 0);
      searchParams.max_price = data.quantidade_tipo === "par" ? budgetValue / 2 : budgetValue;
    }

    let catalog = await searchCatalog(supabase, searchParams, data);
    let usedBudgetFallback = false;

    if (catalog.length === 0 && searchParams.max_price) {
      const relaxedSearchParams = { ...searchParams };
      delete relaxedSearchParams.max_price;
      catalog = await searchCatalog(supabase, relaxedSearchParams, data);
      usedBudgetFallback = catalog.length > 0;
    }

    if (catalog.length === 0) {
      const reply = `Não encontrei modelos prontos na cor ${data.cor} dentro dessa faixa agora. Se quiser, eu posso te mostrar outra faixa de valor ou outra cor.`;

      await persistConversation(
        supabase,
        conversation.id,
        "keila",
        "keila_sem_catalogo",
        conversation.current_node || null,
        data,
      );
      await saveAssistantMessage(supabase, conversation.id, "keila", reply, "keila_sem_catalogo");
      await saveAgentMemory(supabase, phone, "keila", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "keila_sem_catalogo",
        collectedData: data,
        agent: "keila",
      });
    }

    const cards = buildKeilaCards(catalog);

    data.catalogo_keila_enviado = true;
    data.catalogo_orcamento_relaxado = usedBudgetFallback;
    data.last_catalog = cards.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      color: product.color,
      image_url: product.image_url,
      video_url: product.video_url,
    }));

    const intro =
      data.numeracao_status === "nao_sabe"
        ? "Tudo bem, se você ainda não souber a numeração agora, eu sigo com você mesmo assim 😊\n\n"
        : "";

    const reply = `${intro}${
      usedBudgetFallback
        ? `Não encontrei modelos na cor ${data.cor} exatamente dentro dessa faixa de valor, mas separei outras opções disponíveis da mesma categoria para te mostrar. 💍`
        : `Separei opções na cor ${data.cor}. 💍`
    }
O valor do card é da unidade. O par sai pelo dobro.`;

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "catalogo",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", reply, "catalogo");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "catalogo",
      products: cards,
      collectedData: data,
      agent: "keila",
      useProductButtons: true,
      postCatalogMessage:
        "Lembrando que o valor do card é da unidade e o par sai pelo dobro. Gostou de algum modelo? 😊",
    });
  }

  if (hasSelectedProduct && !hasDelivery) {
    const reply = `Perfeito! Você escolheu *${data.selected_name}*. 💍

Você vai retirar na loja ou prefere entrega?`;

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_entrega",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", reply, "keila_entrega");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "keila_entrega",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "keila",
    });
  }

  if (
    hasSelectedProduct &&
    data.delivery_method === "retirada" &&
    !data.keila_store_handoff_done
  ) {
    return await handoffKeilaToHuman({
      supabase,
      supabaseUrl,
      supabaseServiceKey,
      conversation,
      phone,
      contactName,
      data,
    });
  }

  if (hasSelectedProduct && data.delivery_method === "entrega" && !hasPayment) {
    const reply = "Perfeito! E o pagamento vai ser no Pix ou cartão? 💳";

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_pagamento",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", reply, "keila_pagamento");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "keila_pagamento",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "keila",
    });
  }

  if (hasSelectedProduct && data.delivery_method === "entrega" && hasPayment) {
    const reply = `Perfeito! Já deixei tudo anotado para seguir com seu atendimento. 💍`;

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "finalizado",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", reply, "finalizado");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "finalizado",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "keila",
    });
  }

  const reply =
    "Lembrando que o valor do card é da unidade e o par sai pelo dobro. Gostou de algum modelo? 😊";

  await persistConversation(
    supabase,
    conversation.id,
    "keila",
    "selecao",
    conversation.current_node || null,
    data,
  );
  await saveAssistantMessage(supabase, conversation.id, "keila", reply, "selecao");
  await saveAgentMemory(supabase, phone, "keila", contactName, data);

  return buildResponsePayload({
    phone,
    message: reply,
    node: "selecao",
    collectedData: data,
    agent: "keila",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const phone = String(body.phone || "").replace(/\D/g, "");
    const message = String(body.message || "");
    const contactName = String(body.contact_name || "Cliente");
    const buttonResponseId = body.button_response_id ? String(body.button_response_id) : null;

    if (!phone || !message) {
      throw new Error("phone and message are required");
    }

    const resolved = await resolveConversation(supabase, phone, contactName);

    if (resolved?.skipped) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: resolved.reason,
          message: "Atendimento humano ativo, Aline não responde",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const conversation = resolved;

    await supabase.from("aline_messages").insert({
      conversation_id: conversation.id,
      role: "user",
      message,
      node: conversation.current_node || "abertura",
    });

    const baseData: AnyRecord = {
      ...(conversation.collected_data || {}),
      contact_name: contactName || conversation.collected_data?.contact_name || "Cliente",
    };

    baseData.categoria = detectCategory(message, baseData) || baseData.categoria || null;
    baseData.finalidade = detectAllianceType(message, baseData) || baseData.finalidade || null;
    baseData.triagem_categoria = detectClassification(message, baseData) || baseData.triagem_categoria || null;

    const activeAgent = (conversation.active_agent || baseData.agente_atual || "aline") as ConversationAgent;
    const alineMemory = await loadAgentMemory(supabase, phone, "aline");

    if (activeAgent === "keila" || detectMarriageIntent(message, baseData, conversation.current_node || "")) {
      const keilaResponse = await handleKeilaFlow({
        supabase,
        supabaseUrl,
        supabaseServiceKey,
        conversation: {
          ...conversation,
          active_agent: "keila",
          collected_data: {
            ...baseData,
            agente_atual: "keila",
            categoria: "aliancas",
            finalidade: "casamento",
          },
        },
        phone,
        message,
        contactName,
        buttonResponseId,
      });

      return new Response(JSON.stringify(keilaResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alineData = hydrateDataWithMemory(
      {
        ...baseData,
        agente_atual: "aline",
      },
      alineMemory,
    );

    const aiChatResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        phone,
        message,
        contact_name: contactName,
        save_history: false,
        agent_override: "aline",
        memory_context: alineMemory?.summary || null,
        conversation_snapshot: {
          categoria: alineData.categoria || null,
          finalidade: alineData.finalidade || null,
          cor: alineData.cor || null,
          triagem_categoria: alineData.triagem_categoria || null,
        },
      }),
    });

    if (!aiChatResponse.ok) {
      const errorText = await aiChatResponse.text();
      throw new Error(`ai-chat failed: ${aiChatResponse.status} - ${errorText}`);
    }

    const aiPayload = await aiChatResponse.json();

    alineData.categoria = aiPayload?.memoria?.categoria || alineData.categoria || null;
    alineData.finalidade = aiPayload?.memoria?.tipo_alianca || alineData.finalidade || null;
    alineData.cor = aiPayload?.memoria?.cor || alineData.cor || null;
    alineData.selected_sku = aiPayload?.memoria?.produto_sku || alineData.selected_sku || null;
    alineData.selected_name = aiPayload?.memoria?.produto_nome || alineData.selected_name || null;
    alineData.triagem_categoria = aiPayload?.filtros?.intencao || alineData.triagem_categoria || null;

    await persistConversation(
      supabase,
      conversation.id,
      "aline",
      aiPayload.node_tecnico || conversation.current_node || "abertura",
      conversation.current_node || null,
      alineData,
    );

    await saveAssistantMessage(
      supabase,
      conversation.id,
      "aline",
      aiPayload.mensagem_whatsapp || aiPayload.response || "Posso te ajudar com alianças ou pingentes? 😊",
      aiPayload.node_tecnico || conversation.current_node || "abertura",
    );

    await saveAgentMemory(supabase, phone, "aline", contactName, alineData);

    return new Response(JSON.stringify(aiPayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[ALINE-REPLY] Erro:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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
