import type { NormalizedInboundV2 } from "./inbound-normalizer-v2.ts";
import type { AgentDecisionV2, AgentSlugV2, ConversationStateV2 } from "./agent-orchestrator-v2.ts";

export type FlowActionV2 =
  | "none"
  | "answer_operational"
  | "ask_clarification"
  | "ask_next_question"
  | "query_catalog"
  | "handoff";

export interface FlowStepV2 {
  key: string;
  agent: AgentSlugV2;
  action: FlowActionV2;
  promptKey: string | null;
  requiredFacts: string[];
  missingFacts: string[];
  canQueryCatalog: boolean;
  canUpdateMemory: boolean;
}

export interface FlowRunResultV2 {
  flowKey: string;
  step: FlowStepV2;
  factsPatch: Record<string, unknown>;
  pendingQuestionsPatch: Array<{ key: string; text: string }>;
  log: Record<string, unknown>;
}

const FLOW_REQUIREMENTS: Record<AgentSlugV2, string[]> = {
  aline: [],
  kate: ["categoria", "cor"],
  keila: ["categoria", "cor", "prazo", "orcamento", "quantidade", "numeracao"],
  malu: ["categoria", "modelo_ou_formato"],
  human: [],
};

const FLOW_QUESTIONS: Record<string, string> = {
  categoria: "Qual produto voce esta procurando?",
  cor: "Qual cor voce prefere: dourada, prata, preta, azul ou rose?",
  prazo: "Para quando voce quer fechar?",
  orcamento: "Quanto voce quer investir?",
  quantidade: "Voce quer o par ou uma unidade?",
  numeracao: "Voce ja sabe a numeracao?",
  modelo_ou_formato: "Voce quer algum modelo ou formato especifico?",
};

function hasFact(state: ConversationStateV2, key: string): boolean {
  const value = state.facts?.[key];
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function inferFacts(input: NormalizedInboundV2, decision: AgentDecisionV2): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  const text = input.normalizedText;

  if (decision.productSignals.length > 0) {
    facts.categoria = decision.productSignals[0];
  }
  if (/(dourad|ouro|gold)/.test(text)) facts.cor = "dourada";
  if (/(prata|pratead|aco|inox|silver)/.test(text)) facts.cor = "prata";
  if (/(preta|preto|black)/.test(text)) facts.cor = "preta";
  if (/(azul|blue)/.test(text)) facts.cor = "azul";
  if (/(rose|rosa)/.test(text)) facts.cor = "rose";
  if (/par|casal|duas/.test(text)) facts.quantidade = "par";
  if (/unidade|uma so|1 unidade/.test(text)) facts.quantidade = "unidade";
  if (/nao sei|nao sabe|sem numeracao|medir depois/.test(text)) facts.numeracao = "nao_sabe";
  if (/(hoje|amanha|semana|mes|data|dia \d{1,2})/.test(text)) facts.prazo = input.text;
  if (/(r\$|\d{2,}[,.]?\d*|orcamento|investir)/.test(text)) facts.orcamento = input.text;

  return facts;
}

function buildFlowKey(agent: AgentSlugV2): string {
  if (agent === "keila") return "keila_aliancas";
  if (agent === "kate") return "kate_pingentes";
  if (agent === "malu") return "malu_oculos";
  if (agent === "human") return "human_takeover";
  return "aline_triagem";
}

export function runAgentFlowV2(
  input: NormalizedInboundV2,
  decision: AgentDecisionV2,
  state: ConversationStateV2,
): FlowRunResultV2 {
  const factsPatch = inferFacts(input, decision);
  const mergedState: ConversationStateV2 = {
    ...state,
    facts: {
      ...(state.facts || {}),
      ...factsPatch,
    },
  };
  const flowKey = buildFlowKey(decision.agent);
  const requiredFacts = FLOW_REQUIREMENTS[decision.agent] || [];
  const missingFacts = requiredFacts.filter((key) => !hasFact(mergedState, key));
  const nextMissing = missingFacts[0] || null;

  if (!decision.shouldReply) {
    return {
      flowKey,
      factsPatch,
      pendingQuestionsPatch: [],
      step: {
        key: "silent",
        agent: decision.agent,
        action: "none",
        promptKey: null,
        requiredFacts,
        missingFacts,
        canQueryCatalog: false,
        canUpdateMemory: false,
      },
      log: { flowKey, reason: "decision_should_not_reply" },
    };
  }

  if (decision.shouldHandoff) {
    return {
      flowKey,
      factsPatch,
      pendingQuestionsPatch: [],
      step: {
        key: "handoff",
        agent: decision.agent,
        action: "handoff",
        promptKey: null,
        requiredFacts,
        missingFacts,
        canQueryCatalog: false,
        canUpdateMemory: true,
      },
      log: { flowKey, reason: "decision_handoff" },
    };
  }

  if (decision.shouldAskClarification) {
    return {
      flowKey,
      factsPatch,
      pendingQuestionsPatch: [{ key: "clarification", text: decision.replyHint || FLOW_QUESTIONS.categoria }],
      step: {
        key: "ask_clarification",
        agent: decision.agent,
        action: "ask_clarification",
        promptKey: "clarification",
        requiredFacts,
        missingFacts,
        canQueryCatalog: false,
        canUpdateMemory: true,
      },
      log: { flowKey, reason: "decision_clarification" },
    };
  }

  if (decision.decisionType === "answer_operational_question") {
    return {
      flowKey,
      factsPatch,
      pendingQuestionsPatch: [],
      step: {
        key: "answer_operational",
        agent: decision.agent,
        action: "answer_operational",
        promptKey: "operational_answer",
        requiredFacts,
        missingFacts,
        canQueryCatalog: decision.shouldQueryCatalog,
        canUpdateMemory: true,
      },
      log: { flowKey, reason: "operational_priority" },
    };
  }

  if ((decision.shouldQueryCatalog || missingFacts.length === 0) && decision.agent !== "aline") {
    return {
      flowKey,
      factsPatch,
      pendingQuestionsPatch: [],
      step: {
        key: "query_catalog",
        agent: decision.agent,
        action: "query_catalog",
        promptKey: "catalog_intro",
        requiredFacts,
        missingFacts,
        canQueryCatalog: true,
        canUpdateMemory: true,
      },
      log: { flowKey, reason: "catalog_ready_or_requested" },
    };
  }

  return {
    flowKey,
    factsPatch,
    pendingQuestionsPatch: nextMissing ? [{ key: nextMissing, text: FLOW_QUESTIONS[nextMissing] }] : [],
    step: {
      key: nextMissing ? `ask_${nextMissing}` : "continue",
      agent: decision.agent,
      action: nextMissing ? "ask_next_question" : "none",
      promptKey: nextMissing,
      requiredFacts,
      missingFacts,
      canQueryCatalog: false,
      canUpdateMemory: true,
    },
    log: { flowKey, reason: nextMissing ? "missing_required_fact" : "continue" },
  };
}

