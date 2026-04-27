alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists replaced_message_id uuid references public.messages(id) on delete set null;

create index if not exists idx_messages_replaced_message_id
  on public.messages (replaced_message_id)
  where replaced_message_id is not null;

create index if not exists idx_messages_deleted_at
  on public.messages (deleted_at)
  where deleted_at is not null;
