import { normalizeInboundV2 } from "./inbound-normalizer-v2.ts";
import { decideAgentV2, type ConversationStateV2 } from "./agent-orchestrator-v2.ts";
import {
  DEFAULT_ACCUMULATOR_CONFIG_V2,
  buildBatchMessageV2,
  combineBatchMessagesV2,
  decideAccumulatorV2,
  type InboundBatchV2,
} from "./agent-accumulator-v2.ts";
import { runAgentFlowV2 } from "./agent-flow-runner-v2.ts";
import { planResponseV2 } from "./response-planner-v2.ts";

export interface AgentScenarioV2 {
  name: string;
  rawPayload: Record<string, unknown>;
  state: ConversationStateV2;
  expected: {
    decisionType: string;
    agent: string;
    shouldReply: boolean;
    shouldHandoff: boolean;
    shouldAskClarification?: boolean;
    shouldQueryCatalog?: boolean;
  };
}

export interface AccumulatorScenarioV2 {
  name: string;
  rawPayloads: Record<string, unknown>[];
  expected: {
    finalAction: string;
    combinedTextIncludes: string[];
  };
}

export interface PlannerScenarioV2 {
  name: string;
  rawPayload: Record<string, unknown>;
  state: ConversationStateV2;
  expected: {
    action: string;
    flowAction: string;
    hasAgentMessage: boolean;
  };
}

export const agentScenariosV2: AgentScenarioV2[] = [
  {
    name: "humano ativo nunca responde",
    rawPayload: {
      phone: "5592999999999",
      message: "Dourada tem?",
    },
    state: {
      phone: "5592999999999",
      humanActive: true,
      activeAgent: "keila",
    },
    expected: {
      decisionType: "skip_human_active",
      agent: "human",
      shouldReply: false,
      shouldHandoff: false,
    },
  },
  {
    name: "pergunta de endereco interrompe funil da Keila",
    rawPayload: {
      phone: "5592999999999",
      message: "Loja fica no shopping sumauma?",
    },
    state: {
      phone: "5592999999999",
      humanActive: false,
      activeAgent: "keila",
      facts: { categoria: "aliancas" },
    },
    expected: {
      decisionType: "answer_operational_question",
      agent: "keila",
      shouldReply: true,
      shouldHandoff: false,
    },
  },
  {
    name: "material de alianca nao vira humano",
    rawPayload: {
      phone: "5592999999999",
      message: "Essas aliancas sao de ouro ou banhada?",
    },
    state: {
      phone: "5592999999999",
      humanActive: false,
      activeAgent: "keila",
      facts: { categoria: "aliancas" },
    },
    expected: {
      decisionType: "answer_operational_question",
      agent: "keila",
      shouldReply: true,
      shouldHandoff: false,
      shouldQueryCatalog: true,
    },
  },
  {
    name: "instagram reel sem conteudo pede contexto",
    rawPayload: {
      phone: "5592999999999",
      platform: "instagram",
      message: "[ig_reel]",
    },
    state: {
      phone: "5592999999999",
      humanActive: false,
      activeAgent: "aline",
    },
    expected: {
      decisionType: "ask_clarification",
      agent: "aline",
      shouldReply: true,
      shouldHandoff: false,
      shouldAskClarification: true,
    },
  },
  {
    name: "pedido de catalogo de pingente roteia Kate",
    rawPayload: {
      phone: "5592999999999",
      message: "Quero ver modelos de pingente dourado",
    },
    state: {
      phone: "5592999999999",
      humanActive: false,
      activeAgent: "aline",
    },
    expected: {
      decisionType: "send_catalog",
      agent: "kate",
      shouldReply: true,
      shouldHandoff: false,
      shouldQueryCatalog: true,
    },
  },
];

export const accumulatorScenariosV2: AccumulatorScenarioV2[] = [
  {
    name: "acumula varias duvidas antes de decidir resposta",
    rawPayloads: [
      {
        phone: "5592999999999",
        messageId: "msg-1",
        message: "Ola! Tenho interesse e queria mais informacoes, por favor.",
      },
      {
        phone: "5592999999999",
        messageId: "msg-2",
        message: "Isso e de ouro?",
      },
      {
        phone: "5592999999999",
        messageId: "msg-3",
        message: "Loja fica no shopping sumauma?",
      },
    ],
    expected: {
      finalAction: "append",
      combinedTextIncludes: ["Tenho interesse", "ouro", "shopping sumauma"],
    },
  },
];

