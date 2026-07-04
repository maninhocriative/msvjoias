export type FollowupType =
  | "catalog_abandoned"
  | "price_abandoned"
  | "payment_pending"
  | "photo_pending"
  | "approval_pending"
  | "pickup_pending"
  | "delivery_pending"
  | "old_customer_reactivation"
  | "post_sale"
  | "high_value_lead";

export type FollowupContext = {
  conversationId: string;
  stage: string;
  humanTakeover: boolean;
  automationPaused: boolean;
  customerAskedToStop: boolean;
  finishedOrder: boolean;
  complaintOpen: boolean;
  channelAllowsFreeMessage: boolean;
  templateApproved: boolean;
  recentlyFollowedUp: boolean;
  attempts: number;
  maxAttempts: number;
  minutesSinceLastCustomerMessage: number;
};

export function canSendFollowup(context: FollowupContext): { allowed: boolean; reason?: string } {
  if (context.humanTakeover) return { allowed: false, reason: "human_takeover_active" };
  if (context.automationPaused) return { allowed: false, reason: "automation_paused" };
  if (context.customerAskedToStop) return { allowed: false, reason: "customer_asked_to_stop" };
  if (context.finishedOrder && context.stage !== "post_sale") return { allowed: false, reason: "order_finished" };
  if (context.complaintOpen) return { allowed: false, reason: "complaint_open" };
  if (!context.channelAllowsFreeMessage && !context.templateApproved) return { allowed: false, reason: "template_required" };
  if (context.recentlyFollowedUp) return { allowed: false, reason: "recent_followup" };
  if (context.attempts >= context.maxAttempts) return { allowed: false, reason: "attempt_limit_reached" };
  return { allowed: true };
}

export function inferFollowupType(stage: string): FollowupType | null {
  if (stage === "catalog_sent") return "catalog_abandoned";
  if (stage === "payment_pending") return "payment_pending";
  if (stage === "pickup_pending") return "pickup_pending";
  if (stage === "delivery_pending") return "delivery_pending";
  if (stage === "finished") return "post_sale";
  return null;
}
