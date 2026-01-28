-- Adicionar coluna zapi_message_id para rastreamento de mensagens
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS zapi_message_id TEXT;

-- Criar índice para busca rápida por message_id do ZAPI
CREATE INDEX IF NOT EXISTS idx_messages_zapi_message_id 
ON public.messages(zapi_message_id) 
WHERE zapi_message_id IS NOT NULL;