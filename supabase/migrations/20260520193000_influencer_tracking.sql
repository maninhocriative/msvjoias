create table if not exists public.influencers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  handle text,
  code text not null unique,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.influencer_leads (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_name text,
  contact_phone text not null,
  first_message text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (influencer_id, contact_phone)
);

create index if not exists idx_influencers_code on public.influencers(code);
create index if not exists idx_influencer_leads_influencer_id on public.influencer_leads(influencer_id);
create index if not exists idx_influencer_leads_contact_phone on public.influencer_leads(contact_phone);
create index if not exists idx_influencer_leads_conversation_id on public.influencer_leads(conversation_id);

alter table public.influencers enable row level security;
alter table public.influencer_leads enable row level security;

drop policy if exists "Usuarios autenticados podem ver influencers" on public.influencers;
create policy "Usuarios autenticados podem ver influencers"
on public.influencers for select
using (auth.uid() is not null);

drop policy if exists "Usuarios autenticados podem gerenciar influencers" on public.influencers;
create policy "Usuarios autenticados podem gerenciar influencers"
on public.influencers for all
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "Usuarios autenticados podem ver leads de influencers" on public.influencer_leads;
create policy "Usuarios autenticados podem ver leads de influencers"
on public.influencer_leads for select
using (auth.uid() is not null);

drop policy if exists "Service role pode gerenciar leads de influencers" on public.influencer_leads;
create policy "Service role pode gerenciar leads de influencers"
on public.influencer_leads for all
to service_role
using (true)
with check (true);
