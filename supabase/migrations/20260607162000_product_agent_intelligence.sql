ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS agent_line text,
  ADD COLUMN IF NOT EXISTS ai_description text,
  ADD COLUMN IF NOT EXISTS ai_tags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS search_aliases text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS commercial_notes text,
  ADD COLUMN IF NOT EXISTS included_items text,
  ADD COLUMN IF NOT EXISTS restrictions text,
  ADD COLUMN IF NOT EXISTS recommended_when text,
  ADD COLUMN IF NOT EXISTS avoid_when text;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS agent_line text,
  ADD COLUMN IF NOT EXISTS search_aliases text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ai_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_agent_line_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_agent_line_check
      CHECK (agent_line IS NULL OR agent_line IN ('aline', 'keila', 'kate', 'malu', 'human'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_agent_line_check'
  ) THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_agent_line_check
      CHECK (agent_line IS NULL OR agent_line IN ('aline', 'keila', 'kate', 'malu', 'human'));
  END IF;
END $$;

UPDATE public.categories
SET
  agent_line = CASE
    WHEN slug IN ('aliancas', 'aneis') THEN 'keila'
    WHEN slug = 'pingente' THEN 'kate'
    WHEN slug = 'oculos' THEN 'malu'
    ELSE agent_line
  END,
  search_aliases = CASE
    WHEN slug = 'aliancas' THEN ARRAY['alianca', 'aliancas', 'anel de compromisso', 'casamento', 'namoro', 'par de aliancas']
    WHEN slug = 'aneis' THEN ARRAY['anel', 'aneis', 'solitario', 'aparador']
    WHEN slug = 'pingente' THEN ARRAY['pingente', 'pingentes', 'medalha', 'medalhao', 'fotogravacao', 'foto no pingente', 'presente']
    WHEN slug = 'oculos' THEN ARRAY['oculos', 'oculo', 'armacao', 'armacoes', 'lente', 'grau', 'solar']
    ELSE search_aliases
  END,
  ai_notes = CASE
    WHEN slug IN ('aliancas', 'aneis') THEN 'Linha atendida pela Keila. Usar para alianças, anéis, namoro, compromisso e casamento.'
    WHEN slug = 'pingente' THEN 'Linha atendida pela Kate. Usar para pingentes fotograváveis, presentes e simulação com foto.'
    WHEN slug = 'oculos' THEN 'Linha atendida pela Malu. Usar para óculos, armações, lentes, grau e solar.'
    ELSE ai_notes
  END
WHERE slug IN ('aliancas', 'aneis', 'pingente', 'oculos');

UPDATE public.products
SET agent_line = CASE
  WHEN category IN ('aliancas', 'aneis') THEN 'keila'
  WHEN category = 'pingente' THEN 'kate'
  WHEN category = 'oculos' THEN 'malu'
  ELSE agent_line
END
WHERE agent_line IS NULL;

UPDATE public.products
SET ai_tags = array_remove(ARRAY[
  CASE WHEN category IN ('aliancas', 'aneis') THEN 'aliancas' END,
  CASE WHEN category IN ('aliancas', 'aneis') THEN 'casal' END,
  CASE WHEN category = 'pingente' THEN 'pingente' END,
  CASE WHEN category = 'pingente' THEN 'fotogravavel' END,
  CASE WHEN category = 'pingente' THEN 'presente' END,
  CASE WHEN category = 'oculos' THEN 'oculos' END,
  CASE WHEN category = 'oculos' THEN 'armacao' END,
  CASE WHEN color IS NOT NULL THEN color END,
  CASE WHEN price IS NOT NULL AND price <= 250 THEN 'baixo_orcamento' END,
  CASE WHEN price IS NOT NULL AND price >= 500 THEN 'premium' END
], NULL)
WHERE ai_tags IS NULL OR cardinality(ai_tags) = 0;

UPDATE public.products
SET search_aliases = array_remove(ARRAY[
  lower(name),
  lower(coalesce(sku, '')),
  CASE WHEN category IN ('aliancas', 'aneis') THEN 'alianca' END,
  CASE WHEN category IN ('aliancas', 'aneis') THEN 'anel' END,
  CASE WHEN category IN ('aliancas', 'aneis') THEN 'casamento' END,
  CASE WHEN category = 'pingente' THEN 'medalha' END,
  CASE WHEN category = 'pingente' THEN 'fotogravacao' END,
  CASE WHEN category = 'pingente' THEN 'foto no pingente' END,
  CASE WHEN category = 'oculos' THEN 'armacao' END,
  CASE WHEN category = 'oculos' THEN 'lente' END,
  CASE WHEN category = 'oculos' THEN 'grau' END,
  color
], NULL)
WHERE search_aliases IS NULL OR cardinality(search_aliases) = 0;

UPDATE public.products
SET
  ai_description = CASE
    WHEN category IN ('aliancas', 'aneis') THEN concat_ws(' ', name, 'Produto da linha de alianças/anéis. Indicado para atendimento da Keila quando o cliente falar de namoro, compromisso, casamento, par de alianças ou anel.')
    WHEN category = 'pingente' THEN concat_ws(' ', name, 'Pingente fotogravável atendido pela Kate. Bom para presente e simulação com foto. Não informar que acompanha corrente se isso não estiver confirmado.')
    WHEN category = 'oculos' THEN concat_ws(' ', name, 'Produto da linha de óculos/armações atendido pela Malu. Usar quando o cliente pedir óculos, armação, lente, grau ou solar.')
    ELSE ai_description
  END,
  included_items = CASE
    WHEN category = 'pingente' THEN coalesce(included_items, 'Somente pingente/medalha, salvo informação explícita diferente no produto.')
    ELSE included_items
  END,
  restrictions = CASE
    WHEN category = 'pingente' THEN coalesce(restrictions, 'Não dizer que acompanha corrente/cordão. Confirmar com vendedor se o cliente pedir corrente.')
    WHEN category IN ('aliancas', 'aneis') THEN coalesce(restrictions, 'Não chamar aço de ouro. Usar o material/cor cadastrado no produto.')
    ELSE restrictions
  END,
  recommended_when = CASE
    WHEN category IN ('aliancas', 'aneis') THEN coalesce(recommended_when, 'Cliente procura aliança, anel, namoro, compromisso, casamento ou modelo para casal.')
    WHEN category = 'pingente' THEN coalesce(recommended_when, 'Cliente procura pingente, medalha, fotogravação, presente personalizado ou foto gravada.')
    WHEN category = 'oculos' THEN coalesce(recommended_when, 'Cliente procura óculos, armação, lente, grau, solar ou modelo para testar com selfie.')
    ELSE recommended_when
  END
WHERE ai_description IS NULL OR ai_description = '';

CREATE INDEX IF NOT EXISTS products_agent_line_idx ON public.products(agent_line);
CREATE INDEX IF NOT EXISTS products_ai_tags_gin_idx ON public.products USING gin(ai_tags);
CREATE INDEX IF NOT EXISTS products_search_aliases_gin_idx ON public.products USING gin(search_aliases);
CREATE INDEX IF NOT EXISTS categories_agent_line_idx ON public.categories(agent_line);
