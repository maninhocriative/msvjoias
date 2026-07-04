import type { FollowupType } from "./rules";

export const followupTemplates: Record<FollowupType, string> = {
  catalog_abandoned: "Vi que voce estava olhando algumas opcoes. Quer que eu te mande as mais vendidas ou as mais economicas?",
  price_abandoned: "Consegui separar uma opcao com otimo custo-beneficio para voce. Quer ver?",
  payment_pending: "Seu pedido ficou quase pronto por aqui. Quer que eu te envie novamente o link de pagamento para garantir a peca?",
  photo_pending: "Falta so a foto para eu continuar com seu pingente. Quer me enviar agora?",
  approval_pending: "Falta so sua aprovacao para eu seguir com o pedido. Posso te mostrar o resumo?",
  pickup_pending: "Seu pedido ja foi separado. Posso te passar as orientacoes de retirada?",
  delivery_pending: "Seu pedido esta na etapa de entrega. Quer que eu te atualize por aqui?",
  old_customer_reactivation: "Separei algumas novidades que combinam com o que voce ja gostou antes. Quer ver?",
  post_sale: "Como ficou sua experiencia com a ACIUM? Posso te ajudar com mais alguma coisa?",
  high_value_lead: "Tenho algumas opcoes especiais para o que voce esta buscando. Quer que eu te mostre as melhores?"
};
