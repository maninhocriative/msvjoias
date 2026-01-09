-- Adicionar coluna total_purchases para armazenar o valor total de compras do cliente
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS total_purchases numeric NOT NULL DEFAULT 0.00;