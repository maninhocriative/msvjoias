-- Adicionar campos de configuração de follow-up na tabela ai_agent_config
ALTER TABLE public.ai_agent_config 
ADD COLUMN IF NOT EXISTS followup_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS followup_interval_minutes integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS followup_max_attempts integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS followup_messages text[] DEFAULT ARRAY[
  'Oi! Ainda está por aí? Posso te ajudar com algo mais? 😊',
  'Ei, vi que você ainda não respondeu. Se tiver alguma dúvida, é só me chamar! 💬',
  'Olá! Só passando para ver se está tudo bem. Posso te ajudar em algo? 🙋‍♀️'
]::text[];