-- Habilitar extensões necessárias para cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Adicionar policy de DELETE para processed_messages (necessário para a limpeza funcionar)
CREATE POLICY "Service role pode deletar mensagens processadas"
ON public.processed_messages
FOR DELETE
USING (true);