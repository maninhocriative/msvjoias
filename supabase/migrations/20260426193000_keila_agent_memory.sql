ALTER TABLE public.aline_conversations
  ADD COLUMN IF NOT EXISTS active_agent text NOT NULL DEFAULT 'aline',
  ADD COLUMN IF NOT EXISTS agent_handoff_at timestamptz;

UPDATE public.aline_conversations
SET active_agent = CASE
  WHEN status = 'human_takeover' THEN 'human'
  WHEN coalesce(nullif(collected_data->>'agente_atual', ''), '') <> '' THEN collected_data->>'agente_atual'
  ELSE 'aline'
END
WHERE active_agent IS DISTINCT FROM CASE
  WHEN status = 'human_takeover' THEN 'human'
  WHEN coalesce(nullif(collected_data->>'agente_atual', ''), '') <> '' THEN collected_data->>'agente_atual'
  ELSE 'aline'
END;

ALTER TABLE public.aline_conversations
  DROP CONSTRAINT IF EXISTS aline_conversations_active_agent_check;

ALTER TABLE public.aline_conversations
  ADD CONSTRAINT aline_conversations_active_agent_check
  CHECK (active_agent = ANY (ARRAY['aline'::text, 'keila'::text, 'human'::text]));

CREATE TABLE IF NOT EXISTS public.customer_agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  agent_slug text NOT NULL,
  customer_name text,
  summary text,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_interest text,
  last_product_sku text,
  last_product_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_agent_memory_agent_slug_check
    CHECK (agent_slug = ANY (ARRAY['aline'::text, 'keila'::text])),
  CONSTRAINT customer_agent_memory_phone_agent_key UNIQUE (phone, agent_slug)
);

CREATE INDEX IF NOT EXISTS customer_agent_memory_phone_idx
  ON public.customer_agent_memory (phone);

CREATE INDEX IF NOT EXISTS customer_agent_memory_agent_slug_idx
  ON public.customer_agent_memory (agent_slug);

DROP TRIGGER IF EXISTS update_customer_agent_memory_updated_at ON public.customer_agent_memory;

CREATE TRIGGER update_customer_agent_memory_updated_at
  BEFORE UPDATE ON public.customer_agent_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.customer_agent_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff pode ver memorias de agentes" ON public.customer_agent_memory;
CREATE POLICY "Staff pode ver memorias de agentes"
  ON public.customer_agent_memory FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gerente')
    OR public.has_role(auth.uid(), 'vendedor')
  );

DROP POLICY IF EXISTS "Admin e gerente podem gerenciar memorias de agentes" ON public.customer_agent_memory;
CREATE POLICY "Admin e gerente podem gerenciar memorias de agentes"
  ON public.customer_agent_memory FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gerente'));

ALTER TABLE public.aline_messages
  DROP CONSTRAINT IF EXISTS aline_messages_role_check;

ALTER TABLE public.aline_messages
  ADD CONSTRAINT aline_messages_role_check
  CHECK (role = ANY (ARRAY['user'::text, 'aline'::text, 'keila'::text, 'human'::text]));

INSERT INTO public.ai_agent_config (
  name,
  assistant_id,
  model,
  system_prompt,
  personality,
  greeting,
  rules,
  available_functions,
  product_presentation_template,
  closing_phrases,
  active_template,
  max_products_per_message,
  send_video_priority,
  include_sizes,
  include_stock,
  include_price,
  is_active,
  followup_enabled,
  followup_interval_minutes,
  followup_max_attempts,
  followup_messages
)
SELECT
  'Keila',
  NULL,
  'gpt-4o-mini',
  '# Keila | ACIUM Manaus

Voce e Keila, especialista em aliancas de casamento da ACIUM Manaus.

Seu papel:
- atender clientes que buscam aliancas de casamento
- usar memoria do cliente para lembrar preferencias e contexto
- conduzir o atendimento com objetividade, elegancia e seguranca

Fluxo obrigatorio:
1. perguntar para quando o cliente deseja fechar
2. perguntar quanto quer investir
3. perguntar se deseja o par ou a unidade
4. perguntar a numeracao
5. se o cliente nao souber a numeracao, tranquilizar:
   "Tudo bem, se voce ainda nao souber a numeracao agora, eu sigo com voce mesmo assim 😊"

Depois:
- buscar opcoes no catalogo da cor escolhida
- os cards serao enviados pelo sistema
- sempre lembrar:
  "O valor do card e da unidade. O par sai pelo dobro. 💍"
- depois dos cards, perguntar:
  "Gostou de algum modelo? 😊"

Cores de casamento:
- dourada
- prata
- preta
- azul

Regras:
- respostas curtas
- nunca listar produtos manualmente
- nunca inventar preco, estoque ou prazo
- focar so em aliancas de casamento',
  'Elegante, especialista, acolhedora e objetiva.',
  'Oi! Sou a Keila, especialista em aliancas de casamento da ACIUM. 💍',
  ARRAY[
    'Coletar prazo, orcamento, par ou unidade e numeracao antes do catalogo.',
    'Se o cliente nao souber a numeracao, continuar o atendimento normalmente.',
    'Sempre lembrar que o valor do card e da unidade e o par sai pelo dobro.'
  ]::text[],
  ARRAY['search_catalog', 'get_product_details']::text[],
  '*{{nome}}*
🎨 Cor: {{cor}}
📦 Cod: {{sku}}
💰 {{preco}}
💍 O valor do card e da unidade. O par sai pelo dobro.',
  ARRAY[
    'Gostou de algum modelo? 😊',
    'Se quiser, eu sigo com voce por esse modelo. 💍'
  ]::text[],
  'keila',
  8,
  true,
  true,
  true,
  true,
  true,
  false,
  0,
  0,
  ARRAY[
    'Oi! Se quiser retomar as aliancas de casamento, eu sigo com voce. 💍'
  ]::text[]
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ai_agent_config
  WHERE lower(name) = 'keila'
);
