-- Função auxiliar para remover acentos
CREATE OR REPLACE FUNCTION public.unaccent_text(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(
    $1,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiioooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  )
$$;

-- 1. NORMALIZAR COLUNA CATEGORY
UPDATE products SET category = 
  CASE 
    WHEN lower(public.unaccent_text(category)) IN ('aliancas de tungstenio', 'aliancas de aco', 'aliancas', 'alianca') THEN 'aliancas'
    WHEN lower(public.unaccent_text(category)) IN ('pingente', 'pingentes') THEN 'pingente'
    WHEN lower(public.unaccent_text(category)) IN ('aneis', 'anel') THEN 'aneis'
    WHEN lower(public.unaccent_text(category)) IN ('personalizacao', 'personalizacoes') THEN 'personalizacao'
    ELSE lower(public.unaccent_text(COALESCE(category, '')))
  END
WHERE category IS NOT NULL;

-- 2. NORMALIZAR COLUNA COLOR (converter para minúsculo sem acentos)
UPDATE products SET color = lower(public.unaccent_text(color))
WHERE color IS NOT NULL;

-- 3. PREENCHER COLOR NULL baseado em name ou description
UPDATE products SET color = 
  CASE
    WHEN lower(public.unaccent_text(COALESCE(name, '') || ' ' || COALESCE(description, ''))) LIKE '%dourada%' THEN 'dourada'
    WHEN lower(public.unaccent_text(COALESCE(name, '') || ' ' || COALESCE(description, ''))) LIKE '%dourado%' THEN 'dourada'
    WHEN lower(public.unaccent_text(COALESCE(name, '') || ' ' || COALESCE(description, ''))) LIKE '%prata%' THEN 'prata'
    WHEN lower(public.unaccent_text(COALESCE(name, '') || ' ' || COALESCE(description, ''))) LIKE '%aco%' THEN 'aco'
    WHEN lower(public.unaccent_text(COALESCE(name, '') || ' ' || COALESCE(description, ''))) LIKE '%preta%' THEN 'preta'
    WHEN lower(public.unaccent_text(COALESCE(name, '') || ' ' || COALESCE(description, ''))) LIKE '%preto%' THEN 'preta'
    WHEN lower(public.unaccent_text(COALESCE(name, '') || ' ' || COALESCE(description, ''))) LIKE '%azul%' THEN 'azul'
    ELSE NULL
  END
WHERE color IS NULL;

-- 4. GERAR DESCRIPTION AUTOMÁTICA onde estiver NULL
UPDATE products SET description = 
  CASE category
    WHEN 'aliancas' THEN 'Aliança de alta qualidade em ' || COALESCE(color, 'acabamento premium') || '. ' || name || '. Material resistente e durável.'
    WHEN 'pingente' THEN 'Pingente elegante ' || COALESCE(color, '') || '. ' || name || '. Design exclusivo.'
    WHEN 'aneis' THEN 'Anel sofisticado em ' || COALESCE(color, 'acabamento refinado') || '. ' || name || '.'
    WHEN 'personalizacao' THEN 'Serviço de personalização. ' || name || '. Deixe sua peça única.'
    ELSE name || '. Produto de alta qualidade.'
  END
WHERE description IS NULL OR description = '';

-- 5. ATIVAR PRODUTOS COM ESTOQUE
UPDATE products p SET active = true
WHERE EXISTS (
  SELECT 1 FROM product_variants pv 
  WHERE pv.product_id = p.id AND pv.stock > 0
);

-- 6. Criar função para normalizar automaticamente em novos inserts/updates
CREATE OR REPLACE FUNCTION public.normalize_product_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Normalizar category
  IF NEW.category IS NOT NULL THEN
    NEW.category := CASE 
      WHEN lower(public.unaccent_text(NEW.category)) IN ('aliancas de tungstenio', 'aliancas de aco', 'aliancas', 'alianca', 'alianças', 'alianças de tungstênio', 'alianças de aço') THEN 'aliancas'
      WHEN lower(public.unaccent_text(NEW.category)) IN ('pingente', 'pingentes') THEN 'pingente'
      WHEN lower(public.unaccent_text(NEW.category)) IN ('aneis', 'anel', 'anéis') THEN 'aneis'
      WHEN lower(public.unaccent_text(NEW.category)) IN ('personalizacao', 'personalizacoes', 'personalização', 'personalizações') THEN 'personalizacao'
      ELSE lower(public.unaccent_text(NEW.category))
    END;
  END IF;
  
  -- Normalizar color
  IF NEW.color IS NOT NULL THEN
    NEW.color := lower(public.unaccent_text(NEW.color));
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger para normalização automática
DROP TRIGGER IF EXISTS normalize_product_trigger ON products;
CREATE TRIGGER normalize_product_trigger
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_product_fields();