
-- ============================================================
-- FIX 1: aline_conversations - restrict SELECT to staff roles only
-- ============================================================
DROP POLICY IF EXISTS "Usuários autenticados podem ver conversas aline" ON public.aline_conversations;
CREATE POLICY "Staff pode ver conversas aline"
  ON public.aline_conversations FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'gerente') 
    OR public.has_role(auth.uid(), 'vendedor')
  );

DROP POLICY IF EXISTS "Service role pode gerenciar conversas aline" ON public.aline_conversations;
CREATE POLICY "Admin e gerente podem gerenciar conversas aline"
  ON public.aline_conversations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

-- ============================================================
-- FIX 2: aline_messages - restrict SELECT to staff roles
-- ============================================================
DROP POLICY IF EXISTS "Usuários autenticados podem ver mensagens aline" ON public.aline_messages;
CREATE POLICY "Staff pode ver mensagens aline"
  ON public.aline_messages FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'gerente') 
    OR public.has_role(auth.uid(), 'vendedor')
  );

DROP POLICY IF EXISTS "Service role pode gerenciar mensagens aline" ON public.aline_messages;
CREATE POLICY "Admin e gerente podem gerenciar mensagens aline"
  ON public.aline_messages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

-- ============================================================
-- FIX 3: conversation_state - restrict to admin/gerente
-- ============================================================
DROP POLICY IF EXISTS "Usuários autenticados podem ver estado" ON public.conversation_state;
CREATE POLICY "Admin e gerente podem ver estado"
  ON public.conversation_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "Sistema pode atualizar estado" ON public.conversation_state;
CREATE POLICY "Admin e gerente podem gerenciar estado"
  ON public.conversation_state FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

-- ============================================================
-- FIX 4: processed_messages - restrict policies
-- ============================================================
DROP POLICY IF EXISTS "Service role pode gerenciar mensagens processadas" ON public.processed_messages;
DROP POLICY IF EXISTS "Service role pode deletar mensagens processadas" ON public.processed_messages;
CREATE POLICY "Admin pode gerenciar mensagens processadas"
  ON public.processed_messages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- FIX 5: conversations - restrict to staff roles
-- ============================================================
DROP POLICY IF EXISTS "Usuários autenticados podem criar conversas" ON public.conversations;
CREATE POLICY "Staff podem criar conversas"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'gerente') 
    OR public.has_role(auth.uid(), 'vendedor')
  );

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar conversas" ON public.conversations;
CREATE POLICY "Staff podem atualizar conversas"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'gerente') 
    OR public.has_role(auth.uid(), 'vendedor')
  );

DROP POLICY IF EXISTS "Usuários autenticados podem ver conversas" ON public.conversations;
CREATE POLICY "Staff podem ver conversas"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'gerente') 
    OR public.has_role(auth.uid(), 'vendedor')
  );

-- ============================================================
-- FIX 6: messages - restrict to staff roles
-- ============================================================
DROP POLICY IF EXISTS "Usuários autenticados podem criar mensagens" ON public.messages;
CREATE POLICY "Staff podem criar mensagens"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'gerente') 
    OR public.has_role(auth.uid(), 'vendedor')
  );

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar mensagens" ON public.messages;
CREATE POLICY "Staff podem atualizar mensagens"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'gerente') 
    OR public.has_role(auth.uid(), 'vendedor')
  );

DROP POLICY IF EXISTS "Usuários autenticados podem ver mensagens" ON public.messages;
CREATE POLICY "Staff podem ver mensagens"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'gerente') 
    OR public.has_role(auth.uid(), 'vendedor')
  );

-- ============================================================
-- FIX 7: conversation_events - restrict
-- ============================================================
DROP POLICY IF EXISTS "Sistema pode criar eventos" ON public.conversation_events;
CREATE POLICY "Admin e gerente podem criar eventos"
  ON public.conversation_events FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "Usuários autenticados podem ver eventos" ON public.conversation_events;
CREATE POLICY "Staff podem ver eventos"
  ON public.conversation_events FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'gerente') 
    OR public.has_role(auth.uid(), 'vendedor')
  );

-- ============================================================
-- FIX 8: loyalty_transactions - restrict SELECT
-- ============================================================
DROP POLICY IF EXISTS "Usuários autenticados podem ver transações" ON public.loyalty_transactions;
CREATE POLICY "Admin e gerente podem ver transações"
  ON public.loyalty_transactions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

-- ============================================================
-- FIX 9: Fix function search_path mutable
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_seller_presence_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
