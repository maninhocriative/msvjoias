-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agendar verificação diária às 09:00 (horário UTC)
SELECT cron.schedule(
  'daily-stock-check',
  '0 9 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/daily-stock-check',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ"}'::jsonb,
      body := '{"triggered_by": "pg_cron"}'::jsonb
    ) AS request_id;
  $$
);