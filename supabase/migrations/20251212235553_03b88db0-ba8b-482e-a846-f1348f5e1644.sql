-- Adicionar campos extras na tabela products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS sku text UNIQUE,
ADD COLUMN IF NOT EXISTS video_url text,
ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';

-- Criar índice para busca por SKU
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);

-- Adicionar campo para registrar interesse em produtos nas mensagens
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS product_interest uuid REFERENCES public.products(id) ON DELETE SET NULL;

-- Criar índice para buscar mensagens com interesse em produtos
CREATE INDEX IF NOT EXISTS idx_messages_product_interest ON public.messages(product_interest) WHERE product_interest IS NOT NULL;