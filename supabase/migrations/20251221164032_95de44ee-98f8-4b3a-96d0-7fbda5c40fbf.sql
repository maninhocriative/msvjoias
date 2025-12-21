-- Habilitar RLS nas tabelas que estavam sem
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;

-- Políticas para conversation_events
CREATE POLICY "Usuários autenticados podem ver eventos" ON public.conversation_events
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Sistema pode criar eventos" ON public.conversation_events
FOR INSERT WITH CHECK (true);

-- Políticas para conversation_state
CREATE POLICY "Usuários autenticados podem ver estado" ON public.conversation_state
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Sistema pode atualizar estado" ON public.conversation_state
FOR ALL USING (true);