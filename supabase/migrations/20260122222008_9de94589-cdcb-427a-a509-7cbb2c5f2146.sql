-- Cron job para enviar relatório de clientes aguardando a cada 6 horas
-- Horários: 6h, 12h, 18h, 00h (horário Manaus = 10h, 16h, 22h, 04h UTC)

SELECT cron.schedule(
  'waiting-customers-report-every-6h',
  '0 10,16,22,4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/waiting-customers-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);