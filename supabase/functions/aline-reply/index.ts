import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPhoneVariants, normalizeWhatsappPhone } from "../_shared/phone.ts";
import {
  buildAgentSystemContext,
  getAgentSystemContextSummary,
} from "../_shared/agent-system-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PREVIEW_GENERATIONS_PER_CUSTOMER = 2;

type MemoryAgent = "aline" | "keila" | "kate" | "malu";
type ConversationAgent = "aline" | "keila" | "kate" | "malu" | "human";
type AnyRecord = Record<string, any>;
type ConversationIntent =
  | "produto_aliancas"
  | "produto_pingentes"
  | "produto_oculos"
  | "atendimento_humano"
  | "pagamento"
  | "entrega"
  | "catalogo"
  | "preco"
  | "previa"
  | "foto_cliente"
  | "escolha_produto"
  | "duvida_geral"
  | "indefinido";

interface ConversationIntelligence {
  intent: ConversationIntent;
  targetAgent: ConversationAgent | "unknown";
  confidence: number;
  shouldSwitchAgent: boolean;
  customerStage: string;
  extracted: AnyRecord;
  source: "rules" | "openai" | "hybrid";
  needsClarification: boolean;
  clarificationQuestion?: string | null;
}

interface ImageUnderstanding {
  kind: "customer_photo" | "product_reference" | "payment_document" | "inappropriate" | "unclear";
  product_category: "pingente" | "oculos" | "aliancas" | "aneis" | "chaveiro" | null;
  confidence: number;
  reason: string | null;
}

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
  buttons?: Array<{ id: string; label: string }>;
  force_separate_buttons?: boolean;
  tags?: unknown;
  agent_line?: string | null;
  ai_description?: string | null;
  ai_tags?: unknown;
  search_aliases?: unknown;
  commercial_notes?: string | null;
  included_items?: string | null;
  restrictions?: string | null;
  recommended_when?: string | null;
  avoid_when?: string | null;
}

interface KatePendantTemplate {
  id: string;
  family: "coracao" | "octagonal" | "redondo";
  color: "prata" | "dourada";
  sku_aliases: string[];
  name_aliases: string[];
  file_name: string;
  display_name: string;
}

const KATE_ENGRAVING_TEMPLATES: KatePendantTemplate[] = [
  {
    id: "PF-010001-01-S",
    family: "coracao",
    color: "prata",
    sku_aliases: ["pf01000101", "pf01000101s"],
    name_aliases: ["pingente inox formato coracao", "pingente coracao prata"],
    file_name: "PF-010001-01-S.png",
    display_name: "Pingente Coração Prata",
  },
  {
    id: "PF-010001-03-M",
    family: "coracao",
    color: "dourada",
    sku_aliases: ["pf01000103", "pf01000103m"],
    name_aliases: ["pingente dourado formato coracao", "pingente coracao dourado"],
    file_name: "PF-010001-03-M.png",
    display_name: "Pingente Coração Dourado",
  },
  {
    id: "PF-010002-01-L",
    family: "octagonal",
    color: "prata",
    sku_aliases: ["pf01000201", "pf01000201l"],
    name_aliases: ["pingente inox octagonal", "pingente octagonal prata"],
    file_name: "PF-010002-01-L.png",
    display_name: "Pingente Octagonal Prata",
  },
  {
    id: "PF-010002-03-M",
    family: "octagonal",
    color: "dourada",
    sku_aliases: ["pf01000203", "pf01000203m"],
    name_aliases: ["pingente octagonal dourado"],
    file_name: "PF-010002-03-M.png",
    display_name: "Pingente Octagonal Dourado",
  },
  {
    id: "PF-010003-01-M",
    family: "redondo",
    color: "prata",
    sku_aliases: ["pf01000301", "pf01000301m"],
    name_aliases: ["pingente inox redondo", "pingente redondo prata"],
    file_name: "PF-010003-01-M.png",
    display_name: "Pingente Redondo Prata",
  },
  {
    id: "PF-010003-03-S",
    family: "redondo",
    color: "dourada",
    sku_aliases: ["pf01000303", "pf01000303s"],
    name_aliases: ["pingente dourado redondo", "pingente redondo dourado"],
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

  if (/(dourada|dourado|amarela|amarelo)/.test(normalized)) return "dourada";
  if (/(prata|prateada|prateado|aco|aço|silver|cinza)/.test(normalized)) return "prata";
  if (/(preta|preto|black|escura|escuro)/.test(normalized)) return "preta";
  if (/(azul|blue)/.test(normalized)) return "azul";
  if (/(rose|ros[eé]|rosa)/.test(normalized)) return "rose";

  return null;
}

function normalizeCatalogColor(value: unknown): string | null {
  const normalized = normalizeText(String(value || ""));
  if (!normalized) return null;
  if (/^(dourada|dourado|amarela|amarelo)$/.test(normalized)) return "dourada";
  if (/^(prata|prateada|prateado|silver|cinza)$/.test(normalized)) return "prata";
  if (/^(preta|preto|black|negra|negro|escura|escuro)$/.test(normalized)) return "preta";
  if (/^(azul|blue)$/.test(normalized)) return "azul";
  if (/^(rose|rosa|rose gold)$/.test(normalized)) return "rose";
  return null;
}

function detectColors(text: string): string[] {
  const normalized = normalizeText(text);
  const matches: Array<{ color: string; index: number }> = [];
  const addMatch = (color: string, pattern: RegExp) => {
    const match = normalized.match(pattern);
    if (match?.index !== undefined) matches.push({ color, index: match.index });
  };

  addMatch("dourada", /\b(dourada|dourado|amarela|amarelo)\b/);
  addMatch("prata", /\b(prata|prateada|prateado|silver|cinza)\b/);
  addMatch("preta", /\b(preta|preto|black|negra|negro|escura|escuro)\b/);
  addMatch("azul", /\b(azul|blue)\b/);
  addMatch("rose", /\b(rose|rosa|rose gold)\b/);

  const ordered = matches.sort((a, b) => a.index - b.index).map((item) => item.color);
  return Array.from(new Set(ordered));
}

function getRequestedColors(data: AnyRecord, allowedColors?: string[]): string[] {
  const rawColors = Array.isArray(data.cores_solicitadas) ? data.cores_solicitadas : [];
  const normalizedColors = [...rawColors, data.cor]
    .map(normalizeCatalogColor)
    .filter(Boolean) as string[];

  const uniqueColors = Array.from(new Set(normalizedColors));
  if (!allowedColors || allowedColors.length === 0) return uniqueColors;
  return uniqueColors.filter((color) => allowedColors.includes(color));
}

function formatColorList(colors: string[]): string {
  const labels = colors.filter(Boolean);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

function colorAliases(color: string): string[] {
  if (color === "prata") return ["prata", "prateada", "prateado", "silver", "cinza"];
  if (color === "dourada") return ["dourada", "dourado", "amarela", "amarelo"];
  if (color === "preta") return ["preta", "preto", "black", "negra", "negro", "escura", "escuro"];
  if (color === "azul") return ["azul", "blue"];
  if (color === "rose") return ["rose", "rosa"];
  return [color].filter(Boolean);
}

function applyDetectedColorsToData(data: AnyRecord, text: string, allowedColors?: string[]): boolean {
  const detected = detectColors(text).filter((color) => !allowedColors || allowedColors.includes(color));
  if (detected.length === 0) return false;

  const previousKey = getRequestedColors(data, allowedColors).join("|");
  data.cores_solicitadas = detected;
  data.cor = detected[0];

  return previousKey !== detected.join("|");
}

function detectCategory(text: string, data: AnyRecord): string | null {
  const raw = String(text || "").toLowerCase();
  const normalized = normalizeText(text);
  const searchable = `${normalized} ${raw}`;

  if (/culos|armacao|lente/.test(searchable)) {
    return "oculos";
  }

  if (/oculos|oculo|óculos|óculo|ã³culos|ã³culo|armacao|arma[cç]ao|lente|modelo de oculos|quero testar oculos|provar oculos|oculos de sol/.test(searchable)) {
    return "oculos";
  }

  const pendantContext = data.categoria === "pingente" || data.agente_atual === "kate";
  if (
    /pingente|pingentes|medalh|fotograv|foto no pingente|gravar foto/.test(searchable) ||
    (pendantContext && /cordao|corda|corrente/.test(searchable))
  ) {
    return "pingente";
  }

  if (/alian|alianc|alianç/.test(searchable)) {
    return "aliancas";
  }

  if (/anel|aneis|an[eé]is/.test(searchable)) {
    return "aneis";
  }

  return data.categoria || null;
}

function detectKeychainIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /chaveiro|chaveiros|porta chave|porta-chave/.test(normalized);
}

function detectUnsupportedAccessoryIntent(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || detectKeychainIntent(normalized)) return false;

  const mentionsUnsupportedAccessory =
    /pulseira|pulseiras|bracelete|tornozeleira|brinco|brincos|argola|argolas|escapulario|conjunto|kit|combinad|colar/.test(
      normalized,
    );

  if (!mentionsUnsupportedAccessory) return false;

  const isPendantSpecific =
    /pingente|pingentes|medalha|medalhas|fotograv|foto no pingente|gravar foto/.test(normalized);

  return !isPendantSpecific || /pulseira|pulseiras|bracelete|conjunto|kit|combinad/.test(normalized);
}

function detectThanksOnly(text: string): boolean {
  const normalized = normalizeText(text).replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const closingPattern =
    "(ok|ta ok|tudo certo|ta certo|ta bom|tudo bem|beleza|blz|show|obrigado|obrigada|muito obrigado|muito obrigada|valeu|agradeco|tenha um bom dia|tenha um otimo dia|bom dia|boa tarde|boa noite|ate mais|ate logo)";

  return (
    /^(obrigado|obrigada|valeu|agradeco)$/.test(normalized) ||
    /^(ok|ta ok|tudo certo|ta certo|ta bom|tudo bem|beleza|blz|show)( obrigado| obrigada| valeu)?$/.test(normalized) ||
    new RegExp(`^${closingPattern}(\\s+${closingPattern})*$`).test(normalized)
  );
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
  if (category === "oculos") return "oculos";

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
    /fotograv|foto gravad|foto no pingente|gravar foto|foto no medalha|foto no medalhao|placa|coracao|cora[cç]ao|redondo|hexagonal/.test(normalized);
  return explicitPendant || data.categoria === "pingente" || String(currentNode || "").startsWith("kate_");
}

function detectEyewearIntent(text: string, data: AnyRecord, currentNode: string): boolean {
  return detectCategory(text, {}) === "oculos" || data.categoria === "oculos" || String(currentNode || "").startsWith("malu_");
}

function hasWeddingAllianceContext(data: AnyRecord, currentNode: string): boolean {
  const selectedSku = normalizeSkuToken(String(data.selected_sku || ""));
  const selectedName = normalizeText(String(data.selected_name || ""));
  const triageCategory = normalizeText(String(data.triagem_categoria || ""));

  return (
    data.finalidade === "casamento" ||
    triageCategory === "aliancas_casamento" ||
    isKeilaFlowNode(currentNode) ||
    /^e0(?:6|7)12\d+/.test(selectedSku) ||
    /tungsten|alianca|casamento/.test(selectedName)
  );
}

function buildAlineFallbackGreeting(contactName: string): string {
  const firstName = String(contactName || "")
    .trim()
    .split(/\s+/)[0]
    ?.replace(/\d+/g, "")
    .trim();
  const greetingName = firstName && firstName.length > 1 ? `, ${firstName}` : "";

  return `Oi${greetingName}! Sou a Aline da ACIUM Manaus. Posso te ajudar com alianças, pingentes ou algum modelo do catálogo?`;
}

function buildAlineContinuationFallback(contactName: string, data: AnyRecord): string {
  const category = String(data?.categoria || data?.triagem_categoria || "").toLowerCase();

  if (category.includes("pingente") || data?.catalogo_kate_enviado || data?.agente_atual === "kate") {
    return "Certo, sigo com os pingentes. Voce quer ver os modelos disponiveis, tirar uma duvida ou escolher um modelo para continuar?";
  }

  if (category.includes("oculos") || data?.catalogo_malu_enviado || data?.agente_atual === "malu") {
    return "Certo, sigo com os oculos. Voce quer ver os modelos disponiveis, escolher um modelo ou mandar uma selfie para simulacao?";
  }

  if (category.includes("alianca") || category.includes("aneis") || data?.catalogo_keila_enviado || data?.agente_atual === "keila") {
    return "Certo, sigo com as aliancas. Voce quer ver os modelos, informar a cor/tamanho ou continuar com algum modelo que gostou?";
  }

  return buildAlineFallbackGreeting(contactName);
}

function isAlineIntroMessage(text: string): boolean {
  const normalized = normalizeText(text);
  return /sou a aline da acium manaus/.test(normalized) && /posso te ajudar/.test(normalized);
}

function getCustomerFirstName(contactName: string): string {
  return String(contactName || "")
    .trim()
    .split(/\s+/)[0]
    ?.replace(/\d+/g, "")
    .trim();
}

function buildAlineTransferIntro(contactName: string, targetAgent: "kate" | "keila" | "malu"): string {
  const firstName = getCustomerFirstName(contactName);
  const greetingName = firstName && firstName.length > 1 ? `, ${firstName}` : "";

  if (targetAgent === "kate") {
    return `Oi${greetingName}! Sou a Aline da ACIUM Manaus. Vi que voce quer saber sobre pingentes/fotogravacao, entao vou te direcionar para a Kate, nossa especialista nessa linha.`;
  }

  if (targetAgent === "keila") {
    return `Oi${greetingName}! Sou a Aline da ACIUM Manaus. Vi que voce quer ver aliancas, entao vou te direcionar para a Keila, nossa especialista nessa linha.`;
  }

  return `Oi${greetingName}! Sou a Aline da ACIUM Manaus. Vi que voce quer ver oculos, entao vou te direcionar para a Malu, nossa especialista nessa linha.`;
}

function normalizeConversationAgent(value: unknown): ConversationAgent | "unknown" {
  const agent = String(value || "").toLowerCase();
  if (agent === "aline" || agent === "keila" || agent === "kate" || agent === "malu" || agent === "human") {
    return agent;
  }
  return "unknown";
}

function agentForCategory(category: string | null): ConversationAgent | "unknown" {
  if (category === "oculos") return "malu";
  if (category === "pingente") return "kate";
  if (category === "aliancas" || category === "aneis") return "keila";
  return "unknown";
}

function detectHumanIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /atendente|humano|vendedor|vendedora|pessoa|falar com alguem|chama alguem|me liga|reclam|problema|suporte/.test(
    normalized,
  );
}

function detectHarassmentIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /pelad|nude|manda (uma )?foto sua pelad|quero ver voce pelad|quero te ver pelad|gostosa|delicia|sexo|sexual|buceta|priqueta|piroca|pau|rola|safad|tesao|tesão|assedi/.test(
    normalized,
  );
}

function detectPaymentIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /pix|cartao|cart[aã]o|credito|cr[eé]dito|debito|d[eé]bito|crediario|bemol|pagar|pagamento|parcel/.test(
    normalized,
  );
}

function detectCardInstallmentQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return /(quantas|qts|vezes|parcela|parcelas|parcelar|divide|dividir|sem juros).*(cartao|cartao de credito|credito|sem juros)|cartao.*(quantas|vezes|parcela|parcelas|sem juros)/.test(
    normalized,
  );
}
function detectDeliveryIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /entrega|delivery|retirar|retirada|buscar|loja|endereco|endere[cç]o|frete|moto|motoboy/.test(normalized);
}

function detectDeliveryDeadlineQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return /quantos dias|prazo|quando fica pronto|ficar pronto|fica pronto|tempo para entregar|tempo pra entregar|dias pra entregar|dias para entregar|demora|entregar|entrega/.test(normalized);
}

function detectCatalogIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /catalogo|cat[aá]logo|modelos|opcoes|op[cç][oõ]es|mostra|mostrar|ver mais|quero mais|tem mais|disponivel|disponiveis/.test(
    normalized,
  );
}

function detectFullCatalogRequest(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  return /catalogo.*(todas|todos|todo|completo|geral|pecas|pe[cç]as|modelos)|(?:todas|todos|todo).*(pecas|pe[cç]as|modelos|catalogo)|(?:manda|mande|mostrar|mostra|ver).*(tudo|todos|todas|catalogo completo)|catalogo de todas as pecas|catalogo completo/.test(
    normalized,
  );
}

function detectBareProductCatalogRequest(text: string, category: string | null): boolean {
  const normalized = normalizeText(text).replace(/\s+/g, " ").trim();
  if (!normalized || !category) return false;

  if (category === "pingente") {
    return /^(pingente|pingentes|medalha|medalhas|fotogravacao|fotogravado|fotogravados)$/.test(normalized);
  }

  if (category === "oculos") {
    return /^(oculos|oculo|armacao|armacoes|lente|lentes)$/.test(normalized);
  }

  if (category === "aliancas" || category === "aneis") {
    return /^(alianca|aliancas|anel|aneis|aneis de namoro|alianca de namoro|aliancas de namoro|alianca de casamento|aliancas de casamento)$/.test(
      normalized,
    );
  }

  return false;
}

function detectPriceIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /valor|preco|pre[cç]o|quanto|orcamento|or[cç]amento|ate quanto|faixa/.test(normalized);
}

function detectChoiceIntent(text: string, buttonResponseId?: string | null, catalogSelectionHint?: string | null): boolean {
  const combined = normalizeText(`${text || ""} ${buttonResponseId || ""} ${catalogSelectionHint || ""}`);
  return /quero este|quero esse|escolher|escolhi|ficar com esse|gostei desse|esse modelo|este modelo|vou querer|quero comprar|pode ser esse|esse mesmo|este mesmo/.test(combined);
}

function detectPreviewIntent(text: string, mediaType?: string | null): boolean {
  const normalized = normalizeText(text);
  return (
    mediaType === "image" ||
    /previa|pr[eé]via|selfie|foto|testar|provar|simular|gerar imagem|como fica|fotograv/.test(normalized)
  );
}

