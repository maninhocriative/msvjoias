import { buildPhoneVariants, normalizeWhatsappPhone } from "./phone.ts";

export type AgentSlug = "aline" | "kate" | "keila" | "malu" | "human" | string;
export type MediaKind = "image" | "audio" | "video" | "document" | null;
export type HandoffPriority = "low" | "medium" | "high";

export type AnyRecord = Record<string, any>;

export interface AgentSystemContext {
  conversation: {
    id: string | null;
    phone: string | null;
    customerName?: string | null;
    status?: string | null;
    tags?: string[];
    assignedSellerId?: string | null;
    activeAgent?: AgentSlug | null;
  };
  normalizedInput: {
    phone: string;
    text: string;
    originalText?: string;
    buttonResponseId?: string | null;
    buttonText?: string | null;
    mediaType?: MediaKind;
    mediaUrl?: string | null;
    hasMedia: boolean;
  };
  recentMessages: Array<{
    role: "user" | "assistant" | "aline" | "kate" | "keila" | "malu" | "human" | string;
    content: string;
    createdAt?: string;
    mediaType?: string | null;
    mediaUrl?: string | null;
  }>;
  agentMemory: Record<string, any>;
  collectedData: {
    agente_atual?: string;
    categoria?: string;
    finalidade?: string;
    cor?: string;
    cores_solicitadas?: string[];
    selected_product?: any;
    selected_sku?: string | null;
    selected_name?: string | null;
    selected_price?: number | string | null;
    last_catalog?: any[];
    catalog_history?: any[];
    customer_stage?: string | null;
    handoff_reason?: string | null;
    catalogo_kate_enviado?: boolean;
    catalogo_keila_enviado?: boolean;
    catalogo_malu_enviado?: boolean;
    intro_sent?: Record<string, boolean>;
    fallback_count?: number | Record<string, number>;
    fallback_key?: string | null;
    last_agent_response?: string | null;
    harassment_detected?: boolean;
    simulation_count?: number;
    preview_generation_count?: number;
    [key: string]: any;
  };
  selectedProduct: {
    id?: string | null;
    sku?: string | null;
    name?: string | null;
    price?: number | string | null;
    category?: string | null;
    imageUrl?: string | null;
    raw?: any;
  } | null;
  recentCatalog: any[];
  availableProducts: {
    pingentes?: any[];
    aliancas?: any[];
    oculos?: any[];
    geral?: any[];
  };
  activeOffers: any[];
  storeRules: typeof ACIUM_STORE_RULES;
  mediaContext: {
    lastCustomerImage?: string | null;
    lastCustomerAudio?: string | null;
    lastCustomerDocument?: string | null;
    canUseImageForSimulation?: boolean;
  };
  safetyFlags: {
    isHarassment?: boolean;
    hasPaymentProof?: boolean;
    hasUnsafeAudio?: boolean;
    shouldPauseAutomation?: boolean;
  };
  handoffContext: {
    shouldHandoff: boolean;
    reason?: string;
    summary?: string;
    priority?: HandoffPriority;
  };
}

interface AgentSystemContextRuntime {
  supabase: any;
  phoneVariants: string[];
  crmConversationId?: string | null;
}

type AgentSystemContextWithRuntime = AgentSystemContext & {
  __runtime?: AgentSystemContextRuntime;
};

export const ACIUM_STORE_RULES = {
  address: "Shopping Sumauma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM",
  productionDeadline: "Geralmente de 8 a 24 horas apos pagamento e fechamento, dependendo da fila de producao.",
  pingenteMaterialRule: "Os pingentes sao de aco. Dourado e prata sao acabamentos do aco. Nao informar como ouro.",
  cordaoRule: "Corrente ou cordao nao acompanha o pingente. E vendido separadamente.",
  simulationRule: "Imagem de fotogravacao e apenas simulacao. A arte final/original sera enviada pelo vendedor para aprovacao antes da gravacao.",
  paymentRule: "Quando houver Pix, comprovante, pagamento ou fechamento, marcar venda iniciada e chamar atendimento humano.",
  deliveryRule: "Retirada e delivery devem ser tratados como intencao forte de compra.",
};

