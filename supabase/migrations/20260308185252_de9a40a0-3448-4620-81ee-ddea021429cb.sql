
CREATE TABLE public.scheduled_callbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  callback_date date NOT NULL,
  reason text,
  context jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  executed_at timestamp with time zone,
  UNIQUE(phone, callback_date)
);

ALTER TABLE public.scheduled_callbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode gerenciar callbacks" ON public.scheduled_callbacks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff pode ver callbacks" ON public.scheduled_callbacks
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'vendedor'::app_role));
