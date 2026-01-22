-- Resetar conversa para novo teste
DELETE FROM aline_messages WHERE conversation_id = '94d0ddeb-75e0-47a3-a14b-cef8740a7a55';

UPDATE aline_conversations 
SET current_node = 'abertura', 
    last_node = NULL,
    collected_data = '{}',
    status = 'active',
    updated_at = now()
WHERE id = '94d0ddeb-75e0-47a3-a14b-cef8740a7a55';