-- Remover cron job anterior
SELECT cron.unschedule('seller-offline-alert-daily');

-- Agendar verificações nos novos horários (Brasília = UTC-3)
-- 10h Brasília = 13h UTC
SELECT cron.schedule(
  'seller-offline-alert-10h',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/seller-offline-alert',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ"}'::jsonb,
    body := '{"source": "cron-10h"}'::jsonb
  ) AS request_id;
  $$
);

-- 14h Brasília = 17h UTC
SELECT cron.schedule(
  'seller-offline-alert-14h',
  '0 17 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/seller-offline-alert',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ"}'::jsonb,
    body := '{"source": "cron-14h"}'::jsonb
  ) AS request_id;
  $$
);

-- 18h Brasília = 21h UTC
SELECT cron.schedule(
  'seller-offline-alert-18h',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/seller-offline-alert',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ"}'::jsonb,
    body := '{"source": "cron-18h"}'::jsonb
  ) AS request_id;
  $$
);

-- 20h Brasília = 23h UTC
SELECT cron.schedule(
  'seller-offline-alert-20h',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/seller-offline-alert',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ"}'::jsonb,
    body := '{"source": "cron-20h"}'::jsonb
  ) AS request_id;
  $$
);