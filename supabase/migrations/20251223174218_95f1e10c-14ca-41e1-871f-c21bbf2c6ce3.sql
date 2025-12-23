-- =============================================
-- CÉREBRO DA ALINE - Migração Completa
-- =============================================

-- 1) CONVERSATION_STATE - Adicionar colunas faltantes
ALTER TABLE public.conversation_state 
ADD COLUMN IF NOT EXISTS thread_id text,
ADD COLUMN IF NOT EXISTS stage text DEFAULT 'menu_categoria',
ADD COLUMN IF NOT EXISTS categoria text,
ADD COLUMN IF NOT EXISTS tipo_alianca text,
ADD COLUMN IF NOT EXISTS cor_preferida text,
ADD COLUMN IF NOT EXISTS selected_name text,
ADD COLUMN IF NOT EXISTS selected_price numeric,
ADD COLUMN IF NOT EXISTS last_catalog_session_id uuid,
ADD COLUMN IF NOT EXISTS crm_entrega text,
ADD COLUMN IF NOT EXISTS crm_pagamento text,
ADD COLUMN IF NOT EXISTS crm_finalizar boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_message_id text,
ADD COLUMN IF NOT EXISTS last_user_text text,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 2) CATALOG_SESSIONS - Adicionar colunas faltantes
ALTER TABLE public.catalog_sessions 
ADD COLUMN IF NOT EXISTS thread_id text,
ADD COLUMN IF NOT EXISTS categoria text,
ADD COLUMN IF NOT EXISTS tipo_alianca text,
ADD COLUMN IF NOT EXISTS cor_preferida text,
ADD COLUMN IF NOT EXISTS source text DEFAULT 'fiqon';

-- 3) CONVERSATION_EVENTS - Adicionar thread_id
ALTER TABLE public.conversation_events 
ADD COLUMN IF NOT EXISTS thread_id text;

-- 4) ÍNDICES para conversation_state
CREATE INDEX IF NOT EXISTS idx_conversation_state_thread_id 
  ON public.conversation_state(thread_id);
CREATE INDEX IF NOT EXISTS idx_conversation_state_stage 
  ON public.conversation_state(stage);

-- 5) ÍNDICES para catalog_sessions
CREATE INDEX IF NOT EXISTS idx_catalog_sessions_phone_created 
  ON public.catalog_sessions(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_sessions_thread_created 
  ON public.catalog_sessions(thread_id, created_at DESC);

-- 6) ÍNDICES para catalog_items_sent
CREATE INDEX IF NOT EXISTS idx_catalog_items_session 
  ON public.catalog_items_sent(session_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_sku 
  ON public.catalog_items_sent(sku);

-- 7) ÍNDICES para conversation_events
CREATE INDEX IF NOT EXISTS idx_conversation_events_phone_ts 
  ON public.conversation_events(phone, ts DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_events_thread_ts 
  ON public.conversation_events(thread_id, ts DESC);

-- 8) ÍNDICES para processed_messages
CREATE INDEX IF NOT EXISTS idx_processed_messages_phone_created 
  ON public.processed_messages(phone, created_at DESC);

-- 9) TRIGGER de updated_at para conversation_state
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_conversation_state_updated ON public.conversation_state;
CREATE TRIGGER trg_conversation_state_updated
BEFORE UPDATE ON public.conversation_state
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10) FUNÇÃO: upsert_conversation_state
CREATE OR REPLACE FUNCTION public.upsert_conversation_state(
  p_phone text,
  p_thread_id text DEFAULT NULL,
  p_stage text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_tipo_alianca text DEFAULT NULL,
  p_cor_preferida text DEFAULT NULL,
  p_selected_sku text DEFAULT NULL,
  p_selected_name text DEFAULT NULL,
  p_selected_price numeric DEFAULT NULL,
  p_last_catalog_session_id uuid DEFAULT NULL,
  p_crm_entrega text DEFAULT NULL,
  p_crm_pagamento text DEFAULT NULL,
  p_crm_finalizar boolean DEFAULT NULL,
  p_last_message_id text DEFAULT NULL,
  p_last_user_text text DEFAULT NULL
)
RETURNS public.conversation_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.conversation_state;
BEGIN
  INSERT INTO public.conversation_state (
    phone, thread_id, stage, categoria, tipo_alianca, cor_preferida,
    selected_sku, selected_name, selected_price,
    last_catalog_session_id,
    crm_entrega, crm_pagamento, crm_finalizar,
    last_message_id, last_user_text
  )
  VALUES (
    p_phone, p_thread_id,
    COALESCE(p_stage, 'menu_categoria'),
    p_categoria, p_tipo_alianca, p_cor_preferida,
    p_selected_sku, p_selected_name, p_selected_price,
    p_last_catalog_session_id,
    p_crm_entrega, p_crm_pagamento, COALESCE(p_crm_finalizar, false),
    p_last_message_id, p_last_user_text
  )
  ON CONFLICT (phone) DO UPDATE SET
    thread_id = COALESCE(EXCLUDED.thread_id, conversation_state.thread_id),
    stage = COALESCE(EXCLUDED.stage, conversation_state.stage),
    categoria = COALESCE(EXCLUDED.categoria, conversation_state.categoria),
    tipo_alianca = COALESCE(EXCLUDED.tipo_alianca, conversation_state.tipo_alianca),
    cor_preferida = COALESCE(EXCLUDED.cor_preferida, conversation_state.cor_preferida),
    selected_sku = COALESCE(EXCLUDED.selected_sku, conversation_state.selected_sku),
    selected_name = COALESCE(EXCLUDED.selected_name, conversation_state.selected_name),
    selected_price = COALESCE(EXCLUDED.selected_price, conversation_state.selected_price),
    last_catalog_session_id = COALESCE(EXCLUDED.last_catalog_session_id, conversation_state.last_catalog_session_id),
    crm_entrega = COALESCE(EXCLUDED.crm_entrega, conversation_state.crm_entrega),
    crm_pagamento = COALESCE(EXCLUDED.crm_pagamento, conversation_state.crm_pagamento),
    crm_finalizar = COALESCE(EXCLUDED.crm_finalizar, conversation_state.crm_finalizar),
    last_message_id = COALESCE(EXCLUDED.last_message_id, conversation_state.last_message_id),
    last_user_text = COALESCE(EXCLUDED.last_user_text, conversation_state.last_user_text);

  SELECT * INTO v_row FROM public.conversation_state WHERE phone = p_phone;
  RETURN v_row;
