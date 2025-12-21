-- Criar tabela catalog_sessions
CREATE TABLE public.catalog_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  line text NOT NULL,
  intent text NULL,
  preferred_color text NULL,
  budget_max numeric NULL,
  session_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Criar índice para phone
CREATE INDEX idx_catalog_sessions_phone ON public.catalog_sessions(phone);

-- Enable RLS
ALTER TABLE public.catalog_sessions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Gerentes e admins podem ver sessões" ON public.catalog_sessions
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerentes e admins podem criar sessões" ON public.catalog_sessions
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerentes e admins podem atualizar sessões" ON public.catalog_sessions
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

-- Criar tabela catalog_items_sent
CREATE TABLE public.catalog_items_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.catalog_sessions(id) ON DELETE CASCADE,
  position int NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  price numeric NULL,
  price_formatted text NULL,
  sizes jsonb NULL,
  image_url text NULL,
  video_url text NULL,
  media_type text NOT NULL,
  media_url text NOT NULL,
  stock_total int NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Criar índices
CREATE INDEX idx_catalog_items_sent_session_id ON public.catalog_items_sent(session_id);
CREATE INDEX idx_catalog_items_sent_sku ON public.catalog_items_sent(sku);

-- Enable RLS
ALTER TABLE public.catalog_items_sent ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Gerentes e admins podem ver itens" ON public.catalog_items_sent
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerentes e admins podem criar itens" ON public.catalog_items_sent
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

-- Adicionar novos campos na tabela orders existente
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS session_id uuid NULL REFERENCES public.catalog_sessions(id),
ADD COLUMN IF NOT EXISTS selected_name text NULL,
ADD COLUMN IF NOT EXISTS selected_sku text NULL,
ADD COLUMN IF NOT EXISTS selected_size_1 text NULL,
ADD COLUMN IF NOT EXISTS selected_size_2 text NULL,
ADD COLUMN IF NOT EXISTS unit_or_pair text NULL,
ADD COLUMN IF NOT EXISTS payment_method text NULL,
ADD COLUMN IF NOT EXISTS delivery_method text NULL,
ADD COLUMN IF NOT EXISTS delivery_address text NULL,
ADD COLUMN IF NOT EXISTS notes text NULL,
ADD COLUMN IF NOT EXISTS summary_text text NULL,
ADD COLUMN IF NOT EXISTS assigned_to text NULL;

-- Atualizar status default para incluir novos valores
-- Criar índices adicionais para orders
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_selected_sku ON public.orders(selected_sku);