import { describe, expect, it } from "vitest";
import { planFollowup } from "./engine";
import type { FollowupContext } from "./rules";

const baseContext: FollowupContext = {
  conversationId: "c1",
  stage: "payment_pending",
  humanTakeover: false,
  automationPaused: false,
  customerAskedToStop: false,
  finishedOrder: false,
  complaintOpen: false,
  channelAllowsFreeMessage: true,
  templateApproved: false,
  recentlyFollowedUp: false,
  attempts: 0,
  maxAttempts: 3,
  minutesSinceLastCustomerMessage: 120
};

describe("planFollowup", () => {
  it("blocks follow-up when human is active", () => {
    const plan = planFollowup({ ...baseContext, humanTakeover: true });
    expect(plan.shouldSend).toBe(false);
    expect(plan.reason).toBe("human_takeover_active");
  });

  it("plans contextual payment follow-up when eligible", () => {
    const plan = planFollowup(baseContext);
    expect(plan.shouldSend).toBe(true);
    expect(plan.type).toBe("payment_pending");
  });
});
