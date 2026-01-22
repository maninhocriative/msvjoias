-- Habilitar extensões necessárias para cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agendar verificação diária às 9h (horário de Brasília = 12h UTC)
SELECT cron.schedule(
  'seller-offline-alert-daily',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/seller-offline-alert',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);