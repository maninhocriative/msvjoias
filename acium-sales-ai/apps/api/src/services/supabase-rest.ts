import type { AgentRoutingDecision } from "@acium/shared";
import type { Env } from "../types";

type DecisionLogInput = {
  conversationId: string;
  messageId: string;
  decision: AgentRoutingDecision;
  previousAgent: string | null;
  stageBefore: string | null;
  responsePreview?: string | null;
};

export async function insertAgentDecisionLog(env: Env, input: DecisionLogInput): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;

  const payload = {
    conversation_id: input.conversationId,
    message_id: input.messageId,
    agent_selected: input.decision.selectedAgent,
    previous_agent: input.previousAgent,
    stage_before: input.stageBefore,
    stage_after: input.decision.stage,
    decision_reason: input.decision.reason,
    confidence: input.decision.confidence,
    tools_called: [],
    catalog_products_used: [],
    memory_used: [],
    handoff_decision: input.decision.handoff ?? null,
    response_preview: input.responsePreview ?? null
  };

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/agent_decision_logs`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Supabase decision log failed with status ${response.status}`);
  }
}
