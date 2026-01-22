-- Adicionar campos para rastrear quando o vendedor está ativamente atendendo
ALTER TABLE seller_presence 
ADD COLUMN IF NOT EXISTS is_chatting boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS current_chat_phone text,
ADD COLUMN IF NOT EXISTS chat_started_at timestamp with time zone;