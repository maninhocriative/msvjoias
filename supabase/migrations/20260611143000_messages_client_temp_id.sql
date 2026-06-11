alter table public.messages
  add column if not exists client_temp_id text;

create unique index if not exists idx_messages_client_temp_id_unique
  on public.messages (client_temp_id)
  where client_temp_id is not null;
