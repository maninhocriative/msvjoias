-- Deletar pedidos de teste criados durante os testes de notificação
DELETE FROM orders WHERE id IN (
  'b6697d52-e106-4f47-91fe-ed3749fcb84e',
  '29ba293a-30af-4a96-93f5-285f70aabb72',
  '1037d913-191d-4571-896d-6d900ccf06ba',
  '9705f615-3059-4451-8ac3-49a83f9818bd'
);