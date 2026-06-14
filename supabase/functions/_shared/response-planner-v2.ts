import type { NormalizedInboundV2 } from "./inbound-normalizer-v2.ts";
import type { AgentDecisionV2 } from "./agent-orchestrator-v2.ts";
import type { FlowRunResultV2 } from "./agent-flow-runner-v2.ts";

export type ResponsePlanActionV2 = "none" | "send_text" | "send_catalog" | "handoff";

export interface ResponsePlanV2 {
  action: ResponsePlanActionV2;
  agentMessage: string | null;
  catalogQuery: Record<string, unknown> | null;
  handoffReason: string | null;
  memoryPatch: Record<string, unknown>;
  pendingQuestions: Array<{ key: string; text: string }>;
  shouldPersistDecision: boolean;
  log: Record<string, unknown>;
}

function textForOperational(decision: AgentDecisionV2): string {
  if (decision.replyHint) return decision.replyHint;
  return "Responder a duvida do cliente antes de continuar o funil.";
}

function catalogQueryFor(input: NormalizedInboundV2, flow: FlowRunResultV2): Record<string, unknown> {
  return {
    category: flow.factsPatch.categoria || input.productSignals[0] || null,
    color: flow.factsPatch.cor || null,
    only_available: true,
    source: input.sourcePlatform,
  };
}

export function planResponseV2(
  input: NormalizedInboundV2,
  decision: AgentDecisionV2,
  flow: FlowRunResultV2,
): ResponsePlanV2 {
  const memoryPatch = {
    ...flow.factsPatch,
    last_agent: decision.agent,
    last_decision_type: decision.decisionType,
    last_flow_key: flow.flowKey,
    last_step_key: flow.step.key,
  };

  if (!decision.shouldReply || flow.step.action === "none") {
    return {
      action: "none",
      agentMessage: null,
      catalogQuery: null,
      handoffReason: null,
      memoryPatch,
      pendingQuestions: [],
      shouldPersistDecision: true,
      log: { reason: "no_reply", decisionType: decision.decisionType, step: flow.step.key },
    };
  }

  if (flow.step.action === "handoff") {
    return {
      action: "handoff",
      agentMessage: "Para nao te responder errado, vou chamar um vendedor para continuar daqui.",
      catalogQuery: null,
      handoffReason: decision.reason,
      memoryPatch,
      pendingQuestions: [],
      shouldPersistDecision: true,
      log: { reason: "handoff", decisionReason: decision.reason },
    };
  }

  if (flow.step.action === "answer_operational") {
    return {
      action: flow.step.canQueryCatalog ? "send_catalog" : "send_text",
      agentMessage: textForOperational(decision),
      catalogQuery: flow.step.canQueryCatalog ? catalogQueryFor(input, flow) : null,
      handoffReason: null,
      memoryPatch,
      pendingQuestions: [],
      shouldPersistDecision: true,
      log: { reason: "operational_answer", catalog: flow.step.canQueryCatalog },
    };
  }

  if (flow.step.action === "ask_clarification" || flow.step.action === "ask_next_question") {
    const question = flow.pendingQuestionsPatch[0]?.text || decision.replyHint || "Me conta um pouco mais para eu te ajudar melhor.";
    return {
      action: "send_text",
      agentMessage: question,
      catalogQuery: null,
      handoffReason: null,
      memoryPatch,
      pendingQuestions: flow.pendingQuestionsPatch,
      shouldPersistDecision: true,
      log: { reason: "question", questionKey: flow.pendingQuestionsPatch[0]?.key || null },
    };
  }

  if (flow.step.action === "query_catalog") {
    return {
      action: "send_catalog",
      agentMessage: "Vou te mostrar as melhores opcoes disponiveis.",
      catalogQuery: catalogQueryFor(input, flow),
      handoffReason: null,
      memoryPatch,
      pendingQuestions: [],
      shouldPersistDecision: true,
      log: { reason: "catalog_query" },
    };
  }

  return {
    action: "send_text",
    agentMessage: "Me conta mais para eu te ajudar melhor.",
    catalogQuery: null,
    handoffReason: null,
    memoryPatch,
    pendingQuestions: flow.pendingQuestionsPatch,
    shouldPersistDecision: true,
    log: { reason: "fallback" },
  };
}

