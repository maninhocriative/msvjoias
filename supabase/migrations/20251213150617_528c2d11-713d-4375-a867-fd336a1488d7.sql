-- Tabela de configurações da loja
CREATE TABLE public.store_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Inserir configuração padrão de cashback
INSERT INTO public.store_settings (key, value, description) VALUES 
  ('cashback_percentage', '5', 'Porcentagem de cashback para clientes fidelizados');

-- Enable RLS
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Policies para store_settings (apenas admins)
CREATE POLICY "Admins podem ver configurações" ON public.store_settings
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar configurações" ON public.store_settings
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem criar configurações" ON public.store_settings
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de clientes (CRM/Fidelidade)
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  whatsapp text NOT NULL UNIQUE,
  cpf text,
  wallet_balance decimal(10,2) NOT NULL DEFAULT 0.00,
  total_orders integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Policies para customers
CREATE POLICY "Usuários autenticados podem ver clientes" ON public.customers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Gerentes e admins podem criar clientes" ON public.customers
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerentes e admins podem atualizar clientes" ON public.customers
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Admins podem deletar clientes" ON public.customers
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de transações de fidelidade (extrato)
CREATE TABLE public.loyalty_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('CREDIT', 'DEBIT', 'MANUAL_ADJUSTMENT')),
  amount decimal(10,2) NOT NULL,
  order_reference text,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- Policies para loyalty_transactions
CREATE POLICY "Usuários autenticados podem ver transações" ON public.loyalty_transactions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Gerentes e admins podem criar transações" ON public.loyalty_transactions
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

-- Tabela de ofertas relâmpago
CREATE TABLE public.offers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  promotional_price decimal(10,2) NOT NULL,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  gift_description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- Policies para offers
CREATE POLICY "Ofertas são visíveis publicamente" ON public.offers
  FOR SELECT USING (true);

CREATE POLICY "Gerentes e admins podem criar ofertas" ON public.offers
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerentes e admins podem atualizar ofertas" ON public.offers
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerentes e admins podem deletar ofertas" ON public.offers
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar novos campos à tabela products
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS min_stock_alert integer DEFAULT 5;

-- Função para adicionar cashback ao cliente
CREATE OR REPLACE FUNCTION public.add_customer_cashback(
  p_customer_id uuid,
  p_order_value decimal,
  p_order_reference text
)
RETURNS decimal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cashback_percentage decimal;
  v_cashback_amount decimal;
BEGIN
  -- Buscar porcentagem de cashback das configurações
  SELECT CAST(value AS decimal) INTO v_cashback_percentage
  FROM store_settings WHERE key = 'cashback_percentage';
  
  IF v_cashback_percentage IS NULL THEN
    v_cashback_percentage := 5; -- Default 5%
  END IF;
  
  -- Calcular cashback
  v_cashback_amount := ROUND(p_order_value * (v_cashback_percentage / 100), 2);
  
  -- Atualizar saldo do cliente
  UPDATE customers 
  SET wallet_balance = wallet_balance + v_cashback_amount,
      total_orders = total_orders + 1
  WHERE id = p_customer_id;
  
  -- Registrar transação
  INSERT INTO loyalty_transactions (customer_id, type, amount, order_reference, description)
  VALUES (p_customer_id, 'CREDIT', v_cashback_amount, p_order_reference, 
          'Cashback de ' || v_cashback_percentage || '% sobre compra de R$' || p_order_value);
  
  RETURN v_cashback_amount;
END;
$$;

-- Função para resgatar cashback
CREATE OR REPLACE FUNCTION public.redeem_customer_cashback(
  p_customer_id uuid,
  p_amount decimal,
  p_order_reference text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance decimal;
BEGIN
  -- Verificar saldo atual
  SELECT wallet_balance INTO v_current_balance
  FROM customers WHERE id = p_customer_id;
  
  IF v_current_balance < p_amount THEN
    RETURN false;
  END IF;
  
  -- Debitar saldo
  UPDATE customers 
  SET wallet_balance = wallet_balance - p_amount
  WHERE id = p_customer_id;
  
  -- Registrar transação
  INSERT INTO loyalty_transactions (customer_id, type, amount, order_reference, description)
  VALUES (p_customer_id, 'DEBIT', p_amount, p_order_reference, 'Resgate de cashback');
  
  RETURN true;
END;
$$;