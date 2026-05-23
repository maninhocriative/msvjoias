import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPhoneVariants, normalizeWhatsappPhone } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  if (/pingente|pingentes|medalh|colar|cord|corrente/.test(searchable)) {
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
    /pingente|pingentes|medalh|colar|cord|corrente|fotograv|gravar foto/.test(normalized)
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
  const budget = detectBudgetValue(text);
  if (budget) extracted.orcamento_valor = budget;
  const color = detectColor(text);
  if (color) extracted.cor = color;

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
  return /vem so o pingente|vem so pingente|corrente inclusa|vem corrente|acompanha corrente|vem com corrente|vem com cord|teria cord|tem cord|cord.*inclus|cord|corrente|so a medalh|apenas a medalh|medalh|so o pingente|apenas o pingente/.test(
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
  return /endere[cç]o|onde fica|localiza[cç]ao|localizacao|qual a loja|loja fica|shopping|retirar na loja|buscar na loja/.test(
    normalized,
  );
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
    `${product.color || ""} ${product.name || ""} ${product.description || ""} ${product.category || ""}`,
  );

  if (detected === "prata" || detected === "dourada") return detected;
  return null;
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
  const asksToSend = /(envia|enviar|mande|manda|manda ai|mostra|mostrar|quero ver|me manda|me mande|me envia|sim.*modelos|pode.*modelos)/.test(normalized);
  const mentionsCatalog = /(modelo|modelos|opcao|opcoes|catalogo|alianca|aliancas|pingente|pingentes|oculos|armacao)/.test(normalized);
  return asksToSend && mentionsCatalog;
}

