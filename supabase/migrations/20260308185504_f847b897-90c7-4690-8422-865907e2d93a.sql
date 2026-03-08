SELECT cron.schedule(
  'aline-daily-callback-check',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/aline-scheduled-callback',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ"}'::jsonb,
    body:='{"time": "daily-check"}'::jsonb
  ) AS request_id;
  $$
);