-- Enable RLS on products table
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Products should be viewable by everyone (public catalog)
CREATE POLICY "Produtos são visíveis publicamente"
ON public.products
FOR SELECT
USING (true);

-- Only admins and managers can create products
CREATE POLICY "Gerentes e admins podem criar produtos"
ON public.products
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente'));

-- Only admins and managers can update products
CREATE POLICY "Gerentes e admins podem atualizar produtos"
ON public.products
FOR UPDATE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente'));

-- Only admins and managers can delete products
CREATE POLICY "Gerentes e admins podem deletar produtos"
ON public.products
FOR DELETE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente'));

-- Enable RLS on conversations table
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view conversations
CREATE POLICY "Usuários autenticados podem ver conversas"
ON public.conversations
FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can create conversations
CREATE POLICY "Usuários autenticados podem criar conversas"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Authenticated users can update conversations
CREATE POLICY "Usuários autenticados podem atualizar conversas"
ON public.conversations
FOR UPDATE
TO authenticated
USING (true);

-- Enable RLS on messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view messages
CREATE POLICY "Usuários autenticados podem ver mensagens"
ON public.messages
FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can create messages
CREATE POLICY "Usuários autenticados podem criar mensagens"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Authenticated users can update messages
CREATE POLICY "Usuários autenticados podem atualizar mensagens"
ON public.messages
FOR UPDATE
TO authenticated
USING (true);