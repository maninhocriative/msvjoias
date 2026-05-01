-- Tabela de categorias gerenciáveis
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categorias visíveis publicamente"
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "Gerentes e admins podem criar categorias"
  ON public.categories FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerentes e admins podem atualizar categorias"
  ON public.categories FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Admins podem deletar categorias"
  ON public.categories FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed das categorias atuais
INSERT INTO public.categories (slug, label) VALUES
  ('aliancas', 'Alianças'),
  ('pingente', 'Pingente'),
  ('aneis', 'Anéis'),
  ('personalizacao', 'Personalização')
ON CONFLICT (slug) DO NOTHING;

-- Atualizar trigger de normalização para considerar categorias dinâmicas
CREATE OR REPLACE FUNCTION public.normalize_product_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text;
  v_match text;
BEGIN
  IF NEW.category IS NOT NULL THEN
    v_norm := lower(public.unaccent_text(NEW.category));
    NEW.category := CASE 
      WHEN v_norm IN ('aliancas de tungstenio', 'aliancas de aco', 'aliancas', 'alianca') THEN 'aliancas'
      WHEN v_norm IN ('pingente', 'pingentes') THEN 'pingente'
      WHEN v_norm IN ('aneis', 'anel') THEN 'aneis'
      WHEN v_norm IN ('personalizacao', 'personalizacoes') THEN 'personalizacao'
      ELSE v_norm
    END;

    -- Se não bate com slug existente, tenta resolver via tabela categories (label normalizado)
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE slug = NEW.category) THEN
      SELECT slug INTO v_match
      FROM public.categories
      WHERE lower(public.unaccent_text(label)) = v_norm
         OR slug = v_norm
      LIMIT 1;
      IF v_match IS NOT NULL THEN
        NEW.category := v_match;
      END IF;
    END IF;
  END IF;
  
  IF NEW.color IS NOT NULL THEN
    NEW.color := lower(public.unaccent_text(NEW.color));
  END IF;
  
  RETURN NEW;
END;
$function$;