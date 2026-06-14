import type { NormalizedInboundV2 } from "./inbound-normalizer-v2.ts";

export type AgentSlugV2 = "aline" | "keila" | "kate" | "malu" | "human";

export type DecisionTypeV2 =
  | "skip_human_active"
  | "handoff_safety"
  | "answer_operational_question"
  | "route_product_agent"
  | "send_catalog"
  | "ask_clarification"
  | "continue_flow";

export interface ConversationStateV2 {
  phone: string;
  humanActive: boolean;
  activeAgent?: AgentSlugV2 | null;
  selectedProduct?: {
    id?: string | null;
    sku?: string | null;
    name?: string | null;
    category?: string | null;
  } | null;
  facts?: Record<string, unknown>;
  pendingQuestions?: Array<{ key: string; text: string }>;
  lastCatalogAgent?: AgentSlugV2 | null;
}

export interface AgentDecisionV2 {
  decisionType: DecisionTypeV2;
  agent: AgentSlugV2;
  reason: string;
  shouldReply: boolean;
  shouldHandoff: boolean;
  shouldQueryCatalog: boolean;
  shouldAskClarification: boolean;
  operationalQuestions: string[];
  productSignals: string[];
  replyHint: string | null;
  nextStep: string | null;
  log: Record<string, unknown>;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function agentForProductSignal(signals: string[], fallback?: AgentSlugV2 | null): AgentSlugV2 {
  if (signals.includes("oculos")) return "malu";
  if (signals.includes("pingente")) return "kate";
  if (signals.includes("aliancas")) return "keila";
  return fallback && fallback !== "human" ? fallback : "aline";
}

function buildOperationalReplyHint(questions: string[], agent: AgentSlugV2): string {
  const parts: string[] = [];

  if (questions.includes("endereco")) {
    parts.push("Sim, nossa loja fica no Shopping Sumauma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM.");
  }
  if (questions.includes("material")) {
    if (agent === "kate") {
      parts.push("Os pingentes fotogravaveis sao de aco. Dourado e prata sao acabamentos, nao ouro macico.");
    } else if (agent === "keila") {
      parts.push("Nas aliancas, o material e acabamento dependem do modelo. Vou te mostrar opcoes do catalogo para voce ver certinho no card.");
    } else {
      parts.push("O material depende do produto escolhido. Me diga qual modelo voce viu que eu confirmo certinho.");
    }
  }
  if (questions.includes("prazo_entrega")) {
    parts.push("A producao geralmente fica pronta de 8 a 24 horas apos pagamento e fechamento, dependendo da fila.");
  }
  if (questions.includes("pagamento")) {
    parts.push("Aceitamos Pix, crediario Bemol e cartao de credito em ate 3x sem juros.");
  }

  return parts.join(" ");
}

function isExternalReferenceWithoutReadableContent(input: NormalizedInboundV2): boolean {
  if (!input.externalReferenceType || input.media.url) return false;
  if (!input.normalizedText.trim()) return true;
  if (/^\[(ig_reel|ig_post|ig_story)\]$/.test(input.normalizedText)) return true;
  return input.normalizedTextForAgent.startsWith("Recebi uma referencia externa sem conteudo legivel.");
}

export function decideAgentV2(input: NormalizedInboundV2, state: ConversationStateV2): AgentDecisionV2 {
  const productSignals = unique(input.productSignals);
  const operationalQuestions = unique(input.operationalQuestions);
  const commerceSignals = unique(input.commerceSignals);
  const safetySignals = unique(input.safetySignals);
  const handoffSignals = unique(input.handoffSignals);
  const currentAgent = state.activeAgent && state.activeAgent !== "human" ? state.activeAgent : "aline";
  const productAgent = agentForProductSignal(productSignals, currentAgent);

  const baseLog = {
    phone: input.phone,
    sourcePlatform: input.sourcePlatform,
    mediaType: input.media.type,
    externalReferenceType: input.externalReferenceType,
    productSignals,
    operationalQuestions,
    commerceSignals,
    safetySignals,
    handoffSignals,
    activeAgent: state.activeAgent || null,
    humanActive: state.humanActive,
  };

  if (state.humanActive) {
    return {
      decisionType: "skip_human_active",
      agent: "human",
      reason: "Atendimento humano ativo; automacao deve ficar em silencio.",
      shouldReply: false,
      shouldHandoff: false,
      shouldQueryCatalog: false,
      shouldAskClarification: false,
      operationalQuestions,
      productSignals,
      replyHint: null,
      nextStep: "human_active",
      log: baseLog,
    };
  }

  if (safetySignals.length > 0 || handoffSignals.includes("comprovante_ou_documento")) {
    return {
      decisionType: "handoff_safety",
      agent: "human",
      reason: safetySignals[0] || "comprovante_ou_documento",
      shouldReply: true,
      shouldHandoff: true,
      shouldQueryCatalog: false,
      shouldAskClarification: false,
      operationalQuestions,
      productSignals,
      replyHint: "Enviar mensagem ponte antes de encaminhar para humano.",
      nextStep: "human_handoff",
      log: baseLog,
    };
  }

  if (operationalQuestions.length > 0) {
    return {
      decisionType: "answer_operational_question",
      agent: productAgent,
      reason: "Pergunta operacional tem prioridade sobre funil.",
      shouldReply: true,
      shouldHandoff: false,
      shouldQueryCatalog: operationalQuestions.includes("material") && productSignals.length > 0,
      shouldAskClarification: false,
      operationalQuestions,
      productSignals,
      replyHint: buildOperationalReplyHint(operationalQuestions, productAgent),
      nextStep: "answer_then_continue_context",
      log: baseLog,
    };
  }

  if (isExternalReferenceWithoutReadableContent(input)) {
    return {
      decisionType: "ask_clarification",
      agent: productAgent,
      reason: "Referencia externa sem conteudo legivel.",
      shouldReply: true,
      shouldHandoff: false,
      shouldQueryCatalog: false,
      shouldAskClarification: true,
      operationalQuestions,
      productSignals,
      replyHint: "Recebi a referencia do Instagram, mas nao consegui ver qual produto era. Voce pode me dizer qual peca chamou sua atencao ou mandar um print?",
      nextStep: "await_external_reference_context",
      log: baseLog,
    };
  }

  if (commerceSignals.includes("catalogo") || productSignals.length > 0) {
    return {
      decisionType: commerceSignals.includes("catalogo") ? "send_catalog" : "route_product_agent",
      agent: productAgent,
      reason: commerceSignals.includes("catalogo") ? "Cliente pediu catalogo/modelos." : "Produto identificado.",
      shouldReply: true,
      shouldHandoff: false,
      shouldQueryCatalog: commerceSignals.includes("catalogo"),
      shouldAskClarification: false,
      operationalQuestions,
      productSignals,
      replyHint: null,
      nextStep: commerceSignals.includes("catalogo") ? "query_catalog" : "route_agent",
      log: baseLog,
    };
  }

  if (!input.normalizedTextForAgent.trim()) {
    return {
      decisionType: "ask_clarification",
      agent: currentAgent,
      reason: "Mensagem sem texto acionavel.",
      shouldReply: true,
      shouldHandoff: false,
      shouldQueryCatalog: false,
      shouldAskClarification: true,
      operationalQuestions,
      productSignals,
      replyHint: "Recebi sua mensagem, mas preciso de mais um detalhe para te ajudar. Qual produto voce quer ver?",
      nextStep: "await_clarification",
      log: baseLog,
    };
  }

  return {
    decisionType: "continue_flow",
    agent: currentAgent,
    reason: "Sem prioridade global; continuar fluxo do agente atual.",
    shouldReply: true,
    shouldHandoff: false,
    shouldQueryCatalog: false,
    shouldAskClarification: false,
    operationalQuestions,
    productSignals,
    replyHint: null,
    nextStep: "continue_current_flow",
    log: baseLog,
  };
}
