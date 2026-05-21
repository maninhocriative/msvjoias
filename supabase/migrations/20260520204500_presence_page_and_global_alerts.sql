-- Track where each seller is in the CRM and support global in-app alerts.
ALTER TABLE public.seller_presence
  ADD COLUMN IF NOT EXISTS current_page text,
  ADD COLUMN IF NOT EXISTS current_path text,
  ADD COLUMN IF NOT EXISTS page_updated_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.crm_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Alerta',
  message text NOT NULL,
  alert_type text NOT NULL DEFAULT 'manual',
  target_role text NOT NULL DEFAULT 'vendedor',
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamp with time zone DEFAULT (now() + interval '15 minutes'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  acknowledged_at timestamp with time zone
);

ALTER TABLE public.crm_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_alerts' AND policyname = 'Staff podem ver alertas CRM'
  ) THEN
    CREATE POLICY "Staff podem ver alertas CRM"
      ON public.crm_alerts FOR SELECT
      TO authenticated
      USING (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'gerente')
        OR public.has_role(auth.uid(), 'vendedor')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_alerts' AND policyname = 'Admin e gerente podem criar alertas CRM'
  ) THEN
    CREATE POLICY "Admin e gerente podem criar alertas CRM"
      ON public.crm_alerts FOR INSERT
      TO authenticated
      WITH CHECK (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'gerente')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_alerts' AND policyname = 'Admin e gerente podem atualizar alertas CRM'
  ) THEN
    CREATE POLICY "Admin e gerente podem atualizar alertas CRM"
      ON public.crm_alerts FOR UPDATE
      TO authenticated
      USING (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'gerente')
      )
      WITH CHECK (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'gerente')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_seller_presence_online_seen
  ON public.seller_presence(is_online, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_alerts_active_created
  ON public.crm_alerts(active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_alerts_conversation
  ON public.crm_alerts(conversation_id);
