export type AgentName =
  | "aline"
  | "keila"
  | "kate"
  | "financeiro"
  | "pedido"
  | "pos_venda"
  | "followup"
  | "human";

export type AgentRoutingDecision = {
  conversationId: string;
  selectedAgent: AgentName;
  confidence: number;
  reason: string;
  stage: string;
  shouldRespond: boolean;
  shouldHandoff: boolean;
  handoff?: {
    mode: "review" | "takeover";
    reason: string;
    priority: "low" | "normal" | "high" | "urgent";
    queue: "vendas" | "financeiro" | "suporte" | "gerencia";
    summary: string;
  };
};
