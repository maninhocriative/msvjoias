-- Atualizar mensagens que foram salvas com variável não resolvida do Fiqon
UPDATE messages 
SET content = '[Mensagem do cliente não capturada]'
WHERE content LIKE '$%' AND is_from_me = false;

-- Atualizar last_message das conversas que têm mensagem inválida
UPDATE conversations c
SET last_message = (
  SELECT COALESCE(m.content, '[Sem mensagem]')
  FROM messages m
  WHERE m.conversation_id = c.id
  AND m.content NOT LIKE '$%'
  ORDER BY m.created_at DESC
  LIMIT 1
)
WHERE c.last_message LIKE '$%';