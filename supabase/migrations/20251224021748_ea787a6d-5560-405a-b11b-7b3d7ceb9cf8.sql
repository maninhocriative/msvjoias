-- Atualizar cores dos pingentes Inox para "prata"
UPDATE products SET color = 'prata' WHERE id IN (
  'bdf5b460-d065-4758-922a-e419b71db6f2',  -- Pingente Inox Formato Coração
  '1f4cc71a-9c2d-48d3-8ec4-c1363ebc2489',  -- Pingente Inox Octagonal
  '3bc66ae3-c741-403f-8b6b-52af2b74a9f7',  -- Pingente Inox Redondo
  'da983a25-367e-46a0-b2e4-e51de88106e6'   -- Tag de Inox Polido
);

-- Corrigir "dourado" para "dourada" (padrão normalizado)
UPDATE products SET color = 'dourada' WHERE id = 'd92c2ac5-cc54-4330-9357-1c50347b71ca';