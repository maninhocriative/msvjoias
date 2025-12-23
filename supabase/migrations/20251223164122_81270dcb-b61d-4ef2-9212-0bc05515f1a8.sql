-- Tabela para deduplicação de mensagens do WhatsApp
CREATE TABLE IF NOT EXISTS public.processed_messages (
  id bigserial PRIMARY KEY,
  message_id text NOT NULL,
  phone text NULL,
  thread_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice único para message_id (garante dedupe)
CREATE UNIQUE INDEX IF NOT EXISTS processed_messages_message_id_uidx
ON public.processed_messages (message_id);

-- Índice para consultas por phone
CREATE INDEX IF NOT EXISTS processed_messages_phone_idx
ON public.processed_messages (phone);

-- Índice para consultas por thread_id
CREATE INDEX IF NOT EXISTS processed_messages_thread_idx
ON public.processed_messages (thread_id);

-- Habilitar RLS (tabela será acessada via service_role)
ALTER TABLE public.processed_messages ENABLE ROW LEVEL SECURITY;

-- Policy para service role poder fazer tudo (via edge functions)
CREATE POLICY "Service role pode gerenciar mensagens processadas"
ON public.processed_messages
FOR ALL
USING (true)
WITH CHECK (true);