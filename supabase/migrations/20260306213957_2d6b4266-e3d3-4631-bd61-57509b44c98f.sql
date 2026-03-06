SELECT cron.unschedule('campanha-dia-mulheres');

SELECT cron.schedule(
  'campanha-dia-mulheres',
  '*/7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/campaign-broadcast',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ"}'::jsonb,
    body := '{"campaign_id":"dia-mulheres-2026-mar","message":"🌸 *Feliz Dia da Mulher!* 🌸\n\nQue tal eternizar um momento especial? 💝\n\nNossos *pingentes em aço inox* com *fotogravação GRÁTIS* são o presente perfeito!\n\nA partir de *R$ 139,00* ✨\n\n📸 Envie a foto que deseja gravar e nós fazemos pra você!\n\nResponda essa mensagem para saber mais! 💬","video_url":"https://mono-canvas-pro.lovable.app/videos/campanha-dia-mulheres.mp4","batch_size":10,"dry_run":false}'::jsonb
  ) AS request_id;
  $$
);