const PRODUCT_SELECT = `
  id,
  name,
  sku,
  price,
  image_url,
  video_url,
  category,
  color,
  description,
  tags,
  active
`;

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function compact<T>(values: Array<T | null | undefined | false | "">): T[] {
  return values.filter(Boolean) as T[];
}

function safeObject(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function getRuntime(context: AgentSystemContext): AgentSystemContextRuntime | null {
  return (context as AgentSystemContextWithRuntime).__runtime || null;
}

function getAgentForMemory(context: AgentSystemContext, fallback?: string | null): string {
  const agent = String(fallback || context.conversation.activeAgent || context.collectedData.agente_atual || "aline");
  return agent === "human" ? "aline" : agent;
}

function getRecentCatalog(collectedData: AnyRecord): any[] {
  const seen = new Set<string>();
  const merged = [...asArray(collectedData.catalog_history), ...asArray(collectedData.last_catalog)];
  const result: any[] = [];

  for (const item of merged) {
    if (!item || typeof item !== "object") continue;
    const key = String(item.id || item.sku || item.name || JSON.stringify(item));
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function normalizeProduct(product: any) {
  if (!product || typeof product !== "object") return null;
  return {
    id: product.id || null,
    sku: product.sku || null,
    name: product.name || product.nome || null,
    price: product.price ?? product.preco ?? null,
    category: product.category || product.categoria || null,
    imageUrl: product.image_url || product.imageUrl || product.imagem_url || product.media_url || null,
    raw: product,
  };
}

function productMatchesCategory(product: any, category: "pingentes" | "aliancas" | "oculos"): boolean {
  const haystack = normalizeText([
    product?.category,
    product?.name,
    product?.description,
    asArray(product?.tags).join(" "),
  ].join(" "));

  if (category === "pingentes") {
    return /pingente|fotograv|medalha|placa|coracao|redondo|octagonal/.test(haystack);
  }

  if (category === "aliancas") {
    return /alianca|aliancas|anel|aneis|tungstenio|namoro|casamento/.test(haystack);
  }

  return /oculos|oculo|armacao|lente|solar/.test(haystack);
}

function detectHarassment(text: string, collectedData: AnyRecord): boolean {
  if (collectedData.harassment_detected) return true;
  const normalized = normalizeText(text);
  return /pelad|nude|nudes|foto sua|manda uma foto sua|priqueta|buceta|pau|sexo|tesao/.test(normalized);
}

function detectPaymentProof(text: string, mediaType: MediaKind): boolean {
  const normalized = normalizeText(text);
  return (
    /comprovante|paguei|pix feito|fiz o pix|transferencia|recibo|pagamento feito/.test(normalized) ||
    mediaType === "document"
  );
}

function detectUnsafeAudio(text: string, mediaType: MediaKind): boolean {
  if (mediaType !== "audio") return false;
  const normalized = normalizeText(text).replace(/^audio recebido/, "").replace(/^\[audio recebido\]/, "").trim();
  return !normalized || normalized === "audio";
}

function summarizeHandoff(args: {
  reason: string;
  context: AgentSystemContext;
  priority: HandoffPriority;
}) {
  const data = args.context.collectedData;
  const product = args.context.selectedProduct;
  const parts = compact<string>([
    `Motivo: ${args.reason}`,
    `Agente: ${String(args.context.conversation.activeAgent || data.agente_atual || "indefinido")}`,
    product?.name ? `Produto: ${product.name}` : data.selected_name ? `Produto: ${data.selected_name}` : "",
    product?.sku ? `SKU: ${product.sku}` : data.selected_sku ? `SKU: ${data.selected_sku}` : "",
    product?.price ? `Valor: ${product.price}` : data.selected_price ? `Valor: ${data.selected_price}` : "",
    data.cor ? `Cor: ${data.cor}` : "",
    data.finalidade ? `Finalidade: ${data.finalidade}` : "",
    data.delivery_method ? `Entrega: ${data.delivery_method}` : "",
    data.payment_method ? `Pagamento: ${data.payment_method}` : "",
    args.context.normalizedInput.text ? `Ultima mensagem: ${args.context.normalizedInput.text}` : "",
  ]);
  return parts.join("; ");
}

async function loadAlineConversation(supabase: any, phoneVariants: string[], conversationId?: string | null) {
  try {
    let query = supabase
      .from("aline_conversations")
      .select("*");

    if (conversationId) {
      query = query.eq("id", conversationId);
    } else {
      query = query.in("phone", phoneVariants);
    }

    const { data, error } = await query
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[AGENT-CONTEXT] loadAlineConversation failed:", error.message || error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error("[AGENT-CONTEXT] loadAlineConversation exception:", error);
    return null;
  }
}

async function loadCrmConversation(supabase: any, phoneVariants: string[]) {
  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .in("contact_number", phoneVariants)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[AGENT-CONTEXT] loadCrmConversation failed:", error.message || error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error("[AGENT-CONTEXT] loadCrmConversation exception:", error);
    return null;
  }
}

async function loadRecentMessages(supabase: any, crmConversationId?: string | null) {
  if (!crmConversationId) return [];

  try {
    const { data, error } = await supabase
      .from("messages")
      .select("content, created_at, message_type, media_url, is_from_me")
      .eq("conversation_id", crmConversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("[AGENT-CONTEXT] loadRecentMessages failed:", error.message || error);
      return [];
    }

    return (data || [])
      .reverse()
      .map((item: any) => ({
        role: item.is_from_me ? "assistant" : "user",
        content: String(item.content || ""),
        createdAt: item.created_at || undefined,
        mediaType: item.message_type || null,
        mediaUrl: item.media_url || null,
      }));
  } catch (error) {
    console.error("[AGENT-CONTEXT] loadRecentMessages exception:", error);
    return [];
  }
}

async function loadAgentMemoryMap(supabase: any, phoneVariants: string[]) {
  try {
    const { data, error } = await supabase
      .from("customer_agent_memory")
      .select("*")
      .in("phone", phoneVariants)
      .order("last_seen_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("[AGENT-CONTEXT] loadAgentMemoryMap failed:", error.message || error);
      return {};
    }

    const memory: Record<string, any> = {};
    for (const item of data || []) {
      const key = String(item.agent_slug || "").trim();
      if (key && !memory[key]) memory[key] = item;
    }
    return memory;
  } catch (error) {
    console.error("[AGENT-CONTEXT] loadAgentMemoryMap exception:", error);
    return {};
  }
}

async function loadActiveProducts(supabase: any) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(160);

    if (error) {
      console.error("[AGENT-CONTEXT] loadActiveProducts failed:", error.message || error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("[AGENT-CONTEXT] loadActiveProducts exception:", error);
    return [];
  }
}

async function loadActiveOffers(supabase: any) {
  const now = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from("offers")
      .select("id, product_id, promotional_price, gift_description, start_date, end_date, active")
      .eq("active", true)
      .lte("start_date", now)
      .gte("end_date", now)
      .order("start_date", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[AGENT-CONTEXT] loadActiveOffers failed:", error.message || error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("[AGENT-CONTEXT] loadActiveOffers exception:", error);
    return [];
  }
}

async function resolveSelectedProduct(supabase: any, collectedData: AnyRecord) {
  const existing = normalizeProduct(collectedData.selected_product);
  const selectedId = existing?.id || collectedData.selected_product_id || null;
  const selectedSku = existing?.sku || collectedData.selected_sku || null;
  const selectedName = existing?.name || collectedData.selected_name || null;

  async function byField(field: string, value: string) {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq(field, value)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[AGENT-CONTEXT] resolveSelectedProduct failed:", error.message || error);
      return null;
    }
    return normalizeProduct(data);
  }

  try {
    if (selectedId) {
      const product = await byField("id", String(selectedId));
      if (product) return product;
    }

    if (selectedSku) {
      const product = await byField("sku", String(selectedSku));
      if (product) return product;
    }

    if (selectedName) {
      const product = await byField("name", String(selectedName));
      if (product) return product;
    }
  } catch (error) {
    console.error("[AGENT-CONTEXT] resolveSelectedProduct exception:", error);
  }

  return existing || (
    selectedSku || selectedName
      ? {
          id: null,
          sku: selectedSku || null,
          name: selectedName || null,
          price: collectedData.selected_price ?? null,
          category: collectedData.categoria || null,
          imageUrl: null,
          raw: collectedData.selected_product || null,
        }
      : null
  );
}

function buildMediaContext(recentMessages: AgentSystemContext["recentMessages"], normalizedMessage: any, selectedProduct: AgentSystemContext["selectedProduct"]) {
  const customerMessages = recentMessages.filter((message) => message.role === "user");
  const lastCustomerImage = [...customerMessages].reverse().find((message) => message.mediaType === "image" && message.mediaUrl)?.mediaUrl || null;
  const lastCustomerAudio = [...customerMessages].reverse().find((message) => message.mediaType === "audio" && message.mediaUrl)?.mediaUrl || null;
  const lastCustomerDocument = [...customerMessages].reverse().find((message) => message.mediaType === "document" && message.mediaUrl)?.mediaUrl || null;
  const categoryText = normalizeText(`${selectedProduct?.category || ""} ${selectedProduct?.name || ""}`);
  const inboundImage = normalizedMessage.mediaType === "image" && normalizedMessage.mediaUrl;

  return {
    lastCustomerImage: inboundImage ? normalizedMessage.mediaUrl : lastCustomerImage,
    lastCustomerAudio: normalizedMessage.mediaType === "audio" && normalizedMessage.mediaUrl ? normalizedMessage.mediaUrl : lastCustomerAudio,
    lastCustomerDocument: normalizedMessage.mediaType === "document" && normalizedMessage.mediaUrl ? normalizedMessage.mediaUrl : lastCustomerDocument,
    canUseImageForSimulation: !!(
      (inboundImage || lastCustomerImage) &&
      selectedProduct &&
      /pingente|fotograv|oculos|oculo|armacao|lente/.test(categoryText)
    ),
  };
}

export async function buildAgentSystemContext(params: {
  supabase: any;
  conversationId?: string | null;
  phone: string;
  normalizedMessage: any;
  activeAgent?: string | null;
}): Promise<AgentSystemContext> {
  const phone = normalizeWhatsappPhone(params.phone);
  const phoneVariants = buildPhoneVariants(phone);
  const normalizedMessage = safeObject(params.normalizedMessage);
  const inputText = String(normalizedMessage.text || normalizedMessage.message || "").trim();
  const mediaType = normalizedMessage.mediaType || normalizedMessage.media_type || null;
  const mediaUrl = normalizedMessage.mediaUrl || normalizedMessage.media_url || null;

  const [alineConversation, crmConversation, agentMemory, products, activeOffers] = await Promise.all([
    loadAlineConversation(params.supabase, phoneVariants, params.conversationId),
    loadCrmConversation(params.supabase, phoneVariants),
    loadAgentMemoryMap(params.supabase, phoneVariants),
    loadActiveProducts(params.supabase),
    loadActiveOffers(params.supabase),
  ]);

  const collectedData = {
    ...safeObject(alineConversation?.collected_data),
  } as AgentSystemContext["collectedData"];
  const recentMessages = await loadRecentMessages(params.supabase, crmConversation?.id || null);
  const selectedProduct = await resolveSelectedProduct(params.supabase, collectedData);
  const recentCatalog = getRecentCatalog(collectedData);
  const mediaContext = buildMediaContext(recentMessages, {
    mediaType,
    mediaUrl,
  }, selectedProduct);
  const safetyFlags = {
    isHarassment: detectHarassment(inputText, collectedData),
    hasPaymentProof: detectPaymentProof(inputText, mediaType),
    hasUnsafeAudio: detectUnsafeAudio(inputText, mediaType),
    shouldPauseAutomation: !!collectedData.harassment_detected || alineConversation?.status === "human_takeover",
  };

  const availableProducts = {
    pingentes: products.filter((product: any) => productMatchesCategory(product, "pingentes")),
    aliancas: products.filter((product: any) => productMatchesCategory(product, "aliancas")),
    oculos: products.filter((product: any) => productMatchesCategory(product, "oculos")),
    geral: products,
  };

  let handoffContext: AgentSystemContext["handoffContext"] = {
    shouldHandoff: false,
  };
  if (safetyFlags.isHarassment) {
    handoffContext = { shouldHandoff: true, reason: "assedio", priority: "high" };
  } else if (safetyFlags.hasPaymentProof) {
    handoffContext = { shouldHandoff: true, reason: "pagamento_ou_comprovante", priority: "high" };
  } else if (safetyFlags.hasUnsafeAudio) {
    handoffContext = { shouldHandoff: true, reason: "audio_sem_transcricao_segura", priority: "medium" };
  }

  const context: AgentSystemContextWithRuntime = {
    conversation: {
      id: alineConversation?.id || params.conversationId || null,
      phone,
      customerName: crmConversation?.contact_name || collectedData.contact_name || null,
      status: alineConversation?.status || crmConversation?.lead_status || null,
      tags: compact([
        crmConversation?.lead_status || "",
        collectedData.customer_stage || "",
        collectedData.handoff_reason || "",
      ]),
      assignedSellerId: alineConversation?.assigned_seller_id || null,
      activeAgent: params.activeAgent || alineConversation?.active_agent || collectedData.agente_atual || null,
    },
    normalizedInput: {
      phone,
      text: inputText,
      originalText: normalizedMessage.originalText || normalizedMessage.original_text || inputText,
      buttonResponseId: normalizedMessage.buttonResponseId || normalizedMessage.button_response_id || null,
      buttonText: normalizedMessage.buttonText || normalizedMessage.button_text || null,
      mediaType,
      mediaUrl,
      hasMedia: !!mediaUrl || !!mediaType,
    },
    recentMessages,
    agentMemory,
    collectedData,
    selectedProduct,
    recentCatalog,
    availableProducts,
    activeOffers,
    storeRules: ACIUM_STORE_RULES,
    mediaContext,
    safetyFlags,
    handoffContext,
    __runtime: {
      supabase: params.supabase,
      phoneVariants,
      crmConversationId: crmConversation?.id || null,
    },
  };

  if (context.handoffContext.shouldHandoff && !context.handoffContext.summary) {
    context.handoffContext.summary = summarizeHandoff({
      reason: context.handoffContext.reason || "handoff",
      context,
      priority: context.handoffContext.priority || "medium",
    });
  }

  return context;
}

export function getAgentSystemContextSummary(context: AgentSystemContext) {
  return {
    active_agent: context.conversation.activeAgent || null,
    status: context.conversation.status || null,
    selected_product: context.selectedProduct
      ? {
          id: context.selectedProduct.id || null,
          sku: context.selectedProduct.sku || null,
          name: context.selectedProduct.name || null,
          price: context.selectedProduct.price ?? null,
          category: context.selectedProduct.category || null,
        }
      : null,
    recent_catalog_count: context.recentCatalog.length,
    available_products_count: {
      pingentes: context.availableProducts.pingentes?.length || 0,
      aliancas: context.availableProducts.aliancas?.length || 0,
      oculos: context.availableProducts.oculos?.length || 0,
      geral: context.availableProducts.geral?.length || 0,
    },
    active_offers_count: context.activeOffers.length,
    media_context: context.mediaContext,
    safety_flags: context.safetyFlags,
    handoff_context: context.handoffContext,
    store_rules: context.storeRules,
  };
}

export async function updateCollectedDataPatch(context: AgentSystemContext, patch: AnyRecord) {
  const runtime = getRuntime(context);
  if (!runtime || !context.conversation.id) return { ok: false, error: "missing_context" };

  const nextData = {
    ...context.collectedData,
    ...patch,
  };

  try {
    const { error } = await runtime.supabase
      .from("aline_conversations")
      .update({
        collected_data: nextData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.conversation.id);

    if (error) {
      console.error("[AGENT-CONTEXT] updateCollectedDataPatch failed:", error.message || error);
      return { ok: false, error };
    }

    Object.assign(context.collectedData, patch);
    return { ok: true, data: nextData };
  } catch (error) {
    console.error("[AGENT-CONTEXT] updateCollectedDataPatch exception:", error);
    return { ok: false, error };
  }
}

export async function saveSelectedProduct(context: AgentSystemContext, product: any, source = "agent") {
  const normalized = normalizeProduct(product) || {};
  const patch = {
    selected_product: product || null,
    selected_product_source: source,
    selected_product_changed_at: new Date().toISOString(),
    selected_sku: normalized.sku || product?.sku || null,
    selected_name: normalized.name || product?.name || null,
    selected_price: normalized.price ?? product?.price ?? null,
  };
  return await updateCollectedDataPatch(context, patch);
}

export async function saveAgentMemoryPatch(context: AgentSystemContext, patch: AnyRecord) {
  const runtime = getRuntime(context);
  if (!runtime) return { ok: false, error: "missing_context" };

  const agent = getAgentForMemory(context, patch.agent_slug);
  const currentMemory = safeObject(context.agentMemory[agent]);
  const currentPreferences = safeObject(currentMemory.preferences);
  const preferences = {
    ...currentPreferences,
    ...safeObject(patch.preferences),
  };

  try {
    const { error } = await runtime.supabase
      .from("customer_agent_memory")
      .upsert(
        {
          phone: context.normalizedInput.phone,
          agent_slug: agent,
          customer_name: context.conversation.customerName || "Cliente",
          summary: patch.summary || currentMemory.summary || null,
          preferences,
          last_interest: patch.last_interest || currentMemory.last_interest || context.collectedData.categoria || null,
          last_product_sku: patch.last_product_sku || context.collectedData.selected_sku || null,
          last_product_name: patch.last_product_name || context.collectedData.selected_name || null,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "phone,agent_slug" },
      );

    if (error) {
      console.error("[AGENT-CONTEXT] saveAgentMemoryPatch failed:", error.message || error);
      return { ok: false, error };
    }

    context.agentMemory[agent] = {
      ...currentMemory,
      ...patch,
      preferences,
      agent_slug: agent,
      phone: context.normalizedInput.phone,
    };
    return { ok: true };
  } catch (error) {
    console.error("[AGENT-CONTEXT] saveAgentMemoryPatch exception:", error);
    return { ok: false, error };
  }
}

export async function markHumanHandoff(
  context: AgentSystemContext,
  reason: string,
  summary?: string,
  priority: HandoffPriority = "medium",
) {
  const runtime = getRuntime(context);
  if (!runtime || !context.conversation.id) return { ok: false, error: "missing_context" };

  const handoffSummary = summary || summarizeHandoff({ reason, context, priority });
  const nextData = {
    ...context.collectedData,
    agente_atual: "human",
    customer_stage: "aguardando_humano",
    handoff_reason: reason,
    handoff_summary: handoffSummary,
    handoff_priority: priority,
  };

  try {
    const { error } = await runtime.supabase
      .from("aline_conversations")
      .update({
        status: "human_takeover",
        active_agent: "human",
        assignment_reason: reason,
        collected_data: nextData,
        current_node: "human_handoff",
        last_message_at: new Date().toISOString(),
        agent_handoff_at: new Date().toISOString(),
      })
      .eq("id", context.conversation.id);

    if (error) {
      console.error("[AGENT-CONTEXT] markHumanHandoff failed:", error.message || error);
      return { ok: false, error };
    }

    await runtime.supabase
      .from("conversations")
      .update({ lead_status: "humano" })
      .in("contact_number", runtime.phoneVariants);

    context.conversation.activeAgent = "human";
    context.conversation.status = "human_takeover";
    context.handoffContext = {
      shouldHandoff: true,
      reason,
      summary: handoffSummary,
      priority,
    };
    Object.assign(context.collectedData, nextData);
    return { ok: true };
  } catch (error) {
    console.error("[AGENT-CONTEXT] markHumanHandoff exception:", error);
    return { ok: false, error };
  }
}

export async function saveInternalNote(context: AgentSystemContext, note: string) {
  const runtime = getRuntime(context);
  if (!runtime?.crmConversationId || !note.trim()) return { ok: false, error: "missing_context" };

  try {
    const { error } = await runtime.supabase
      .from("messages")
      .insert({
        conversation_id: runtime.crmConversationId,
        content: `[Nota interna] ${note.trim()}`,
        message_type: "internal_note",
        is_from_me: true,
        status: "sent",
      });

    if (error) {
      console.error("[AGENT-CONTEXT] saveInternalNote failed:", error.message || error);
      return { ok: false, error };
    }

    return { ok: true };
  } catch (error) {
    console.error("[AGENT-CONTEXT] saveInternalNote exception:", error);
    return { ok: false, error };
  }
}

export async function updateCustomerStage(context: AgentSystemContext, stage: string) {
  return await updateCollectedDataPatch(context, { customer_stage: stage });
}

export async function registerCatalogSent(context: AgentSystemContext, agentSlug: string, products: any[]) {
  const existingHistory = asArray(context.collectedData.catalog_history);
  const nextLastCatalog = asArray(products);
  const patch: AnyRecord = {
    last_catalog: nextLastCatalog,
    catalog_history: [...existingHistory, ...nextLastCatalog].slice(-120),
    [`catalogo_${agentSlug}_enviado`]: true,
    last_catalog_sent_at: new Date().toISOString(),
  };
  return await updateCollectedDataPatch(context, patch);
}

export async function rememberLastAgentResponse(context: AgentSystemContext, responseText: string) {
  return await updateCollectedDataPatch(context, {
    last_agent_response: String(responseText || "").trim().slice(0, 2000),
    last_agent_response_at: new Date().toISOString(),
  });
}

export async function incrementFallbackCount(context: AgentSystemContext, fallbackKey: string) {
  const counts = typeof context.collectedData.fallback_count === "object" && context.collectedData.fallback_count
    ? { ...context.collectedData.fallback_count }
    : {};
  counts[fallbackKey] = Number(counts[fallbackKey] || 0) + 1;
  await updateCollectedDataPatch(context, {
    fallback_count: counts,
    fallback_key: fallbackKey,
  });
  return counts[fallbackKey];
}

export async function markSafetyFlag(context: AgentSystemContext, flag: string, reason?: string) {
  const safety = {
    ...safeObject(context.collectedData.safety_flags),
    [flag]: {
      value: true,
      reason: reason || null,
      at: new Date().toISOString(),
    },
  };
  return await updateCollectedDataPatch(context, {
    safety_flags: safety,
    harassment_detected: flag === "harassment" ? true : context.collectedData.harassment_detected,
  });
}

export function isRepeatedAgentResponse(context: AgentSystemContext, nextText: string) {
  const previous = normalizeText(context.collectedData.last_agent_response || "");
  const next = normalizeText(nextText || "");
  return !!previous && !!next && previous === next;
}