export const plannerScenariosV2: PlannerScenarioV2[] = [
  {
    name: "humano ativo gera plano sem resposta",
    rawPayload: {
      phone: "5592999999999",
      message: "Dourada tem?",
    },
    state: {
      phone: "5592999999999",
      humanActive: true,
      activeAgent: "keila",
    },
    expected: {
      action: "none",
      flowAction: "none",
      hasAgentMessage: false,
    },
  },
  {
    name: "pergunta operacional gera texto antes do funil",
    rawPayload: {
      phone: "5592999999999",
      message: "Loja fica no shopping sumauma?",
    },
    state: {
      phone: "5592999999999",
      humanActive: false,
      activeAgent: "keila",
      facts: { categoria: "aliancas" },
    },
    expected: {
      action: "send_text",
      flowAction: "answer_operational",
      hasAgentMessage: true,
    },
  },
  {
    name: "instagram sem conteudo gera pergunta de esclarecimento",
    rawPayload: {
      phone: "5592999999999",
      platform: "instagram",
      message: "[ig_reel]",
    },
    state: {
      phone: "5592999999999",
      humanActive: false,
      activeAgent: "aline",
    },
    expected: {
      action: "send_text",
      flowAction: "ask_clarification",
      hasAgentMessage: true,
    },
  },
];


export function runAgentScenariosV2() {
  return agentScenariosV2.map((scenario) => {
    const input = normalizeInboundV2(scenario.rawPayload);
    const decision = decideAgentV2(input, scenario.state);
    const pass =
      decision.decisionType === scenario.expected.decisionType &&
      decision.agent === scenario.expected.agent &&
      decision.shouldReply === scenario.expected.shouldReply &&
      decision.shouldHandoff === scenario.expected.shouldHandoff &&
      (scenario.expected.shouldAskClarification === undefined ||
        decision.shouldAskClarification === scenario.expected.shouldAskClarification) &&
      (scenario.expected.shouldQueryCatalog === undefined ||
        decision.shouldQueryCatalog === scenario.expected.shouldQueryCatalog);

    return {
      name: scenario.name,
      pass,
      expected: scenario.expected,
      actual: {
        decisionType: decision.decisionType,
        agent: decision.agent,
        shouldReply: decision.shouldReply,
        shouldHandoff: decision.shouldHandoff,
        shouldAskClarification: decision.shouldAskClarification,
        shouldQueryCatalog: decision.shouldQueryCatalog,
      },
    };
  });
}

export function runAccumulatorScenariosV2() {
  return accumulatorScenariosV2.map((scenario) => {
    let openBatch: InboundBatchV2 | null = null;
    let lastAction = "";
    let combinedText = "";

    scenario.rawPayloads.forEach((payload, index) => {
      const input = normalizeInboundV2(payload);
      const now = new Date(Date.UTC(2026, 0, 1, 12, 0, index));
      const decision = decideAccumulatorV2({
        input,
        openBatch,
        now,
        config: DEFAULT_ACCUMULATOR_CONFIG_V2,
      });
      const message = buildBatchMessageV2(input, now);
      const messages = openBatch && decision.action === "append"
        ? [...openBatch.messages, message]
        : [message];
      const nextCombinedText = combineBatchMessagesV2(messages);

      lastAction = decision.action;
      openBatch = {
        id: "test-batch",
        phone: input.phone,
        conversationId: null,
        status: "open",
        messageCount: messages.length,
        messages,
        combinedText: nextCombinedText,
        firstMessageAt: openBatch?.firstMessageAt || now.toISOString(),
        lastMessageAt: now.toISOString(),
        closesAt: decision.closesAt || now.toISOString(),
      };
      combinedText = nextCombinedText;
    });

    const pass =
      lastAction === scenario.expected.finalAction &&
      scenario.expected.combinedTextIncludes.every((part) => combinedText.includes(part));

    return {
      name: scenario.name,
      pass,
      expected: scenario.expected,
      actual: {
        finalAction: lastAction,
        combinedText,
      },
    };
  });
}

export function runPlannerScenariosV2() {
  return plannerScenariosV2.map((scenario) => {
    const input = normalizeInboundV2(scenario.rawPayload);
    const decision = decideAgentV2(input, scenario.state);
    const flow = runAgentFlowV2(input, decision, scenario.state);
    const plan = planResponseV2(input, decision, flow);
    const pass =
      plan.action === scenario.expected.action &&
      flow.step.action === scenario.expected.flowAction &&
      Boolean(plan.agentMessage) === scenario.expected.hasAgentMessage;

    return {
      name: scenario.name,
      pass,
      expected: scenario.expected,
      actual: {
        action: plan.action,
        flowAction: flow.step.action,
        hasAgentMessage: Boolean(plan.agentMessage),
        agentMessage: plan.agentMessage,
      },
    };
  });
}

export function runAllAgentPlatformScenariosV2() {
  const agents = runAgentScenariosV2();
  const accumulator = runAccumulatorScenariosV2();
  const planner = runPlannerScenariosV2();
  const success = [...agents, ...accumulator, ...planner].every((scenario) => scenario.pass);

  return {
    success,
    agents,
    accumulator,
    planner,
  };
}
