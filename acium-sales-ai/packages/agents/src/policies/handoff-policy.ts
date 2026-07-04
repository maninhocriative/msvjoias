export type ForcedHandoff = {
  code: string;
  reason: string;
  priority: "low" | "normal" | "high" | "urgent";
  queue: "vendas" | "financeiro" | "suporte" | "gerencia";
  summary: string;
};

export function shouldForceHandoff(normalizedText: string | null): ForcedHandoff | null {
  if (!normalizedText) {
    return {
      code: "mensagem_incompreensivel",
      reason: "Message has no text that can be safely interpreted.",
      priority: "normal",
      queue: "vendas",
      summary: "Customer sent a message that needs human review."
    };
  }

  if (matches(normalizedText, ["atendente", "humano", "pessoa", "vendedor", "falar com alguem"])) {
    return {
      code: "cliente_pediu_humano",
      reason: "Customer explicitly asked for human assistance.",
      priority: "normal",
      queue: "vendas",
      summary: "Customer asked to speak with a human."
    };
  }

  if (matches(normalizedText, ["reclamacao", "reclamar", "irritado", "absurdo", "problema serio", "cancelar"])) {
    return {
      code: "cliente_irritado_ou_reclamacao",
      reason: "Customer appears upset or is making a complaint.",
      priority: "high",
      queue: "suporte",
      summary: "Customer message indicates complaint or high-friction situation."
    };
  }

  if (matches(normalizedText, ["comprovante errado", "pagamento deu erro", "cobranca errada", "paguei e nao confirmou"])) {
    return {
      code: "pagamento_ou_comprovante_com_problema",
      reason: "Payment or proof issue requires finance review.",
      priority: "high",
      queue: "financeiro",
      summary: "Customer reports a payment or proof divergence."
    };
  }

  return null;
}

function matches(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
