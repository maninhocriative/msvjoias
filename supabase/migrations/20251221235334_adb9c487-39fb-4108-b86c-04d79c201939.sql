-- Inserir configuração do número de notificação WhatsApp
INSERT INTO store_settings (key, value, description)
VALUES ('notification_whatsapp', '5592984145531', 'Número WhatsApp para receber notificações de novos pedidos')
ON CONFLICT (key) DO NOTHING;