function detectBudgetValue(text: string): number | null {
  const normalized = normalizeText(text).replace(/\./g, "").replace(",", ".");
  const match = normalized.match(/(?:r\$|ate|at[eé]|maximo|max|orcamento|or[cç]amento)?\s*(\d{2,6}(?:\.\d{1,2})?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildRuleBasedIntelligence(args: {
  text: string;
  data: AnyRecord;
  activeAgent: ConversationAgent;
  currentNode: string;
  mediaType?: string | null;
  buttonResponseId?: string | null;
  catalogSelectionHint?: string | null;
}): ConversationIntelligence {
  const { text, data, activeAgent, currentNode, mediaType, buttonResponseId, catalogSelectionHint } = args;
  const explicitCategory = detectCategory(text, {});
  const categoryAgent = agentForCategory(explicitCategory);
  const normalized = normalizeText(text);
  const mentionedCategories = [
    detectCategory(text, {}) === "oculos" ? "oculos" : null,
    /pingente|pingentes|medalh|fotograv|gravar foto/.test(normalized)
      ? "pingente"
      : null,
    /alianc|anel|aneis|an[eé]is/.test(normalized) ? "aliancas" : null,
  ].filter(Boolean);
  const uniqueMentionedCategories = [...new Set(mentionedCategories)];
  const hasPendantContext = data.categoria === "pingente" || String(currentNode || "").startsWith("kate_") || /fotograv|pingente|medalh/.test(normalizeText(String(data.last_interest || data.customer_stage || "")));
  const isRomanticGiftContext = /namorad|dia dos namorad|presente.*namorad/.test(normalized);
  const mentionsAllianceProduct = /alianc|anel|aneis|an[eé]is/.test(normalized);
  const extracted: AnyRecord = {};
  if (hasPendantContext && isRomanticGiftContext && !mentionsAllianceProduct) {
    return {
      intent: "produto_pingentes",
      targetAgent: "kate",
      confidence: 0.94,
      shouldSwitchAgent: activeAgent !== "kate",
      customerStage: "fotogravacao_presente_namorado",
      extracted: { ...extracted, categoria: "pingente", ocasiao: "namorados" },
      source: "rules",
      needsClarification: false,
    };
  }
  if (detectKeychainIntent(text)) {
    return {
      intent: "atendimento_humano",
      targetAgent: "human",
      confidence: 0.96,
      shouldSwitchAgent: activeAgent !== "human",
      customerStage: "produto_chaveiro_humano",
      extracted: { ...extracted, categoria: "chaveiro" },
      source: "rules",
      needsClarification: false,
    };
  }
  if (detectUnsupportedAccessoryIntent(text)) {
    return {
      intent: "atendimento_humano",
      targetAgent: "human",
      confidence: 0.9,
      shouldSwitchAgent: activeAgent !== "human",
      customerStage: "produto_acessorio_humano",
      extracted: { ...extracted, categoria: "acessorio" },
      source: "rules",
      needsClarification: false,
    };
  }
  const budget = detectBudgetValue(text);
  if (budget) extracted.orcamento_valor = budget;
  const colors = detectColors(text);
  if (colors.length > 0) {
    extracted.cores_solicitadas = colors;
    extracted.cor = colors[0];
  } else {
    const color = detectColor(text);
    if (color) extracted.cor = color;
  }

  if (mediaType === "image") {
    return {
      intent: "foto_cliente",
      targetAgent: activeAgent === "kate" || activeAgent === "malu" ? activeAgent : "unknown",
      confidence: activeAgent === "kate" || activeAgent === "malu" ? 0.92 : 0.62,
      shouldSwitchAgent: false,
      customerStage: "enviou_foto",
      extracted: { ...extracted, tem_foto_cliente: true },
      source: "rules",
      needsClarification: activeAgent !== "kate" && activeAgent !== "malu",
      clarificationQuestion:
        activeAgent !== "kate" && activeAgent !== "malu"
          ? "Essa foto e para uma previa de pingente ou de oculos?"
          : null,
    };
  }

  if (uniqueMentionedCategories.length > 1 && !buttonResponseId) {
    return {
      intent: "indefinido",
      targetAgent: "unknown",
      confidence: 0.52,
      shouldSwitchAgent: false,
      customerStage: "intencao_ambigua",
      extracted,
      source: "rules",
      needsClarification: true,
      clarificationQuestion: "Voce quer ver aliancas, pingentes ou oculos agora?",
    };
  }

  if (categoryAgent !== "unknown") {
    const intent: ConversationIntent =
      explicitCategory === "oculos"
        ? "produto_oculos"
        : explicitCategory === "pingente"
          ? "produto_pingentes"
          : "produto_aliancas";
    return {
      intent,
      targetAgent: categoryAgent,
      confidence: 0.96,
      shouldSwitchAgent: activeAgent !== categoryAgent,
      customerStage: "produto_identificado",
      extracted: { ...extracted, categoria: explicitCategory },
      source: "rules",
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  if (detectHumanIntent(text)) {
    return {
      intent: "atendimento_humano",
      targetAgent: "human",
      confidence: 0.9,
      shouldSwitchAgent: activeAgent !== "human",
      customerStage: "handoff_humano",
      extracted,
      source: "rules",
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  const contextualAgent =
    activeAgent !== "aline" && activeAgent !== "human"
      ? activeAgent
      : agentForCategory(data.categoria || null);
  const buttonOrChoice = detectChoiceIntent(text, buttonResponseId, catalogSelectionHint);
  const preview = detectPreviewIntent(text, mediaType);
  const payment = detectPaymentIntent(text);
  const delivery = detectDeliveryIntent(text);
  const catalog = detectCatalogIntent(text);
  const price = detectPriceIntent(text);
  const pendantMaterialQuestion = detectPendantMaterialQuestion(text);
  const targetAgent = contextualAgent !== "unknown" ? contextualAgent : activeAgent;

  if (buttonOrChoice || preview || payment || delivery || catalog || price || pendantMaterialQuestion) {
    return {
      intent: buttonOrChoice
        ? "escolha_produto"
        : preview
          ? "previa"
          : payment
            ? "pagamento"
            : delivery
              ? "entrega"
              : catalog
                ? "catalogo"
                : price
                  ? "preco"
                  : "duvida_geral",
      targetAgent,
      confidence: targetAgent !== "aline" ? 0.84 : 0.68,
      shouldSwitchAgent: false,
      customerStage: buttonOrChoice
        ? "escolheu_produto"
        : preview
          ? "quer_previa"
          : payment
            ? "negociando_pagamento"
            : delivery
              ? "negociando_entrega"
              : catalog
                ? "vendo_catalogo"
                : price
                  ? "consultando_preco"
                  : "duvida_produto",
      extracted: {
        ...extracted,
        quer_previa: preview || undefined,
      },
      source: "rules",
      needsClarification: false,
      clarificationQuestion: null,
    };
  }

  return {
    intent: "duvida_geral",
    targetAgent: targetAgent || "unknown",
    confidence: activeAgent !== "aline" ? 0.7 : 0.55,
    shouldSwitchAgent: false,
    customerStage: "duvida_geral",
    extracted,
    source: "rules",
    needsClarification: false,
    clarificationQuestion: null,
  };
}

function parseOpenAIJson(content: string): AnyRecord | null {
  try {
    const cleaned = String(content || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned);
  } catch (_error) {
    return null;
  }
}

async function classifyConversationWithOpenAI(args: {
  text: string;
  data: AnyRecord;
  activeAgent: ConversationAgent;
  currentNode: string;
  ruleResult: ConversationIntelligence;
  recentCrmContext?: string | null;
  imageUnderstanding?: ImageUnderstanding | null;
}): Promise<ConversationIntelligence | null> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIApiKey || !args.text.trim()) return null;

  try {
    const model = Deno.env.get("OPENAI_INTELLIGENCE_MODEL") || "gpt-4o-mini";
    const state = {
      activeAgent: args.activeAgent,
      currentNode: args.currentNode,
      categoria: args.data.categoria || null,
      selected_name: args.data.selected_name || null,
      selected_sku: args.data.selected_sku || null,
      last_intent: args.data.last_intent || null,
      customer_stage: args.data.customer_stage || null,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 280,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Voce classifica intencao de cliente de WhatsApp para CRM ACIUM. Responda somente JSON valido. Agentes: aline triagem, keila aliancas/aneis, kate pingentes/fotogravacao, malu oculos, human atendimento humano. Intencoes permitidas: produto_aliancas, produto_pingentes, produto_oculos, atendimento_humano, pagamento, entrega, catalogo, preco, previa, foto_cliente, escolha_produto, duvida_geral, indefinido. Seja conservador: se o produto citado for claro, escolha o agente desse produto mesmo que o contexto anterior seja outro. Se ambiguo entre produtos, needsClarification=true.",
          },
          {
            role: "user",
            content: JSON.stringify({
              mensagem: args.text,
              estado_atual: state,
              regra_previa: args.ruleResult,
              contexto_recente_crm: args.recentCrmContext || null,
              entendimento_imagem: args.imageUnderstanding || null,
              formato_resposta: {
                intent: "uma intencao permitida",
                targetAgent: "aline|keila|kate|malu|human|unknown",
                confidence: "0 a 1",
                customerStage: "curto_em_snake_case",
                extracted: "objeto com sinais uteis",
                needsClarification: "boolean",
                clarificationQuestion: "pergunta curta ou null",
              },
            }),
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const json = await response.json();
    const parsed = parseOpenAIJson(json?.choices?.[0]?.message?.content || "");
    if (!parsed) return null;

    const targetAgent = normalizeConversationAgent(parsed.targetAgent);
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    const intent = String(parsed.intent || "indefinido") as ConversationIntent;
    const allowedIntents: ConversationIntent[] = [
      "produto_aliancas",
      "produto_pingentes",
      "produto_oculos",
      "atendimento_humano",
      "pagamento",
      "entrega",
      "catalogo",
      "preco",
      "previa",
      "foto_cliente",
      "escolha_produto",
      "duvida_geral",
      "indefinido",
    ];
    if (!allowedIntents.includes(intent) || confidence < 0.6) return null;

    return {
      intent,
      targetAgent,
      confidence,
      shouldSwitchAgent: targetAgent !== "unknown" && targetAgent !== args.activeAgent,
      customerStage: String(parsed.customerStage || args.ruleResult.customerStage || "classificado_ia"),
      extracted: parsed.extracted && typeof parsed.extracted === "object" ? parsed.extracted : {},
      source: "openai",
      needsClarification: Boolean(parsed.needsClarification),
      clarificationQuestion: parsed.clarificationQuestion || null,
    };
  } catch (_error) {
    return null;
  }
}

async function buildConversationIntelligence(args: {
  text: string;
  data: AnyRecord;
  activeAgent: ConversationAgent;
  currentNode: string;
  mediaType?: string | null;
  buttonResponseId?: string | null;
  catalogSelectionHint?: string | null;
  recentCrmContext?: string | null;
  imageUnderstanding?: ImageUnderstanding | null;
}): Promise<ConversationIntelligence> {
  const ruleResult = buildRuleBasedIntelligence(args);

  if (ruleResult.needsClarification) {
    return ruleResult;
  }

  if (ruleResult.confidence >= 0.78 && !ruleResult.needsClarification) {
    return ruleResult;
  }

  const aiResult = await classifyConversationWithOpenAI({
    text: args.text,
    data: args.data,
    activeAgent: args.activeAgent,
    currentNode: args.currentNode,
    ruleResult,
    recentCrmContext: args.recentCrmContext,
    imageUnderstanding: args.imageUnderstanding,
  });

  if (!aiResult) return ruleResult;

  const ruleProductAgent =
    ruleResult.targetAgent === "keila" || ruleResult.targetAgent === "kate" || ruleResult.targetAgent === "malu";
  if (ruleProductAgent && ruleResult.confidence >= 0.78 && aiResult.confidence < 0.9) {
    return ruleResult;
  }

  return {
    ...ruleResult,
    ...aiResult,
    extracted: { ...ruleResult.extracted, ...aiResult.extracted },
    source: "hybrid",
  };
}

function applyIntelligenceToData(data: AnyRecord, intelligence: ConversationIntelligence) {
  data.conversation_intelligence = intelligence;
  data.last_intent = intelligence.intent;
  data.customer_stage = intelligence.customerStage;
  data.intent_confidence = intelligence.confidence;
  data.intent_source = intelligence.source;
  data.needs_clarification = intelligence.needsClarification;
  data.intended_agent = intelligence.targetAgent;

  const extracted = intelligence.extracted || {};
  for (const [key, value] of Object.entries(extracted)) {
    if (value !== undefined && value !== null && value !== "" && data[key] === undefined) {
      data[key] = value;
    }
  }

  if (extracted.categoria) data.categoria = extracted.categoria;
  if (Array.isArray(extracted.cores_solicitadas) && extracted.cores_solicitadas.length > 0) {
    data.cores_solicitadas = extracted.cores_solicitadas;
    data.cor = extracted.cor || extracted.cores_solicitadas[0] || data.cor;
  } else if (extracted.cor) {
    data.cor = extracted.cor;
  }
  if (intelligence.targetAgent !== "unknown") data.agente_atual = intelligence.targetAgent;
}

function shouldRouteToKate(
  activeAgent: ConversationAgent,
  text: string,
  data: AnyRecord,
  currentNode: string,
  kateMemory?: AnyRecord | null,
  keilaMemory?: AnyRecord | null,
): boolean {
  const normalized = normalizeText(text);
  const isPendantColorAnswer = /^(dourada|dourado|prata|prateada|prateado)$/.test(normalized);
  const kateSeenAt = kateMemory?.last_seen_at ? new Date(kateMemory.last_seen_at).getTime() : 0;
  const keilaSeenAt = keilaMemory?.last_seen_at ? new Date(keilaMemory.last_seen_at).getTime() : 0;
  const kateWasRecent =
    Number.isFinite(kateSeenAt) &&
    kateSeenAt > 0 &&
    Date.now() - kateSeenAt <= 30 * 60 * 1000 &&
    kateSeenAt >= keilaSeenAt;
  const kateHadPendantContext =
    kateMemory?.last_interest === "pingente" ||
    kateMemory?.preferences?.categoria === "pingente" ||
    /pingente|fotograv/.test(normalizeText(String(kateMemory?.summary || "")));

  return (
    activeAgent === "kate" ||
    data.agente_atual === "kate" ||
    isKateFlowNode(currentNode) ||
    (isPendantColorAnswer && kateWasRecent && kateHadPendantContext) ||
    detectPendantIntent(text, data, currentNode)
  );
}

function shouldRouteToKeila(
  activeAgent: ConversationAgent,
  text: string,
  data: AnyRecord,
  currentNode: string,
): boolean {
  return (
    activeAgent === "keila" ||
    data.agente_atual === "keila" ||
    hasWeddingAllianceContext(data, currentNode) ||
    detectMarriageIntent(text, data, currentNode)
  );
}

function shouldRouteToMalu(
  activeAgent: ConversationAgent,
  text: string,
  data: AnyRecord,
  currentNode: string,
): boolean {
  return (
    activeAgent === "malu" ||
    data.agente_atual === "malu" ||
    isMaluFlowNode(currentNode) ||
    detectEyewearIntent(text, data, currentNode)
  );
}

function detectPreviewApprovalIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /aprov|gostei|pode fazer|pode seguir|quero assim|quero esse|quero este|vou ficar|fico com|esse mesmo|isso mesmo|isso msm|perfeito|pode ser|ficou bom|fechar|finalizar|comprar|sim pode|\bsim\b|\bok\b|\bblz\b|beleza|ta bom|t[aá] bom|t[aá] lindo/.test(normalized);
}

function detectPreviewRedoIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /outra foto|trocar foto|manda outra|vou mandar outra|refaz|refazer|mudar foto|nova com foto|nova foto|gerar nova|gera uma nova/.test(normalized);
}

function detectPendantModelQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return /vem so o pingente|vem so pingente|somente pingente|somente o pingente|corrente inclusa|vem corrente|acompanha corrente|vem com corrente|vem com cord|teria cord|tem cord|cord.*inclus|cord|corrente|so a medalh|apenas a medalh|medalh|so o pingente|apenas o pingente/.test(
    normalized,
  );
}

function detectPendantMaterialQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return /material|e ouro|eh ouro|ouro|banhado|folheado|aco|aço|inox|grama|gramas|peso|pesa|pesado|leve/.test(
    normalized,
  );
}

function detectPriceQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return /qual valor|valor|pre[cç]o|preco|quanto custa|quanto sai|quanto fica|custa quanto|qto|quanto e|quanto é/.test(
    normalized,
  );
}

function detectStoreAddressQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return /endere[cç]o|onde fica|localiza[cç]ao|localizacao|qual a loja|nome da loja|nome.*loja|loja fica|shopping|retirar na loja|buscar na loja/.test(
    normalized,
  );
}

function detectStoreNameQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return /nome da loja|nome.*loja|qual.*loja|como chama.*loja/.test(normalized);
}

function detectFinishPhotosQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return /foto|fotos|imagem|imagens|acabamento|acabamentos|ver dourad|ver prata|mostrar dourad|mostrar prata/.test(
    normalized,
  );
}

function detectComplaintOrFrustration(text: string): boolean {
  const normalized = normalizeText(text);
  return /merda|ruim|horr[ií]vel|p[eé]ssim|chatead|puta|puto|raiva|irritad|reclama|nao gostei|não gostei|cancelar|desistir|demora demais|ninguem responde|ninguém responde|so sabe|só sabe|sempre a mesma|mesma resposta|nao responde|não responde/.test(
    normalized,
  );
}

function detectGenericDoubt(text: string): boolean {
  const normalized = normalizeText(text);
  return /\bduvida\b|d[uú]vida|estou com essa|tenho uma pergunta|pergunta/.test(normalized);
}

function detectOnlyLaughter(text: string): boolean {
  const normalized = normalizeText(text).replace(/[^a-z]/g, "");
  return /^(rs|rss|kk|kkk|kkkk|haha|hahaha|hehe|hehehe)$/.test(normalized);
}

function detectPayNowTodayQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return /(pagando agora|pagar agora|se eu pagar|fechando agora|fechar agora).*(hoje|hj|mesmo dia|finaliza|fica pronto|entrega)|(?:hoje|hj).*(pagando agora|pagar agora|fechando agora|fechar agora|finaliza)/.test(
    normalized,
  );
}

function detectUnresolvedCommercialQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  return /\?|qual|como|quando|onde|prazo|entrega|retirada|delivery|endereço|endereco|cordão|cordao|corrente|medalha|vem com|acompanha|somente|só|so|grama|gramas|peso|material|aço|aco|inox|garantia|finaliza|fecha|fechar|pedido|pagamento|pix|cartão|cartao|crediario|crediário|bemol|so sabe|só sabe|dúvida|duvida/.test(
    normalized,
  );
}
function detectInboundImageUrl(text: string): string | null {
  const trimmed = String(text || "").trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (/\.(jpg|jpeg|png|webp)(?:$|[?#])/.test(lower) || /temp-file-download\/.*(?:=\.jpg|=\.jpeg|=\.png|=\.webp)/.test(lower)) {
    return trimmed;
  }
  return null;
}

function summarizeRecentCrmMessages(messages: Array<{ direction: string; content: string; message_type: string | null }>): string {
  return messages
    .filter((item) => item.content || item.message_type)
    .slice(-10)
    .map((item) => {
      const speaker = item.direction === "out" ? "vendedor/agente" : "cliente";
      const content = item.content || `[${item.message_type || "midia"}]`;
      return `${speaker}: ${content}`.slice(0, 220);
    })
    .join("\n");
}

async function loadRecentCrmMessageContext(supabase: any, phone: string): Promise<string | null> {
  const phoneVariants = buildPhoneVariants(phone);
  const { data: crmConversation } = await supabase
    .from("conversations")
    .select("id")
    .in("contact_number", phoneVariants)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!crmConversation?.id) return null;

  const { data: rows } = await supabase
    .from("messages")
    .select("content, is_from_me, message_type, created_at")
    .eq("conversation_id", crmConversation.id)
    .order("created_at", { ascending: false })
    .limit(14);

  if (!rows?.length) return null;

  const ordered = [...rows].reverse().map((row: any) => ({
    direction: row.is_from_me ? "out" : "in",
    content: String(row.content || "").trim(),
    message_type: row.message_type || null,
  }));

  return summarizeRecentCrmMessages(ordered);
}

async function analyzeInboundImageWithOpenAI(args: {
  imageUrl: string;
  text: string;
  data: AnyRecord;
  activeAgent: ConversationAgent;
}): Promise<ImageUnderstanding | null> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIApiKey || !args.imageUrl) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_VISION_MODEL") || "gpt-4o-mini",
        temperature: 0,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Classifique a imagem recebida no WhatsApp da ACIUM. Responda somente JSON valido. kind: customer_photo quando for selfie/foto de pessoa para simulacao ou fotogravacao; product_reference quando for foto de produto/modelo; payment_document quando for comprovante/documento; inappropriate quando houver assedio/nudez; unclear quando nao der para saber. product_category: pingente, oculos, aliancas, aneis, chaveiro ou null. Seja conservador: nao chame produto de foto de cliente.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  legenda_ou_texto: args.text || null,
                  agente_atual: args.activeAgent,
                  categoria_atual: args.data.categoria || null,
                  produto_escolhido: args.data.selected_name || null,
                  formato: {
                    kind: "customer_photo|product_reference|payment_document|inappropriate|unclear",
                    product_category: "pingente|oculos|aliancas|aneis|chaveiro|null",
                    confidence: "0 a 1",
                    reason: "curto",
                  },
                }),
              },
              { type: "image_url", image_url: { url: args.imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const payload = await response.json();
    const parsed = parseOpenAIJson(payload?.choices?.[0]?.message?.content || "");
    if (!parsed) return null;

    const allowedKinds = ["customer_photo", "product_reference", "payment_document", "inappropriate", "unclear"];
    const kind = allowedKinds.includes(String(parsed.kind)) ? String(parsed.kind) : "unclear";
    const allowedCategories = ["pingente", "oculos", "aliancas", "aneis", "chaveiro"];
    const productCategory = allowedCategories.includes(String(parsed.product_category))
      ? String(parsed.product_category)
      : null;

    return {
      kind: kind as ImageUnderstanding["kind"],
      product_category: productCategory as ImageUnderstanding["product_category"],
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reason: parsed.reason ? String(parsed.reason).slice(0, 160) : null,
    };
  } catch (error) {
    console.error("[ALINE-REPLY] Falha ao analisar imagem recebida:", error);
    return null;
  }
}

function shouldUseInboundImageAsCustomerPhoto(args: {
  mediaType: string | null;
  imageUnderstanding?: ImageUnderstanding | null;
  data: AnyRecord;
  activeAgent: ConversationAgent;
  currentNode: string;
}) {
  if (args.mediaType !== "image") return false;
  const kind = args.imageUnderstanding?.kind || null;
  if (kind === "customer_photo") return true;
  if (kind === "product_reference" || kind === "payment_document" || kind === "inappropriate") return false;

  const selectedProduct = !!(args.data.selected_sku || args.data.selected_product?.id);
  const previewContext =
    args.activeAgent === "kate" ||
    args.activeAgent === "malu" ||
    String(args.currentNode || "").includes("foto") ||
    String(args.currentNode || "").includes("preview");

  if (args.activeAgent === "malu" && previewContext) return true;

  return selectedProduct && previewContext;
}

function isSimpleColorChoice(text: string): boolean {
  const normalized = normalizeText(text).replace(/[^a-z]/g, "");
  return normalized === "prata" || normalized === "dourada" || normalized === "dourado";
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
    normalizeProductText(product),
  );

  if (detected === "prata" || detected === "dourada") return detected;
  return null;
}

function normalizeProductText(product: Partial<CatalogProduct> | AnyRecord): string {
  const tagsText = Array.isArray(product.tags)
    ? product.tags.map((tag: unknown) => String(tag || "")).join(" ")
    : String(product.tags || "");
  const metadataText = product.metadata && typeof product.metadata === "object"
    ? JSON.stringify(product.metadata)
    : String(product.metadata || "");
  const aiTagsText = Array.isArray(product.ai_tags)
    ? product.ai_tags.map((tag: unknown) => String(tag || "")).join(" ")
    : String(product.ai_tags || "");
  const aliasesText = Array.isArray(product.search_aliases)
    ? product.search_aliases.map((alias: unknown) => String(alias || "")).join(" ")
    : String(product.search_aliases || "");

  return normalizeText([
    product.name,
    product.title,
    product.sku,
    product.category,
    product.color,
    product.description,
    product.agent_line,
    product.ai_description,
    aiTagsText,
    aliasesText,
    product.commercial_notes,
    product.included_items,
    product.restrictions,
    product.recommended_when,
    product.avoid_when,
    tagsText,
    metadataText,
  ].filter(Boolean).join(" "));
}

function isPingenteFotogravavel(product: Partial<CatalogProduct> | AnyRecord): boolean {
  const text = normalizeProductText(product);
  const isPendant = /pingente|medalha|medalhao|fotograv|foto grav|placa/.test(text);
  const isOtherProduct = /chaveiro|oculos|oculo|armacao|alianca|aliancas|anel|aneis/.test(text);

  return isPendant && !isOtherProduct;
}

function detectPingenteColor(product: Partial<CatalogProduct> | AnyRecord): "prata" | "dourada" | null {
  const detected = detectColor(normalizeProductText(product));
  if (detected === "prata" || detected === "dourada") return detected;
  return null;
}

function detectPingenteStyle(product: Partial<CatalogProduct> | AnyRecord): "cravejado" | "liso" | null {
  const text = normalizeProductText(product);
  if (/cravejad|cravad|zircon|zirconia|pedrinh|pedra|pedras|strass/.test(text)) return "cravejado";
  if (/liso|chapado|sem pedra|sem pedras/.test(text)) return "liso";
  return null;
}

function detectPingenteShape(product: Partial<CatalogProduct> | AnyRecord): "redondo" | "coracao" | "octagonal" | null {
  const text = normalizeProductText(product);
  if (/coracao|heart/.test(text)) return "coracao";
  if (/octagonal|octogonal|octag/.test(text)) return "octagonal";
  if (/redondo|redonda|circular|circulo/.test(text)) return "redondo";
  return null;
}

function detectRequestedPingenteStyle(text: string): "cravejado" | null {
  const normalized = normalizeText(text);
  if (/cravejad|cravad|com pedra|com pedrinh|pedrinh|zircon|zirconia|strass/.test(normalized)) {
    return "cravejado";
  }
  return null;
}

function buildKateCatalogSelection(
  products: CatalogProduct[],
  options: {
    colorFilters?: string[];
    styleFilter?: "cravejado" | null;
    excludeSkus?: string[];
    limit?: number;
    requestType?: string;
  } = {},
): CatalogProduct[] {
  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0 ? Number(options.limit) : 8;
  const colorFilters = (options.colorFilters || []).filter((color) => color === "prata" || color === "dourada");
  const excluded = new Set((options.excludeSkus || []).map((item) => normalizeText(String(item || ""))).filter(Boolean));
  const seen = new Set<string>();

  const candidates = products.filter((product) => {
    const key = normalizeText(String(product.sku || product.id || ""));
    if (!key || seen.has(key) || excluded.has(key)) return false;
    seen.add(key);
    if (!isPingenteFotogravavel(product)) return false;
    if (!product.image_url && !product.video_url) return false;
    if (!product.price || Number(product.price) <= 0) return false;

    const color = detectPingenteColor(product);
    if (colorFilters.length > 0 && (!color || !colorFilters.includes(color))) return false;

    if (options.styleFilter === "cravejado" && detectPingenteStyle(product) !== "cravejado") return false;

    return true;
  });

  const selected: CatalogProduct[] = [];
  const selectedKeys = new Set<string>();
  const addProduct = (product?: CatalogProduct | null) => {
    if (!product || selected.length >= limit) return;
    const key = normalizeText(String(product.sku || product.id || ""));
    if (!key || selectedKeys.has(key)) return;
    selectedKeys.add(key);
    selected.push(product);
  };

  const byStyle = (style: "cravejado" | "liso" | null) =>
    candidates.filter((product) => {
      const detected = detectPingenteStyle(product);
      return style === null ? detected === null : detected === style;
    });
  const byColor = (color: "prata" | "dourada") =>
    candidates.filter((product) => detectPingenteColor(product) === color);

  const cravejados = byStyle("cravejado");
  const lisosOuSemEstilo = [...byStyle("liso"), ...byStyle(null)];

  if (options.styleFilter === "cravejado") {
    cravejados.forEach(addProduct);
  } else {
    cravejados.slice(0, 2).forEach(addProduct);
    addProduct(lisosOuSemEstilo.find((product) => detectPingenteColor(product) === "prata"));
    addProduct(lisosOuSemEstilo.find((product) => detectPingenteColor(product) === "dourada"));

    const usedShapes = new Set(selected.map((product) => detectPingenteShape(product)).filter(Boolean));
    for (const product of candidates) {
      const shape = detectPingenteShape(product);
      if (shape && !usedShapes.has(shape)) {
        addProduct(product);
        usedShapes.add(shape);
      }
      if (selected.length >= limit) break;
    }

    if (colorFilters.length > 0) {
      colorFilters.forEach((color) => byColor(color as "prata" | "dourada").forEach(addProduct));
    }

    candidates.forEach(addProduct);
  }

  const selectedIds = new Set(selected.map((product) => normalizeText(String(product.sku || product.id || ""))));
  const excludedIds = products
    .map((product) => normalizeText(String(product.sku || product.id || "")))
    .filter((id) => id && !selectedIds.has(id));

  console.log("[ALINE-REPLY] kate_catalog_selection", {
    kate_catalog_request_type: options.requestType || "auto",
    filters_detected: {
      colors: colorFilters,
      style: options.styleFilter || null,
      excluded_count: excluded.size,
    },
    total_pingentes_found: candidates.length,
    total_cravejados_found: cravejados.length,
    total_lisos_found: lisosOuSemEstilo.length,
    total_prata_found: candidates.filter((product) => detectPingenteColor(product) === "prata").length,
    total_dourado_found: candidates.filter((product) => detectPingenteColor(product) === "dourada").length,
    total_products_selected: selected.length,
    selected_product_names: selected.map((product) => product.name).slice(0, 12),
    selected_product_ids: selected.map((product) => product.sku || product.id).slice(0, 12),
    excluded_product_ids: excludedIds.slice(0, 20),
    exclusion_reason: "fora_do_lote_ou_filtro_seguro",
    catalog_batch_index: excluded.size > 0 ? "more" : "initial",
  });

  return selected;
}

