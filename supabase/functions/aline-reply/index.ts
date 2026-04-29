import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MemoryAgent = "aline" | "keila" | "kate";
type ConversationAgent = "aline" | "keila" | "kate" | "human";
type AnyRecord = Record<string, any>;

interface ResponseMediaItem {
  type: "image" | "video";
  url: string;
  caption?: string | null;
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

interface KatePendantTemplate {
  id: string;
  family: "coracao" | "octagonal" | "redondo";
  color: "prata" | "dourada";
  sku_hint: string;
  file_name: string;
  display_name: string;
}

const KATE_ENGRAVING_TEMPLATES: KatePendantTemplate[] = [
  {
    id: "PF-010001-01-S",
    family: "coracao",
    color: "prata",
    sku_hint: "pf01000101",
    file_name: "PF-010001-01-S.png",
    display_name: "Pingente Coração Prata",
  },
  {
    id: "PF-010001-03-M",
    family: "coracao",
    color: "dourada",
    sku_hint: "pf01000103",
    file_name: "PF-010001-03-M.png",
    display_name: "Pingente Coração Dourado",
  },
  {
    id: "PF-010002-01-L",
    family: "octagonal",
    color: "prata",
    sku_hint: "pf01000201",
    file_name: "PF-010002-01-L.png",
    display_name: "Pingente Octagonal Prata",
  },
  {
    id: "PF-010002-03-M",
    family: "octagonal",
    color: "dourada",
    sku_hint: "pf01000203",
    file_name: "PF-010002-03-M.png",
    display_name: "Pingente Octagonal Dourado",
  },
  {
    id: "PF-010003-01-M",
    family: "redondo",
    color: "prata",
    sku_hint: "pf01000301",
    file_name: "PF-010003-01-M.png",
    display_name: "Pingente Redondo Prata",
  },
  {
    id: "PF-010003-03-S",
    family: "redondo",
    color: "dourada",
    sku_hint: "pf01000303",
    file_name: "PF-010003-03-S.png",
    display_name: "Pingente Redondo Dourado",
  },
];

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

function detectPendantIntent(text: string, data: AnyRecord, currentNode: string): boolean {
  const normalized = normalizeText(text);
  const explicitPendant =
    detectCategory(text, {}) === "pingente" ||
    /fotograv|foto gravad|foto no pingente|gravar foto|foto no medalha|foto no medalhao/.test(normalized);
  return explicitPendant || data.categoria === "pingente" || String(currentNode || "").startsWith("kate_");
}

function detectPreviewApprovalIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /aprov|gostei|pode fazer|pode seguir|quero assim|ficou bom|fechar|sim pode|ta bom|t[aá] lindo/.test(normalized);
}

function detectPreviewRedoIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /outra foto|trocar foto|manda outra|vou mandar outra|refaz|refazer|mudar foto/.test(normalized);
}

