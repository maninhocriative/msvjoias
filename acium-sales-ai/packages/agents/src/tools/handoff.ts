export type HandoffToHumanInput = {
  conversationId: string;
  reason: string;
  priority: "low" | "normal" | "high" | "urgent";
  queue: "vendas" | "financeiro" | "suporte" | "gerencia";
  summary: string;
  suggestedAction?: string;
};

export function buildHandoffUpdate(input: HandoffToHumanInput) {
  return {
    conversation: {
      status: "waiting_human",
      human_takeover: true,
      human_required: true,
      automation_paused: true,
      assigned_queue: input.queue,
      handoff_reason: input.reason,
      handoff_priority: input.priority,
      handoff_summary: input.summary
    },
    handoff: {
      conversation_id: input.conversationId,
      reason: input.reason,
      priority: input.priority,
      queue: input.queue,
      summary: input.summary,
      suggested_action: input.suggestedAction ?? null,
      status: "open"
    }
  };
}