END;
$$;

-- 11) FUNÇÃO: create_catalog_session
CREATE OR REPLACE FUNCTION public.create_catalog_session(
  p_phone text,
  p_thread_id text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_tipo_alianca text DEFAULT NULL,
  p_cor_preferida text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.catalog_sessions(phone, thread_id, categoria, tipo_alianca, cor_preferida, line)
  VALUES (p_phone, p_thread_id, p_categoria, p_tipo_alianca, p_cor_preferida, 'fiqon')
  RETURNING id INTO v_id;

  PERFORM public.upsert_conversation_state(
    p_phone := p_phone,
    p_thread_id := p_thread_id,
    p_stage := 'catalog_sent',
    p_categoria := p_categoria,
    p_tipo_alianca := p_tipo_alianca,
    p_cor_preferida := p_cor_preferida,
    p_last_catalog_session_id := v_id
  );

  RETURN v_id;
END;
$$;

-- 12) FUNÇÃO: add_catalog_item
CREATE OR REPLACE FUNCTION public.add_catalog_item(
  p_session_id uuid,
  p_sku text,
  p_name text DEFAULT NULL,
  p_price numeric DEFAULT NULL,
  p_sizes jsonb DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_video_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.catalog_items_sent(session_id, sku, name, price, sizes, image_url, video_url, media_url, media_type, position)
  VALUES (p_session_id, p_sku, p_name, p_price, p_sizes, p_image_url, p_video_url, COALESCE(p_image_url, p_video_url), 
    CASE WHEN p_video_url IS NOT NULL THEN 'video' ELSE 'image' END, 0)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 13) FUNÇÃO: get_recent_catalog_context
CREATE OR REPLACE FUNCTION public.get_recent_catalog_context(
  p_phone text,
  p_limit int DEFAULT 9
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session uuid;
  v_txt text := '';
  r record;
BEGIN
  SELECT last_catalog_session_id INTO v_session
  FROM public.conversation_state
  WHERE phone = p_phone;

  IF v_session IS NULL THEN
    RETURN '';
  END IF;

  v_txt := 'CATALOGO_ATUAL (itens enviados recentemente):' || E'\n';

  FOR r IN
    SELECT sku, name, price, sizes
    FROM public.catalog_items_sent
    WHERE session_id = v_session
    ORDER BY created_at ASC
    LIMIT p_limit
  LOOP
    v_txt := v_txt
      || '- SKU: ' || COALESCE(r.sku,'')
      || ' | Nome: ' || COALESCE(r.name,'')
      || ' | Preço unit: ' || COALESCE(r.price::text,'')
      || CASE WHEN r.sizes IS NULL THEN '' ELSE ' | Tamanhos: ' || r.sizes::text END
      || E'\n';
  END LOOP;

  RETURN v_txt;
END;
$$;

-- 14) FUNÇÃO: cleanup_bot_data (limpeza completa)
CREATE OR REPLACE FUNCTION public.cleanup_bot_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.processed_messages
  WHERE created_at < now() - interval '30 days';

  DELETE FROM public.conversation_events
  WHERE ts < now() - interval '30 days';

  DELETE FROM public.catalog_sessions
  WHERE created_at < now() - interval '60 days';
  -- catalog_items_sent será apagado por cascade
END;
$$;