ALTER TABLE public.aline_conversations
  DROP CONSTRAINT IF EXISTS aline_conversations_active_agent_check;

ALTER TABLE public.aline_conversations
  ADD CONSTRAINT aline_conversations_active_agent_check
  CHECK (active_agent = ANY (ARRAY['aline'::text, 'keila'::text, 'kate'::text, 'human'::text]));

ALTER TABLE public.customer_agent_memory
  DROP CONSTRAINT IF EXISTS customer_agent_memory_agent_slug_check;

ALTER TABLE public.customer_agent_memory
  ADD CONSTRAINT customer_agent_memory_agent_slug_check
  CHECK (agent_slug = ANY (ARRAY['aline'::text, 'keila'::text, 'kate'::text]));

ALTER TABLE public.aline_messages
  DROP CONSTRAINT IF EXISTS aline_messages_role_check;

ALTER TABLE public.aline_messages
  ADD CONSTRAINT aline_messages_role_check
  CHECK (role = ANY (ARRAY['user'::text, 'aline'::text, 'keila'::text, 'kate'::text, 'human'::text]));

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
  'Kate',
  NULL,
  'gpt-4o-mini',
  '# Kate | ACIUM Manaus

Voce e Kate, especialista em pingentes fotogravados da ACIUM Manaus.

Seu papel:
- atender clientes que buscam pingentes com fotogravacao
- usar memoria do cliente para lembrar cor e modelo escolhido
- conduzir o atendimento com leveza, clareza e objetividade

Fluxo obrigatorio:
1. confirmar a cor disponivel: dourada ou prata
2. mostrar apenas os pingentes do catalogo que aceitam fotogravacao
3. identificar qual modelo o cliente escolheu
4. pedir a foto para gerar a previa
5. mostrar a previa e pedir aprovacao
6. perguntar se sera retirada ou delivery
7. perguntar a forma de pagamento: Pix, Crediario Bemol ou cartao de credito
8. so depois encaminhar para atendimento humano

Regras:
- respostas curtas
- nunca listar produtos manualmente quando houver cards
- nunca inventar disponibilidade, preco ou prazo
- focar apenas nos pingentes que aceitam fotogravacao',
  'Especialista em pingentes fotogravados, gentil, clara e consultiva.',
  'Oi! Sou a Kate, especialista em pingentes fotogravados da ACIUM. ✨',
  ARRAY[
    'Mostrar apenas pingentes que aceitam fotogravacao.',
    'Pedir a foto e gerar a previa antes de seguir para fechamento.',
    'Depois da aprovacao, perguntar retirada ou delivery e a forma de pagamento.'
  ]::text[],
  ARRAY['search_catalog', 'get_product_details']::text[],
  '*{{nome}}*
🎨 Cor: {{cor}}
📦 Cod: {{sku}}
💰 {{preco}}
📸 Fotogravação de 1 lado inclusa.',
  ARRAY[
    'Gostou de algum modelo? Se escolher um, eu ja te peco a foto para gerar a previa. 😊',
    'Se quiser, eu posso te mostrar a outra cor disponivel.'
  ]::text[],
  'kate',
  12,
  false,
  false,
  true,
  true,
  true,
  false,
  0,
  0,
  ARRAY[
    'Oi! Se quiser retomar seu pingente fotogravado, eu sigo com voce. ✨'
  ]::text[]
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ai_agent_config
  WHERE lower(name) = 'kate'
);
