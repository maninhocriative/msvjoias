-- Ajusta o job de follow-up para rodar a cada 5 minutos.
-- A funcao decide quais conversas podem receber as 3 retomadas curtas dos agentes.
DO $$
BEGIN
  PERFORM cron.unschedule('aline-followup-job');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'aline-followup-job',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/aline-followup',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"trigger": "cron", "version": "agent_rescue_v1"}'::jsonb
  ) AS request_id;
  $$
);
