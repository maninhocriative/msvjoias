import { describe, expect, it } from "vitest";
import { routeAgent, type RoutingContext } from "./router";

const baseContext: RoutingContext = {
  conversationId: "c1",
  channel: "whatsapp",
  stage: "new_lead",
  currentAgent: "auto_router",
  normalizedText: "quero ver alianca dourada",
  humanTakeover: false,
  automationPaused: false,
  paymentPending: false,
  orderPending: false,
  productSelected: false
};

describe("routeAgent", () => {
  it("blocks automatic response when human takeover is active", () => {
    const decision = routeAgent({ ...baseContext, humanTakeover: true });
    expect(decision.selectedAgent).toBe("human");
    expect(decision.shouldRespond).toBe(false);
  });

  it("forces handoff when customer asks for a human", () => {
    const decision = routeAgent({ ...baseContext, normalizedText: "quero falar com um atendente" });
    expect(decision.shouldHandoff).toBe(true);
    expect(decision.handoff?.reason).toBe("cliente_pediu_humano");
  });

  it("routes wedding ring intent to Keila", () => {
    const decision = routeAgent(baseContext);
    expect(decision.selectedAgent).toBe("keila");
    expect(decision.shouldRespond).toBe(true);
  });
});
