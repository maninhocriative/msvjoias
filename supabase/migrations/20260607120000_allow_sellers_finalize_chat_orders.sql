DROP POLICY IF EXISTS "Gerentes e admins podem ver pedidos" ON public.orders;
DROP POLICY IF EXISTS "Gerentes e admins podem criar pedidos" ON public.orders;
DROP POLICY IF EXISTS "Gerentes e admins podem atualizar pedidos" ON public.orders;

CREATE POLICY "Equipe comercial pode ver pedidos"
ON public.orders
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'gerente'::app_role)
  OR public.has_role(auth.uid(), 'vendedor'::app_role)
);

CREATE POLICY "Equipe comercial pode criar pedidos"
ON public.orders
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'gerente'::app_role)
  OR public.has_role(auth.uid(), 'vendedor'::app_role)
);

CREATE POLICY "Equipe comercial pode atualizar pedidos"
ON public.orders
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'gerente'::app_role)
  OR public.has_role(auth.uid(), 'vendedor'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'gerente'::app_role)
  OR public.has_role(auth.uid(), 'vendedor'::app_role)
);