function detectMoreOptionsIntent(text: string): boolean {
  const normalized = normalizeText(text);
  return /more_options|ver_mais|quero mais|tem outros|tem outras|mais opcoes|mais modelos|outros modelos|outras opcoes|outras opções|ver mais/.test(
    normalized,
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
  if (/modelos.*culos|culos disponiveis/.test(normalized)) return true;
  return /modelos de oculos|oculos disponiveis|previa com selfie|quer ver os modelos|catalogo_oculos|malu/.test(normalized);
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
  if (data.cor) parts.push(`cor=${data.cor}`);
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
  if (data.cor) parts.push(`cor ${data.cor}`);
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
    const productId = normalizeText(product.id || "");
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
        tagsText.includes("casamento");

      if (!isAlliance) return false;

      if (requestedPurpose === "casamento" && !isTungsten) return false;
      if (requestedPurpose === "namoro" && isTungsten) return false;
    }

    if (requestedCategory === "pingente") {
      const isPendant = category.includes("pingente") || name.includes("pingente") || name.includes("medalha");
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
        tagsText.includes("armacao");
      if (!isEyewear) return false;
    }

    if (requestedColor) {
      const normalizedRequestedColor =
        requestedColor === "prata"
          ? ["prata", "aco", "aço", "silver"]
        : requestedColor === "dourada"
            ? ["dourada", "dourado", "amarela", "amarelo"]
            : requestedColor === "preta"
              ? ["preta", "preto", "black", "negra", "escura", "escuro"]
              : requestedColor === "azul"
                ? ["azul", "blue"]
                : [requestedColor];

      const matchesColor = normalizedRequestedColor.some((color) => colorSearchText.includes(color));
      if (!matchesColor) return false;
    }

    const variantCount = Array.isArray(product.product_variants) ? product.product_variants.length : 0;
    const stock = (product.product_variants || []).reduce(
      (sum: number, item: any) => sum + Number(item.stock || 0),
      0,
    );

    const allowWithoutVariantStock =
      requestedCategory === "oculos" &&
      variantCount === 0 &&
      !!product.image_url;

    if (stock <= 0 && !allowWithoutVariantStock) return false;

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

    const rawStock = (product.product_variants || []).reduce(
      (sum: number, item: any) => sum + Number(item.stock || 0),
      0,
    );
    const stock = requestedCategory === "oculos" && sizes.length === 0 && rawStock <= 0 && product.image_url
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
          id: `details_${product.sku || product.id}`,
          label: "Ver mais",
        },
        {
          id: `select_${product.sku || product.id}`,
          label: "Quero este",
        },
      ],
      force_separate_buttons: true,
    };
  });
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

  const imageResponse = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openAIApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      images: [
        { image_url: customerPhotoUrl },
        { image_url: productImageUrl },
      ],
      prompt,
      size: "1024x1024",
      quality: "high",
      output_format: "png",
    }),
  });

  if (!imageResponse.ok) {
    const errorText = await imageResponse.text();
    throw new Error(`OpenAI eyewear image edit error: ${imageResponse.status} - ${errorText}`);
  }

  const imagePayload = await imageResponse.json();
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

  // Pingentes não usam numeração/tamanho de alianças; limpamos qualquer resíduo
  // herdado para que, após a cor, a Kate siga direto para o catálogo.
  delete data.finalidade;
  delete data.quantidade_tipo;
  delete data.tamanho_1;
  delete data.tamanho_2;
  delete data.numeracao_status;

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
  const wantsCatalogResend = detectCatalogResendIntent(message);
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

  const sendKateCatalogForBothFinishes = async (reply: string) => {
    const previousColor = data.cor;
    delete data.cor;
    const cards = await fetchKateCatalogCards([]);
    if (previousColor === "prata" || previousColor === "dourada") {
      data.cor = previousColor;
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
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "catalogo_pingente");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
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
    await saveAssistantMessage(supabase, conversation.id, "kate", reply, "catalogo_pingente");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
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

  if (!hasSelectedProduct && hasColor && isSimpleColorChoice(message)) {
    return await sendKateCatalogForCurrentColor(
      `Perfeito, vou te mostrar os pingentes fotogravaveis no acabamento ${data.cor}. A fotogravacao de 1 lado ja esta inclusa.`,
    );
  }

  if (!hasSelectedProduct && asksFinishPhotos) {
    return await sendKateCatalogForBothFinishes(
      "Tenho sim. Vou te mandar os modelos com acabamento dourado e prata para voce comparar pelas fotos.",
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
    const reply = `Nossa loja fica no Shopping Sumaúma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM.${nextLine}`;

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
    const polishedReply = detectedColor && !["prata", "dourada"].includes(detectedColor)
      ? "Os pingentes fotogravaveis sao de aco e hoje tenho duas opcoes de acabamento: dourado ou prata. Qual voce prefere?"
      : `Oi, eu sou a Kate. A fotogravacao fica linda para presente: usamos uma foto sua e preparo uma simulacao no pingente antes de seguir com o pedido.

Os pingentes sao de aco, com acabamento dourado ou prata. Qual acabamento voce prefere ver?`;

    await persistConversation(
      supabase,
      conversation.id,
      "kate",
      "kate_cor",
      conversation.current_node || null,
      data,
    );
    await saveAssistantMessage(supabase, conversation.id, "kate", polishedReply, "kate_cor");
    await saveAgentMemory(supabase, phone, "kate", contactName, data);

    return buildResponsePayload({
      phone,
      message: polishedReply,
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

        const reply = `Recebi sua foto! Preparei uma simulacao de fotogravacao do *${cleanCustomerProductName(data.selected_name)}* para voce conferir. Importante: essa imagem e apenas uma simulacao. Apos o fechamento, o vendedor envia a arte original para sua aprovacao antes da gravacao.`;

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
        const reply = `Perfeito, seguimos com *${cleanCustomerProductName(data.selected_name)}* sem simulacao.

Voce vai retirar na loja ou prefere delivery? Depois do fechamento, o vendedor envia a arte original para sua aprovacao antes da gravacao.`;

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

Esse modelo permite fotogravacao de 1 lado. Se quiser ver antes, me manda a foto que voce quer gravar e eu preparo uma simulacao para ajudar na escolha.

Se preferir seguir sem simulacao, posso avancar com entrega e pagamento agora. Depois do fechamento, o vendedor envia a arte original para sua aprovacao antes da gravacao.`;

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

      try {
        const previewImageUrl = await generateKatePreview({
          supabase,
          phone,
          selectedProduct: data.selected_product || {},
          customerPhotoUrl: effectiveMediaUrl,
        });

        data.kate_preview_image_url = previewImageUrl;
        data.kate_preview_status = "resent";

        const reply = "Perfeito! Preparei uma nova simulacao com essa foto para voce conferir. Lembrando: essa imagem e apenas uma simulacao; depois do fechamento, o vendedor envia a arte original para sua aprovacao antes da gravacao.";

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
  const data: AnyRecord = {
    ...(conversation.collected_data || {}),
    agente_atual: "malu",
    categoria: "oculos",
  };

  if (!isMaluFlowNode(currentNode)) {
    resetMaluFlowState(data);
  }

  const selectionToken = [buttonResponseId, catalogSelectionHint, message].filter(Boolean).join(" ");
  const normalizedSelectionToken = normalizeText(selectionToken);
  const isChoiceText = /escolher este|quero este|escolher|quero esse|quero esse modelo|preview|previa|prévia|testar|provar/.test(normalizedSelectionToken);
  const isDetailsText = /ver mais|detalhes|mais detalhes/.test(normalizedSelectionToken);
  const forceCatalogRequest = detectMaluCatalogRequest(message, buttonResponseId, catalogSelectionHint);
  let selectedFromCatalog = findCatalogSelection(
    buttonResponseId || catalogSelectionHint || message,
    getCatalogSelectionPool(data),
  );
  if (!selectedFromCatalog && (isChoiceText || isDetailsText || (mediaType === "image" && mediaUrl))) {
    selectedFromCatalog = findSingleCatalogSelection(data);
  }
  const wantsDetails = /^details[_-]/i.test(String(buttonResponseId || "")) || isDetailsText;
  const wantsMoreOptions = detectMoreOptionsIntent(message) || /^more_options$/i.test(String(buttonResponseId || ""));
  const wantsCatalogResend = detectCatalogResendIntent(message);
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

  const hasSelectedProduct = !!(data.selected_sku || data.selected_product?.id);
  const hasPhoto = !!data.malu_customer_photo_url;
  const hasPreview = !!data.malu_preview_image_url;

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

  if (forceCatalogRequest || !data.catalogo_malu_enviado || (!hasSelectedProduct && (wantsMoreOptions || wantsCatalogResend || confirmsCatalogRequest))) {
    const shownSkus = Array.isArray(data.last_catalog)
      ? data.last_catalog.map((item: any) => String(item?.sku || item?.id || "")).filter(Boolean)
      : [];
    const cards = await fetchMaluCatalogCards(wantsMoreOptions ? shownSkus : []);

    if (cards.length === 0) {
      const reply = "Oi, eu sou a Malu. No momento não encontrei modelos de óculos disponíveis no catálogo, mas posso chamar um atendente para te ajudar.";

      await persistConversation(supabase, conversation.id, "malu", "malu_sem_catalogo", conversation.current_node || null, data);
      await saveAssistantMessage(supabase, conversation.id, "malu", reply, "malu_sem_catalogo");
      await saveAgentMemory(supabase, phone, "malu", contactName, data);

      return buildResponsePayload({
        phone,
        message: reply,
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

    const reply = wantsMoreOptions
      ? "Separei mais alguns modelos de óculos para você ver."
      : `Oi, eu sou a Malu.
Vou te ajudar a escolher o óculos ideal.

Separei alguns modelos disponíveis. Você pode escolher um modelo ou me mandar uma selfie de frente para eu gerar uma prévia.`;

    await persistConversation(supabase, conversation.id, "malu", "catalogo_oculos", conversation.current_node || null, data);
    await saveAssistantMessage(supabase, conversation.id, "malu", reply, "catalogo_oculos");
    await saveAgentMemory(supabase, phone, "malu", contactName, data);

    return buildResponsePayload({
      phone,
      message: reply,
      node: "catalogo_oculos",
      products: cards,
      collectedData: data,
      agent: "malu",
      useProductButtons: true,
      postCatalogMessage: "Gostou de algum modelo? Toque em Quero este que eu te peço a selfie para testar.",
    });
  }

  if (hasSelectedProduct && !hasPhoto) {
    if (mediaType === "image" && mediaUrl) {
      data.malu_customer_photo_url = mediaUrl;

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
    const recentCrmContext = await loadRecentCrmMessageContext(supabase, phone);
    if (recentCrmContext) {
      baseData.recent_crm_context = recentCrmContext;
      baseData.human_chat_summary = recentCrmContext;
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
    baseData.categoria = explicitCategory || detectCategory(inboundText, baseData) || baseData.categoria || null;
    baseData.finalidade = detectAllianceType(inboundText, baseData) || baseData.finalidade || null;
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

    if (imageUnderstanding?.kind === "product_reference" && !explicitCategory) {
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

    if (routeToKate) {
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
      aiPayload = {
        success: true,
        response: buildAlineFallbackGreeting(contactName),
        mensagem_whatsapp: buildAlineFallbackGreeting(contactName),
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
