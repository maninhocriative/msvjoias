-- Criar tabela para rastrear presença dos vendedores online
CREATE TABLE public.seller_presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  is_online BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.seller_presence ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Usuários autenticados podem ver presença"
  ON public.seller_presence FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários podem atualizar própria presença"
  ON public.seller_presence FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir própria presença"
  ON public.seller_presence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Adicionar campos à tabela aline_conversations para rastrear atribuição
ALTER TABLE public.aline_conversations 
  ADD COLUMN IF NOT EXISTS assigned_seller_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_seller_name TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS assignment_reason TEXT;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_seller_presence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_seller_presence_updated_at
  BEFORE UPDATE ON public.seller_presence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_seller_presence_updated_at();