-- Atualizar configuração de follow-up para 5 tentativas com mensagens customizadas
UPDATE ai_agent_config 
SET followup_max_attempts = 5,
    followup_messages = ARRAY[
      'Oi! Ainda está por aí? Posso te ajudar com algo mais? 😊',
      'Ei, vi que você ainda não respondeu. Se tiver alguma dúvida, é só me chamar! 💬',
      'Olá! Só passando para ver se está tudo bem. Posso te ajudar em algo? 🙋‍♀️',
      '🎁 OFERTA ESPECIAL! Comprando o par de alianças, você GANHA um pingente fotogravado personalizado! Essa promoção é por tempo limitado. Quer aproveitar? 💍✨',
      'Oi! Passando aqui pela última vez. Se precisar de ajuda para escolher suas alianças ou pingentes, estou à disposição! 💎'
    ];

-- Resetar contadores de follow-up das conversas ativas para receberem os novos follow-ups
UPDATE aline_conversations 
SET followup_count = 0 
WHERE status = 'active';