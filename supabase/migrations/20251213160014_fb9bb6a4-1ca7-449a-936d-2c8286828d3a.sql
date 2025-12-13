-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Usuários autenticados podem ver clientes" ON public.customers;

-- Create a new restricted SELECT policy - only admin and gerente can view customers
CREATE POLICY "Admins e gerentes podem ver clientes" 
ON public.customers 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));