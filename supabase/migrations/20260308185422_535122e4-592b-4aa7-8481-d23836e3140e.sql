INSERT INTO public.scheduled_callbacks (phone, callback_date, reason, context, status)
VALUES ('559291283573', '2026-04-05', 'Cliente disse "vou encomendar um pro dia 5" - pedido de casamento, pingente', '{"categoria": "pingente", "finalidade": "casamento", "contact_name": "DJ RAY", "campaign_origin": "dia-mulheres"}'::jsonb, 'pending')
ON CONFLICT (phone, callback_date) DO NOTHING;