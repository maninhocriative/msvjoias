import type { AgentRoutingDecision, AgentName } from "@acium/shared";
import { shouldForceHandoff } from "./policies/handoff-policy";

export type RoutingContext = {
  conversationId: string;
  channel: "whatsapp" | "instagram" | "facebook";
  stage: string;
  currentAgent: AgentName | "auto_router" | null;
  normalizedText: string | null;
  humanTakeover: boolean;
  automationPaused: boolean;
  paymentPending: boolean;
  orderPending: boolean;
  productSelected: boolean;
  selectedProductCategory?: "alianca" | "pingente" | "chaveiro" | "fotogravacao" | null;
  confidenceHint?: number;
};

export function routeAgent(context: RoutingContext): AgentRoutingDecision {
  if (context.humanTakeover || context.automationPaused) {
    return {
      conversationId: context.conversationId,
      selectedAgent: "human",
      confidence: 1,
      reason: "Automation is paused because a human is active or required.",
      stage: "human_active",
      shouldRespond: false,
      shouldHandoff: false
    };
  }

  const forcedHandoff = shouldForceHandoff(context.normalizedText);
  if (forcedHandoff) {
    return {
      conversationId: context.conversationId,
      selectedAgent: "human",
      confidence: 1,
      reason: forcedHandoff.reason,
      stage: "human_required",
      shouldRespond: false,
      shouldHandoff: true,
      handoff: {
        mode: "takeover",
        reason: forcedHandoff.code,
        priority: forcedHandoff.priority,
        queue: forcedHandoff.queue,
        summary: forcedHandoff.summary
      }
    };
  }

  if ((context.confidenceHint ?? 1) < 0.55) {
    return handoff(context, "baixa_confianca_da_ia", "normal", "vendas", "AI confidence was below the automatic response threshold.");
  }

  if (context.paymentPending) {
    return decision(context, "financeiro", "payment_pending", "Payment is pending.", 0.9);
  }

  if (context.orderPending || context.stage === "order_building") {
    return decision(context, "pedido", context.stage, "Order workflow is active.", 0.86);
  }

  if (context.selectedProductCategory === "alianca" || includesAny(context.normalizedText, ["alianca", "anel", "par de aliancas"])) {
    return decision(context, "keila", "interest_identified", "Customer intent matches wedding rings.", 0.82);
  }

  if (
    context.selectedProductCategory === "pingente" ||
    context.selectedProductCategory === "chaveiro" ||
    includesAny(context.normalizedText, ["pingente", "chaveiro", "foto", "fotogravacao"])
  ) {
    return decision(context, "kate", "interest_identified", "Customer intent matches personalized items.", 0.82);
  }

  return decision(context, "aline", context.stage || "new_lead", "Default reception and triage route.", 0.72);
}

function decision(
  context: RoutingContext,
  selectedAgent: AgentRoutingDecision["selectedAgent"],
  stage: string,
  reason: string,
  confidence: number
): AgentRoutingDecision {
  return {
    conversationId: context.conversationId,
    selectedAgent,
    confidence,
    reason,
    stage,
    shouldRespond: true,
    shouldHandoff: false
  };
}

function handoff(
  context: RoutingContext,
  reason: string,
  priority: "low" | "normal" | "high" | "urgent",
  queue: "vendas" | "financeiro" | "suporte" | "gerencia",
  summary: string
): AgentRoutingDecision {
  return {
    conversationId: context.conversationId,
    selectedAgent: "human",
    confidence: 1,
    reason,
    stage: "human_required",
    shouldRespond: false,
    shouldHandoff: true,
    handoff: {
      mode: "takeover",
      reason,
      priority,
      queue,
      summary
    }
  };
}

function includesAny(text: string | null, needles: string[]): boolean {
  return needles.some((needle) => text?.includes(needle));
}
