-- Remove legacy FiqOn defaults from the current database shape without
-- rewriting historical migrations or deleting old records.

alter table if exists public.catalog_sessions
  alter column source set default 'zapi_whatsapp';

update public.catalog_sessions
set source = 'legacy_fiqon'
where source = 'fiqon';

create or replace function public.create_catalog_session(
  p_phone text,
  p_thread_id text default null,
  p_categoria text default null,
  p_tipo_alianca text default null,
  p_cor_preferida text default null,
  p_source text default 'zapi_whatsapp'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.catalog_sessions(phone, thread_id, categoria, tipo_alianca, cor_preferida, line, source)
  values (
    p_phone,
    p_thread_id,
    p_categoria,
    p_tipo_alianca,
    p_cor_preferida,
    coalesce(p_categoria, 'catalogo'),
    coalesce(nullif(p_source, ''), 'zapi_whatsapp')
  )
  returning id into v_id;

  perform public.upsert_conversation_state(
    p_phone := p_phone,
    p_thread_id := p_thread_id,
    p_stage := 'catalog_sent',
    p_categoria := p_categoria,
    p_tipo_alianca := p_tipo_alianca,
    p_cor_preferida := p_cor_preferida,
    p_last_catalog_session_id := v_id
  );

  return v_id;
end;
$$;

comment on column public.catalog_sessions.source is
  'Current integration source. Use zapi_whatsapp or meta_instagram for active channels; legacy_fiqon is historical only.';
