-- Tabela: aline_conversations
-- Controla o estado da conversa
CREATE TABLE public.aline_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  current_node text NOT NULL DEFAULT 'abertura',
  last_node text,
  collected_data jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela: aline_messages
-- Histórico completo da conversa
CREATE TABLE public.aline_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.aline_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'aline')),
  message text NOT NULL,
  node text,
  actions_executed jsonb,
  created_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_aline_conversations_phone ON public.aline_conversations(phone);
CREATE INDEX idx_aline_conversations_status ON public.aline_conversations(status);
CREATE INDEX idx_aline_messages_conversation_id ON public.aline_messages(conversation_id);
CREATE INDEX idx_aline_messages_created_at ON public.aline_messages(created_at);

-- Trigger para updated_at
CREATE TRIGGER update_aline_conversations_updated_at
  BEFORE UPDATE ON public.aline_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.aline_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aline_messages ENABLE ROW LEVEL SECURITY;

-- Policies para aline_conversations
CREATE POLICY "Service role pode gerenciar conversas aline"
  ON public.aline_conversations FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem ver conversas aline"
  ON public.aline_conversations FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Policies para aline_messages
CREATE POLICY "Service role pode gerenciar mensagens aline"
  ON public.aline_messages FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem ver mensagens aline"
  ON public.aline_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);