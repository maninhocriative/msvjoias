ALTER TABLE public.aline_conversations
  DROP CONSTRAINT IF EXISTS aline_conversations_active_agent_check;

ALTER TABLE public.aline_conversations
  ADD CONSTRAINT aline_conversations_active_agent_check
  CHECK (active_agent IN ('aline', 'keila', 'kate', 'malu', 'human'));

ALTER TABLE public.customer_agent_memory
  DROP CONSTRAINT IF EXISTS customer_agent_memory_agent_slug_check;

ALTER TABLE public.customer_agent_memory
  ADD CONSTRAINT customer_agent_memory_agent_slug_check
  CHECK (agent_slug IN ('aline', 'keila', 'kate', 'malu'));

ALTER TABLE public.aline_messages
  DROP CONSTRAINT IF EXISTS aline_messages_role_check;

ALTER TABLE public.aline_messages
  ADD CONSTRAINT aline_messages_role_check
  CHECK (role IN ('user', 'aline', 'keila', 'kate', 'malu', 'human'));
