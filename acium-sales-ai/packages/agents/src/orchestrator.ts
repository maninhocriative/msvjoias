import { routeAgent, type RoutingContext } from "./router";

export async function orchestrateIncomingMessage(context: RoutingContext) {
  const decision = routeAgent(context);

  if (!decision.shouldRespond || decision.selectedAgent === "human") {
    return { decision, response: null };
  }

  return {
    decision,
    response: {
      agent: decision.selectedAgent,
      requiresCatalogToolBeforeProductClaim: true
    }
  };
}
