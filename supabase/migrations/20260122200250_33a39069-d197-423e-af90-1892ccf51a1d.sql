-- Alterar a constraint de status para incluir 'human_takeover'
ALTER TABLE public.aline_conversations 
DROP CONSTRAINT IF EXISTS aline_conversations_status_check;

ALTER TABLE public.aline_conversations 
ADD CONSTRAINT aline_conversations_status_check 
CHECK (status = ANY (ARRAY['active'::text, 'finished'::text, 'human_takeover'::text]));