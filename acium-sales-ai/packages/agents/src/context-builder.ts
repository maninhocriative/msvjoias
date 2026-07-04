export type AgentMemoryContext = {
  shortTermMessages: unknown[];
  operationalState: Record<string, unknown>;
  persistentFacts: unknown[];
  semanticMatches: unknown[];
};

export function buildAgentContext(context: AgentMemoryContext) {
  return {
    memory: context,
    guardrails: {
      neverInventCatalogData: true,
      neverRespondWhenAutomationPaused: true,
      requireToolForCatalogClaims: true
    }
  };
}
