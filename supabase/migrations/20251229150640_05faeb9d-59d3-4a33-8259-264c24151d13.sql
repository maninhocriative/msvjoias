-- Criar cron job para follow-up da Aline a cada 5 minutos
SELECT cron.schedule(
  'aline-followup-job',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/aline-followup',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $$
);