function matchKateTemplateForProduct(product: Partial<CatalogProduct> | AnyRecord): KatePendantTemplate | null {
  const sku = normalizeSkuToken(String(product.sku || ""));
  const name = normalizeText(String(product.name || ""));
  const family = inferPendantFamilyFromText(
    `${product.name || ""} ${product.description || ""} ${product.category || ""}`,
  );
  const color = inferKatePendantColor(product);

  return (
    KATE_ENGRAVING_TEMPLATES.find((template) => {
      const skuMatches = sku
        ? template.sku_aliases.some((alias) => {
            const normalizedAlias = normalizeSkuToken(alias);
            return sku === normalizedAlias || sku.startsWith(normalizedAlias) || normalizedAlias.startsWith(sku);
          })
        : false;
      const nameMatches = template.name_aliases.some((alias) => name.includes(normalizeText(alias)));
      const familyMatches = family === template.family;
      const colorMatches = color === template.color;
      return colorMatches && (skuMatches || (nameMatches && familyMatches));
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
  const asksToSend = /(envia|enviar|reenviar|reenvia|mande|manda|manda ai|manda de novo|mande de novo|envia de novo|me manda de novo|mostra|mostrar|mostra de novo|quero ver|quero rever|me manda|me mande|me envia|sim.*modelos|pode.*modelos)/.test(normalized);
  const mentionsCatalog = /(modelo|modelos|opcao|opcoes|catalogo|alianca|aliancas|pingente|pingentes|oculos|armacao)/.test(normalized);
  const asksAgain = /(de novo|novamente|outra vez|reenviar|reenvia|reenviar os cards|cards de novo|manda os cards|mande os cards)/.test(normalized);
  const mentionsCards = /(card|cards|foto|fotos|imagem|imagens)/.test(normalized);
  return (asksToSend && mentionsCatalog) || (asksAgain && (mentionsCatalog || mentionsCards));
}

function detectMoreOptionsIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /more_options|ver_mais|quero mais|tem outros|tem outras|mais opcoes|mais modelos|outros modelos|outras opcoes|outras opções|ver mais/.test(
    normalized,
  );
}

function detectKeilaCatalogNowIntent(text: string): boolean {
  const normalized = normalizeText(text).replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  return (
    /^(manda|mande|pode mandar|pode enviar|me manda|me mande|envia|envie)$/.test(normalized) ||
    /(quero|queria|gostaria).*(ver|olhar|receber).*(modelo|modelos|opcao|opcoes|opções|valor|valores)/.test(normalized) ||
    /(manda|mande|envia|envie|mostra|mostrar|me manda|me mande).*(modelo|modelos|opcao|opcoes|opções|valor|valores|catalogo|catálogo)/.test(normalized) ||
    /(modelo|modelos|opcao|opcoes|opções).*(valor|valores)/.test(normalized) ||
    /(nao sei|não sei|nem vi|ainda nao vi|ainda não vi).*(modelo|modelos|produto|produtos)/.test(normalized) ||
    /^(quero ver modelos|ver modelos|modelos|opcoes|opções|opcoes e valores|opções e valores)$/.test(normalized)
  );
}

function detectMaluCatalogRequest(text: string, buttonResponseId?: string | null, catalogSelectionHint?: string | null): boolean {
  const normalized = normalizeText([buttonResponseId, catalogSelectionHint, text].filter(Boolean).join(" "));
  if (!normalized) return false;
  if (/culos|armacao|modelo de oculos|modelos de oculos/.test(normalized)) return true;

  return (
    /^(sim|s|ok|pode|claro|manda|mande|quero|quero sim|ver|modelos|ver modelos|oculos|oculo|óculos|óculo|me manda|me mande|mostrar|mostra)$/.test(
      normalized,
    ) ||
    /ver modelos|mostrar modelos|mostra modelos|mande os modelos|manda os modelos|me mande os modelos|me manda os modelos|quero ver os modelos|quero ver oculos|quero ver óculos|quero oculos|quero óculos|modelos de oculos|modelos de óculos/.test(
      normalized,
    )
  );
}

function recentContextHasMaluEyewearPrompt(context?: string | null): boolean {
  const normalized = normalizeText(context || "");
  if (!normalized) return false;
  return /catalogo_oculos|malu|modelos de oculos|oculos disponiveis|previa com selfie|selfie.*oculos|oculos.*quero este|modelo.*oculos|oculos-0|quero este.*oculos|testar outro.*modelo/.test(normalized);
}

function recentContextHasKatePendantPrompt(context?: string | null): boolean {
  const normalized = normalizeText(context || "");
  if (!normalized) return false;

  return /catalogo_pingente|kate|sou a kate|pingentes fotogravaveis|modelos de pingentes|pingente escolhido|fotogravacao de 1 lado|foto no pingente|quero este no pingente|toque em quero este no pingente|no pingente escolhido|gostou de algum modelo.*pingente|somente do pingente|pingente\/medalha|corrente.*cordao|cordao.*vendido separadamente|simulacao de fotogravacao|preparar outra simulacao|arte original.*aprovacao|aprovacao antes da gravacao|valor da unidade.*pingente|pingente.*valor da unidade|material:\s*aco|cod:\s*pf/i.test(
    normalized,
  );
}

function recentContextHasKeilaAlliancePrompt(context?: string | null): boolean {
  const normalized = normalizeText(context || "");
  if (!normalized) return false;

  return /catalogo_alianca|keila|sou a keila|aliancas de aco|alianca.*tamanho|tamanhos:|quero esta.*alianca|alianca.*valor da unidade|cod:\s*e0/i.test(
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
  delete data.catalogo_malu_enviado;
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
  delete data.malu_store_handoff_done;
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

function isMaluFlowNode(node: string): boolean {
  const normalized = String(node || "");
  return (
    normalized.startsWith("malu_") ||
    normalized === "catalogo_oculos" ||
    normalized === "selecao_oculos" ||
    normalized === "human_handoff_oculos"
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
  delete data.cores_solicitadas;
  delete data.catalog_history;
  delete data.delivery_method;
  delete data.payment_method;
  delete data.keila_store_handoff_done;
  resetCatalogChoice(data);
}

function resetKateFlowState(data: AnyRecord) {
  delete data.finalidade;
  delete data.quantidade_tipo;
  delete data.tamanho_1;
  delete data.tamanho_2;
  delete data.numeracao_status;
  delete data.cor;
  delete data.cores_solicitadas;
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

function resetMaluFlowState(data: AnyRecord) {
  delete data.finalidade;
  delete data.quantidade_tipo;
  delete data.tamanho_1;
  delete data.tamanho_2;
  delete data.numeracao_status;
  delete data.cor;
  delete data.cores_solicitadas;
  delete data.catalog_history;
  delete data.delivery_method;
  delete data.payment_method;
  delete data.malu_customer_photo_url;
  delete data.malu_preview_image_url;
  delete data.malu_preview_status;
  delete data.malu_preview_approved;
  delete data.malu_store_handoff_done;
  resetCatalogChoice(data);
}

function buildSummary(data: AnyRecord): string {
  const parts: string[] = [];

  if (data.categoria) parts.push(`categoria=${data.categoria}`);
  if (data.finalidade) parts.push(`finalidade=${data.finalidade}`);
  const summaryColors = getRequestedColors(data);
  if (summaryColors.length > 0) parts.push(`cores=${formatColorList(summaryColors)}`);
  else if (data.cor) parts.push(`cor=${data.cor}`);
  if (data.prazo_fechamento) parts.push(`prazo=${data.prazo_fechamento}`);
  if (data.orcamento_valor) parts.push(`orcamento=${data.orcamento_valor}`);
  if (data.quantidade_tipo) parts.push(`tipo=${data.quantidade_tipo}`);
  if (data.tamanho_1) parts.push(`tam1=${data.tamanho_1}`);
  if (data.tamanho_2) parts.push(`tam2=${data.tamanho_2}`);
  if (data.delivery_method) parts.push(`entrega=${data.delivery_method}`);
  if (data.payment_method) parts.push(`pagamento=${data.payment_method}`);
  if (data.selected_name) parts.push(`produto=${data.selected_name}`);
  if (data.sales_stage) parts.push(`etapa=${data.sales_stage}`);
  if (data.last_question_kind) parts.push(`ultima_duvida=${data.last_question_kind}`);
  if (data.pending_customer_question) parts.push(`pendente=${data.pending_customer_question}`);

  return parts.join(" | ");
}

function detectCustomerQuestionKind(text: string, intelligence?: ConversationIntelligence | null): string | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  if (detectPriceQuestion(text) || detectPriceIntent(text)) return "preco";
  if (detectDeliveryDeadlineQuestion(text) || detectPayNowTodayQuestion(text)) return "prazo_entrega";
  if (detectDeliveryIntent(text)) return "entrega_retirada";
  if (detectPaymentIntent(text)) return "pagamento";
  if (detectStoreAddressQuestion(text)) return "endereco_loja";
  if (detectPendantMaterialQuestion(text)) return "material";
  if (detectPendantModelQuestion(text)) return "corrente_ou_medalha";
  if (detectFinishPhotosQuestion(text)) return "acabamento_fotos";
  if (detectCatalogIntent(text)) return "catalogo";
  if (detectChoiceIntent(text)) return "escolha_produto";
  if (detectPreviewIntent(text)) return "simulacao_previa";
  if (detectHumanIntent(text)) return "atendimento_humano";
  if (detectComplaintOrFrustration(text)) return "frustracao";
  if (intelligence?.intent && intelligence.intent !== "indefinido") return intelligence.intent;
  if (/\?|qual|como|quando|onde|porque|por que|tem|pode|consegue|sabe|duvida|dúvida/.test(normalized)) return "duvida_comercial";

  return null;
}

function inferSalesStage(data: AnyRecord, intelligence: ConversationIntelligence): string {
  if (data.payment_method && data.delivery_method && data.selected_sku) return "pronto_para_humano_fechar";
  if (data.delivery_method && data.selected_sku) return "definindo_pagamento";
  if (data.selected_sku && (data.kate_preview_approved || data.malu_preview_approved)) return "confirmando_entrega";
  if (data.selected_sku && (data.kate_preview_image_url || data.malu_preview_image_url)) return "simulacao_enviada";
  if (data.selected_sku) return "produto_escolhido";
  if (Array.isArray(data.last_catalog) && data.last_catalog.length > 0) return "catalogo_enviado";
  if (data.categoria) return "produto_identificado";
  return intelligence.customerStage || "triagem";
}

function buildSellerContextSummary(data: AnyRecord): string {
  const parts: string[] = [];
  if (data.contact_name) parts.push(`cliente ${data.contact_name}`);
  if (data.categoria) parts.push(`interesse em ${data.categoria}`);
  if (data.selected_name) parts.push(`escolheu ${data.selected_name}`);
  if (data.selected_sku) parts.push(`sku ${data.selected_sku}`);
  const sellerColors = getRequestedColors(data);
  if (sellerColors.length > 0) parts.push(`cores ${formatColorList(sellerColors)}`);
  else if (data.cor) parts.push(`cor ${data.cor}`);
  if (data.delivery_method) parts.push(`entrega ${data.delivery_method}`);
  if (data.payment_method) parts.push(`pagamento ${data.payment_method}`);
  if (data.last_question_kind) parts.push(`ultima duvida: ${data.last_question_kind}`);
  return parts.join("; ");
}

function updateSellerContextMemory(data: AnyRecord, args: {
  text: string;
  mediaType?: string | null;
  intelligence: ConversationIntelligence;
  activeAgent: ConversationAgent;
}) {
  const now = new Date().toISOString();
  const text = String(args.text || "").trim();
  const questionKind = detectCustomerQuestionKind(text, args.intelligence);

  data.last_customer_message = text || (args.mediaType === "image" ? "[imagem recebida]" : args.mediaType === "audio" ? "[audio recebido]" : "");
  data.last_customer_message_at = now;
  data.last_customer_intent = args.intelligence.intent;
  data.last_customer_agent_context = args.activeAgent;
  data.sales_stage = inferSalesStage(data, args.intelligence);
  data.sales_next_best_action = args.intelligence.customerStage;

  if (questionKind) {
    data.last_customer_question = text || `[${questionKind}]`;
    data.last_question_kind = questionKind;
    data.pending_customer_question = questionKind;
    const history = Array.isArray(data.customer_question_history) ? data.customer_question_history : [];
    data.customer_question_history = [
      ...history.slice(-7),
      { at: now, kind: questionKind, text: text || `[${questionKind}]`, agent: args.activeAgent },
    ];
  }

  if (args.intelligence.intent === "escolha_produto" || data.selected_sku) {
    data.buying_signal_detected = true;
  }

  data.seller_context_summary = buildSellerContextSummary(data);
}

async function loadAgentMemory(supabase: any, phone: string, agentSlug: MemoryAgent) {
  const phoneVariants = buildPhoneVariants(phone);
  const { data } = await supabase
    .from("customer_agent_memory")
    .select("*")
    .in("phone", phoneVariants)
    .eq("agent_slug", agentSlug)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(1)
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
    cores_solicitadas: getRequestedColors(data),
    prazo_fechamento: data.prazo_fechamento || null,
    orcamento_valor: data.orcamento_valor || null,
    orcamento_texto: data.orcamento_texto || null,
    quantidade_tipo: data.quantidade_tipo || null,
    tamanho_1: data.tamanho_1 || null,
    tamanho_2: data.tamanho_2 || null,
    numeracao_status: data.numeracao_status || null,
    delivery_method: data.delivery_method || null,
    payment_method: data.payment_method || null,
    last_intent: data.last_intent || null,
    customer_stage: data.customer_stage || null,
    intent_confidence: data.intent_confidence || null,
    intent_source: data.intent_source || null,
    intended_agent: data.intended_agent || null,
    quer_previa: data.quer_previa || null,
    tem_foto_cliente: data.tem_foto_cliente || null,
    sales_stage: data.sales_stage || null,
    seller_context_summary: data.seller_context_summary || null,
    recent_crm_context: data.recent_crm_context || null,
    human_chat_summary: data.human_chat_summary || null,
    last_image_understanding: data.last_image_understanding || null,
    last_customer_message: data.last_customer_message || null,
    last_customer_message_at: data.last_customer_message_at || null,
    last_customer_question: data.last_customer_question || null,
    last_question_kind: data.last_question_kind || null,
    pending_customer_question: data.pending_customer_question || null,
    customer_question_history: data.customer_question_history || [],
    buying_signal_detected: data.buying_signal_detected || null,
    preview_generation_count: data.preview_generation_count || 0,
    preview_generation_limit: MAX_PREVIEW_GENERATIONS_PER_CUSTOMER,
    preview_generation_last_at: data.preview_generation_last_at || null,
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
  if (!Array.isArray(data.cores_solicitadas) && Array.isArray(preferences.cores_solicitadas)) {
    data.cores_solicitadas = preferences.cores_solicitadas;
  }
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
  if (!data.last_intent && preferences.last_intent) data.last_intent = preferences.last_intent;
  if (!data.customer_stage && preferences.customer_stage) data.customer_stage = preferences.customer_stage;
  if (!data.intent_confidence && preferences.intent_confidence) data.intent_confidence = preferences.intent_confidence;
  if (!data.intent_source && preferences.intent_source) data.intent_source = preferences.intent_source;
  if (!data.intended_agent && preferences.intended_agent) data.intended_agent = preferences.intended_agent;
  if (!data.quer_previa && preferences.quer_previa) data.quer_previa = preferences.quer_previa;
  if (!data.tem_foto_cliente && preferences.tem_foto_cliente) data.tem_foto_cliente = preferences.tem_foto_cliente;
  if (!data.sales_stage && preferences.sales_stage) data.sales_stage = preferences.sales_stage;
  if (!data.seller_context_summary && preferences.seller_context_summary) data.seller_context_summary = preferences.seller_context_summary;
  if (!data.recent_crm_context && preferences.recent_crm_context) data.recent_crm_context = preferences.recent_crm_context;
  if (!data.human_chat_summary && preferences.human_chat_summary) data.human_chat_summary = preferences.human_chat_summary;
  if (!data.last_image_understanding && preferences.last_image_understanding) data.last_image_understanding = preferences.last_image_understanding;
  if (!data.last_customer_message && preferences.last_customer_message) data.last_customer_message = preferences.last_customer_message;
  if (!data.last_customer_message_at && preferences.last_customer_message_at) data.last_customer_message_at = preferences.last_customer_message_at;
  if (!data.last_customer_question && preferences.last_customer_question) data.last_customer_question = preferences.last_customer_question;
  if (!data.last_question_kind && preferences.last_question_kind) data.last_question_kind = preferences.last_question_kind;
  if (!data.pending_customer_question && preferences.pending_customer_question) data.pending_customer_question = preferences.pending_customer_question;
  if (!data.customer_question_history && preferences.customer_question_history) data.customer_question_history = preferences.customer_question_history;
  if (!data.buying_signal_detected && preferences.buying_signal_detected) data.buying_signal_detected = preferences.buying_signal_detected;
  if (!data.preview_generation_count && preferences.preview_generation_count) data.preview_generation_count = preferences.preview_generation_count;
  if (!data.preview_generation_limit && preferences.preview_generation_limit) data.preview_generation_limit = preferences.preview_generation_limit;
  if (!data.preview_generation_last_at && preferences.preview_generation_last_at) data.preview_generation_last_at = preferences.preview_generation_last_at;
  if (!data.selected_sku && memory.last_product_sku) data.selected_sku = memory.last_product_sku;
  if (!data.selected_name && memory.last_product_name) data.selected_name = memory.last_product_name;

  return data;
}

function getPreviewGenerationCount(data: AnyRecord): number {
  const parsed = Number(data.preview_generation_count || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function hasPreviewGenerationBudget(data: AnyRecord): boolean {
  return getPreviewGenerationCount(data) < MAX_PREVIEW_GENERATIONS_PER_CUSTOMER;
}

function registerPreviewGeneration(data: AnyRecord, agent: "kate" | "malu") {
  const nextCount = getPreviewGenerationCount(data) + 1;
  const now = new Date().toISOString();
  data.preview_generation_count = nextCount;
  data.preview_generation_limit = MAX_PREVIEW_GENERATIONS_PER_CUSTOMER;
  data.preview_generation_last_at = now;
  data[`${agent}_preview_generation_count`] = Number(data[`${agent}_preview_generation_count`] || 0) + 1;
  data[`${agent}_preview_generation_last_at`] = now;
  return nextCount;
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

function cleanCustomerProductName(name: unknown): string {
  return String(name || "")
    .replace(/\bplngente\b/gi, "Pingente")
    .replace(/\bp[lI]ngente\b/g, "Pingente")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPendantResultCaption(productName: unknown): string {
  const cleanName = cleanCustomerProductName(productName);
  return cleanName
    ? `Simulacao de fotogravacao - ${cleanName}`
    : "Simulacao de fotogravacao do pingente";
}

function detectPendantFamily(product: AnyRecord): string {
  const template = matchKateTemplateForProduct(product);
  const text = normalizeText(`${product?.name || ""} ${product?.description || ""} ${product?.sku || ""}`);

  if (template?.family) return template.family;
  if (/coracao|cora[cç]ao|heart/.test(text)) return "coracao";
  if (/hexagonal|sextavado|octagonal/.test(text)) return "hexagonal";
  if (/redondo|circular|circulo|c[ií]rculo/.test(text)) return "redondo";

  return "generico";
}

function buildPendantPreviewPrompt(product: AnyRecord): string {
  const family = detectPendantFamily(product);
  const color = detectColor(`${product?.color || ""} ${product?.name || ""} ${product?.description || ""}`);
  const colorInstruction = color
    ? `Preserve o acabamento de aço do template (${color === "dourada" ? "aço com acabamento dourado" : "aço prata"}).`
    : "Preserve exatamente o acabamento de aço do template.";
  const familyInstruction =
    family === "redondo"
      ? "O pingente é redondo. A fotogravação deve respeitar a área circular, com rosto centralizado, escala equilibrada e margem segura nas bordas."
      : family === "coracao"
        ? "O pingente é em formato de coração. A fotogravação deve se adaptar à silhueta do coração sem deformar o rosto, respeitando curvas superiores e ponta inferior."
        : family === "hexagonal" || family === "octagonal"
          ? "O pingente é geométrico. A fotogravação deve respeitar a área útil do formato, mantendo alinhamento e margem segura nas bordas."
          : "A fotogravação deve respeitar a área útil do pingente escolhido, com margens internas harmoniosas.";

  return `Imagem A é o template oficial do pingente escolhido. Imagem B é a foto enviada pelo cliente.

Crie uma prévia comercial realista de um pingente personalizado fotogravado.

Use a Imagem A como base principal e preserve exatamente o produto: formato, metal, brilho, contorno, proporção, argola, bordas, estrutura, fundo limpo e enquadramento.
Não recrie o pingente do zero. Não troque o template. Não altere argola, bordas, proporção, cor do metal ou acabamento externo.

Use a IA apenas para transformar a pessoa da Imagem B em uma fotogravação realista na área útil frontal do pingente.
A gravação deve preservar identidade, formato do rosto, cabelo, expressão e principais traços faciais, com acabamento monocromático fino de gravação a laser sobre metal.
Não aplicar foto colorida dentro do pingente. Não parecer foto colada, adesivo, impressão plana ou desenho artístico exagerado.

Centralize a pessoa com elegância, sem invadir a argola, sem encostar nas bordas e sem cortar excessivamente rosto, cabeça ou queixo.
${familyInstruction}
${colorInstruction}

Resultado final: mockup premium, realista e vendável para WhatsApp, com aparência de joia ACIUM personalizada por fotogravação.`;
}

// Colunas sempre presentes na tabela products.
const CATALOG_SELECT_CORE =
  "id, name, sku, price, image_url, video_url, category, color, description, tags, product_variants(size, stock)";
// Colunas core + "agent intelligence" (migration 20260607162000). Caso a migration
// ainda nao tenha sido aplicada em producao, o select cai para CATALOG_SELECT_CORE.
const CATALOG_SELECT_EXTENDED =
  "id, name, sku, price, image_url, video_url, category, color, description, tags, agent_line, ai_description, ai_tags, search_aliases, commercial_notes, included_items, restrictions, recommended_when, avoid_when, product_variants(size, stock)";

async function searchCatalog(
  supabase: any,
  params: Record<string, any>,
  data: AnyRecord,
): Promise<CatalogProduct[]> {
  let { data: products, error } = await supabase
    .from("products")
    .select(CATALOG_SELECT_EXTENDED)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    // As colunas de "agent intelligence" podem ainda nao existir em producao
    // (migration nao aplicada por drift). Cair para o select basico evita
    // retornar catalogo vazio e travar o envio dos agentes.
    console.warn(
      "[ALINE-REPLY] searchCatalog extended select failed, falling back to core columns:",
      error.message || error,
    );
    ({ data: products, error } = await supabase
      .from("products")
      .select(CATALOG_SELECT_CORE)
      .eq("active", true)
      .order("created_at", { ascending: false }));
  }

  if (error) {
    console.error("[ALINE-REPLY] searchCatalog error:", error);
    return [];
  }

  const requestedColor = String(params.color || data.cor || "").toLowerCase().trim();
  const requestedColors = Array.from(
    new Set(
      [
        ...(Array.isArray(params.colors) ? params.colors : []),
        ...(Array.isArray(data.cores_solicitadas) ? data.cores_solicitadas : []),
        requestedColor,
      ]
        .map(normalizeCatalogColor)
        .filter(Boolean) as string[],
    ),
  );
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
    const productId = normalizeText(product.id || "");
    const tagsText = Array.isArray(product.tags)
      ? product.tags.map((tag: unknown) => normalizeText(String(tag || ""))).join(" ")
      : normalizeText(String(product.tags || ""));
    const aiTagsText = Array.isArray(product.ai_tags)
      ? product.ai_tags.map((tag: unknown) => normalizeText(String(tag || ""))).join(" ")
      : normalizeText(String(product.ai_tags || ""));
    const aliasesText = Array.isArray(product.search_aliases)
      ? product.search_aliases.map((alias: unknown) => normalizeText(String(alias || ""))).join(" ")
      : normalizeText(String(product.search_aliases || ""));
    const aiDescription = normalizeText(product.ai_description || "");
    const commercialText = normalizeText([
      product.commercial_notes,
      product.included_items,
      product.restrictions,
      product.recommended_when,
      product.avoid_when,
    ].filter(Boolean).join(" "));
    const agentLine = normalizeText(product.agent_line || "");
    const productSearchText = `${productColor} ${name} ${description} ${category} ${tagsText} ${aiTagsText} ${aliasesText} ${aiDescription} ${commercialText} ${agentLine}`;
    const colorSearchText = productSearchText;
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
        aiTagsText.includes("casamento") ||
        aliasesText.includes("casamento") ||
        aiDescription.includes("casamento") ||
        /^e0(?:6|7)120\d+/i.test(productSku);

    if (excludedSkus.length > 0 && ((productSku && excludedSkus.includes(productSku)) || (productId && excludedSkus.includes(productId)))) {
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
        tagsText.includes("casamento") ||
        aiTagsText.includes("alianca") ||
        aiTagsText.includes("aliancas") ||
        aliasesText.includes("alianca") ||
        aliasesText.includes("casamento") ||
        agentLine === "keila";

      if (!isAlliance) return false;

      if (requestedPurpose === "casamento" && !isTungsten) return false;
      if (requestedPurpose === "namoro" && isTungsten) return false;
    }

    if (requestedCategory === "pingente") {
      const isPendant = isPingenteFotogravavel(product);
      if (!isPendant) return false;
    }

    if (requestedCategory === "oculos") {
      const isEyewear =
        category.includes("oculos") ||
        category.includes("oculo") ||
        name.includes("oculos") ||
        name.includes("oculo") ||
        name.includes("armacao") ||
        name.includes("lente") ||
        description.includes("oculos") ||
        description.includes("armacao") ||
        tagsText.includes("oculos") ||
        tagsText.includes("armacao") ||
        aiTagsText.includes("oculos") ||
        aliasesText.includes("armacao") ||
        aliasesText.includes("grau") ||
        agentLine === "malu";
      if (!isEyewear) return false;
    }

    if (requestedColors.length > 0) {
      const normalizedRequestedColor = requestedColors.flatMap(colorAliases);
      const matchesColor = normalizedRequestedColor.some((color) => colorSearchText.includes(normalizeText(color)));
      if (!matchesColor) return false;
    }

    const variantCount = Array.isArray(product.product_variants) ? product.product_variants.length : 0;
    const stock = (product.product_variants || []).reduce(
      (sum: number, item: any) => sum + Number(item.stock || 0),
      0,
    );

    const allowWithoutVariantStock =
      variantCount === 0 &&
      !!product.image_url &&
      (
        requestedCategory === "oculos" ||
        requestedCategory === "aliancas" ||
        (requestedCategory === "pingente" && Number(product.price || 0) > 0)
      );

    if (stock <= 0 && !allowWithoutVariantStock) return false;

    if (maxPrice !== null && Number(product.price || 0) > maxPrice) return false;

    return true;
  });

  filtered = filtered.sort((a: any, b: any) => {
    const aColor = normalizeText(a.color || "");
    const bColor = normalizeText(b.color || "");
    const requested = requestedColors.map(normalizeText);
    const aRank = requested.findIndex((color) => aColor.includes(color));
    const bRank = requested.findIndex((color) => bColor.includes(color));
    const aExact = aRank >= 0;
    const bExact = bRank >= 0;

    if (aExact !== bExact) return aExact ? -1 : 1;
    if (aExact && bExact && aRank !== bRank) return aRank - bRank;
    return Number(a.price || 0) - Number(b.price || 0);
  });

  if (Number.isFinite(Number(params.limit)) && Number(params.limit) > 0) {
    filtered = filtered.slice(0, Number(params.limit));
  }

  return filtered.map((product: any, index: number) => {
    const sizes = (product.product_variants || [])
      .filter((variant: any) => Number(variant.stock || 0) > 0)
      .map((variant: any) => String(variant.size));

    const rawStock = (product.product_variants || []).reduce(
      (sum: number, item: any) => sum + Number(item.stock || 0),
      0,
    );
    const stock = (requestedCategory === "oculos" || requestedCategory === "aliancas") && sizes.length === 0 && rawStock <= 0 && product.image_url
      ? 1
      : rawStock;

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
      tags: product.tags || null,
      agent_line: product.agent_line || null,
      ai_description: product.ai_description || null,
      ai_tags: product.ai_tags || null,
      search_aliases: product.search_aliases || null,
      commercial_notes: product.commercial_notes || null,
      included_items: product.included_items || null,
      restrictions: product.restrictions || null,
      recommended_when: product.recommended_when || null,
      avoid_when: product.avoid_when || null,
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
      "🔩 Material: aço",
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

function buildMaluCards(products: CatalogProduct[]): CatalogProduct[] {
  return products.map((product) => {
    const captionLines = [
      `*${product.name}*`,
      product.description ? product.description : null,
      product.color ? `Cor: ${product.color}` : null,
      product.sku ? `Cód: ${product.sku}` : null,
      product.price_formatted ? `Valor: ${product.price_formatted}` : null,
    ].filter(Boolean);

    return {
      ...product,
      caption: captionLines.join("\n"),
      button_id: `select_${product.sku || product.id}`,
      button_label: "Quero este",
      buttons: [
        {
          id: `select_${product.sku || product.id}`,
          label: "Quero este",
        },
      ],
      force_separate_buttons: true,
    };
  });
}

function inferAgentFromProduct(product: AnyRecord | null | undefined): ConversationAgent | null {
  if (!product) return null;

  const detectedCategory = detectCategory(
    `${product.category || ""} ${product.name || ""} ${product.description || ""}`,
    {},
  );

  if (detectedCategory === "pingente") return "kate";
  if (detectedCategory === "oculos") return "malu";
  if (detectedCategory === "aliancas" || detectedCategory === "aneis") return "keila";

  return null;
}

function buildGeneralCatalogCards(products: CatalogProduct[]): CatalogProduct[] {
  return products.map((product) => {
    const agent = inferAgentFromProduct(product);
    if (agent === "kate") return buildKateCards([product])[0];
    if (agent === "malu") return buildMaluCards([product])[0];
    if (agent === "keila") return buildKeilaCards([product])[0];

    return {
      ...product,
      caption: product.caption || formatProductCaption(product),
      button_id: `select_${product.sku || product.id}`,
      button_label: "Quero este",
    };
  });
}

function catalogHasAgentProduct(data: AnyRecord, agent: ConversationAgent): boolean {
  return getCatalogSelectionPool(data).some((item) => inferAgentFromProduct(item) === agent);
}

function shouldKeepAgentContext(args: {
  activeAgent: ConversationAgent;
  data: AnyRecord;
  currentNode: string;
  agent: ConversationAgent;
}) {
  const { activeAgent, data, currentNode, agent } = args;

  if (agent === "kate") {
    return (
      activeAgent === "kate" ||
      data.agente_atual === "kate" ||
      data.categoria === "pingente" ||
      data.catalogo_kate_enviado ||
      isKateFlowNode(currentNode) ||
      catalogHasAgentProduct(data, "kate")
    );
  }

  if (agent === "keila") {
    return (
      activeAgent === "keila" ||
      data.agente_atual === "keila" ||
      data.categoria === "aliancas" ||
      data.categoria === "aneis" ||
      data.catalogo_keila_enviado ||
      isKeilaFlowNode(currentNode) ||
      catalogHasAgentProduct(data, "keila")
    );
  }

  if (agent === "malu") {
    return (
      activeAgent === "malu" ||
      data.agente_atual === "malu" ||
      data.categoria === "oculos" ||
      data.catalogo_malu_enviado ||
      isMaluFlowNode(currentNode) ||
      catalogHasAgentProduct(data, "malu")
    );
  }

  return false;
}

function findCatalogSelection(token: string | null, catalog: any[]): any | null {
  if (!token || !Array.isArray(catalog) || catalog.length === 0) return null;

  const normalized = normalizeText(token);
  const explicitButton = normalized.match(/^(?:select|choose|details)[_-]([a-z0-9-]+)/i);
  if (explicitButton) {
    const token = explicitButton[1].toUpperCase();
    return catalog.find((item: any) => {
      const sku = String(item.sku || "").toUpperCase();
      const id = String(item.id || "").toUpperCase();
      return (sku && sku === token) || (id && id === token);
    }) || null;
  }

  const exactSku = catalog.find((item: any) => {
    const sku = String(item.sku || "").toUpperCase();
    const id = String(item.id || "").toLowerCase();
    return (sku && normalized.includes(sku.toLowerCase())) || (id && normalized.includes(id));
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

function findSingleCatalogSelection(data: AnyRecord): AnyRecord | null {
  const catalog = getCatalogSelectionPool(data);
  if (catalog.length !== 1) return null;
  return catalog[0] || null;
}

function extractCatalogSkuFromText(text: string): string | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const explicit = normalized.match(/(?:cod|codigo|sku)\s*:?\s*([a-z0-9_-]{3,})/i);
  if (explicit?.[1]) return explicit[1].toUpperCase();

  const sku = normalized.match(/\b(pf[a-z0-9_-]{5,}|e0\d{5,}|oculos[-_]?\d+)\b/i);
  return sku?.[1] ? sku[1].toUpperCase() : null;
}

async function lookupCatalogProductBySkuOrId(supabase: any, token: string | null): Promise<AnyRecord | null> {
  if (!token) return null;
  const value = String(token).trim();
  if (!value) return null;

  async function byField(field: "sku" | "id") {
    // O select de produtos nao usa product_variants aqui; reaproveitamos as listas
    // de colunas removendo a relacao para manter o fallback consistente.
    const extendedCols = CATALOG_SELECT_EXTENDED.replace(", product_variants(size, stock)", "");
    const coreCols = CATALOG_SELECT_CORE.replace(", product_variants(size, stock)", "");

    let { data, error } = await supabase
      .from("products")
      .select(extendedCols)
      .eq(field, value)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(
        "[ALINE-REPLY] lookupCatalogProductBySkuOrId extended select failed, falling back:",
        error.message || error,
      );
      ({ data, error } = await supabase
        .from("products")
        .select(coreCols)
        .eq(field, value)
        .eq("active", true)
        .limit(1)
        .maybeSingle());
    }

    if (error) {
      console.warn("[ALINE-REPLY] lookupCatalogProductBySkuOrId failed:", error.message || error);
      return null;
    }

    return data || null;
  }

  return (await byField("sku")) || (await byField("id"));
}

async function findRecentCrmCatalogSelection(
  supabase: any,
  phone: string,
  data: AnyRecord,
): Promise<AnyRecord | null> {
  const phoneVariants = buildPhoneVariants(phone);
  const catalogPool = getCatalogSelectionPool(data);

  const { data: crmConversation } = await supabase
    .from("conversations")
    .select("id")
    .in("contact_number", phoneVariants)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!crmConversation?.id) return null;

  const { data: recentMessages, error } = await supabase
    .from("messages")
    .select("content, is_from_me, message_type, created_at")
    .eq("conversation_id", crmConversation.id)
    .or("message_type.is.null,message_type.neq.internal_note")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.warn("[ALINE-REPLY] findRecentCrmCatalogSelection failed:", error.message || error);
    return null;
  }

  for (const row of recentMessages || []) {
    if (!row?.is_from_me) continue;

    const content = String(row.content || "");
    if (!content.trim()) continue;

    const matchedFromPool = findCatalogSelection(content, catalogPool);
    if (matchedFromPool) return matchedFromPool;

    const sku = extractCatalogSkuFromText(content);
    if (!sku) continue;

    const matchedBySku = findCatalogSelection(sku, catalogPool);
    if (matchedBySku) return matchedBySku;

    const product = await lookupCatalogProductBySkuOrId(supabase, sku);
    if (product) return product;
  }

  return null;
}

async function resolveMaluSelectedProductForPreview(
  supabase: any,
  data: AnyRecord,
): Promise<AnyRecord | null> {
  const currentProduct = data.selected_product || null;
  if (currentProduct?.image_url || currentProduct?.media_url) return currentProduct;

  const lookupToken = String(data.selected_sku || data.selected_name || "").trim();
  if (!lookupToken) return currentProduct;

  let selected = findCatalogSelection(lookupToken, getCatalogSelectionPool(data));

  if (!selected) {
    const catalog = await searchCatalog(
      supabase,
      {
        category: "oculos",
        only_available: true,
        limit: 80,
      },
      {
        ...data,
        categoria: "oculos",
      },
    );
    selected = findCatalogSelection(lookupToken, catalog);
  }

  if (!selected) return currentProduct;

  data.selected_product = selected;
  data.selected_sku = selected.sku || selected.id || data.selected_sku || null;
  data.selected_name = selected.name || data.selected_name || null;
  data.selected_price = selected.price ?? data.selected_price ?? null;
  data.catalog_history = mergeCatalogHistory(data.catalog_history, [selected]);

  return selected;
}

function detectPostCatalogPositiveIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /^(sim|s|quero|gostei|gostei sim|pode ser|ok|ta bom|beleza|perfeito|esse|este|isso)$/.test(normalized) ||
    /gostei|quero|pode ser|vou querer|esse mesmo|este mesmo|fechar|finalizar|comprar/.test(normalized);
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
  actionButtons?: Array<{ id: string; label: string }>;
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
    actionButtons = [],
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
    action_buttons: actionButtons,
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
      sales_stage: collectedData.sales_stage || null,
      seller_context_summary: collectedData.seller_context_summary || null,
      last_customer_question: collectedData.last_customer_question || null,
      last_question_kind: collectedData.last_question_kind || null,
      pending_customer_question: collectedData.pending_customer_question || null,
      buying_signal_detected: collectedData.buying_signal_detected || null,
      recent_crm_context: collectedData.recent_crm_context || null,
      human_chat_summary: collectedData.human_chat_summary || null,
    },
    use_product_buttons: useProductButtons,
    agente_atual: agent,
  };
}

async function resolveConversation(supabase: any, phone: string, contactName: string) {
  const phoneVariants = buildPhoneVariants(phone);
  let { data: existingConversation, error } = await supabase
    .from("aline_conversations")
    .select("*")
    .in("phone", phoneVariants)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const { data: crmConversation } = await supabase
    .from("conversations")
    .select("id, lead_status, attending_by, attending_name")
    .in("contact_number", phoneVariants)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingConversation && existingConversation.phone !== phone) {
    const { data: canonicalized, error: canonicalizeError } = await supabase
      .from("aline_conversations")
      .update({ phone })
      .eq("id", existingConversation.id)
      .select()
      .single();

    if (canonicalizeError) throw canonicalizeError;
    existingConversation = canonicalized;
  }

  const crmLeadStatus = String(crmConversation?.lead_status || "").toLowerCase();
  const crmHumanActive =
    crmLeadStatus === "humano" ||
    crmLeadStatus === "venda_iniciada" ||
    crmLeadStatus === "vendido" ||
    Boolean(crmConversation?.attending_by || crmConversation?.attending_name);

  if (crmHumanActive) {
    if (existingConversation?.id) {
      await supabase
        .from("aline_conversations")
        .update({
          status: "human_takeover",
          active_agent: "human",
          assignment_reason: crmConversation?.attending_name
            ? `Atendimento humano ativo no CRM: ${crmConversation.attending_name}`
            : `Lead status no CRM: ${crmLeadStatus || "humano"}`,
          last_message_at: new Date().toISOString(),
          followup_count: 0,
        })
        .eq("id", existingConversation.id);
    }

    return {
      skipped: true,
      reason: crmConversation?.attending_by || crmConversation?.attending_name
        ? "crm_attending_human"
        : `crm_lead_status_${crmLeadStatus || "human"}`,
    };
  }

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

  if (
    existingConversation.status === "human_takeover" ||
    existingConversation.active_agent === "human" ||
    existingConversation.assigned_seller_id ||
    existingConversation.assigned_seller_name
  ) {
    await supabase
      .from("aline_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        followup_count: 0,
      })
      .eq("id", existingConversation.id);

    return {
      skipped: true,
      reason: existingConversation.assigned_seller_id || existingConversation.assigned_seller_name
        ? "seller_assigned"
        : "human_takeover",
    };
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
  const { error } = await supabase
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

  if (error) {
    console.error("[ALINE-REPLY] persistConversation failed:", error);
    throw new Error("persistConversation failed");
  }
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

  const preview = String(message || "").trim().slice(0, 100);
  if (!preview) return;

  const { data: agentConversation } = await supabase
    .from("aline_conversations")
    .select("phone")
    .eq("id", conversationId)
    .maybeSingle();

  const phone = String(agentConversation?.phone || "").trim();
  if (!phone) return;
  const phoneVariants = buildPhoneVariants(phone);

  const { data: crmConversation } = await supabase
    .from("conversations")
    .select("id")
    .in("contact_number", phoneVariants)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!crmConversation?.id) return;

  await supabase
    .from("conversations")
    .update({
      contact_number: phone,
      last_message: preview,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", crmConversation.id);
}

async function updateCrmLeadStatus(supabase: any, phone: string, leadStatus: string) {
  const cleanPhone = String(phone || "").trim();
  if (!cleanPhone) return;

  const phoneVariants = buildPhoneVariants(cleanPhone);
  const { data: crmConversation } = await supabase
    .from("conversations")
    .select("id")
    .in("contact_number", phoneVariants)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!crmConversation?.id) return;

  const { error } = await supabase
    .from("conversations")
    .update({ lead_status: leadStatus })
    .eq("id", crmConversation.id);

  if (error) {
    console.error("[ALINE-REPLY] updateCrmLeadStatus failed:", error);
  }
}

async function handoffPreviewLimitToHuman(args: {
  supabase: any;
  conversation: any;
  phone: string;
  contactName: string;
  data: AnyRecord;
  agent: "kate" | "malu";
  productLabel: string;
}) {
  const { supabase, conversation, phone, contactName, data, agent, productLabel } = args;
  const agentName = agent === "kate" ? "Kate" : "Malu";
  const safeProductLabel = productLabel || (agent === "kate" ? "pingente escolhido" : "óculos escolhido");
  const assignmentReason = `${agentName} atingiu limite de ${MAX_PREVIEW_GENERATIONS_PER_CUSTOMER} previas para ${safeProductLabel}`;
  const reply = `Já preparei ${MAX_PREVIEW_GENERATIONS_PER_CUSTOMER} simulações para você. Para seguir com segurança, vou chamar um vendedor para continuar daqui sem gerar novas imagens automáticas.`;

  data.preview_generation_limit_reached = true;
  data.preview_generation_limit = MAX_PREVIEW_GENERATIONS_PER_CUSTOMER;
  data.agente_atual = "human";
  data.handoff_reason = "preview_generation_limit";

  await supabase
    .from("aline_conversations")
    .update({
      status: "human_takeover",
      active_agent: "human",
      assignment_reason: assignmentReason,
      collected_data: data,
      last_message_at: new Date().toISOString(),
      agent_handoff_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  await saveAssistantMessage(supabase, conversation.id, agent, reply, "human_takeover_preview_limit");
  await saveAgentMemory(supabase, phone, agent, contactName, data);
  await updateCrmLeadStatus(supabase, phone, "humano");

  return buildResponsePayload({
    phone,
    message: reply,
    node: "human_takeover_preview_limit",
    selectedProduct: data.selected_product || null,
    collectedData: data,
    agent: "human",
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

  await updateCrmLeadStatus(supabase, phone, "humano");

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

  const prompt = buildPendantPreviewPrompt(selectedProduct);

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
      quality: "high",
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

async function generateMaluPreview(args: {
  supabase: any;
  phone: string;
  selectedProduct: AnyRecord;
  customerPhotoUrl: string;
}) {
  const { supabase, phone, selectedProduct, customerPhotoUrl } = args;
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openAIApiKey) {
    throw new Error("OPENAI_API_KEY não configurada para gerar a prévia da Malu.");
  }

  const productImageUrl = String(selectedProduct?.image_url || selectedProduct?.media_url || "").trim();
  if (!productImageUrl) {
    throw new Error("O óculos escolhido não possui imagem para gerar a prévia.");
  }

  const prompt = `Imagem A é a selfie/foto original do cliente. Imagem B é a foto oficial do óculos escolhido.

Faça uma edição realista e controlada da Imagem A, mantendo a foto do cliente como base.

Preserve a Imagem A praticamente intacta: não altere identidade, rosto, formato da cabeça, olhos, nariz, boca, pele, cabelo, barba, expressão, pose, roupa, fundo, iluminação geral, enquadramento ou proporções da pessoa.
Não embeleze, não rejuvenesça, não afine, não redesenhe e não recrie o rosto. A pessoa precisa continuar sendo exatamente o mesmo cliente da selfie.

Aplique sobre o rosto o óculos da Imagem B com a maior fidelidade possível.
Preserve o óculos da Imagem B: formato da armação, ponte, lentes, cor, transparência, hastes, detalhes metálicos, parafusos, brilho e acabamento.
Não invente outro óculos, não troque a cor da lente, não mude o formato e não simplifique o produto.

O único elemento novo na Imagem A deve ser o óculos escolhido, ajustado ao rosto com tamanho proporcional, perspectiva correta, encaixe natural no nariz/orelhas, sombras suaves e reflexos discretos.
Se algum detalhe lateral da haste não puder aparecer pela pose da selfie, mantenha coerente com a perspectiva, mas não altere o design frontal do óculos.

Resultado final: a selfie original do cliente usando exatamente o óculos escolhido, com aparência comercial realista para WhatsApp.`;

  const imageModel = Deno.env.get("OPENAI_EYEWEAR_IMAGE_MODEL") ||
    Deno.env.get("OPENAI_IMAGE_MODEL") ||
    "gpt-image-2";
  const modelCandidates = Array.from(new Set([imageModel, "gpt-image-2", "gpt-image-1.5", "gpt-image-1"].filter(Boolean)));
  let imagePayload: AnyRecord | null = null;
  let lastErrorText = "";

  for (const model of modelCandidates) {
    const imageResponse = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openAIApiKey}`,
    },
    body: JSON.stringify({
      model,
      images: [
        { image_url: customerPhotoUrl },
        { image_url: productImageUrl },
      ],
      prompt,
      size: "1024x1536",
      quality: "high",
      output_format: "png",
    }),
    });

    if (imageResponse.ok) {
      imagePayload = await imageResponse.json();
      break;
    }

    lastErrorText = `${imageResponse.status} - ${await imageResponse.text()}`;
    if (!/model|does not exist|invalid|not found|not supported/i.test(lastErrorText)) break;
  }

  if (!imagePayload) {
    throw new Error(`OpenAI eyewear image edit error: ${lastErrorText}`);
  }

  const previewBase64 = imagePayload?.data?.[0]?.b64_json || null;
  const previewUrl = imagePayload?.data?.[0]?.url || null;

  if (previewUrl) {
    return previewUrl;
  }

  if (!previewBase64) {
    throw new Error("A OpenAI não retornou uma imagem válida para a prévia de óculos.");
  }

  const binary = Uint8Array.from(atob(previewBase64), (char) => char.charCodeAt(0));
  const filePath = `malu-previews/${phone}/${Date.now()}-${selectedProduct?.sku || selectedProduct?.id || "oculos"}.png`;

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

  await updateCrmLeadStatus(supabase, phone, "humano");

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

  const reply = `Perfeito! Ja deixei anotado que sera ${deliveryLabel} com pagamento via ${paymentLabel}. Essa conversa esta em Acao humana: um vendedor vai assumir daqui para finalizar seu pingente fotogravado.`;

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
  const preservedPendantColors = getRequestedColors(data, ["prata", "dourada"]);
  const shouldSendInitialKateIntro =
    !isKateFlowNode(currentNode) &&
    !data.kate_intro_sent &&
    !data.catalogo_kate_enviado &&
    !data.selected_sku &&
    !data.selected_product?.id;
  const withKateIntro = (reply: string) => {
    if (!shouldSendInitialKateIntro || data.kate_intro_sent) return reply;
    data.kate_intro_sent = true;
    return `${buildAlineTransferIntro(contactName, "kate")}\n\n${reply}`;
  };

  // Pingentes não usam numeração/tamanho de alianças; limpamos qualquer resíduo
  // herdado para que, após a cor, a Kate siga direto para o catálogo.
  delete data.finalidade;
  delete data.quantidade_tipo;
  delete data.tamanho_1;
  delete data.tamanho_2;
  delete data.numeracao_status;

  if (!isKateFlowNode(currentNode) || data.kate_force_catalogo_amplo === true) {
    resetKateFlowState(data);
    if (preservedPendantColors.length > 0) {
      data.cores_solicitadas = preservedPendantColors;
      data.cor = preservedPendantColors[0];
    }
  }

  const previousSelectedSku = String(data.selected_sku || "");
  const selectedFromCatalog = findCatalogSelection(
    buttonResponseId || catalogSelectionHint || message,
    getCatalogSelectionPool(data),
  );

  if (selectedFromCatalog) {
    data.selected_product = selectedFromCatalog;
    data.selected_sku = selectedFromCatalog.sku || selectedFromCatalog.id;
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

  const requestedPendantStyle = detectRequestedPingenteStyle(message);
  if (requestedPendantStyle && !data.selected_sku && !data.selected_product?.id) {
    if (data.estilo_pingente !== requestedPendantStyle) {
      resetCatalogChoice(data);
    }
    data.estilo_pingente = requestedPendantStyle;
  }

  const pendantColorChanged = applyDetectedColorsToData(data, message, ["prata", "dourada"]);
  if (pendantColorChanged) {
    resetCatalogChoice(data);
    delete data.kate_selected_template_id;
    delete data.kate_customer_photo_url;
    delete data.kate_preview_image_url;
    delete data.kate_preview_status;
    delete data.kate_preview_approved;
  }

  const requestedPendantColors = getRequestedColors(data, ["prata", "dourada"]);
  const hasColor = requestedPendantColors.length > 0;
  const hasSelectedProduct = !!(data.selected_sku || data.selected_product?.id);
  const hasPhoto = !!data.kate_customer_photo_url;
  const hasPreview = !!data.kate_preview_image_url;
  const hasPreviewApproved = data.kate_preview_approved === true;
  const hasDelivery = !!data.delivery_method;
  const hasPayment = !!data.payment_method;
  const hasCatalogOptions = getCatalogSelectionPool(data).length > 0;
  const postCatalogPositive = !hasSelectedProduct && hasCatalogOptions && detectPostCatalogPositiveIntent(message);

  if (postCatalogPositive) {
    const singleOption = findSingleCatalogSelection(data);

    if (singleOption) {
      data.selected_product = singleOption;
      data.selected_sku = singleOption.sku || singleOption.id;
      data.selected_name = singleOption.name;
      data.selected_price = singleOption.price;
      data.kate_selected_template_id = matchKateTemplateForProduct(singleOption)?.id || null;
      data.kate_store_handoff_done = true;

      const reply = `Perfeito! Vou seguir com *${cleanCustomerProductName(data.selected_name)}*. Essa conversa esta em Acao humana: um vendedor vai assumir daqui para finalizar seu pingente fotogravado.`;

      await supabase
        .from("aline_conversations")
        .update({
          status: "human_takeover",
          active_agent: "human",
          assignment_reason: `Kate: cliente confirmou interesse em ${data.selected_name || data.selected_sku} apos catalogo`,
          collected_data: { ...data, agente_atual: "human" },
          last_message_at: new Date().toISOString(),
          agent_handoff_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);

      await updateCrmLeadStatus(supabase, phone, "humano");
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

    data.kate_store_handoff_done = true;
    data.needs_human_reason = "cliente confirmou interesse apos catalogo sem modelo claro";

    const reply = "Perfeito. Para nao travar sua compra, vou chamar um vendedor para continuar daqui. Ele vai ver os modelos enviados e te ajuda a escolher certinho.";

    await supabase
      .from("aline_conversations")
      .update({
        status: "human_takeover",
        active_agent: "human",
        assignment_reason: "Kate: cliente demonstrou interesse apos catalogo sem modelo claro",
        collected_data: { ...data, agente_atual: "human" },
        last_message_at: new Date().toISOString(),
        agent_handoff_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);

    await updateCrmLeadStatus(supabase, phone, "humano");
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "human_handoff_pingente");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "human_handoff_pingente",
      collectedData: data,
      agent: "human",
    });
  }

  const normalizedMessage = normalizeText(message);
  const wantsFullCatalog = detectFullCatalogRequest(message);
  const wantsCatalogResend = detectCatalogResendIntent(message) || wantsFullCatalog;
  const wantsMoreOptions = detectMoreOptionsIntent(message);
  const wantsPreviewRedo = detectPreviewRedoIntent(message);
  const wantsPreviewApproval = detectPreviewApprovalIntent(message);
  const wantsCloseWithoutPhoto = /fechar|finalizar|comprar|quero comprar|vou querer|pode seguir|seguir sem foto|sem foto|sem simulacao|nao quero foto|nao precisa de foto/.test(normalizedMessage);
  const wantsProceedWithSelectedProduct = /quero este|quero esse|esse mesmo|essa mesma|isso mesmo|isso msm|perfeito|pode ser|vou querer|quero comprar/.test(normalizedMessage);
  const asksPendantModelQuestion = detectPendantModelQuestion(message);
  const asksPendantMaterialQuestion = detectPendantMaterialQuestion(message);
  const asksDeliveryDeadline = detectDeliveryDeadlineQuestion(message);
  const asksPrice = detectPriceQuestion(message);
  const asksStoreAddress = detectStoreAddressQuestion(message);
  const asksFinishPhotos = detectFinishPhotosQuestion(message);
  const isComplaintOrFrustration = detectComplaintOrFrustration(message);
  const asksGenericDoubt = detectGenericDoubt(message);
  const isOnlyLaughter = detectOnlyLaughter(message);
  const asksPayNowToday = detectPayNowTodayQuestion(message);
  const asksCardInstallments = detectCardInstallmentQuestion(message);
  const inboundImageUrl = detectInboundImageUrl(message);
  const effectiveMediaType = mediaType === "image" || inboundImageUrl ? "image" : mediaType;
  const effectiveMediaUrl = mediaUrl || inboundImageUrl;

  const fetchKateCatalogCards = async (excludeSkus: string[] = []) => {
    const colorFilters = getRequestedColors(data, ["prata", "dourada"]);
    const styleFilter = data.estilo_pingente === "cravejado" ? "cravejado" : null;
    const searchParams: AnyRecord = {
      category: "pingente",
      only_available: true,
      limit: 80,
    };

    if (data.cor) {
      searchParams.color = data.cor;
    }

    if (colorFilters.length > 0) {
      searchParams.colors = colorFilters;
      if (colorFilters.length === 1) searchParams.color = colorFilters[0];
    }

    if (excludeSkus.length > 0) {
      searchParams.exclude_skus = excludeSkus;
    }

    const catalog = await searchCatalog(supabase, searchParams, data);
    const selected = buildKateCatalogSelection(catalog, {
      colorFilters,
      styleFilter,
      excludeSkus,
      limit: 8,
      requestType: styleFilter
        ? "style_cravejado"
        : excludeSkus.length > 0
          ? "more_options"
          : colorFilters.length > 0
            ? "color"
            : "broad",
    });

    return buildKateCards(selected);
  };

  const sendKateCatalogForBothFinishes = async (reply: string) => {
    const previousColor = data.cor;
    const previousColors = Array.isArray(data.cores_solicitadas) ? [...data.cores_solicitadas] : null;
    const previousStyle = data.estilo_pingente;
    delete data.cor;
    delete data.cores_solicitadas;
    let cards = await fetchKateCatalogCards([]);
    let replyText = reply;
    if (cards.length === 0 && previousStyle === "cravejado") {
      delete data.estilo_pingente;
      cards = await fetchKateCatalogCards([]);
      if (cards.length > 0) {
        data.kate_requested_style_unavailable = previousStyle;
        replyText = "Nao encontrei nenhum pingente marcado como cravejado no catalogo ativo agora. Para nao te deixar sem opcao, vou te mostrar os pingentes fotogravaveis disponiveis e, se quiser algum detalhe especifico, chamo um vendedor para confirmar.";
      } else {
        data.estilo_pingente = previousStyle;
      }
    }
    if (previousColor === "prata" || previousColor === "dourada") {
      data.cor = previousColor;
    }
    if (previousColors) {
      data.cores_solicitadas = previousColors;
    }

    if (cards.length > 0) {
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
    }

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "catalogo_pingente",
      conversation.current_node || null,
      data,
    );
    const finalReply = withKateIntro(replyText);
    await saveAssistantMessage(supabase, conversation.id, "kate", finalReply, "catalogo_pingente");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: finalReply,
      node: "catalogo_pingente",
      products: cards,
      collectedData: data,
      agent: "kate",
      useProductButtons: cards.length > 0,
      postCatalogMessage: cards.length > 0
        ? "Gostou de algum modelo? Toque em Quero este no pingente escolhido que eu sigo com voce."
        : undefined,
    });
  };

  const sendKateCatalogForCurrentColor = async (reply: string) => {
    const cards = await fetchKateCatalogCards([]);

    if (cards.length > 0) {
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
    }

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "catalogo_pingente",
      conversation.current_node || null,
      data,
    );
    const finalReply = withKateIntro(reply);
    await saveAssistantMessage(supabase, conversation.id, "kate", finalReply, "catalogo_pingente");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: finalReply,
      node: "catalogo_pingente",
      products: cards,
      collectedData: data,
      agent: "kate",
      useProductButtons: cards.length > 0,
      postCatalogMessage: cards.length > 0
        ? "Gostou de algum modelo? Toque em Quero este no pingente escolhido que eu sigo com voce."
        : undefined,
    });
  };

  if (isComplaintOrFrustration) {
    data.kate_needs_human = true;
    data.agente_atual = "human";
    const reply = "Sinto muito por essa experiência. Vou pausar o atendimento automático e chamar um vendedor agora para resolver com você sem ficar repetindo mensagem.";

    await supabase
      .from("aline_conversations")
      .update({
        status: "human_takeover",
        active_agent: "human",
        assignment_reason: "Kate acionou atendimento humano por insatisfacao/reclamacao do cliente",
        collected_data: data,
        last_message_at: new Date().toISOString(),
        agent_handoff_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "human_takeover");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);
    await updateCrmLeadStatus(supabase, phone, "humano");

    return buildResponsePayload({
      phone,
      message: reply,
      node: "human_takeover",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "human",
    });
  }

  if (mediaType === "audio" && /audio recebido/.test(normalizedMessage)) {
    data.kate_needs_human = true;
    data.agente_atual = "human";
    const reply = "Recebi seu áudio. Para não te responder errado, vou chamar um vendedor para ouvir e continuar seu atendimento por aqui.";

    await supabase
      .from("aline_conversations")
      .update({
        status: "human_takeover",
        active_agent: "human",
        assignment_reason: "Kate encaminhou atendimento humano para audio sem transcricao",
        collected_data: data,
        last_message_at: new Date().toISOString(),
        agent_handoff_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "human_takeover");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);
    await updateCrmLeadStatus(supabase, phone, "humano");

    return buildResponsePayload({
      phone,
      message: reply,
      node: "human_takeover",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "human",
    });
  }

  if (detectUnsupportedAccessoryIntent(message)) {
    data.kate_needs_human = true;
    data.agente_atual = "human";
    data.handoff_reason = "produto_acessorio_sem_fluxo";
    const reply = "Consigo te ajudar com essa peca, mas para nao te passar informacao errada vou chamar um vendedor para confirmar os modelos e valores certinhos com voce.";

    await supabase
      .from("aline_conversations")
      .update({
        status: "human_takeover",
        active_agent: "human",
        assignment_reason: "Kate encaminhou acessorio fora do fluxo automatico para vendedor",
        collected_data: data,
        last_message_at: new Date().toISOString(),
        agent_handoff_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "human_acessorio");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);
    await updateCrmLeadStatus(supabase, phone, "humano");

    return buildResponsePayload({
      phone,
      message: reply,
      node: "human_acessorio",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "human",
    });
  }

  if (detectThanksOnly(message)) {
    const reply = hasSelectedProduct
      ? `Eu que agradeco! Deixei o *${cleanCustomerProductName(data.selected_name)}* no contexto. Se quiser finalizar, me diga se prefere retirada na loja ou delivery.`
      : data.catalogo_kate_enviado
        ? "Eu que agradeco! Se algum modelo te agradou, toque em Quero este no pingente escolhido que eu sigo com voce."
        : "Eu que agradeco! Quando quiser, me diga se prefere ver os pingentes no acabamento prata ou dourado.";

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_ack",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_ack");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_ack",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }

  const wantsInitialBroadPendantCatalog =
    wantsFullCatalog ||
    data.kate_force_catalogo_amplo === true ||
    (!data.catalogo_kate_enviado && !hasColor && (
      detectCatalogIntent(message) ||
      detectBareProductCatalogRequest(message, "pingente")
    ));

  if (!hasSelectedProduct && wantsInitialBroadPendantCatalog) {
    delete data.kate_force_catalogo_amplo;
    return await sendKateCatalogForBothFinishes(
      "Claro. Vou te mandar alguns modelos de pingentes fotogravaveis, incluindo opcoes lisas e cravejadas, nos acabamentos prata e dourado, para voce comparar pelas fotos.",
    );
  }

  if (!hasSelectedProduct && requestedPendantStyle === "cravejado" && !data.catalogo_kate_enviado) {
    return await sendKateCatalogForBothFinishes(
      "Tenho sim. Vou te mostrar os modelos de pingentes fotogravaveis que aparecem como cravejados no catalogo. Se quiser algum detalhe especifico, chamo um vendedor para confirmar certinho com voce.",
    );
  }

  if (!hasSelectedProduct && hasColor && asksPendantMaterialQuestion && !data.catalogo_kate_enviado) {
    return await sendKateCatalogForCurrentColor(
      `Nossos pingentes fotogravaveis sao de aco, nao sao de ouro. ${data.cor === "dourada" ? "O dourado e acabamento do aco." : "O prata e acabamento do aco."} Vou te mostrar os modelos no acabamento ${data.cor}.`,
    );
  }

  if (!hasSelectedProduct && hasColor && detectCatalogIntent(message) && !data.catalogo_kate_enviado) {
    return await sendKateCatalogForCurrentColor(
      `Claro. Vou te mostrar os pingentes fotogravaveis no acabamento ${data.cor}, incluindo modelos lisos e cravejados quando estiverem disponiveis.`,
    );
  }

  if (!hasSelectedProduct && hasColor && isSimpleColorChoice(message)) {
    return await sendKateCatalogForCurrentColor(
      `Perfeito, vou te mostrar os pingentes fotogravaveis no acabamento ${data.cor}, incluindo opcoes lisas e cravejadas se tiverem no catalogo. A fotogravacao de 1 lado ja esta inclusa.`,
    );
  }

  if (!hasSelectedProduct && asksFinishPhotos) {
    return await sendKateCatalogForBothFinishes(
      "Tenho sim. Vou te mandar alguns modelos de pingentes fotogravaveis, incluindo opcoes lisas e cravejadas, nos acabamentos prata e dourado, para voce comparar pelas fotos.",
    );
  }

  if (asksPendantModelQuestion) {
    const reply = "Esse valor e somente do pingente/medalha fotogravavel. Corrente ou cordao nao acompanha; e vendido separadamente. Se quiser corrente, o vendedor confirma as opcoes e valores separados.";

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_duvida_produto",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_duvida_produto");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_duvida_produto",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }

  if (asksDeliveryDeadline) {
    const reply = asksPayNowToday
      ? "Pagando e fechando agora, o pedido entra na fila de producao hoje. Geralmente fica pronto de 8 a 24 horas apos pagamento e fechamento; se houver vaga na fila, pode ficar ainda hoje. Para eu seguir, escolha um modelo ou toque em Quero este no card."
      : "A producao e entrega dependem da fila de espera. Geralmente fica pronto de 8 a 24 horas apos pagamento e fechamento do pedido.";

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_prazo",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_prazo");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_prazo",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }

  if (hasSelectedProduct && asksGenericDoubt) {
    const reply = "Claro, pode perguntar. E so para deixar essa parte bem clara: o valor do card e do pingente/medalha fotogravavel; corrente ou cordao e vendido separadamente.";

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_duvida_produto",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_duvida_produto");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_duvida_produto",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }

  if (hasSelectedProduct && hasDelivery && !hasPayment && isOnlyLaughter) {
    const reply = "Tranquilo. Quando quiser finalizar, me diga se prefere Pix, Crediario Bemol ou cartao de credito que eu encaminho para o vendedor concluir com voce.";

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

  if (asksStoreAddress) {
    if (hasSelectedProduct) data.delivery_method = "retirada";
    const nextLine = hasSelectedProduct && !hasPayment
      ? "\n\nSe você for retirar na loja, me confirma também a forma de pagamento: Pix, Crediario Bemol ou cartão de crédito?"
      : "";
    const reply = detectStoreNameQuestion(message)
      ? `O nome da loja e ACIUM Manaus. Ficamos no Shopping Sumauma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM.${nextLine}`
      : `Nossa loja fica no Shopping Sumauma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM.${nextLine}`;

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      hasSelectedProduct ? "kate_pagamento" : "kate_endereco",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_endereco");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: hasSelectedProduct ? "kate_pagamento" : "kate_endereco",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }

  if (asksCardInstallments) {
    if (hasSelectedProduct) data.payment_method = "cartao";
    const reply = hasSelectedProduct
      ? hasDelivery
        ? "No cartao de credito, a ACIUM divide em ate 3x sem juros. Ja deixei cartao anotado para o vendedor finalizar com voce com seguranca."
        : "No cartao de credito, a ACIUM divide em ate 3x sem juros. Se voce quiser seguir no cartao, me confirma se sera retirada na loja ou delivery que eu deixo tudo pronto para o vendedor finalizar."
      : "No cartao de credito, a ACIUM divide em ate 3x sem juros. Me diga qual pingente voce gostou que eu sigo com voce.";

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      hasSelectedProduct ? "kate_pagamento" : "kate_duvida_produto",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, hasSelectedProduct ? "kate_pagamento" : "kate_duvida_produto");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: hasSelectedProduct ? "kate_pagamento" : "kate_duvida_produto",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }
  if (asksPayNowToday) {
    const reply = hasSelectedProduct
      ? "Pagando e fechando agora, o pedido entra na fila de producao hoje. Geralmente fica pronto de 8 a 24 horas apos pagamento e fechamento; se houver vaga na fila, pode ficar ainda hoje. Para confirmar a fila atual antes do pagamento, me diga se prefere retirada na loja ou delivery."
      : data.cor === "prata" || data.cor === "dourada"
        ? `Sim. Pagando e fechando agora, o pedido entra na fila de producao hoje. Geralmente fica pronto de 8 a 24 horas; se a fila permitir, pode finalizar ainda hoje. Vou te mandar os modelos ${data.cor} para voce escolher.`
        : "Sim. Pagando e fechando agora, o pedido entra na fila de producao hoje. Geralmente fica pronto de 8 a 24 horas; se a fila permitir, pode finalizar ainda hoje. Voce prefere ver os modelos prata ou dourado?";

    if (!hasSelectedProduct && (data.cor === "prata" || data.cor === "dourada")) {
      return await sendKateCatalogForCurrentColor(reply);
    }

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      hasSelectedProduct ? "kate_entrega" : "kate_cor",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, hasSelectedProduct ? "kate_entrega" : "kate_cor");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: hasSelectedProduct ? "kate_entrega" : "kate_cor",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }

  if (hasSelectedProduct && asksPrice) {
    const price = formatCurrency(data.selected_price || data.selected_product?.price);
    const productName = cleanCustomerProductName(data.selected_name || "pingente fotogravado");
    const reply = `${productName}${price ? ` fica ${price}` : "está com valor no card enviado"}. Esse valor é somente do pingente/medalha fotogravável; corrente ou cordão é vendido separadamente.

Posso seguir com retirada na loja ou delivery? Depois do fechamento, o vendedor envia a arte original para sua aprovação antes da gravação.`;

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_entrega",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_valor");
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

  if (asksPendantMaterialQuestion) {
    const reply = hasSelectedProduct
      ? "Nossos pingentes fotogravaveis sao de aco, nao sao de ouro. O dourado e o prata sao acabamentos do aco. O peso varia conforme o modelo; para nao te passar dado errado, o vendedor confirma o peso exato do modelo escolhido antes do fechamento."
      : "Nossos pingentes fotogravaveis sao de aco, nao sao de ouro. O dourado e o prata sao acabamentos do aco. O peso varia conforme o modelo; escolhendo um modelo eu confirmo com a loja. Quer ver os modelos com acabamento dourado ou prata?";

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_duvida_produto",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_duvida_produto");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_duvida_produto",
      collectedData: data,
      agent: "kate",
    });
  }

  if (!hasColor) {
    const detectedColor = detectColor(message);
    const polishedReply = detectedColor && !["prata", "dourada"].includes(detectedColor)
      ? "Os pingentes fotograváveis são de aço e hoje tenho duas opções de acabamento: dourado ou prata. Qual você prefere?"
      : `Oi, eu sou a Kate. A fotogravação fica linda para presente: usamos uma foto sua e preparo uma simulação no pingente antes de seguir com o pedido.

Os pingentes são de aço, com acabamento dourado ou prata. Qual acabamento você prefere ver?`;
    const finalReply = withKateIntro(polishedReply);

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_cor",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", finalReply, "kate_cor");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: finalReply,
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
      postCatalogMessage: "Gostou de algum modelo? Toque em Quero este. A foto para simulacao ajuda na escolha, mas tambem posso seguir para fechamento sem foto.",
    });
  }

  if (data.catalogo_kate_enviado && !hasSelectedProduct && (wantsCatalogResend || wantsMoreOptions)) {
    const shownSkus = Array.isArray(data.last_catalog)
      ? data.last_catalog.map((item: any) => String(item?.sku || item?.id || "")).filter(Boolean)
      : [];
    const cards = await fetchKateCatalogCards(wantsMoreOptions ? shownSkus : []);

    if (cards.length === 0 && wantsMoreOptions) {
      const originalColor = data.cor === "prata" || data.cor === "dourada" ? data.cor : null;
      const alternateColor = originalColor === "prata" ? "dourada" : originalColor === "dourada" ? "prata" : null;

      if (alternateColor) {
        data.cor = alternateColor;
        const alternateCards = await fetchKateCatalogCards([]);

        if (alternateCards.length > 0) {
          data.last_catalog = alternateCards.map((product) => ({
            id: product.id,
            sku: product.sku,
            name: product.name,
            price: product.price,
            color: product.color,
            image_url: product.image_url,
            video_url: product.video_url,
          }));
          data.catalog_history = mergeCatalogHistory(data.catalog_history, data.last_catalog);

          const reply = `Na cor ${originalColor} eu ja te mostrei os modelos disponiveis. Para nao te deixar sem opcao, separei tambem os pingentes fotogravaveis no acabamento ${alternateColor}.`;

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
            products: alternateCards,
            collectedData: data,
            agent: "kate",
            useProductButtons: true,
            postCatalogMessage: "Gostou de algum modelo? Toque em Quero este. Se quiser, posso preparar uma simulacao com foto, mas tambem consigo seguir para fechamento sem foto.",
          });
        }

        data.cor = originalColor;
      }

      const reply = "Eu ja te mostrei os modelos fotogravaveis disponiveis agora. Se algum te agradou, toque em Quero este que eu sigo com voce; a simulacao com foto e opcional para ajudar na escolha.";

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
        postCatalogMessage: "Gostou de algum modelo? Toque em Quero este. A foto para simulacao ajuda na escolha, mas tambem posso seguir para fechamento sem foto.",
      });
    }
  }

  if (asksPendantMaterialQuestion) {
    const reply = "Nossos pingentes fotogravaveis sao de aco, nao sao de ouro. O dourado e o prata sao acabamentos do aco. Sobre peso em gramas, varia conforme o modelo; se voce escolher um especifico, eu confirmo o peso certinho com a loja.";

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_duvida_produto",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_duvida_produto");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_duvida_produto",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }

  if (hasSelectedProduct && !hasPhoto) {
    if (effectiveMediaType === "image" && effectiveMediaUrl) {
      data.kate_customer_photo_url = effectiveMediaUrl;
      data.kate_photo_requested = true;

      if (!hasPreviewGenerationBudget(data)) {
        return await handoffPreviewLimitToHuman({
          supabase,
          conversation,
          phone,
          contactName,
          data,
          agent: "kate",
          productLabel: cleanCustomerProductName(data.selected_name),
        });
      }

      try {
        const previewImageUrl = await generateKatePreview({
          supabase,
          phone,
          selectedProduct: data.selected_product || {},
          customerPhotoUrl: effectiveMediaUrl,
        });

        data.kate_preview_image_url = previewImageUrl;
        data.kate_preview_status = "sent";
        data.kate_preview_approved = false;
        registerPreviewGeneration(data, "kate");

        const reply = `Recebi sua foto! Preparei uma simulação de fotogravação do *${cleanCustomerProductName(data.selected_name)}* para você conferir. Importante: essa imagem é apenas uma simulação. Após o fechamento, o vendedor envia a arte original para sua aprovação antes da gravação.`;

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
        await updateCrmLeadStatus(supabase, phone, "venda_iniciada");

        return buildResponsePayload({
          phone,
          message: reply,
          node: "kate_preview",
          mediaItems: previewImageUrl
            ? [
                {
                  type: "image",
                  url: previewImageUrl,
                  caption: buildPendantResultCaption(data.selected_name),
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
          "Recebi sua foto, mas nao consegui preparar a simulacao automatica agora. Vou te encaminhar para nosso atendimento humano finalizar a fotogravacao com voce.";

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

    if (hasDelivery || hasPayment || wantsCloseWithoutPhoto || wantsPreviewApproval || wantsProceedWithSelectedProduct) {
      if (!hasDelivery) {
        const reply = `Perfeito, seguimos com *${cleanCustomerProductName(data.selected_name)}* sem simulação.

Você vai retirar na loja ou prefere delivery? Depois do fechamento, o vendedor envia a arte original para sua aprovação antes da gravação.`;

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

      if (!hasPayment) {
        const reply = "Perfeito. E a forma de pagamento vai ser Pix, Crediario Bemol ou cartao de credito?";

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

    const reply = `Perfeito! Voce escolheu *${cleanCustomerProductName(data.selected_name)}*.

Esse modelo permite fotogravação de 1 lado. Se quiser ver antes, me manda a foto que você quer gravar e eu preparo uma simulação para ajudar na escolha.

Se preferir seguir sem simulação, posso avançar com entrega e pagamento agora. Depois do fechamento, o vendedor envia a arte original para sua aprovação antes da gravação.`;

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

  if (asksPendantModelQuestion) {
    const reply = "Esse valor e somente do pingente/medalha fotogravavel. Corrente ou cordao nao acompanha; e vendido separadamente. Se voce quiser, eu sigo com esse pingente ou te mostro outros modelos.";

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

  if (asksDeliveryDeadline) {
    const reply = "A producao e entrega dependem da fila de espera. Geralmente fica pronto de 8 a 24 horas apos pagamento e fechamento do pedido. Se voce aprovar esse pingente, eu sigo com entrega e pagamento.";

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_prazo",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "kate_prazo");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "kate_prazo",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "kate",
    });
  }
  if (hasPreview && !hasPreviewApproved && wantsPreviewRedo && effectiveMediaType !== "image") {
    delete data.kate_customer_photo_url;
    delete data.kate_preview_image_url;
    delete data.kate_preview_status;
    delete data.kate_preview_approved;

    const reply = "Claro. Me manda a nova foto que voce quer gravar, que eu preparo outra simulacao para voce.";

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

  if (hasPreview && !hasPreviewApproved && !wantsPreviewApproval && !wantsPreviewRedo && effectiveMediaType !== "image") {
    const reply = "Certo. Quer seguir com esse pingente, ver outros modelos ou mandar uma nova foto para refazer a simulacao?";

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

  if (hasPreview && !hasPreviewApproved) {
    if (effectiveMediaType === "image" && effectiveMediaUrl) {
      data.kate_customer_photo_url = effectiveMediaUrl;
      data.kate_preview_approved = false;

      if (!hasPreviewGenerationBudget(data)) {
        return await handoffPreviewLimitToHuman({
          supabase,
          conversation,
          phone,
          contactName,
          data,
          agent: "kate",
          productLabel: cleanCustomerProductName(data.selected_name),
        });
      }

      try {
        const previewImageUrl = await generateKatePreview({
          supabase,
          phone,
          selectedProduct: data.selected_product || {},
          customerPhotoUrl: effectiveMediaUrl,
        });

        data.kate_preview_image_url = previewImageUrl;
        data.kate_preview_status = "resent";
        registerPreviewGeneration(data, "kate");

        const reply = "Perfeito! Preparei uma nova simulação com essa foto para você conferir. Lembrando: essa imagem é apenas uma simulação; depois do fechamento, o vendedor envia a arte original para sua aprovação antes da gravação.";

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
        await updateCrmLeadStatus(supabase, phone, "venda_iniciada");

        return buildResponsePayload({
          phone,
          message: reply,
          node: "kate_preview",
          mediaItems: previewImageUrl
            ? [
                {
                  type: "image",
                  url: previewImageUrl,
                  caption: buildPendantResultCaption(data.selected_name),
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

    if (wantsPreviewRedo) {
      delete data.kate_customer_photo_url;
      delete data.kate_preview_image_url;
      delete data.kate_preview_status;
      delete data.kate_preview_approved;

      const reply = "Claro! Me manda outra foto que eu preparo uma nova simulacao para voce.";

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

    if (wantsPreviewApproval) {
      data.kate_preview_approved = true;
    } else {
      const reply =
        "Se essa simulacao ficou boa, me confirma que eu sigo para entrega e pagamento. Se preferir, voce tambem pode me mandar outra foto.";

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
    const reply = `Perfeito! Simulacao aprovada para *${cleanCustomerProductName(data.selected_name)}*.

Voce vai retirar na loja ou prefere delivery? Depois eu confirmo a forma de pagamento: Pix, Crediario Bemol ou cartao de credito.`;

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

  if (detectUnresolvedCommercialQuestion(message)) {
    data.kate_needs_human = true;
    data.agente_atual = "human";
    data.handoff_reason = "pergunta_comercial_nao_resolvida";
    const reply = "Para não te responder errado, vou chamar um vendedor para continuar daqui. Ele vai ver o modelo escolhido e sua dúvida no histórico.";

    await supabase
      .from("aline_conversations")
      .update({
        status: "human_takeover",
        active_agent: "human",
        assignment_reason: "Kate encaminhou pergunta comercial nao resolvida para humano",
        collected_data: data,
        last_message_at: new Date().toISOString(),
        agent_handoff_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "human_takeover");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);
    await updateCrmLeadStatus(supabase, phone, "humano");

    return buildResponsePayload({
      phone,
      message: reply,
      node: "human_takeover",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "human",
    });
  }
  const fallbackReply = "Se quiser, posso te reenviar os modelos ou preparar outra simulacao com uma nova foto.";

  if (data.kate_last_fallback_reply === fallbackReply) {
    data.kate_needs_human = true;
    data.agente_atual = "human";
    data.handoff_reason = "fallback_repetido_kate";
    const reply = "Para nao ficar repetindo resposta e te atrapalhar, vou chamar um vendedor para continuar daqui. Ele vai ver o modelo escolhido e o historico da conversa.";

    await supabase
      .from("aline_conversations")
      .update({
        status: "human_takeover",
        active_agent: "human",
        assignment_reason: "Kate encaminhou por fallback repetido",
        collected_data: data,
        last_message_at: new Date().toISOString(),
        agent_handoff_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "human_takeover");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);
    await updateCrmLeadStatus(supabase, phone, "humano");

    return buildResponsePayload({
      phone,
      message: reply,
      node: "human_takeover",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "human",
    });
  }

  data.kate_last_fallback_reply = fallbackReply;
  const reply = fallbackReply;

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

async function handleMaluFlow(args: {
  supabase: any;
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
  const existingData: AnyRecord = conversation.collected_data || {};
  const data: AnyRecord = {
    ...existingData,
    agente_atual: "malu",
    categoria: "oculos",
  };
  const shouldPreserveMaluColors =
    existingData.categoria === "oculos" ||
    existingData.agente_atual === "malu" ||
    isMaluFlowNode(currentNode);
  const preservedMaluColors = shouldPreserveMaluColors ? getRequestedColors(data) : [];
  const shouldSendInitialMaluIntro =
    !isMaluFlowNode(currentNode) &&
    !data.malu_intro_sent &&
    !data.catalogo_malu_enviado &&
    !data.selected_sku &&
    !data.selected_product?.id;
  const withMaluIntro = (reply: string) => {
    if (!shouldSendInitialMaluIntro || data.malu_intro_sent) return reply;
    data.malu_intro_sent = true;
    return `${buildAlineTransferIntro(contactName, "malu")}\n\n${reply}`;
  };

  if (!isMaluFlowNode(currentNode)) {
    resetMaluFlowState(data);
    if (preservedMaluColors.length > 0) {
      data.cores_solicitadas = preservedMaluColors;
      data.cor = preservedMaluColors[0];
    }
  }
  const maluColorChanged = applyDetectedColorsToData(data, message);
  if (!shouldPreserveMaluColors && !maluColorChanged) {
    delete data.cor;
    delete data.cores_solicitadas;
  }

  const selectionToken = [buttonResponseId, catalogSelectionHint, message].filter(Boolean).join(" ");
  const normalizedSelectionToken = normalizeText(selectionToken);
  const isChoiceText = /escolher este|quero este|escolher|quero esse|quero esse modelo|preview|previa|prévia|testar|provar/.test(normalizedSelectionToken);
  const isDetailsText = /ver mais|detalhes|mais detalhes/.test(normalizedSelectionToken);
  const forceCatalogRequest =
    data.malu_force_catalogo === true ||
    !isChoiceText &&
    !isDetailsText &&
    detectMaluCatalogRequest(message, buttonResponseId, catalogSelectionHint);
  const wantsFullCatalog = detectFullCatalogRequest(message);
  let selectedFromCatalog = findCatalogSelection(
    buttonResponseId || catalogSelectionHint || message,
    getCatalogSelectionPool(data),
  );
  if (!selectedFromCatalog && (isChoiceText || isDetailsText || (mediaType === "image" && mediaUrl))) {
    selectedFromCatalog = findSingleCatalogSelection(data);
  }
  const wantsDetails = /^details[_-]/i.test(String(buttonResponseId || "")) || isDetailsText;
  const wantsMoreOptions = detectMoreOptionsIntent(message) || /^more_options$/i.test(String(buttonResponseId || ""));
  const wantsCatalogResend = detectCatalogResendIntent(message) || wantsFullCatalog;
  const confirmsCatalogRequest = forceCatalogRequest;
  const explicitEyewearCatalogRequest =
    detectCategory(message, {}) === "oculos" || wantsCatalogResend || wantsMoreOptions || confirmsCatalogRequest;

  if (forceCatalogRequest || (explicitEyewearCatalogRequest && !selectedFromCatalog)) {
    delete data.selected_product;
    delete data.selected_sku;
    delete data.selected_name;
    delete data.selected_price;
    delete data.malu_customer_photo_url;
    delete data.malu_preview_image_url;
    delete data.malu_preview_status;
    delete data.malu_preview_approved;
    data.catalogo_malu_enviado = false;
    selectedFromCatalog = null;
  }

  if (selectedFromCatalog) {
    data.selected_product = selectedFromCatalog;
    data.selected_sku = selectedFromCatalog.sku || selectedFromCatalog.id;
    data.selected_name = selectedFromCatalog.name;
    data.selected_price = selectedFromCatalog.price;

    if (wantsDetails) {
      const reply = [
        `Claro! Esse é o *${selectedFromCatalog.name}*.`,
        selectedFromCatalog.description || null,
        selectedFromCatalog.color ? `Cor: ${selectedFromCatalog.color}` : null,
        selectedFromCatalog.price_formatted ? `Valor: ${selectedFromCatalog.price_formatted}` : null,
        "Se quiser testar no rosto, toque em Quero este ou me envie uma selfie de frente.",
      ].filter(Boolean).join("\n\n");

      await persistConversation(supabase, conversation.id, "malu", "malu_detalhes", conversation.current_node || null, data);
      await saveAssistantMessage(supabase, conversation.id, "malu", reply, "malu_detalhes");
      await saveAgentMemory(supabase, phone, "malu", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "malu_detalhes",
        selectedProduct: data.selected_product || null,
        collectedData: data,
        agent: "malu",
      });
    }
  }

  if (mediaType === "image" && mediaUrl && !data.malu_customer_photo_url) {
    data.malu_customer_photo_url = mediaUrl;
    data.tem_foto_cliente = true;
  }

  const hasSelectedProduct = !!(data.selected_sku || data.selected_product?.id);
  const hasPhoto = !!data.malu_customer_photo_url;
  const hasPreview = !!data.malu_preview_image_url;

  if (detectStoreAddressQuestion(message)) {
    if (hasSelectedProduct) data.delivery_method = "retirada";
    const nextLine = hasSelectedProduct
      ? "\n\nSe voce for retirar na loja, me confirma tambem a forma de pagamento: Pix, Crediario Bemol ou cartao de credito?"
      : "";
    const reply = detectStoreNameQuestion(message)
      ? `O nome da loja e ACIUM Manaus. Ficamos no Shopping Sumauma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM.${nextLine}`
      : `Nossa loja fica no Shopping Sumauma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM.${nextLine}`;

    await persistConversation(supabase, conversation.id, "malu", hasSelectedProduct ? "malu_pagamento" : "malu_endereco", conversation.current_node || null, data);
    await saveAssistantMessage(supabase, conversation.id, "malu", reply, "malu_endereco");
    await saveAgentMemory(supabase, phone, "malu", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: hasSelectedProduct ? "malu_pagamento" : "malu_endereco",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "malu",
    });
  }

  const fetchMaluCatalogCards = async (excludeSkus: string[] = []) => {
    const catalog = await searchCatalog(
      supabase,
      {
        category: "oculos",
        only_available: true,
        limit: 30,
        exclude_skus: excludeSkus,
      },
      data,
    );
    return buildMaluCards(catalog);
  };

  const buildMaluPreviewFromPhoto = async (customerPhotoUrl: string) => {
    try {
      const resolvedProduct = await resolveMaluSelectedProductForPreview(supabase, data);
      if (!resolvedProduct?.image_url && !resolvedProduct?.media_url) {
        throw new Error("Produto de oculos sem imagem resolvida para previa.");
      }

      if (!hasPreviewGenerationBudget(data)) {
        return await handoffPreviewLimitToHuman({
          supabase,
          conversation,
          phone,
          contactName,
          data,
          agent: "malu",
          productLabel: data.selected_name || resolvedProduct.name || "óculos escolhido",
        });
      }

      const previewImageUrl = await generateMaluPreview({
        supabase,
        phone,
        selectedProduct: resolvedProduct,
        customerPhotoUrl,
      });

      data.malu_preview_image_url = previewImageUrl;
      data.malu_preview_status = "sent";
      data.malu_preview_approved = false;
      registerPreviewGeneration(data, "malu");

      const resolvedName = data.selected_name || resolvedProduct.name || "escolhido";
      const reply = `Prontinho. Gerei uma prévia do modelo *${resolvedName}* em você.

Quer ficar com esse, testar outro modelo ou falar com atendente?`;

      await persistConversation(supabase, conversation.id, "malu", "malu_preview", conversation.current_node || null, data);
      await saveAssistantMessage(supabase, conversation.id, "malu", reply, "malu_preview");
      await saveAgentMemory(supabase, phone, "malu", contactName, data);
      await updateCrmLeadStatus(supabase, phone, "venda_iniciada");

      return buildResponsePayload({
        phone,
        message: reply,
        node: "malu_preview",
        mediaItems: previewImageUrl
          ? [
              {
                type: "image",
                url: previewImageUrl,
                caption: `Prévia do ${resolvedName}`,
              },
            ]
          : [],
        selectedProduct: data.selected_product || resolvedProduct || null,
        collectedData: data,
        agent: "malu",
        actionButtons: [
          { id: "malu_quero_esse", label: "Quero esse" },
          { id: "malu_testar_outro", label: "Testar outro" },
          { id: "retomar_atendimento", label: "Falar com atendente" },
        ],
      });
    } catch (error) {
      data.malu_preview_error = error instanceof Error
        ? error.message.slice(0, 700)
        : String(error).slice(0, 700);
      console.error("[ALINE-REPLY] Erro ao gerar prévia da Malu:", error);
      const reply = "Tive uma instabilidade para gerar sua prévia agora. Vou tentar novamente em instantes ou chamar um atendente para te ajudar.";

      await persistConversation(supabase, conversation.id, "malu", "malu_preview_falhou", conversation.current_node || null, data);
      await saveAssistantMessage(supabase, conversation.id, "malu", reply, "malu_preview_falhou");
      await saveAgentMemory(supabase, phone, "malu", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "malu_preview_falhou",
        selectedProduct: data.selected_product || null,
        collectedData: data,
        agent: "malu",
      });
    }
  };

  if (hasSelectedProduct && hasPhoto && !hasPreview) {
    return buildMaluPreviewFromPhoto(String(data.malu_customer_photo_url));
  }

  if (!hasSelectedProduct && (forceCatalogRequest || !data.catalogo_malu_enviado || wantsMoreOptions || wantsCatalogResend || confirmsCatalogRequest)) {
    const wasForcedMaluCatalog = data.malu_force_catalogo === true;
    delete data.malu_force_catalogo;
    const shownSkus = Array.isArray(data.last_catalog)
      ? data.last_catalog.map((item: any) => String(item?.sku || item?.id || "")).filter(Boolean)
      : [];
    const cards = await fetchMaluCatalogCards(wantsMoreOptions ? shownSkus : []);

    if (cards.length === 0) {
      const reply = "Oi, eu sou a Malu. No momento não encontrei modelos de óculos disponíveis no catálogo, mas posso chamar um atendente para te ajudar.";

      const finalReply = withMaluIntro(reply);
      await persistConversation(supabase, conversation.id, "malu", "malu_sem_catalogo", conversation.current_node || null, data);
      await saveAssistantMessage(supabase, conversation.id, "malu", finalReply, "malu_sem_catalogo");
      await saveAgentMemory(supabase, phone, "malu", contactName, data);

      return buildResponsePayload({
        phone,
        message: finalReply,
        node: "malu_sem_catalogo",
        collectedData: data,
        agent: "malu",
      });
    }

    data.catalogo_malu_enviado = true;
    data.last_catalog = cards.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      color: product.color,
      image_url: product.image_url,
      video_url: product.video_url,
      description: product.description,
    }));
    data.catalog_history = mergeCatalogHistory(data.catalog_history, data.last_catalog);

    const shouldUseShortCatalogIntro =
      wasForcedMaluCatalog ||
      data.malu_intro_sent ||
      data.catalogo_malu_enviado ||
      isMaluFlowNode(currentNode);
    const reply = wantsMoreOptions
      ? "Separei mais alguns modelos de óculos para você ver."
      : shouldUseShortCatalogIntro
        ? "Separei alguns modelos de oculos disponiveis para voce escolher."
        : `Oi, eu sou a Malu.
Vou te ajudar a escolher o óculos ideal.

Separei alguns modelos disponíveis. Você pode escolher um modelo ou me mandar uma selfie de frente para eu gerar uma prévia.`;

    const finalReply = withMaluIntro(reply);
    await persistConversation(supabase, conversation.id, "malu", "catalogo_oculos", conversation.current_node || null, data);
    await saveAssistantMessage(supabase, conversation.id, "malu", finalReply, "catalogo_oculos");
    await saveAgentMemory(supabase, phone, "malu", contactName, data);

    return buildResponsePayload({
      phone,
      message: finalReply,
      node: "catalogo_oculos",
      products: cards,
      collectedData: data,
      agent: "malu",
      useProductButtons: true,
      postCatalogMessage: "Gostou de algum modelo? Toque em Quero este que eu te peço a selfie para testar.",
    });
  }

  if (hasSelectedProduct && hasPhoto && !hasPreview) {
    return buildMaluPreviewFromPhoto(String(data.malu_customer_photo_url));
  }

  if (hasSelectedProduct && !hasPhoto) {
    if (mediaType === "image" && mediaUrl) {
      data.malu_customer_photo_url = mediaUrl;
      data.tem_foto_cliente = true;
      return buildMaluPreviewFromPhoto(mediaUrl);

      try {
        const previewImageUrl = await generateMaluPreview({
          supabase,
          phone,
          selectedProduct: data.selected_product || {},
          customerPhotoUrl: mediaUrl,
        });

        data.malu_preview_image_url = previewImageUrl;
        data.malu_preview_status = "sent";
        data.malu_preview_approved = false;

        const reply = `Prontinho. Gerei uma prévia do modelo *${data.selected_name}* em você.

Quer ficar com esse, testar outro modelo ou falar com atendente?`;

        await persistConversation(supabase, conversation.id, "malu", "malu_preview", conversation.current_node || null, data);
        await saveAssistantMessage(supabase, conversation.id, "malu", reply, "malu_preview");
        await saveAgentMemory(supabase, phone, "malu", contactName, data);
        await updateCrmLeadStatus(supabase, phone, "venda_iniciada");

        return buildResponsePayload({
          phone,
          message: reply,
          node: "malu_preview",
          mediaItems: previewImageUrl
            ? [
                {
                  type: "image",
                  url: previewImageUrl,
                  caption: `Prévia do ${data.selected_name || "óculos escolhido"}`,
                },
              ]
            : [],
          selectedProduct: data.selected_product || null,
          collectedData: data,
          agent: "malu",
          actionButtons: [
            { id: "malu_quero_esse", label: "Quero esse" },
            { id: "malu_testar_outro", label: "Testar outro" },
            { id: "retomar_atendimento", label: "Falar com atendente" },
          ],
        });
      } catch (error) {
        console.error("[ALINE-REPLY] Erro ao gerar prévia da Malu:", error);
        const reply = "Tive uma instabilidade para gerar sua prévia agora. Vou tentar novamente em instantes ou chamar um atendente para te ajudar.";

        await persistConversation(supabase, conversation.id, "malu", "malu_preview_falhou", conversation.current_node || null, data);
        await saveAssistantMessage(supabase, conversation.id, "malu", reply, "malu_preview_falhou");
        await saveAgentMemory(supabase, phone, "malu", contactName, data);

        return buildResponsePayload({
          phone,
          message: reply,
          node: "malu_preview_falhou",
          selectedProduct: data.selected_product || null,
          collectedData: data,
          agent: "malu",
        });
      }
    }

    const reply = `Perfeito. Você escolheu o modelo *${data.selected_name}*.

Agora me envie uma selfie de frente, com boa iluminação e sem óculos no rosto, que eu gero uma prévia para você.`;

    await persistConversation(supabase, conversation.id, "malu", "malu_selfie", conversation.current_node || null, data);
    await saveAssistantMessage(supabase, conversation.id, "malu", reply, "malu_selfie");
    await saveAgentMemory(supabase, phone, "malu", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "malu_selfie",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "malu",
    });
  }

  if (hasPreview) {
    const normalized = normalizeText([buttonResponseId, message].filter(Boolean).join(" "));
    if (/quero esse|malu_quero_esse|ficar com esse|vou ficar/.test(normalized)) {
      const reply = `Perfeito. Vou deixar anotado que você gostou do *${data.selected_name}* e chamar um atendente para finalizar com você.`;

      await persistConversation(supabase, conversation.id, "malu", "human_handoff_oculos", conversation.current_node || null, data);
      await saveAssistantMessage(supabase, conversation.id, "malu", reply, "human_handoff_oculos");
      await saveAgentMemory(supabase, phone, "malu", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "human_handoff_oculos",
        selectedProduct: data.selected_product || null,
        collectedData: data,
        agent: "malu",
      });
    }

    if (/testar outro|malu_testar_outro|outro modelo|ver outros|mais modelos/.test(normalized)) {
      delete data.selected_product;
      delete data.selected_sku;
      delete data.selected_name;
      delete data.selected_price;
      delete data.malu_customer_photo_url;
      delete data.malu_preview_image_url;
      delete data.malu_preview_status;
      delete data.malu_preview_approved;
      data.catalogo_malu_enviado = false;

      return handleMaluFlow({
        ...args,
        conversation: {
          ...conversation,
          collected_data: data,
          current_node: "malu_reiniciar_catalogo",
        },
        message: "mostrar modelos",
        buttonResponseId: null,
        catalogSelectionHint: null,
        mediaType: null,
        mediaUrl: null,
      });
    }

    const reply = "Quer ficar com esse, testar outro modelo ou falar com atendente?";

    await persistConversation(supabase, conversation.id, "malu", "malu_preview", conversation.current_node || null, data);
    await saveAssistantMessage(supabase, conversation.id, "malu", reply, "malu_preview");
    await saveAgentMemory(supabase, phone, "malu", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "malu_preview",
      selectedProduct: data.selected_product || null,
      collectedData: data,
      agent: "malu",
    });
  }

  data.catalogo_malu_enviado = false;
  return handleMaluFlow({
    ...args,
    conversation: {
      ...conversation,
      active_agent: "malu",
      current_node: "malu_forcar_catalogo",
      collected_data: data,
    },
    message: "ver modelos",
    buttonResponseId: null,
    catalogSelectionHint: null,
    mediaType: null,
    mediaUrl: null,
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
  const existingData: AnyRecord = conversation.collected_data || {};
  const detectedAllianceType = detectAllianceType(message, existingData);
  const data: AnyRecord = {
    ...existingData,
    agente_atual: "keila",
    categoria: "aliancas",
    finalidade: detectedAllianceType || existingData.finalidade || "casamento",
  };
  const preservedAllianceColors = getRequestedColors(data, ["dourada", "prata", "preta", "azul"]);
  const shouldSendInitialKeilaIntro =
    !isKeilaFlowNode(currentNode) &&
    !data.keila_intro_sent &&
    !data.catalogo_keila_enviado &&
    !data.selected_sku &&
    !data.selected_product?.id;
  const withKeilaIntro = (reply: string) => {
    if (!shouldSendInitialKeilaIntro || data.keila_intro_sent) return reply;
    data.keila_intro_sent = true;
    return `${buildAlineTransferIntro(contactName, "keila")}\n\n${reply}`;
  };

  if (!isKeilaFlowNode(currentNode) || data.keila_force_catalogo === true) {
    resetKeilaFlowState(data);
    if (preservedAllianceColors.length > 0) {
      data.cores_solicitadas = preservedAllianceColors;
      data.cor = preservedAllianceColors[0];
    }
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
  if (
    !budget &&
    String(currentNode || "").includes("orcamento") &&
    /nao sei|não sei|ainda nao sei|ainda não sei|sem ideia|nao tenho|não tenho/.test(normalizeText(message))
  ) {
    data.orcamento_texto = "sem_orcamento_definido";
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

  const colorChanged = applyDetectedColorsToData(data, message, ["dourada", "prata", "preta", "azul"]);
  if (colorChanged) {
    resetCatalogChoice(data);
  }

  const keilaNode = normalizeText(currentNode);
  const hasKeilaCatalogContext =
    /catalogo|selecao|sem_mais_opcoes|sem_catalogo|cor/.test(keilaNode) ||
    getRequestedColors(data, ["dourada", "prata", "preta", "azul"]).length > 0;
  const confirmsKeilaCatalogContext =
    hasKeilaCatalogContext && /^(sim|s|ok|pode|claro|beleza|ta bom)$/.test(normalizeText(message));
  const wantsBroadKeilaCatalog = detectFullCatalogRequest(message) || data.keila_force_catalogo === true;
  const wantsKeilaCatalogNow =
    wantsBroadKeilaCatalog ||
    confirmsKeilaCatalogContext ||
    detectKeilaCatalogNowIntent(message) ||
    detectCatalogIntent(message);
  const detectedColorsInMessage = detectColors(message).filter((color) => ["dourada", "prata", "preta", "azul"].includes(color));
  const requestedColors = wantsBroadKeilaCatalog && detectedColorsInMessage.length === 0
    ? []
    : getRequestedColors(data, ["dourada", "prata", "preta", "azul"]);
  const requestedColorLabel = formatColorList(requestedColors);
  const colorPhrase = wantsBroadKeilaCatalog && requestedColors.length === 0
    ? "disponiveis"
    : requestedColors.length > 1
    ? `nas cores ${requestedColorLabel}`
    : `na cor ${requestedColorLabel || data.cor || "solicitada"}`;
  const isDatingAlliance = data.finalidade === "namoro";
  const hasTimeline = wantsKeilaCatalogNow || isDatingAlliance || !!data.prazo_fechamento;
  const hasBudget = wantsKeilaCatalogNow || isDatingAlliance || !!data.orcamento_valor || !!data.orcamento_texto;
  const hasQuantityType = wantsKeilaCatalogNow || isDatingAlliance || !!data.quantidade_tipo;
  const hasSizeInfo = wantsKeilaCatalogNow || isDatingAlliance || !!data.tamanho_1 || data.numeracao_status === "nao_sabe";
  const hasColor = wantsKeilaCatalogNow || requestedColors.length > 0;
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
  const wantsCatalogResend = detectCatalogResendIntent(message) || wantsKeilaCatalogNow;
  const wantsMoreOptions = detectMoreOptionsIntent(message);
  const asksPrice = detectPriceQuestion(message) || detectPriceIntent(message);
  const mentionsExternalReference = /foto|imagem|print|anuncio|anúncio|publicacao|publicação|post|stories|story|reels|video|vídeo/.test(
    normalizeText(message),
  );

  const fetchKeilaCatalogCards = async (excludeSkus: string[] = []) => {
    const searchParams: AnyRecord = {
      category: "aliancas",
      only_available: true,
    };

    if (requestedColors.length > 0) {
      searchParams.colors = requestedColors;
      if (requestedColors.length === 1) searchParams.color = requestedColors[0];
    }

    if (excludeSkus.length > 0) {
      searchParams.exclude_skus = excludeSkus;
    }

    if (Number.isFinite(Number(data.orcamento_valor || 0)) && Number(data.orcamento_valor || 0) > 0) {
      const budgetValue = Number(data.orcamento_valor || 0);
      searchParams.max_price = data.quantidade_tipo === "par" ? budgetValue / 2 : budgetValue;
    }

    let catalog = await searchCatalog(supabase, searchParams, data);
    let usedBudgetFallback = false;
    let usedPurposeFallback = false;

    if (catalog.length === 0 && searchParams.max_price) {
      const relaxedSearchParams = { ...searchParams };
      delete relaxedSearchParams.max_price;
      catalog = await searchCatalog(supabase, relaxedSearchParams, data);
      usedBudgetFallback = catalog.length > 0;
    }

    if (catalog.length === 0 && data.finalidade) {
      const broadPurposeData = {
        ...data,
        finalidade: "",
      };
      const broadSearchParams = { ...searchParams };
      delete broadSearchParams.max_price;
      catalog = await searchCatalog(supabase, broadSearchParams, broadPurposeData);
      usedPurposeFallback = catalog.length > 0;
    }

    return {
      cards: buildKeilaCards(catalog),
      usedBudgetFallback,
      usedPurposeFallback,
    };
  };

  if (!hasTimeline) {
    const reply = "Oi! Sou a Keila. Para quando você quer fechar essas alianças?";
    const finalReply = withKeilaIntro(reply);

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_prazo",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", finalReply, "keila_prazo");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: finalReply,
      node: "keila_prazo",
      collectedData: data,
      agent: "keila",
    });
  }

  if (!hasBudget) {
    const reply = "Perfeito! E quanto você quer investir nas alianças? 💰";
    const finalReply = withKeilaIntro(reply);

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_orcamento",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", finalReply, "keila_orcamento");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: finalReply,
      node: "keila_orcamento",
      collectedData: data,
      agent: "keila",
    });
  }

  if (!hasQuantityType) {
    const reply = "Você quer o par ou só a unidade? 💍";
    const finalReply = withKeilaIntro(reply);

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_par_ou_unidade",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", finalReply, "keila_par_ou_unidade");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: finalReply,
      node: "keila_par_ou_unidade",
      collectedData: data,
      agent: "keila",
    });
  }

  if (!hasSizeInfo) {
    const reply =
      "E qual a numeração? Se você ainda não souber agora, tudo bem, eu sigo com você mesmo assim 😊";
    const finalReply = withKeilaIntro(reply);

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_numeracao",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", finalReply, "keila_numeracao");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: finalReply,
      node: "keila_numeracao",
      collectedData: data,
      agent: "keila",
    });
  }

  if (!hasColor) {
    const reply = "Antes de eu te mostrar, qual cor você prefere: dourada, prata, preta ou azul? 🎨";
    const finalReply = withKeilaIntro(reply);

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_cor",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", finalReply, "keila_cor");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: finalReply,
      node: "keila_cor",
      collectedData: data,
      agent: "keila",
    });
  }

  if (!data.catalogo_keila_enviado) {
    delete data.keila_force_catalogo;
    const { cards, usedBudgetFallback, usedPurposeFallback } = await fetchKeilaCatalogCards();

    if (cards.length === 0) {
      const reply = `Não encontrei modelos prontos ${colorPhrase} dentro dessa faixa agora. Se quiser, eu posso te mostrar outra faixa de valor ou outra cor.`;
      const finalReply = withKeilaIntro(reply);

      await persistConversation(
        supabase,
        conversation.id,
        "keila",
        "keila_sem_catalogo",
        conversation.current_node || null,
        data,
      );
      await saveAssistantMessage(supabase, conversation.id, "keila", finalReply, "keila_sem_catalogo");
      await saveAgentMemory(supabase, phone, "keila", contactName, data);

      return buildResponsePayload({
        phone,
        message: finalReply,
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
        ? `Não encontrei modelos ${colorPhrase} exatamente dentro dessa faixa de valor, mas separei outras opções disponíveis da mesma categoria para te mostrar. 💍`
        : usedPurposeFallback
          ? `Não encontrei modelos ${colorPhrase} com esse filtro exato, mas separei outras opções compatíveis para te mostrar. 💍`
          : `Separei opções ${colorPhrase}. 💍`
    }
O valor do card é da unidade. O par sai pelo dobro.`;
    const finalReply = withKeilaIntro(reply);

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "catalogo",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", finalReply, "catalogo");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: finalReply,
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

    const { cards, usedBudgetFallback, usedPurposeFallback } = await fetchKeilaCatalogCards(wantsMoreOptions ? shownSkus : []);

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
              ? `Tenho outras opções ${colorPhrase}, incluindo modelos fora dessa faixa exata para você comparar. 💍`
              : usedPurposeFallback
                ? `Tenho outras opções compatíveis ${colorPhrase} para te mostrar. 💍`
                : `Tenho outras opções ${colorPhrase} para te mostrar. 💍`
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

  if (!hasSelectedProduct && asksPrice) {
    const singleOption = findSingleCatalogSelection(data);

    if (singleOption?.price) {
      data.selected_product = singleOption;
      data.selected_sku = singleOption.sku || singleOption.id;
      data.selected_name = singleOption.name;
      data.selected_price = singleOption.price;

      const reply = `${cleanCustomerProductName(singleOption.name)} fica ${formatCurrency(singleOption.price)} a unidade. O par sai pelo dobro. Se for esse modelo mesmo, me confirma que eu sigo com entrega e pagamento.`;

      await persistConversation(
        supabase,
        conversation.id,
        "keila",
        "keila_valor_modelo_unico",
        conversation.current_node || null,
        data,
      );
      await saveAssistantMessage(supabase, conversation.id, "keila", reply, "keila_valor_modelo_unico");
      await saveAgentMemory(supabase, phone, "keila", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
        node: "keila_valor_modelo_unico",
        selectedProduct: data.selected_product || null,
        collectedData: data,
        agent: "keila",
      });
    }

    const reply = mentionsExternalReference
      ? "Consigo verificar pra voce, mas preciso identificar qual e o modelo da foto/anuncio. Me envia o print ou a foto desse anuncio aqui, que eu confirmo o valor certinho sem chutar."
      : "Consigo te passar o valor certinho, mas preciso saber qual modelo voce quer. Toque em Quero esta no card escolhido ou me envie a foto/modelo que voce viu.";

    await persistConversation(
      supabase,
      conversation.id,
      "keila",
      "keila_aguardando_referencia_valor",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "keila", reply, "keila_aguardando_referencia_valor");
    await saveAgentMemory(supabase, phone, "keila", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "keila_aguardando_referencia_valor",
      collectedData: data,
      agent: "keila",
    });
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

async function handleGeneralCatalogRequest(args: {
  supabase: any;
  conversation: any;
  phone: string;
  contactName: string;
  data: AnyRecord;
}) {
  const { supabase, conversation, phone, contactName, data } = args;
  const catalogSearchData = {
    ...data,
    categoria: null,
    cor: null,
    cores_solicitadas: [],
    finalidade: null,
  };
  const products = await searchCatalog(supabase, { only_available: true }, catalogSearchData);
  const cards = buildGeneralCatalogCards(products);

  if (cards.length === 0) {
    const reply = "Nao encontrei produtos ativos no catalogo agora. Vou chamar um vendedor para verificar para voce.";
    data.agente_atual = "human";
    data.customer_stage = "aguardando_humano_catalogo";
    data.handoff_reason = "catalogo_geral_sem_produtos";

    await persistConversation(
      supabase,
      conversation.id,
      "human",
      "human_catalogo_sem_produtos",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "human", reply, "human_catalogo_sem_produtos");

    return buildResponsePayload({
      phone,
      message: reply,
      node: "human_catalogo_sem_produtos",
      collectedData: data,
      agent: "human",
    });
  }

  data.catalogo_geral_enviado = true;
  data.last_catalog = cards.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    price: product.price,
    price_formatted: product.price_formatted,
    category: product.category,
    color: product.color,
    description: product.description,
    image_url: product.image_url,
    video_url: product.video_url,
  }));
  data.catalog_history = mergeCatalogHistory(data.catalog_history, data.last_catalog);
  data.customer_stage = "catalogo_geral_enviado";

  const reply = "Claro. Vou te mandar os produtos ativos do catalogo para voce escolher. Toque em Quero este no produto que gostar que eu sigo com o agente certo.";
  const postCatalogMessage = "Gostou de algum modelo? Toque em Quero este no card escolhido que eu sigo com voce.";

  await persistConversation(
    supabase,
    conversation.id,
    "aline",
    "catalogo_geral",
    conversation.current_node || null,
    data,
  );
  await saveAssistantMessage(supabase, conversation.id, "aline", reply, "catalogo_geral");
  await saveAgentMemory(supabase, phone, "aline", contactName, data);

  return buildResponsePayload({
    phone,
    message: reply,
    node: "catalogo_geral",
    products: cards,
    collectedData: data,
    agent: "aline",
    useProductButtons: true,
    postCatalogMessage,
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
    const phone = normalizeWhatsappPhone(body.phone || "");
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

    const activeAgent = (conversation.active_agent || baseData.agente_atual || "aline") as ConversationAgent;
    const normalizedInboundMessage = normalizeText(message);

    if (mediaType === "audio" && /audio recebido|audio nao reconhecido|audio sem fala|transcricao indisponivel/.test(normalizedInboundMessage)) {
      baseData.needs_human_audio = true;
      baseData.agente_atual = "human";

      const reply = "Recebi seu audio. Para nao te responder errado, vou chamar um vendedor para ouvir e continuar seu atendimento por aqui.";

      await supabase
        .from("aline_conversations")
        .update({
          status: "human_takeover",
          active_agent: "human",
          assignment_reason: "Audio recebido sem transcricao automatica",
          collected_data: baseData,
          last_message_at: new Date().toISOString(),
          agent_handoff_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);

      await saveAssistantMessage(supabase, conversation.id, activeAgent, reply, "human_takeover_audio");
      await saveAgentMemory(supabase, phone, activeAgent, contactName, baseData);
      await updateCrmLeadStatus(supabase, phone, "humano");

      return buildResponsePayload({
        phone,
        message: reply,
        node: "human_takeover_audio",
        selectedProduct: baseData.selected_product || null,
        collectedData: baseData,
        agent: "human",
      });
    }

    const systemContext = await buildAgentSystemContext({
      supabase,
      conversationId: conversation.id,
      phone,
      normalizedMessage: {
        phone,
        text: inboundText,
        originalText: message,
        buttonResponseId,
        buttonText: catalogSelectionHint,
        mediaType,
        mediaUrl,
        hasMedia: !!mediaUrl || !!mediaType,
      },
      activeAgent,
    });
    const systemContextSummary = getAgentSystemContextSummary(systemContext);
    baseData.agent_system_context = systemContextSummary;
    baseData.store_rules = systemContext.storeRules;
    if (systemContext.humanContext?.summary) {
      baseData.human_chat_summary = systemContext.humanContext.summary;
    }

    if (systemContext.selectedProduct) {
      if (!baseData.selected_product && systemContext.selectedProduct.raw) {
        baseData.selected_product = systemContext.selectedProduct.raw;
      }
      if (!baseData.selected_sku && systemContext.selectedProduct.sku) {
        baseData.selected_sku = systemContext.selectedProduct.sku;
      }
      if (!baseData.selected_name && systemContext.selectedProduct.name) {
        baseData.selected_name = systemContext.selectedProduct.name;
      }
      if (!baseData.selected_price && systemContext.selectedProduct.price) {
        baseData.selected_price = systemContext.selectedProduct.price;
      }
    }

    if (!Array.isArray(baseData.catalog_history) && systemContext.recentCatalog.length > 0) {
      baseData.catalog_history = systemContext.recentCatalog;
    }

    if (systemContext.mediaContext.lastCustomerImage && !baseData.last_customer_image_url) {
      baseData.last_customer_image_url = systemContext.mediaContext.lastCustomerImage;
    }
    if (systemContext.mediaContext.lastCustomerAudio && !baseData.last_customer_audio_url) {
      baseData.last_customer_audio_url = systemContext.mediaContext.lastCustomerAudio;
    }
    if (systemContext.mediaContext.lastCustomerDocument && !baseData.last_customer_document_url) {
      baseData.last_customer_document_url = systemContext.mediaContext.lastCustomerDocument;
    }
    if (systemContext.safetyFlags.isHarassment) {
      baseData.harassment_detected = true;
    }
    if (systemContext.handoffContext.shouldHandoff) {
      baseData.pending_handoff_context = systemContext.handoffContext;
    }

    console.log("[ALINE-REPLY] agent_system_context", {
      route_decision: "context_loaded",
      active_agent_before: activeAgent,
      detected_intent: baseData.triagem_categoria || baseData.categoria || null,
      selected_product_id: systemContext.selectedProduct?.id || null,
      handoff_reason: systemContext.handoffContext.reason || null,
      catalog_count: systemContext.recentCatalog.length,
      media_type: mediaType || null,
    });

    const recentCrmContext = await loadRecentCrmMessageContext(supabase, phone);
    if (recentCrmContext) {
      baseData.recent_crm_context = recentCrmContext;
    }

    const imageUnderstanding = mediaType === "image" && mediaUrl
      ? await analyzeInboundImageWithOpenAI({
          imageUrl: mediaUrl,
          text: inboundText,
          data: baseData,
          activeAgent,
        })
      : null;

    if (imageUnderstanding) {
      baseData.last_image_understanding = imageUnderstanding;
      if (imageUnderstanding.kind === "product_reference" && imageUnderstanding.product_category) {
        baseData.inbound_product_reference_url = mediaUrl;
      }
    }

    const useImageAsCustomerPhoto = shouldUseInboundImageAsCustomerPhoto({
      mediaType,
      imageUnderstanding,
      data: baseData,
      activeAgent,
      currentNode: conversation.current_node || "",
    });
    const mediaTypeForAgent = mediaType === "image" && !useImageAsCustomerPhoto ? null : mediaType;
    const mediaUrlForAgent = mediaType === "image" && !useImageAsCustomerPhoto ? null : mediaUrl;

    let explicitCategory = detectCategory(inboundText, {});
    if (!explicitCategory && imageUnderstanding?.kind === "product_reference" && imageUnderstanding.product_category) {
      explicitCategory = imageUnderstanding.product_category;
    }
    const recentHasKatePendantPrompt = !explicitCategory && recentContextHasKatePendantPrompt(recentCrmContext);
    const recentHasMaluEyewearPrompt = !explicitCategory && recentContextHasMaluEyewearPrompt(recentCrmContext);
    const recentHasKeilaAlliancePrompt = !explicitCategory && recentContextHasKeilaAlliancePrompt(recentCrmContext);
    const recentContextCategory = !explicitCategory
      ? detectCategory(recentCrmContext || "", {})
      : null;
    baseData.categoria = explicitCategory || recentContextCategory || detectCategory(inboundText, baseData) || baseData.categoria || null;
    if (!explicitCategory && (recentContextCategory === "pingente" || recentHasKatePendantPrompt)) {
      baseData.agente_atual = "kate";
      baseData.categoria = "pingente";
      baseData.catalogo_kate_enviado = baseData.catalogo_kate_enviado ?? true;
    }
    if (!explicitCategory && (recentContextCategory === "oculos" || recentHasMaluEyewearPrompt)) {
      baseData.agente_atual = "malu";
      baseData.categoria = "oculos";
      baseData.catalogo_malu_enviado = baseData.catalogo_malu_enviado ?? true;
    }
    if (!explicitCategory && (recentContextCategory === "aliancas" || recentContextCategory === "aneis" || recentHasKeilaAlliancePrompt)) {
      baseData.agente_atual = "keila";
      baseData.categoria = recentContextCategory === "aneis" ? "aneis" : "aliancas";
      baseData.catalogo_keila_enviado = baseData.catalogo_keila_enviado ?? true;
    }
    if (!explicitCategory && !baseData.catalogo_geral_enviado && catalogHasAgentProduct(baseData, "kate")) {
      baseData.agente_atual = "kate";
      baseData.categoria = "pingente";
      baseData.catalogo_kate_enviado = baseData.catalogo_kate_enviado ?? true;
    }
    if (!explicitCategory && !baseData.catalogo_geral_enviado && catalogHasAgentProduct(baseData, "malu")) {
      baseData.agente_atual = "malu";
      baseData.categoria = "oculos";
      baseData.catalogo_malu_enviado = baseData.catalogo_malu_enviado ?? true;
    }
    if (!explicitCategory && !baseData.catalogo_geral_enviado && catalogHasAgentProduct(baseData, "keila")) {
      baseData.agente_atual = "keila";
      baseData.categoria = baseData.categoria === "aneis" ? "aneis" : "aliancas";
      baseData.catalogo_keila_enviado = baseData.catalogo_keila_enviado ?? true;
    }
    baseData.finalidade = detectAllianceType(inboundText, baseData) || baseData.finalidade || null;
    applyDetectedColorsToData(baseData, inboundText);
    baseData.triagem_categoria = detectClassification(inboundText, baseData) || baseData.triagem_categoria || null;

    if (imageUnderstanding?.kind === "inappropriate") {
      baseData.harassment_detected = true;
      baseData.last_intent = "assedio_imagem";
      baseData.customer_stage = "seguranca_assedio";

      const reply = "Esta conversa foi registrada com seu numero e as mensagens recebidas. Mensagens de assedio nao serao atendidas. Nossa equipe responsavel foi acionada e, se continuar, o caso sera encaminhado as autoridades competentes, incluindo a policia.";

      await persistConversation(
        supabase,
        conversation.id,
        activeAgent,
        "seguranca_assedio",
        conversation.current_node || null,
        baseData,
      );
      await saveAssistantMessage(supabase, conversation.id, activeAgent, reply, "seguranca_assedio");

      return new Response(
        JSON.stringify(
          buildResponsePayload({
            phone,
            message: reply,
            node: "seguranca_assedio",
            collectedData: baseData,
            agent: activeAgent,
          }),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (imageUnderstanding?.kind === "payment_document") {
      baseData.agente_atual = "human";
      baseData.handoff_reason = "imagem_comprovante_documento";
      const reply = "Recebi o arquivo. Vou chamar um vendedor para conferir e continuar com seguranca por aqui.";

      await supabase
        .from("aline_conversations")
        .update({
          status: "human_takeover",
          active_agent: "human",
          assignment_reason: "Cliente enviou comprovante/documento por imagem",
          collected_data: baseData,
          current_node: "human_documento",
          last_message_at: new Date().toISOString(),
          agent_handoff_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);
      await saveAssistantMessage(supabase, conversation.id, "human", reply, "human_documento");
      await saveAgentMemory(supabase, phone, "aline", contactName, baseData);
      await updateCrmLeadStatus(supabase, phone, "humano");

      return new Response(
        JSON.stringify(
          buildResponsePayload({
            phone,
            message: reply,
            node: "human_documento",
            collectedData: baseData,
            agent: "human",
          }),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Imagem de referencia de produto que o bot nao atende no fluxo automatico
    // (ex.: chaveiro, ou qualquer categoria fora de pingente/oculos/aliancas/aneis).
    // Em vez de tratar como selfie do cliente ou ficar em silencio, reconhecemos a
    // imagem e encaminhamos para humano com mensagem-ponte, sem deixar o cliente no vacuo.
    const imageProductCategory = imageUnderstanding?.kind === "product_reference"
      ? imageUnderstanding.product_category
      : null;
    const imageReferenceUnsupported =
      imageProductCategory === "chaveiro" ||
      (!!imageProductCategory && !["pingente", "oculos", "aliancas", "aneis"].includes(imageProductCategory));

    if (imageReferenceUnsupported) {
      baseData.categoria = imageProductCategory;
      baseData.agente_atual = "human";
      baseData.handoff_reason = "imagem_produto_referencia_sem_fluxo";
      const reply = imageProductCategory === "chaveiro"
        ? "Recebi a foto do chaveiro que voce enviou 📷. Esse tipo de peca a gente faz sob personalizacao, entao ja vou chamar um vendedor para te mostrar opcoes parecidas e seguir com voce."
        : "Recebi a foto que voce enviou 📷. Para nao te passar informacao errada sobre essa peca, ja vou chamar um vendedor para identificar o modelo, confirmar disponibilidade e seguir com voce.";

      await supabase
        .from("aline_conversations")
        .update({
          status: "human_takeover",
          active_agent: "human",
          assignment_reason: "Cliente enviou foto de produto fora do fluxo automatico (ex.: chaveiro)",
          collected_data: baseData,
          current_node: "human_imagem_produto",
          last_message_at: new Date().toISOString(),
          agent_handoff_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);
      await saveAssistantMessage(supabase, conversation.id, "human", reply, "human_imagem_produto");
      await saveAgentMemory(supabase, phone, "aline", contactName, baseData);
      await updateCrmLeadStatus(supabase, phone, "humano");

      return new Response(
        JSON.stringify(
          buildResponsePayload({
            phone,
            message: reply,
            node: "human_imagem_produto",
            collectedData: baseData,
            agent: "human",
          }),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const unsupportedAccessoryFromMessage =
      detectUnsupportedAccessoryIntent(inboundText) ||
      (imageUnderstanding?.kind === "product_reference" && detectUnsupportedAccessoryIntent(recentCrmContext || ""));

    if (unsupportedAccessoryFromMessage) {
      baseData.categoria = "acessorio";
      baseData.agente_atual = "human";
      baseData.handoff_reason = "produto_acessorio_sem_fluxo";
      const reply = "Recebi sua duvida sobre essa peca. Para nao te passar informacao errada, vou chamar um vendedor para identificar o produto, confirmar disponibilidade e seguir com voce.";

      await supabase
        .from("aline_conversations")
        .update({
          status: "human_takeover",
          active_agent: "human",
          assignment_reason: "Cliente perguntou por acessorio fora do fluxo automatico",
          collected_data: baseData,
          current_node: "human_acessorio",
          last_message_at: new Date().toISOString(),
          agent_handoff_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);
      await saveAssistantMessage(supabase, conversation.id, "human", reply, "human_acessorio");
      await saveAgentMemory(supabase, phone, "aline", contactName, baseData);
      await updateCrmLeadStatus(supabase, phone, "humano");

      return new Response(
        JSON.stringify(
          buildResponsePayload({
            phone,
            message: reply,
            node: "human_acessorio",
            collectedData: baseData,
            agent: "human",
          }),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (imageUnderstanding?.kind === "product_reference") {
      baseData.agente_atual = "human";
      baseData.handoff_reason = "referencia_produto_nao_identificada";
      const reply = "Recebi a foto como referencia de produto. Para nao te passar informacao errada, vou chamar um vendedor para identificar a peca e seguir com voce.";

      await supabase
        .from("aline_conversations")
        .update({
          status: "human_takeover",
          active_agent: "human",
          assignment_reason: "Cliente enviou referencia de produto nao identificada pelo agente",
          collected_data: baseData,
          current_node: "human_produto_referencia",
          last_message_at: new Date().toISOString(),
          agent_handoff_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);
      await saveAssistantMessage(supabase, conversation.id, "human", reply, "human_produto_referencia");
      await saveAgentMemory(supabase, phone, "aline", contactName, baseData);
      await updateCrmLeadStatus(supabase, phone, "humano");

      return new Response(
        JSON.stringify(
          buildResponsePayload({
            phone,
            message: reply,
            node: "human_produto_referencia",
            collectedData: baseData,
            agent: "human",
          }),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (imageUnderstanding?.kind === "unclear" && mediaType === "image" && !inboundText && !baseData.selected_sku) {
      const reply = "Recebi a imagem. Ela e uma foto para simulacao, uma referencia de produto ou uma duvida? Me diga rapidinho que eu sigo certo.";
      baseData.last_intent = "imagem_indefinida";
      baseData.customer_stage = "aguardando_contexto_imagem";

      await persistConversation(
        supabase,
        conversation.id,
        activeAgent,
        "imagem_indefinida",
        conversation.current_node || null,
        baseData,
      );
      await saveAssistantMessage(supabase, conversation.id, activeAgent, reply, "imagem_indefinida");

      return new Response(
        JSON.stringify(
          buildResponsePayload({
            phone,
            message: reply,
            node: "imagem_indefinida",
            collectedData: baseData,
            agent: activeAgent,
          }),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (detectKeychainIntent(inboundText) || explicitCategory === "chaveiro") {
      baseData.categoria = "chaveiro";
      baseData.agente_atual = "human";
      baseData.handoff_reason = "produto_chaveiro_sem_fluxo";
      const reply = "Perfeito, vou chamar um vendedor para te ajudar com chaveiro. Esse produto ainda nao esta no atendimento automatico, entao ele continua com voce pelo humano.";

      await supabase
        .from("aline_conversations")
        .update({
          status: "human_takeover",
          active_agent: "human",
          assignment_reason: "Cliente pediu chaveiro; produto sem fluxo automatico",
          collected_data: baseData,
          current_node: "human_chaveiro",
          last_message_at: new Date().toISOString(),
          agent_handoff_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);
      await saveAssistantMessage(supabase, conversation.id, "human", reply, "human_chaveiro");
      await saveAgentMemory(supabase, phone, "aline", contactName, baseData);
      await updateCrmLeadStatus(supabase, phone, "humano");

      return new Response(
        JSON.stringify(
          buildResponsePayload({
            phone,
            message: reply,
            node: "human_chaveiro",
            collectedData: baseData,
            agent: "human",
          }),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (detectHarassmentIntent(inboundText)) {
      baseData.harassment_detected = true;
      baseData.last_intent = "assedio";
      baseData.customer_stage = "seguranca_assedio";

      const reply = "Esta conversa foi registrada com seu numero e as mensagens recebidas. Mensagens de assedio nao serao atendidas. Nossa equipe responsavel foi acionada e, se continuar, o caso sera encaminhado as autoridades competentes, incluindo a policia.";

      await persistConversation(
        supabase,
        conversation.id,
        activeAgent,
        "seguranca_assedio",
        conversation.current_node || null,
        baseData,
      );
      await saveAssistantMessage(supabase, conversation.id, activeAgent, reply, "seguranca_assedio");

      return new Response(
        JSON.stringify(
          buildResponsePayload({
            phone,
            message: reply,
            node: "seguranca_assedio",
            collectedData: baseData,
            agent: activeAgent,
          }),
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const alineMemory = await loadAgentMemory(supabase, phone, "aline");
    const kateMemory = await loadAgentMemory(supabase, phone, "kate");
    const keilaMemory = await loadAgentMemory(supabase, phone, "keila");
    const maluMemory = await loadAgentMemory(supabase, phone, "malu");

    const wantsFullCatalogMain = detectFullCatalogRequest(inboundText);
    let selectedFromCatalogContext = findCatalogSelection(
      buttonResponseId || catalogSelectionHint || inboundText,
      getCatalogSelectionPool(baseData),
    );
    if (
      !selectedFromCatalogContext &&
      detectChoiceIntent(inboundText, buttonResponseId, catalogSelectionHint)
    ) {
      selectedFromCatalogContext = await findRecentCrmCatalogSelection(supabase, phone, baseData);
      if (selectedFromCatalogContext) {
        baseData.selected_product_source = "recent_crm_catalog_card";
      }
    }
    const selectedContextAgent = inferAgentFromProduct(selectedFromCatalogContext);

    if (selectedFromCatalogContext) {
      baseData.selected_product = selectedFromCatalogContext;
      baseData.selected_sku = selectedFromCatalogContext.sku || selectedFromCatalogContext.id || null;
      baseData.selected_name = selectedFromCatalogContext.name || null;
      baseData.selected_price = selectedFromCatalogContext.price ?? null;
      baseData.last_catalog = mergeCatalogHistory(baseData.last_catalog, [selectedFromCatalogContext]);
      baseData.catalog_history = mergeCatalogHistory(baseData.catalog_history, [selectedFromCatalogContext]);

      if (selectedContextAgent === "kate") baseData.categoria = "pingente";
      if (selectedContextAgent === "malu") baseData.categoria = "oculos";
      if (selectedContextAgent === "keila") baseData.categoria = "aliancas";
    }

    const forceKateCatalogFromRequest =
      explicitCategory === "pingente" &&
      !selectedContextAgent &&
      (
        detectCatalogIntent(inboundText) ||
        detectFullCatalogRequest(inboundText) ||
        detectBareProductCatalogRequest(inboundText, "pingente")
      );
    const forceMaluCatalogFromRequest =
      explicitCategory === "oculos" &&
      !selectedContextAgent &&
      (
        detectMaluCatalogRequest(inboundText, buttonResponseId, catalogSelectionHint) ||
        detectCatalogIntent(inboundText) ||
        detectBareProductCatalogRequest(inboundText, "oculos")
      );
    const forceKeilaCatalogFromRequest =
      (explicitCategory === "aliancas" || explicitCategory === "aneis") &&
      !selectedContextAgent &&
      (
        detectCatalogIntent(inboundText) ||
        detectBareProductCatalogRequest(inboundText, explicitCategory)
      );

    if (wantsFullCatalogMain && !explicitCategory && !selectedContextAgent) {
      const generalCatalogResponse = await handleGeneralCatalogRequest({
        supabase,
        conversation,
        phone,
        contactName,
        data: {
          ...baseData,
          agente_atual: "aline",
        },
      });

      return new Response(JSON.stringify(generalCatalogResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keepMaluContext =
      selectedContextAgent === "malu" ||
      explicitCategory === "oculos" ||
      recentHasMaluEyewearPrompt ||
      (!explicitCategory &&
        shouldKeepAgentContext({
          activeAgent,
          data: baseData,
          currentNode: conversation.current_node || "",
          agent: "malu",
        }));
    const keepKateContext =
      !keepMaluContext &&
      (selectedContextAgent === "kate" ||
        explicitCategory === "pingente" ||
        recentHasKatePendantPrompt ||
        (!explicitCategory &&
          shouldKeepAgentContext({
            activeAgent,
            data: baseData,
            currentNode: conversation.current_node || "",
            agent: "kate",
          })));
    const keepKeilaContext =
      !keepMaluContext &&
      !keepKateContext &&
      (selectedContextAgent === "keila" ||
        explicitCategory === "aliancas" ||
        explicitCategory === "aneis" ||
        recentHasKeilaAlliancePrompt ||
        (!explicitCategory &&
          shouldKeepAgentContext({
            activeAgent,
            data: baseData,
            currentNode: conversation.current_node || "",
            agent: "keila",
          })));

    if (keepMaluContext) {
      const maluCurrentNode =
        isMaluFlowNode(conversation.current_node || "")
          ? conversation.current_node
          : forceMaluCatalogFromRequest
            ? "malu_pedido_catalogo_expresso"
            : selectedContextAgent === "malu" || explicitCategory === "oculos"
            ? conversation.current_node || ""
            : "malu_contexto_continuado";
      const maluResponse = await handleMaluFlow({
        supabase,
        conversation: {
          ...conversation,
          active_agent: "malu",
          current_node: maluCurrentNode,
          collected_data: hydrateDataWithMemory(
            {
              ...baseData,
              agente_atual: "malu",
              categoria: "oculos",
              malu_force_catalogo: forceMaluCatalogFromRequest || undefined,
              malu_intro_sent: forceMaluCatalogFromRequest ? true : baseData.malu_intro_sent,
            },
            maluMemory,
          ),
        },
        phone,
        message,
        contactName,
        buttonResponseId,
        catalogSelectionHint,
        mediaType: mediaTypeForAgent,
        mediaUrl: mediaUrlForAgent,
      });

      return new Response(JSON.stringify(maluResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (keepKateContext) {
      const kateCurrentNode =
        isKateFlowNode(conversation.current_node || "")
          ? conversation.current_node
          : forceKateCatalogFromRequest
            ? "kate_pedido_catalogo_expresso"
            : selectedContextAgent === "kate" || explicitCategory === "pingente"
            ? conversation.current_node || ""
            : "kate_contexto_continuado";
      const kateResponse = await handleKateFlow({
        supabase,
        supabaseUrl,
        supabaseServiceKey,
        conversation: {
          ...conversation,
          active_agent: "kate",
          current_node: kateCurrentNode,
          collected_data: hydrateDataWithMemory(
            {
              ...baseData,
              agente_atual: "kate",
              categoria: "pingente",
              kate_force_catalogo_amplo: forceKateCatalogFromRequest || undefined,
              kate_intro_sent: forceKateCatalogFromRequest ? true : baseData.kate_intro_sent,
            },
            kateMemory,
          ),
        },
        phone,
        message,
        contactName,
        buttonResponseId,
        catalogSelectionHint,
        mediaType: mediaTypeForAgent,
        mediaUrl: mediaUrlForAgent,
      });

      return new Response(JSON.stringify(kateResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (keepKeilaContext) {
      const keilaCurrentNode =
        isKeilaFlowNode(conversation.current_node || "")
          ? conversation.current_node
          : forceKeilaCatalogFromRequest
            ? "keila_pedido_catalogo_expresso"
            : selectedContextAgent === "keila" || explicitCategory === "aliancas" || explicitCategory === "aneis"
            ? conversation.current_node || ""
            : "keila_contexto_continuado";
      const keilaResponse = await handleKeilaFlow({
        supabase,
        supabaseUrl,
        supabaseServiceKey,
        conversation: {
          ...conversation,
          active_agent: "keila",
          current_node: keilaCurrentNode,
          collected_data: {
            ...baseData,
            agente_atual: "keila",
            categoria: "aliancas",
            keila_force_catalogo: forceKeilaCatalogFromRequest || undefined,
            keila_intro_sent: forceKeilaCatalogFromRequest ? true : baseData.keila_intro_sent,
            finalidade: baseData.finalidade || detectAllianceType(inboundText, baseData) || "casamento",
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

    if (
      explicitCategory === "oculos" ||
      (baseData.categoria === "oculos" && detectMaluCatalogRequest(inboundText, buttonResponseId, catalogSelectionHint))
    ) {
      const maluResponse = await handleMaluFlow({
        supabase,
        conversation: {
          ...conversation,
          active_agent: "malu",
          current_node: isMaluFlowNode(conversation.current_node || "")
            ? conversation.current_node
            : "malu_pedido_catalogo_expresso",
          collected_data: hydrateDataWithMemory(
            {
              ...baseData,
              agente_atual: "malu",
              categoria: "oculos",
              malu_force_catalogo: forceMaluCatalogFromRequest || undefined,
              malu_intro_sent: forceMaluCatalogFromRequest ? true : baseData.malu_intro_sent,
            },
            maluMemory,
          ),
        },
        phone,
        message,
        contactName,
        buttonResponseId,
        catalogSelectionHint,
        mediaType: mediaTypeForAgent,
        mediaUrl: mediaUrlForAgent,
      });

      return new Response(JSON.stringify(maluResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const maluMemoryPreferences = maluMemory?.preferences || {};
    const isMaluContext =
      activeAgent === "malu" ||
      baseData.agente_atual === "malu" ||
      baseData.categoria === "oculos" ||
      isMaluFlowNode(conversation.current_node || "") ||
      recentContextHasMaluEyewearPrompt(recentCrmContext) ||
      maluMemoryPreferences.categoria === "oculos";
    const hasMaluSelectedProduct =
      !!(baseData.selected_sku || baseData.selected_product?.id || maluMemory?.last_product_sku || maluMemory?.last_product_name);
    const shouldForceMaluFlow =
      isMaluContext &&
      (
        detectMaluCatalogRequest(inboundText, buttonResponseId, catalogSelectionHint) ||
        (mediaTypeForAgent === "image" && mediaUrlForAgent && hasMaluSelectedProduct)
      );

    if (shouldForceMaluFlow) {
      const maluResponse = await handleMaluFlow({
        supabase,
        conversation: {
          ...conversation,
          active_agent: "malu",
          current_node: isMaluFlowNode(conversation.current_node || "")
            ? conversation.current_node
            : "malu_contexto_historico",
          collected_data: hydrateDataWithMemory(
            {
              ...baseData,
              agente_atual: "malu",
              categoria: "oculos",
            },
            maluMemory,
          ),
        },
        phone,
        message,
        contactName,
        buttonResponseId,
        catalogSelectionHint,
        mediaType: mediaTypeForAgent,
        mediaUrl: mediaUrlForAgent,
      });

      return new Response(JSON.stringify(maluResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const intelligence = await buildConversationIntelligence({
      text: inboundText,
      data: baseData,
      activeAgent,
      currentNode: conversation.current_node || "",
      mediaType: mediaTypeForAgent,
      recentCrmContext,
      imageUnderstanding,
      buttonResponseId,
      catalogSelectionHint,
    });
    applyIntelligenceToData(baseData, intelligence);
    updateSellerContextMemory(baseData, {
      text: inboundText,
      mediaType,
      intelligence,
      activeAgent,
    });

    if (intelligence.needsClarification && intelligence.clarificationQuestion && !buttonResponseId) {
      const reply = intelligence.clarificationQuestion;
      const clarificationPayload = buildResponsePayload({
        phone,
        message: reply,
        node: "triagem_inteligente_duvida",
        collectedData: baseData,
        agent: activeAgent,
      });

      return new Response(JSON.stringify(clarificationPayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (intelligence.targetAgent === "human") {
      const reply = "Perfeito, vou chamar um atendente para te ajudar por aqui.";
      const humanPayload = buildResponsePayload({
        phone,
        message: reply,
        node: "human_handoff_fechamento",
        collectedData: baseData,
        agent: "human",
      });

      return new Response(JSON.stringify(humanPayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const intelligenceAgent = intelligence.targetAgent;
    const routeToMalu =
      intelligenceAgent === "malu" ||
      explicitCategory === "oculos" ||
      (explicitCategory !== "pingente" &&
        explicitCategory !== "aliancas" &&
        explicitCategory !== "aneis" &&
        shouldRouteToMalu(activeAgent, inboundText, baseData, conversation.current_node || ""));
    const routeToKate =
      !routeToMalu &&
      (intelligenceAgent === "kate" ||
      (explicitCategory === "pingente" ||
        (explicitCategory !== "aliancas" &&
          explicitCategory !== "aneis" &&
          shouldRouteToKate(
            activeAgent,
            inboundText,
            baseData,
            conversation.current_node || "",
            kateMemory,
            keilaMemory,
          ))));
    const routeToKeila =
      !routeToMalu &&
      !routeToKate &&
      (intelligenceAgent === "keila" ||
      (explicitCategory === "aliancas" ||
        explicitCategory === "aneis" ||
        shouldRouteToKeila(activeAgent, inboundText, baseData, conversation.current_node || "")));

    if (routeToMalu) {
      const maluResponse = await handleMaluFlow({
        supabase,
        conversation: {
          ...conversation,
          active_agent: "malu",
          current_node: forceMaluCatalogFromRequest ? "malu_pedido_catalogo_expresso" : conversation.current_node,
          collected_data: hydrateDataWithMemory(
            {
              ...baseData,
              agente_atual: "malu",
              categoria: "oculos",
              malu_force_catalogo: forceMaluCatalogFromRequest || undefined,
              malu_intro_sent: forceMaluCatalogFromRequest ? true : baseData.malu_intro_sent,
            },
            maluMemory,
          ),
        },
        phone,
        message,
        contactName,
          buttonResponseId,
          catalogSelectionHint,
          mediaType: mediaTypeForAgent,
          mediaUrl: mediaUrlForAgent,
        });

      return new Response(JSON.stringify(maluResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (routeToKate) {
      const kateResponse = await handleKateFlow({
        supabase,
        supabaseUrl,
        supabaseServiceKey,
        conversation: {
          ...conversation,
          active_agent: "kate",
          current_node: forceKateCatalogFromRequest ? "kate_pedido_catalogo_expresso" : conversation.current_node,
          collected_data: hydrateDataWithMemory(
            {
              ...baseData,
              agente_atual: "kate",
              categoria: "pingente",
              kate_force_catalogo_amplo: forceKateCatalogFromRequest || undefined,
              kate_intro_sent: forceKateCatalogFromRequest ? true : baseData.kate_intro_sent,
            },
            kateMemory,
          ),
        },
        phone,
        message,
        contactName,
          buttonResponseId,
          catalogSelectionHint,
          mediaType: mediaTypeForAgent,
          mediaUrl: mediaUrlForAgent,
      });

      return new Response(JSON.stringify(kateResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (routeToKeila) {
      const keilaResponse = await handleKeilaFlow({
        supabase,
        supabaseUrl,
        supabaseServiceKey,
        conversation: {
          ...conversation,
          active_agent: "keila",
          current_node: forceKeilaCatalogFromRequest ? "keila_pedido_catalogo_expresso" : conversation.current_node,
          collected_data: {
            ...baseData,
            agente_atual: "keila",
            categoria: "aliancas",
            keila_force_catalogo: forceKeilaCatalogFromRequest || undefined,
            keila_intro_sent: forceKeilaCatalogFromRequest ? true : baseData.keila_intro_sent,
            finalidade: baseData.finalidade || detectAllianceType(inboundText, baseData) || "casamento",
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

    let aiPayload: AnyRecord | null = null;

    try {
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
          skip_aline_reply_proxy: true,
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

      aiPayload = await aiChatResponse.json();
    } catch (error) {
      console.error("[ALINE-REPLY] Falha no ai-chat, usando saudacao segura:", error);
      const safeContinuation = buildAlineContinuationFallback(contactName, alineData);
      aiPayload = {
        success: true,
        response: safeContinuation,
        mensagem_whatsapp: safeContinuation,
        filtros: {
          intencao: "conversa",
          categoria: alineData.categoria || null,
          cor: alineData.cor || null,
          tipo_alianca: alineData.finalidade || null,
          agente_atual: "aline",
          acao_sugerida: "continuar_conversa",
          enviar_catalogo: false,
          node: "abertura",
        },
        produtos: [],
        total_produtos: 0,
        tem_produtos: false,
        memoria: {
          phone,
          agente_atual: "aline",
          stage: "abertura",
          categoria: alineData.categoria || null,
          finalidade: alineData.finalidade || null,
          cor: alineData.cor || null,
        },
        node_tecnico: "abertura",
        categoria_crm: alineData.categoria || null,
        cor_crm: alineData.cor || null,
        fallback_reason: "ai-chat-unavailable",
      };
    }

    const aiMessageText = String(aiPayload?.mensagem_whatsapp || aiPayload?.response || "");
    const guardData = {
      ...alineData,
      agente_atual: recentHasKatePendantPrompt
        ? "kate"
        : recentHasMaluEyewearPrompt
          ? "malu"
          : recentHasKeilaAlliancePrompt
            ? "keila"
            : alineData.agente_atual,
      categoria: recentHasKatePendantPrompt
        ? "pingente"
        : recentHasMaluEyewearPrompt
          ? "oculos"
          : recentHasKeilaAlliancePrompt
            ? "aliancas"
            : alineData.categoria,
      catalogo_kate_enviado: recentHasKatePendantPrompt ? true : alineData.catalogo_kate_enviado,
      catalogo_malu_enviado: recentHasMaluEyewearPrompt ? true : alineData.catalogo_malu_enviado,
      catalogo_keila_enviado: recentHasKeilaAlliancePrompt ? true : alineData.catalogo_keila_enviado,
    };
    const hasSpecialistContextForGuard =
      guardData.agente_atual === "kate" ||
      guardData.agente_atual === "malu" ||
      guardData.agente_atual === "keila" ||
      guardData.categoria === "pingente" ||
      guardData.categoria === "oculos" ||
      guardData.categoria === "aliancas" ||
      guardData.categoria === "aneis";

    if (isAlineIntroMessage(aiMessageText) && hasSpecialistContextForGuard) {
      const safeContinuation = buildAlineContinuationFallback(contactName, guardData);
      aiPayload.response = safeContinuation;
      aiPayload.mensagem_whatsapp = safeContinuation;
      aiPayload.node_tecnico = aiPayload.node_tecnico || "contexto_continuado_sem_reapresentacao";
      aiPayload.fallback_reason = "blocked_repeated_aline_intro";
      aiPayload.memoria = {
        ...(aiPayload.memoria || {}),
        agente_atual: guardData.agente_atual || aiPayload.memoria?.agente_atual || "aline",
        categoria: guardData.categoria || aiPayload.memoria?.categoria || null,
      };
    }

    alineData.categoria = aiPayload?.memoria?.categoria || alineData.categoria || null;
    alineData.finalidade = aiPayload?.memoria?.tipo_alianca || alineData.finalidade || null;
    alineData.cor = aiPayload?.memoria?.cor || alineData.cor || null;
    alineData.selected_sku = aiPayload?.memoria?.produto_sku || alineData.selected_sku || null;
    alineData.selected_name = aiPayload?.memoria?.produto_nome || alineData.selected_name || null;
    alineData.triagem_categoria = aiPayload?.filtros?.intencao || alineData.triagem_categoria || null;
    alineData.agente_atual = aiPayload?.memoria?.agente_atual || alineData.agente_atual || "aline";
    const finalAgentFromPayload = normalizeConversationAgent(aiPayload?.memoria?.agente_atual || aiPayload?.agent);
    const finalAlineBranchAgent: ConversationAgent =
      finalAgentFromPayload === "kate" || finalAgentFromPayload === "keila" || finalAgentFromPayload === "malu"
        ? finalAgentFromPayload
        : "aline";

    await persistConversation(
      supabase,
      conversation.id,
      finalAlineBranchAgent,
      aiPayload.node_tecnico || conversation.current_node || "abertura",
      conversation.current_node || null,
      alineData,
    );

    await saveAssistantMessage(
      supabase,
      conversation.id,
      finalAlineBranchAgent,
      aiPayload.mensagem_whatsapp || aiPayload.response || "Posso te ajudar com alianças ou pingentes? 😊",
      aiPayload.node_tecnico || conversation.current_node || "abertura",
    );

    await saveAgentMemory(supabase, phone, finalAlineBranchAgent, contactName, alineData);

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
