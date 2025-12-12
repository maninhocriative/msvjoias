-- Criar função update_updated_at_column primeiro
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Criar tabela de variações de produtos (tamanhos e estoque)
CREATE TABLE public.product_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, size)
);

-- Habilitar RLS
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Política para visualização pública (catálogo)
CREATE POLICY "Variações são visíveis publicamente"
ON public.product_variants
FOR SELECT
USING (true);

-- Política para inserção (usuários autenticados)
CREATE POLICY "Usuários autenticados podem criar variações"
ON public.product_variants
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para atualização (usuários autenticados)
CREATE POLICY "Usuários autenticados podem atualizar variações"
ON public.product_variants
FOR UPDATE
TO authenticated
USING (true);

-- Política para deleção (usuários autenticados)
CREATE POLICY "Usuários autenticados podem deletar variações"
ON public.product_variants
FOR DELETE
TO authenticated
USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_product_variants_updated_at
BEFORE UPDATE ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();