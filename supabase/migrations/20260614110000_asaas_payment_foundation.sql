-- Fundacao para cobrancas Asaas geridas pelo WhatsApp/CRM.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS asaas_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_asaas_customer_id
ON public.customers (asaas_customer_id)
WHERE asaas_customer_id IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_invoice_url text,
  ADD COLUMN IF NOT EXISTS asaas_bank_slip_url text,
  ADD COLUMN IF NOT EXISTS asaas_pix_payload text,
  ADD COLUMN IF NOT EXISTS asaas_pix_qr_code_base64 text,
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_asaas_payment_id
ON public.orders (asaas_payment_id)
WHERE asaas_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_charges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'asaas',
  provider_customer_id text,
  provider_payment_id text,
  billing_type text NOT NULL DEFAULT 'UNDEFINED',
  status text NOT NULL DEFAULT 'created',
  amount numeric(10,2) NOT NULL DEFAULT 0,
  due_date date,
  invoice_url text,
  bank_slip_url text,
  pix_payload text,
  pix_qr_code_base64 text,
  raw_response jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_charges_provider_payment_id
ON public.payment_charges (provider, provider_payment_id)
WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_charges_order_id
ON public.payment_charges (order_id);

CREATE INDEX IF NOT EXISTS idx_payment_charges_status_created_at
ON public.payment_charges (status, created_at DESC);

ALTER TABLE public.payment_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff pode ver cobrancas" ON public.payment_charges;
CREATE POLICY "Staff pode ver cobrancas"
ON public.payment_charges FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'vendedor'::app_role)
);

DROP POLICY IF EXISTS "Gerentes e admins podem gerenciar cobrancas" ON public.payment_charges;
CREATE POLICY "Gerentes e admins podem gerenciar cobrancas"
ON public.payment_charges FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
);

DROP TRIGGER IF EXISTS update_payment_charges_updated_at ON public.payment_charges;
CREATE TRIGGER update_payment_charges_updated_at
BEFORE UPDATE ON public.payment_charges
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL DEFAULT 'asaas',
  event_type text NOT NULL,
  provider_payment_id text,
  payload jsonb NOT NULL,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (provider, event_type, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_created_at
ON public.payment_webhook_events (created_at DESC);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem ver eventos de pagamento" ON public.payment_webhook_events;
CREATE POLICY "Admins podem ver eventos de pagamento"
ON public.payment_webhook_events FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
