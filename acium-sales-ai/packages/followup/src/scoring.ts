import type { FollowupContext } from "./rules";

export function scoreFollowupOpportunity(context: FollowupContext): number {
  let score = 0.3;
  if (context.stage === "payment_pending") score += 0.35;
  if (context.stage === "catalog_sent") score += 0.2;
  if (context.minutesSinceLastCustomerMessage > 60) score += 0.1;
  if (context.attempts === 0) score += 0.1;
  return Math.min(score, 1);
}