function normalizeSkuToken(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function inferPendantFamilyFromText(text: string): "coracao" | "octagonal" | "redondo" | null {
  const normalized = normalizeText(text);

  if (/coracao|cora[cç]ao|heart/.test(normalized)) return "coracao";
  if (/octagonal|octogonal|octag/.test(normalized)) return "octagonal";
  if (/redondo|redonda|redond|circle|circular/.test(normalized)) return "redondo";

  return null;
}

function inferKatePendantColor(product: Partial<CatalogProduct> | AnyRecord): "prata" | "dourada" | null {
  const detected = detectColor(
    `${product.color || ""} ${product.name || ""} ${product.description || ""} ${product.category || ""}`,
  );

  if (detected === "prata" || detected === "dourada") return detected;
  return null;
}

function matchKateTemplateForProduct(product: Partial<CatalogProduct> | AnyRecord): KatePendantTemplate | null {
  const sku = normalizeSkuToken(String(product.sku || ""));
  const family = inferPendantFamilyFromText(
    `${product.name || ""} ${product.description || ""} ${product.category || ""}`,
  );
  const color = inferKatePendantColor(product);

  return (
    KATE_ENGRAVING_TEMPLATES.find((template) => {
      const skuMatches = sku ? sku.startsWith(template.sku_hint) || sku.includes(template.sku_hint) : false;
      const familyMatches = family === template.family;
      const colorMatches = color === template.color;
      return colorMatches && (skuMatches || familyMatches);
    }) || null
  );
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

function extractPaymentMethod(text: string): "pix" | "cartao" | "crediario_bemol" | null {
  const normalized = normalizeText(text);

  if (/\bpix\b/.test(normalized)) return "pix";
  if (/crediario|crediario bemol|crediario da bemol|bemol/.test(normalized)) return "crediario_bemol";
  if (/cartao|cartão|credito|crédito|debito|débito/.test(normalized)) return "cartao";

  return null;
}

function customerDoesNotKnowSize(text: string): boolean {
  const normalized = normalizeText(text);
  return /nao sei|não sei|nao sabemos|não sabemos|nao tenho|não tenho|ainda nao sei|ainda não sei|depois vejo/.test(
    normalized,
  );
}

function detectCatalogResendIntent(text: string): boolean {
  const normalized = normalizeText(text);
  const asksToSend = /(envia|enviar|manda|manda ai|mostra|mostrar|quero ver|me manda|me envia)/.test(normalized);
  const mentionsCatalog = /(modelo|modelos|opcao|opcoes|catalogo|alianca|aliancas)/.test(normalized);
  return asksToSend && mentionsCatalog;
}

function detectMoreOptionsIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /tem outros|tem outras|mais opcoes|mais opcoes|mais modelos|outros modelos|outras opcoes|outras opções|ver mais/.test(
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
  delete data.catalogo_kate_enviado;
  delete data.catalogo_orcamento_relaxado;
  delete data.last_catalog;
  delete data.selected_product;
  delete data.selected_sku;
  delete data.selected_name;
  delete data.selected_price;
  delete data.delivery_method;
  delete data.payment_method;
  delete data.keila_store_handoff_done;
  delete data.kate_store_handoff_done;
}

function hasCurrentCatalogSelection(data: AnyRecord): boolean {
  const selectedSku = normalizeText(String(data.selected_sku || ""));
  const selectedName = normalizeText(String(data.selected_name || ""));
  const catalog = Array.isArray(data.last_catalog) ? data.last_catalog : [];

  if (catalog.length === 0) return false;

  return catalog.some((item: any) => {
    const itemSku = normalizeText(String(item?.sku || ""));
    const itemName = normalizeText(String(item?.name || ""));

    return (selectedSku && itemSku === selectedSku) || (selectedName && itemName === selectedName);
  });
}

function mergeCatalogHistory(existingCatalog: unknown, items: unknown): AnyRecord[] {
  const currentItems = Array.isArray(existingCatalog) ? existingCatalog : [];
  const incomingItems = Array.isArray(items) ? items : [];
  const map = new Map<string, AnyRecord>();

  for (const item of [...currentItems, ...incomingItems]) {
    const record = (item || {}) as AnyRecord;
    const key = normalizeText(String(record.sku || record.id || record.name || ""));
    if (!key) continue;
    map.set(key, record);
  }

  return Array.from(map.values());
}

function getCatalogSelectionPool(data: AnyRecord): AnyRecord[] {
  return mergeCatalogHistory(data.catalog_history, data.last_catalog);
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

function isKateFlowNode(node: string): boolean {
  const normalized = String(node || "");
  return (
    normalized.startsWith("kate_") ||
    normalized === "catalogo_pingente" ||
    normalized === "selecao_pingente" ||
    normalized === "human_handoff_pingente"
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
  delete data.catalog_history;
  delete data.delivery_method;
  delete data.payment_method;
  delete data.keila_store_handoff_done;
  resetCatalogChoice(data);
}

function resetKateFlowState(data: AnyRecord) {
  delete data.cor;
  delete data.catalog_history;
  delete data.delivery_method;
  delete data.payment_method;
  delete data.kate_photo_requested;
  delete data.kate_customer_photo_url;
  delete data.kate_preview_image_url;
  delete data.kate_preview_status;
  delete data.kate_preview_approved;
  delete data.kate_store_handoff_done;
  delete data.kate_selected_template_id;
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
      tags,
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
  const excludedSkus = Array.isArray(params.exclude_skus)
    ? params.exclude_skus.map((sku: unknown) => normalizeText(String(sku || ""))).filter(Boolean)
    : [];

  let filtered = (products || []).filter((product: any) => {
    const category = normalizeText(product.category || "");
    const name = normalizeText(product.name || "");
    const productColor = normalizeText(product.color || "");
    const description = normalizeText(product.description || "");
    const productSku = normalizeText(product.sku || "");
    const tagsText = Array.isArray(product.tags)
      ? product.tags.map((tag: unknown) => normalizeText(String(tag || ""))).join(" ")
      : normalizeText(String(product.tags || ""));
    const colorSearchText = `${productColor} ${name} ${description} ${category} ${tagsText}`;
    const isTungsten =
      category.includes("tungstenio") ||
      category.includes("tungsten") ||
      name.includes("tungstenio") ||
      name.includes("tungsten") ||
      description.includes("tungstenio") ||
      description.includes("tungsten") ||
      name.includes("casamento") ||
      description.includes("casamento") ||
      tagsText.includes("tungstenio") ||
      tagsText.includes("tungsten") ||
      tagsText.includes("casamento") ||
      /^e0(?:6|7)120\d+/i.test(productSku);

    if (excludedSkus.length > 0 && productSku && excludedSkus.includes(productSku)) {
      return false;
    }

    if (requestedCategory === "aliancas") {
      const isAlliance =
        category.includes("alianca") ||
        category.includes("aliancas") ||
        category.includes("tungsten") ||
        name.includes("alianca") ||
        description.includes("alianca") ||
        description.includes("aliancas") ||
        tagsText.includes("alianca") ||
        tagsText.includes("aliancas") ||
        tagsText.includes("casamento");

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
        requestedColor === "prata"
          ? ["prata", "aco", "aço", "silver"]
          : requestedColor === "dourada"
            ? ["dourada", "dourado", "ouro", "gold", "amarela", "amarelo"]
            : requestedColor === "preta"
              ? ["preta", "preto", "black", "negra", "escura", "escuro"]
              : requestedColor === "azul"
                ? ["azul", "blue"]
                : [requestedColor];

      const matchesColor = normalizedRequestedColor.some((color) => colorSearchText.includes(color));
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

  filtered = filtered.sort((a: any, b: any) => {
    const aColor = normalizeText(a.color || "");
    const bColor = normalizeText(b.color || "");
    const requested = normalizeText(requestedColor);
    const aExact = requested ? aColor.includes(requested) : false;
    const bExact = requested ? bColor.includes(requested) : false;

    if (aExact !== bExact) return aExact ? -1 : 1;

    return Number(a.price || 0) - Number(b.price || 0);
  });

  if (Number.isFinite(Number(params.limit)) && Number(params.limit) > 0) {
    filtered = filtered.slice(0, Number(params.limit));
  }

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

function buildKateCards(products: CatalogProduct[]): CatalogProduct[] {
  return products.map((product) => {
    const captionLines = [
      `*${product.name}*`,
      product.color ? `🎨 Cor: ${product.color}` : null,
      product.sku ? `📦 Cód: ${product.sku}` : null,
      product.price_formatted ? `💰 Valor da unidade: ${product.price_formatted}` : null,
      "📸 Fotogravação de 1 lado inclusa.",
    ].filter(Boolean);

    return {
      ...product,
      caption: captionLines.join("\n"),
      button_id: `select_${product.sku || product.id}`,
      button_label: "Quero este",
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

  const fuzzyNameMatch = catalog.find((item: any) => {
    const name = normalizeText(String(item.name || ""));
    if (!name) return false;
    if (normalized.includes(name)) return true;

    const significantWords = name.split(/\s+/).filter((word) => word.length >= 4);
    if (significantWords.length === 0) return false;

    const matchedWords = significantWords.filter((word) => normalized.includes(word)).length;
    return matchedWords >= Math.min(3, significantWords.length) && matchedWords >= 2;
  });
  if (fuzzyNameMatch) return fuzzyNameMatch;

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
  mediaItems?: ResponseMediaItem[];
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
    mediaItems = [],
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
    media_items: mediaItems,
    total_media_items: mediaItems.length,
    tem_midia: mediaItems.length > 0,
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
      agent_handoff_at: activeAgent === "keila" || activeAgent === "kate" ? new Date().toISOString() : null,
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
  const deliveryLabel = data.delivery_method === "retirada" ? "retirada na loja" : "delivery";
  const paymentLabel =
    data.payment_method === "pix"
      ? "Pix"
      : data.payment_method === "crediario_bemol"
        ? "Crediario Bemol"
        : data.payment_method === "cartao"
          ? "cartao de credito"
          : "forma de pagamento";
  const selectedLabel = data.selected_name || data.selected_sku || "alianca casamento";
  const assignmentReason = `Keila finalizou pedido: ${selectedLabel} | ${deliveryLabel} | ${paymentLabel}`;

  await supabase
    .from("aline_conversations")
    .update({
      status: "human_takeover",
      active_agent: "human",
      assignment_reason: assignmentReason,
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
        reason: assignmentReason,
        send_intro: true,
      }),
    });
  } catch (error) {
    console.error("[ALINE-REPLY] Erro ao encaminhar para atendimento humano:", error);
  }

  const reply = `Perfeito! Já deixei anotado que será ${deliveryLabel} com pagamento via ${paymentLabel}. Vou te encaminhar agora para nosso atendimento humano finalizar com você e acionar os vendedores. 💍`;

  await saveAssistantMessage(
    supabase,
    conversation.id,
    "keila",
    reply,
    "human_handoff_fechamento",
  );

  await saveAgentMemory(supabase, phone, "keila", contactName, data);

  return buildResponsePayload({
    phone,
    message: reply,
    node: "human_handoff_fechamento",
    selectedProduct: data.selected_product || null,
    collectedData: data,
    agent: "human",
  });
}

async function generateKatePreview(args: {
  supabase: any;
  phone: string;
  selectedProduct: AnyRecord;
  customerPhotoUrl: string;
}) {
  const { supabase, phone, selectedProduct, customerPhotoUrl } = args;
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openAIApiKey) {
    throw new Error("OPENAI_API_KEY não configurada para gerar a prévia da Kate.");
  }

  const productImageUrl = String(selectedProduct?.image_url || selectedProduct?.media_url || "").trim();
  if (!productImageUrl) {
    throw new Error("O produto escolhido não possui imagem para gerar a prévia.");
  }

  const prompt = `Crie uma prévia comercial realista de fotogravação para aprovação do cliente.
- Use a imagem do pingente escolhido como referência principal de forma, metal e enquadramento.
- Use a foto enviada pelo cliente como arte que será gravada no pingente.
- A gravação deve parecer monocromática, elegante e centralizada na frente do pingente.
- Preserve o tipo de pingente, a cor do metal, o fundo branco e o visual limpo de catálogo.
- Não adicione corrente, mãos, textos extras, molduras ou objetos novos.
- O resultado deve parecer uma prévia de gravação, não uma foto impressa colorida.`;

  const imageResponse = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openAIApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      images: [
        { image_url: productImageUrl },
        { image_url: customerPhotoUrl },
      ],
      prompt,
      size: "1024x1024",
      quality: "low",
      output_format: "png",
    }),
  });

  if (!imageResponse.ok) {
    const errorText = await imageResponse.text();
    throw new Error(`OpenAI image edit error: ${imageResponse.status} - ${errorText}`);
  }

  const imagePayload = await imageResponse.json();
  const previewBase64 = imagePayload?.data?.[0]?.b64_json || null;
  const previewUrl = imagePayload?.data?.[0]?.url || null;

  if (previewUrl) {
    return previewUrl;
  }

  if (!previewBase64) {
    throw new Error("A OpenAI não retornou uma imagem válida para a prévia.");
  }

  const binary = Uint8Array.from(atob(previewBase64), (char) => char.charCodeAt(0));
  const filePath = `kate-previews/${phone}/${Date.now()}-${selectedProduct?.sku || selectedProduct?.id || "pingente"}.png`;

  const { error: uploadError } = await supabase.storage
    .from("chat-media")
    .upload(filePath, binary, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(filePath);
  return publicUrlData?.publicUrl || null;
}

async function handoffKateToHuman(args: {
  supabase: any;
  supabaseUrl: string;
  supabaseServiceKey: string;
  conversation: any;
  phone: string;
  contactName: string;
  data: AnyRecord;
}) {
  const { supabase, supabaseUrl, supabaseServiceKey, conversation, phone, contactName, data } = args;

  data.kate_store_handoff_done = true;
  const deliveryLabel = data.delivery_method === "retirada" ? "retirada na loja" : "delivery";
  const paymentLabel =
    data.payment_method === "pix"
      ? "Pix"
      : data.payment_method === "crediario_bemol"
        ? "Crediario Bemol"
        : data.payment_method === "cartao"
          ? "cartão de crédito"
          : "forma de pagamento";
  const selectedLabel = data.selected_name || data.selected_sku || "pingente fotogravado";
  const assignmentReason = `Kate finalizou pedido: ${selectedLabel} | ${deliveryLabel} | ${paymentLabel}`;

  await supabase
    .from("aline_conversations")
    .update({
      status: "human_takeover",
      active_agent: "human",
      assignment_reason: assignmentReason,
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
        reason: assignmentReason,
        send_intro: true,
      }),
    });
  } catch (error) {
    console.error("[ALINE-REPLY] Erro ao encaminhar pingente para atendimento humano:", error);
  }

  const reply = `Perfeito! Já deixei anotado que será ${deliveryLabel} com pagamento via ${paymentLabel}. Vou te encaminhar agora para nosso atendimento humano finalizar seu pingente fotogravado 💫`;

  await saveAssistantMessage(supabase, conversation.id, "kate", reply, "human_handoff_pingente");
  await saveAgentMemory(supabase, phone, "kate", contactName, data);

  return buildResponsePayload({
    phone,
    message: reply,
    node: "human_handoff_pingente",
    selectedProduct: data.selected_product || null,
    collectedData: data,
    agent: "human",
  });
}

async function handleKateFlow(args: {
  supabase: any;
  supabaseUrl: string;
  supabaseServiceKey: string;
  conversation: any;
  phone: string;
  message: string;
  contactName: string;
  buttonResponseId: string | null;
  catalogSelectionHint: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
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
    catalogSelectionHint,
    mediaType,
    mediaUrl,
  } = args;

  const currentNode = String(conversation.current_node || "");
  const data: AnyRecord = {
    ...(conversation.collected_data || {}),
    agente_atual: "kate",
    categoria: "pingente",
  };

  if (!isKateFlowNode(currentNode)) {
    resetKateFlowState(data);
  }

  const previousSelectedSku = String(data.selected_sku || "");
  const selectedFromCatalog = findCatalogSelection(
    buttonResponseId || catalogSelectionHint || message,
    getCatalogSelectionPool(data),
  );

  if (selectedFromCatalog) {
    data.selected_product = selectedFromCatalog;
    data.selected_sku = selectedFromCatalog.sku;
    data.selected_name = selectedFromCatalog.name;
    data.selected_price = selectedFromCatalog.price;
    data.kate_selected_template_id = matchKateTemplateForProduct(selectedFromCatalog)?.id || null;
    data.last_catalog = mergeCatalogHistory(data.last_catalog, [selectedFromCatalog]);

    if (previousSelectedSku && previousSelectedSku !== String(selectedFromCatalog.sku || "")) {
      delete data.kate_customer_photo_url;
      delete data.kate_preview_image_url;
      delete data.kate_preview_status;
      delete data.kate_preview_approved;
      delete data.delivery_method;
      delete data.payment_method;
      delete data.kate_store_handoff_done;
    }
  }

  const deliveryMethod = extractDeliveryMethod(message);
  if (deliveryMethod) {
    data.delivery_method = deliveryMethod;
  }

  const paymentMethod = extractPaymentMethod(message);
  if (paymentMethod) {
    data.payment_method = paymentMethod;
  }

  const detectedColor = detectColor(message);
  if (detectedColor === "prata" || detectedColor === "dourada") {
    if (data.cor !== detectedColor) {
      data.cor = detectedColor;
      resetCatalogChoice(data);
      delete data.kate_selected_template_id;
      delete data.kate_customer_photo_url;
      delete data.kate_preview_image_url;
      delete data.kate_preview_status;
      delete data.kate_preview_approved;
    }
  }

  const hasColor = data.cor === "prata" || data.cor === "dourada";
  const hasSelectedProduct = !!data.selected_sku;
  const hasPhoto = !!data.kate_customer_photo_url;
  const hasPreview = !!data.kate_preview_image_url;
  const hasPreviewApproved = data.kate_preview_approved === true;
  const hasDelivery = !!data.delivery_method;
  const hasPayment = !!data.payment_method;
  const wantsCatalogResend = detectCatalogResendIntent(message);
  const wantsMoreOptions = detectMoreOptionsIntent(message);

  const fetchKateCatalogCards = async (excludeSkus: string[] = []) => {
    const searchParams: AnyRecord = {
      category: "pingente",
      only_available: true,
      limit: 30,
    };

    if (data.cor) {
      searchParams.color = data.cor;
    }

    if (excludeSkus.length > 0) {
      searchParams.exclude_skus = excludeSkus;
    }

    const catalog = await searchCatalog(supabase, searchParams, data);
    const filtered = catalog.filter((product) => {
      const template = matchKateTemplateForProduct(product);
      if (!template) return false;
      if (!data.cor) return true;
      return template.color === data.cor;
    });

    return buildKateCards(filtered);
  };

  if (!hasColor) {
    const reply = detectedColor && !["prata", "dourada"].includes(detectedColor)
      ? "Para pingentes com fotogravação, hoje eu tenho modelos em dourada e prata. Qual dessas cores você prefere? 💫"
      : `Perfeito! Vou te transferir para a Kate, nossa especialista em pingentes fotogravados. 💫

Oi! Sou a Kate. Qual cor você prefere para o pingente: dourada ou prata?`;

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_cor",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_cor");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_cor",
      collectedData: data,
      agent: "kate",
    });
  }

  if (!data.catalogo_kate_enviado) {
    const cards = await fetchKateCatalogCards();

    if (cards.length === 0) {
      const reply = `Não encontrei pingentes fotograváveis prontos na cor ${data.cor} agora. Se quiser, eu posso te mostrar a outra cor disponível 😊`;

      await persistConversation(
        supabase,
        conversation.id,
        "kate",
        "kate_sem_catalogo",
        conversation.current_node || null,
        data,
      );
      await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_sem_catalogo");
      await saveAgentMemory(supabase, phone, "kate", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "kate_sem_catalogo",
        collectedData: data,
        agent: "kate",
      });
    }

    data.catalogo_kate_enviado = true;
    data.last_catalog = cards.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      color: product.color,
      image_url: product.image_url,
      video_url: product.video_url,
    }));
    data.catalog_history = mergeCatalogHistory(data.catalog_history, data.last_catalog);

    const reply = `Separei os pingentes fotograváveis na cor ${data.cor}. ✨
A fotogravação de 1 lado já está inclusa.`;

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "catalogo_pingente",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "catalogo_pingente");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "catalogo_pingente",
      products: cards,
      collectedData: data,
      agent: "kate",
      useProductButtons: true,
      postCatalogMessage: "Gostou de algum modelo? Se escolher um, eu já te peço a foto para gerar a prévia 😊",
    });
  }

  if (data.catalogo_kate_enviado && !hasSelectedProduct && (wantsCatalogResend || wantsMoreOptions)) {
    const shownSkus = Array.isArray(data.last_catalog)
      ? data.last_catalog.map((item: any) => String(item?.sku || "")).filter(Boolean)
      : [];
    const cards = await fetchKateCatalogCards(wantsMoreOptions ? shownSkus : []);

    if (cards.length === 0 && wantsMoreOptions) {
      const reply = "No momento esses são os modelos fotograváveis que tenho nessa cor. Se quiser, eu posso te mostrar a outra cor disponível 😊";

      await persistConversation(
        supabase,
        conversation.id,
        "kate",
        "kate_sem_mais_opcoes",
        conversation.current_node || null,
        data,
      );
      await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_sem_mais_opcoes");
      await saveAgentMemory(supabase, phone, "kate", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "kate_sem_mais_opcoes",
        collectedData: data,
        agent: "kate",
      });
    }

    if (cards.length > 0) {
      data.last_catalog = cards.map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        color: product.color,
        image_url: product.image_url,
        video_url: product.video_url,
      }));
      data.catalog_history = mergeCatalogHistory(data.catalog_history, data.last_catalog);

      const reply = wantsMoreOptions
        ? `Tenho outras opções de pingentes fotograváveis na cor ${data.cor} para te mostrar. ✨`
        : "Claro! Vou te reenviar os modelos para você olhar com calma. ✨";

      await persistConversation(
        supabase,
        conversation.id,
        "kate",
        "catalogo_pingente",
        conversation.current_node || null,
        data,
      );
      await saveAssistantMessage(supabase, conversation.id, "kate", reply, "catalogo_pingente");
      await saveAgentMemory(supabase, phone, "kate", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "catalogo_pingente",
        products: cards,
        collectedData: data,
        agent: "kate",
        useProductButtons: true,
        postCatalogMessage: "Gostou de algum modelo? Se escolher um, eu já te peço a foto para gerar a prévia 😊",
      });
    }
  }

  if (hasSelectedProduct && !hasPhoto) {
    if (mediaType === "image" && mediaUrl) {
      data.kate_customer_photo_url = mediaUrl;
      data.kate_photo_requested = true;

      try {
        const previewImageUrl = await generateKatePreview({
          supabase,
          phone,
          selectedProduct: data.selected_product || {},
          customerPhotoUrl: mediaUrl,
        });

        data.kate_preview_image_url = previewImageUrl;
        data.kate_preview_status = "sent";
        data.kate_preview_approved = false;

        const reply = `Recebi sua foto! Gerei uma prévia do *${data.selected_name}* para você conferir. Se aprovar, eu sigo para entrega e pagamento 😊`;

        await persistConversation(
          supabase,
          conversation.id,
          "kate",
          "kate_preview",
          conversation.current_node || null,
          data,
        );
        await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_preview");
        await saveAgentMemory(supabase, phone, "kate", contactName, data);

        return buildResponsePayload({
          phone,
          message: reply,
          node: "kate_preview",
          mediaItems: previewImageUrl
            ? [
                {
                  type: "image",
                  url: previewImageUrl,
                  caption: `Prévia do ${data.selected_name || "pingente fotogravado"}`,
                },
              ]
            : [],
          selectedProduct: data.selected_product || null,
          collectedData: data,
          agent: "kate",
        });
      } catch (error) {
        console.error("[ALINE-REPLY] Erro ao gerar prévia da Kate:", error);
        const reply =
          "Recebi sua foto, mas não consegui gerar a prévia automática agora. Vou te encaminhar para nosso atendimento humano finalizar a fotogravação com você 😊";

        await persistConversation(
          supabase,
          conversation.id,
          "kate",
          "kate_preview_falhou",
          conversation.current_node || null,
          data,
        );
        await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_preview_falhou");
        await saveAgentMemory(supabase, phone, "kate", contactName, data);

        return await handoffKateToHuman({
          supabase,
          supabaseUrl,
          supabaseServiceKey,
          conversation,
          phone,
          contactName,
          data,
        });
      }
    }

    const reply = `Perfeito! Você escolheu *${data.selected_name}*. 📸

Esse modelo permite fotogravação de 1 lado. Me manda agora a foto que você quer gravar para eu gerar a prévia 😊`;

    data.kate_photo_requested = true;

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_foto",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_foto");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_foto",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }

  if (hasPreview && !hasPreviewApproved) {
    if (mediaType === "image" && mediaUrl) {
      data.kate_customer_photo_url = mediaUrl;
      data.kate_preview_approved = false;

      try {
        const previewImageUrl = await generateKatePreview({
          supabase,
          phone,
          selectedProduct: data.selected_product || {},
          customerPhotoUrl: mediaUrl,
        });

        data.kate_preview_image_url = previewImageUrl;
        data.kate_preview_status = "resent";

        const reply = "Perfeito! Gerei uma nova prévia com essa foto para você conferir 😊";

        await persistConversation(
          supabase,
          conversation.id,
          "kate",
          "kate_preview",
          conversation.current_node || null,
          data,
        );
        await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_preview");
        await saveAgentMemory(supabase, phone, "kate", contactName, data);

        return buildResponsePayload({
          phone,
          message: reply,
          node: "kate_preview",
          mediaItems: previewImageUrl
            ? [
                {
                  type: "image",
                  url: previewImageUrl,
                  caption: `Nova prévia do ${data.selected_name || "pingente fotogravado"}`,
                },
              ]
            : [],
          selectedProduct: data.selected_product || null,
          collectedData: data,
          agent: "kate",
        });
      } catch (error) {
        console.error("[ALINE-REPLY] Erro ao refazer prévia da Kate:", error);
      }
    }

    if (detectPreviewRedoIntent(message)) {
      delete data.kate_customer_photo_url;
      delete data.kate_preview_image_url;
      delete data.kate_preview_status;
      delete data.kate_preview_approved;

      const reply = "Claro! Me manda outra foto que eu gero uma nova prévia para você 😊";

      await persistConversation(
        supabase,
        conversation.id,
        "kate",
        "kate_foto",
        conversation.current_node || null,
        data,
      );
      await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_foto");
      await saveAgentMemory(supabase, phone, "kate", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "kate_foto",
        selectedProduct: data.selected_product || null,
        collectedData: data,
        agent: "kate",
      });
    }

    if (detectPreviewApprovalIntent(message)) {
      data.kate_preview_approved = true;
    } else {
      const reply =
        "Se essa prévia ficou boa, me confirma que eu sigo para entrega e pagamento. Se preferir, você também pode me mandar outra foto 😊";

      await persistConversation(
        supabase,
        conversation.id,
        "kate",
        "kate_preview",
        conversation.current_node || null,
        data,
      );
      await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_preview");
      await saveAgentMemory(supabase, phone, "kate", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "kate_preview",
        selectedProduct: data.selected_product || null,
        collectedData: data,
        agent: "kate",
      });
    }
  }

  if (hasSelectedProduct && (data.kate_preview_approved === true) && !hasDelivery) {
    const reply = `Perfeito! Prévia aprovada para *${data.selected_name}*. ✨

Você vai retirar na loja ou prefere delivery? Depois eu confirmo a forma de pagamento: Pix, Crediario Bemol ou cartão de crédito.`;

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_entrega",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_entrega");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_entrega",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }

  if (hasSelectedProduct && hasDelivery && !hasPayment) {
    const reply = "Perfeito! E a forma de pagamento vai ser no Pix, Crediario Bemol ou cartão de crédito? 💳";

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_pagamento",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_pagamento");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_pagamento",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }

  if (hasSelectedProduct && hasDelivery && hasPayment && !data.kate_store_handoff_done) {
    return await handoffKateToHuman({
      supabase,
      supabaseUrl,
      supabaseServiceKey,
      conversation,
      phone,
      contactName,
      data,
    });
  }

  const reply = "Se quiser, posso te reenviar os modelos ou gerar outra prévia com uma nova foto 😊";

  await persistConversation(
    supabase,
    conversation.id,
    "kate",
    "selecao_pingente",
    conversation.current_node || null,
    data,
  );
  await saveAssistantMessage(supabase, conversation.id, "kate", reply, "selecao_pingente");
  await saveAgentMemory(supabase, phone, "kate", contactName, data);

  return buildResponsePayload({
    phone,
    message: reply,
    node: "selecao_pingente",
    selectedProduct: data.selected_product || null,
    collectedData: data,
    agent: "kate",
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
  catalogSelectionHint: string | null;
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
    catalogSelectionHint,
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
    buttonResponseId || catalogSelectionHint || message,
    getCatalogSelectionPool(data),
  );

  if (selectedFromCatalog) {
    data.selected_product = selectedFromCatalog;
    data.selected_sku = selectedFromCatalog.sku;
    data.selected_name = selectedFromCatalog.name;
    data.selected_price = selectedFromCatalog.price;
    data.last_catalog = mergeCatalogHistory(data.last_catalog, [selectedFromCatalog]);
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
  if (!data.payment_method && /crediario|crediario bemol|crediario da bemol|bemol/.test(normalizeText(message))) {
    data.payment_method = "crediario_bemol";
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
  const hasSelectedProduct = hasCurrentCatalogSelection(data);

  if (!hasSelectedProduct) {
    delete data.selected_product;
    delete data.selected_sku;
    delete data.selected_name;
    delete data.selected_price;
    delete data.delivery_method;
    delete data.payment_method;
    delete data.keila_store_handoff_done;
  }

  const hasDelivery = !!data.delivery_method;
  const hasPayment = !!data.payment_method;
  const wantsCatalogResend = detectCatalogResendIntent(message);
  const wantsMoreOptions = detectMoreOptionsIntent(message);

  const fetchKeilaCatalogCards = async (excludeSkus: string[] = []) => {
    const searchParams: AnyRecord = {
      category: "aliancas",
      color: data.cor,
      only_available: true,
    };

    if (excludeSkus.length > 0) {
      searchParams.exclude_skus = excludeSkus;
    }

    if (Number.isFinite(Number(data.orcamento_valor || 0)) && Number(data.orcamento_valor || 0) > 0) {
      const budgetValue = Number(data.orcamento_valor || 0);
      searchParams.max_price = data.quantidade_tipo === "par" ? budgetValue / 2 : budgetValue;
    }

    let catalog = await searchCatalog(supabase, searchParams, data);
    let usedBudgetFallback = false;
    let usedWeddingFallback = false;

    if (catalog.length === 0 && searchParams.max_price) {
      const relaxedSearchParams = { ...searchParams };
      delete relaxedSearchParams.max_price;
      catalog = await searchCatalog(supabase, relaxedSearchParams, data);
      usedBudgetFallback = catalog.length > 0;
    }

    if (catalog.length === 0 && data.finalidade === "casamento") {
      const broadWeddingData = {
        ...data,
        finalidade: "",
      };
      const broadSearchParams = { ...searchParams };
      delete broadSearchParams.max_price;
      catalog = await searchCatalog(supabase, broadSearchParams, broadWeddingData);
      usedWeddingFallback = catalog.length > 0;
    }

    return {
      cards: buildKeilaCards(catalog),
      usedBudgetFallback,
      usedWeddingFallback,
    };
  };

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
    const { cards, usedBudgetFallback, usedWeddingFallback } = await fetchKeilaCatalogCards();

    if (cards.length === 0) {
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
    data.catalog_history = mergeCatalogHistory(data.catalog_history, data.last_catalog);

    const intro =
      data.numeracao_status === "nao_sabe"
        ? "Tudo bem, se você ainda não souber a numeração agora, eu sigo com você mesmo assim 😊\n\n"
        : "";

    const reply = `${intro}${
      usedBudgetFallback
        ? `Não encontrei modelos na cor ${data.cor} exatamente dentro dessa faixa de valor, mas separei outras opções disponíveis da mesma categoria para te mostrar. 💍`
        : usedWeddingFallback
          ? `Não encontrei modelos na cor ${data.cor} com o cadastro ideal da linha de casamento, mas separei outras opções compatíveis para te mostrar. 💍`
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

  if (data.catalogo_keila_enviado && !hasSelectedProduct && (wantsCatalogResend || wantsMoreOptions)) {
    const shownSkus = Array.isArray(data.last_catalog)
      ? data.last_catalog.map((item: any) => String(item?.sku || "")).filter(Boolean)
      : [];

    const { cards, usedBudgetFallback, usedWeddingFallback } = await fetchKeilaCatalogCards(wantsMoreOptions ? shownSkus : []);

    if (cards.length === 0 && wantsMoreOptions) {
      const reply =
        "No momento essas são as opções que tenho nessa cor. Se quiser, eu posso buscar outra faixa de valor ou outra cor para te mostrar. 😊";

      await persistConversation(
        supabase,
        conversation.id,
        "keila",
        "keila_sem_mais_opcoes",
        conversation.current_node || null,
        data,
      );
      await saveAssistantMessage(
        supabase,
        conversation.id,
        "keila",
        reply,
        "keila_sem_mais_opcoes",
      );
      await saveAgentMemory(supabase, phone, "keila", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "keila_sem_mais_opcoes",
        collectedData: data,
        agent: "keila",
      });
    }

    if (cards.length > 0) {
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
      data.catalog_history = mergeCatalogHistory(data.catalog_history, data.last_catalog);

      const reply = wantsMoreOptions
        ? `${
            usedBudgetFallback
              ? `Tenho outras opções na cor ${data.cor}, incluindo modelos fora dessa faixa exata para você comparar. 💍`
              : usedWeddingFallback
                ? `Tenho outras opções compatíveis na cor ${data.cor} para te mostrar. 💍`
                : `Tenho outras opções na cor ${data.cor} para te mostrar. 💍`
          }`
        : "Claro! Vou te reenviar os modelos para você olhar com calma. 💍";

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
  }

  if (hasSelectedProduct && !hasDelivery) {
    const reply = `Perfeito! Você escolheu *${data.selected_name}*. 💍

Você vai retirar na loja ou prefere delivery? Depois eu confirmo a forma de pagamento: Pix, Crediario Bemol ou cartão de crédito.`;

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

  if (hasSelectedProduct && hasDelivery && !hasPayment) {
    const reply = "Perfeito! E a forma de pagamento vai ser no Pix, Crediario Bemol ou cartão de crédito? 💳";

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

  if (hasSelectedProduct && hasDelivery && hasPayment && !data.keila_store_handoff_done) {
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
    const catalogSelectionHint = body.catalog_selection_hint ? String(body.catalog_selection_hint) : null;
    const mediaType = body.media_type ? String(body.media_type) : null;
    const mediaUrl = body.media_url ? String(body.media_url) : null;
    const inboundText = [message, catalogSelectionHint].filter(Boolean).join(" ").trim();

    if (!phone || (!message && !mediaUrl && !buttonResponseId && !catalogSelectionHint)) {
      throw new Error("phone and message or media are required");
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
      message: message || buttonResponseId || catalogSelectionHint || (mediaType ? `[${mediaType}]` : "[sem texto]"),
      node: conversation.current_node || "abertura",
    });

    const baseData: AnyRecord = {
      ...(conversation.collected_data || {}),
      contact_name: contactName || conversation.collected_data?.contact_name || "Cliente",
    };

    baseData.categoria = detectCategory(inboundText, baseData) || baseData.categoria || null;
    baseData.finalidade = detectAllianceType(inboundText, baseData) || baseData.finalidade || null;
    baseData.triagem_categoria = detectClassification(inboundText, baseData) || baseData.triagem_categoria || null;

    const activeAgent = (conversation.active_agent || baseData.agente_atual || "aline") as ConversationAgent;
    const alineMemory = await loadAgentMemory(supabase, phone, "aline");
    const kateMemory = await loadAgentMemory(supabase, phone, "kate");

    if (activeAgent === "kate" || detectPendantIntent(inboundText, baseData, conversation.current_node || "")) {
      const kateResponse = await handleKateFlow({
        supabase,
        supabaseUrl,
        supabaseServiceKey,
        conversation: {
          ...conversation,
          active_agent: "kate",
          collected_data: hydrateDataWithMemory(
            {
              ...baseData,
              agente_atual: "kate",
              categoria: "pingente",
            },
            kateMemory,
          ),
        },
        phone,
        message,
        contactName,
        buttonResponseId,
        catalogSelectionHint,
        mediaType,
        mediaUrl,
      });

      return new Response(JSON.stringify(kateResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (activeAgent === "keila" || detectMarriageIntent(inboundText, baseData, conversation.current_node || "")) {
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
        catalogSelectionHint,
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
