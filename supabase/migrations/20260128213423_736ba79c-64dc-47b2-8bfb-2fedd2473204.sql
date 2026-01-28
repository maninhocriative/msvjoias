-- Adicionar campo para ordenação correta por última mensagem
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Atualizar registros existentes com base em created_at atual
UPDATE public.conversations 
SET last_message_at = created_at 
WHERE last_message_at IS NULL;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at 
ON public.conversations(last_message_at DESC);