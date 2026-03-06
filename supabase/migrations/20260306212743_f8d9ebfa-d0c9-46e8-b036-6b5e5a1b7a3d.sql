CREATE TABLE public.campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, phone)
);

ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode gerenciar campanhas"
ON public.campaign_sends FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_campaign_sends_campaign ON public.campaign_sends(campaign_id);
CREATE INDEX idx_campaign_sends_phone ON public.campaign_sends(phone);