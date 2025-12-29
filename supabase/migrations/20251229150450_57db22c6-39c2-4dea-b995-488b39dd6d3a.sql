-- Adicionar campo followup_count na tabela aline_conversations
ALTER TABLE public.aline_conversations 
ADD COLUMN IF NOT EXISTS followup_count integer DEFAULT 0;

-- Resetar followup_count quando a conversa receber nova mensagem do usuário
-- Isso será feito via código no aline-reply

-- Índice para otimizar busca de conversas para follow-up
CREATE INDEX IF NOT EXISTS idx_aline_conversations_followup 
ON public.aline_conversations (status, last_message_at, followup_count)
WHERE status = 'active';