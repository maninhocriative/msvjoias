import { canSendFollowup, inferFollowupType, type FollowupContext } from "./rules";
import { scoreFollowupOpportunity } from "./scoring";
import { followupTemplates } from "./templates";

export function planFollowup(context: FollowupContext) {
  const gate = canSendFollowup(context);
  if (!gate.allowed) {
    return { shouldSend: false, reason: gate.reason, type: null, template: null, score: 0 };
  }

  const type = inferFollowupType(context.stage);
  if (!type) {
    return { shouldSend: false, reason: "no_followup_type_for_stage", type: null, template: null, score: 0 };
  }

  const score = scoreFollowupOpportunity(context);
  return {
    shouldSend: score >= 0.55,
    reason: score >= 0.55 ? "eligible" : "low_score",
    type,
    template: followupTemplates[type],
    score
  };
}
