-- Fix category typos
UPDATE products SET category = 'aliancas' WHERE category = 'alianaas de tungstenio';
UPDATE products SET category = 'personalizacao' WHERE category = 'personalizaaao';

-- Fix products with NULL color based on their names
UPDATE products SET color = 'dourada' WHERE category = 'aliancas' AND color IS NULL AND (
  lower(name) LIKE '%dourad%' OR lower(name) LIKE '%ouro%' OR lower(name) LIKE '%b. ouro%'
);
UPDATE products SET color = 'preta' WHERE category = 'aliancas' AND color IS NULL AND (
  lower(name) LIKE '%black%' OR lower(name) LIKE '%pret%'
);
UPDATE products SET color = 'prata' WHERE category = 'aliancas' AND color IS NULL AND (
  lower(name) LIKE '%prata%' OR lower(name) LIKE '%grafite%' OR lower(name) LIKE '%escovad%'
);