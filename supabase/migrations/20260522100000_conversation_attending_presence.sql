alter table public.conversations
  add column if not exists attending_by uuid references auth.users(id) on delete set null,
  add column if not exists attending_name text,
  add column if not exists attending_since timestamptz;

create index if not exists idx_conversations_attending_recent
  on public.conversations(attending_since desc)
  where attending_since is not null;

comment on column public.conversations.attending_by is
  'Usuario que esta com a conversa aberta no chat no momento.';

comment on column public.conversations.attending_name is
  'Nome exibido na lista para indicar quem esta atendendo a conversa.';

comment on column public.conversations.attending_since is
  'Horario em que o atendimento em tela foi iniciado ou renovado.';
