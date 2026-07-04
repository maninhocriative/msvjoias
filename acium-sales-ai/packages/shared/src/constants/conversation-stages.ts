export const CONVERSATION_STAGES = [
  "new_lead",
  "qualifying",
  "interest_identified",
  "catalog_requested",
  "catalog_sent",
  "product_selected",
  "order_building",
  "order_created",
  "payment_pending",
  "payment_confirmed",
  "pickup_pending",
  "delivery_pending",
  "finished",
  "lost",
  "human_required",
  "human_active",
  "followup_scheduled"
] as const;

export type ConversationStage = (typeof CONVERSATION_STAGES)[number];
