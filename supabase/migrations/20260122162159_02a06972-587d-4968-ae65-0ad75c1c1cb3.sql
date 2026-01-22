-- Resetar conversa para teste do fluxo completo
-- Deletar mensagens antigas da conversa de teste
DELETE FROM aline_messages WHERE conversation_id = '94d0ddeb-75e0-47a3-a14b-cef8740a7a55';

-- Atualizar conversa para estado inicial
UPDATE aline_conversations 
SET current_node = 'abertura', 
    last_node = NULL,
    collected_data = '{}',
    status = 'active',
    updated_at = now()
WHERE id = '94d0ddeb-75e0-47a3-a14b-cef8740a7a55';