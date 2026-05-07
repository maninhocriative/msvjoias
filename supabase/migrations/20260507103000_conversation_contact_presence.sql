alter table public.conversations
  add column if not exists contact_presence text,
  add column if not exists contact_is_online boolean not null default false,
  add column if not exists contact_last_seen_at timestamptz,
  add column if not exists contact_presence_updated_at timestamptz;

comment on column public.conversations.contact_presence is
  'Ultimo estado de presenca recebido da Z-API: available, unavailable, composing, paused, recording ou unknown.';

comment on column public.conversations.contact_is_online is
  'Indica se o cliente esta online conforme ultimo callback de presenca da Z-API.';

comment on column public.conversations.contact_last_seen_at is
  'Ultimo visto informado pela Z-API quando disponivel.';

comment on column public.conversations.contact_presence_updated_at is
  'Horario em que o CRM recebeu a ultima atualizacao de presenca.';
