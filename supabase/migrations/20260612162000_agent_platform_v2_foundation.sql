-- Agent Platform V2 foundation
-- Adds opt-in tables for normalized ingress, orchestration logs, structured memory,
-- and catalog intelligence. These tables are not wired to production traffic yet.

create table if not exists public.inbound_batches (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  platform text not null default 'whatsapp',
  status text not null default 'open'
    check (status in ('open', 'processing', 'processed', 'cancelled', 'failed')),
  normalized_text text,
  message_ids text[] not null default '{}',
  media_items jsonb not null default '[]'::jsonb,
  signal_summary jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  closes_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inbound_batches_phone_status_idx
  on public.inbound_batches (phone, status, closes_at desc);

create index if not exists inbound_batches_conversation_created_idx
  on public.inbound_batches (conversation_id, created_at desc);

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  active_agent text not null default 'aline',
  status text not null default 'active'
    check (status in ('active', 'paused', 'human_takeover', 'finished')),
  current_flow text,
  current_step text,
  facts jsonb not null default '{}'::jsonb,
  pending_questions jsonb not null default '[]'::jsonb,
  last_decision_id uuid,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone)
);

create index if not exists agent_sessions_conversation_idx
  on public.agent_sessions (conversation_id);

create index if not exists agent_sessions_status_agent_idx
  on public.agent_sessions (status, active_agent);

create table if not exists public.agent_global_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  priority int not null default 100,
  enabled boolean not null default true,
  matcher jsonb not null default '{}'::jsonb,
  action jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_flow_definitions (
  id uuid primary key default gen_random_uuid(),
  flow_key text not null unique,
  agent_slug text not null,
  version int not null default 1,
  enabled boolean not null default false,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_flow_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.agent_flow_definitions(id) on delete cascade,
  step_key text not null,
  priority int not null default 100,
  prompt_template text,
  required_facts text[] not null default '{}',
  transitions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_id, step_key)
);

create table if not exists public.conversation_facts (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  fact_key text not null,
  fact_value jsonb not null,
  source text not null default 'agent',
  confidence numeric(4,3) not null default 1.0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone, fact_key)
);

create index if not exists conversation_facts_phone_idx
  on public.conversation_facts (phone);

create table if not exists public.conversation_pending_questions (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  question_key text not null,
  question_text text not null,
  agent_slug text not null default 'aline',
  status text not null default 'open'
    check (status in ('open', 'answered', 'dismissed', 'expired')),
  answer_text text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists conversation_pending_questions_phone_status_idx
  on public.conversation_pending_questions (phone, status, created_at desc);

create table if not exists public.agent_decision_logs (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  inbound_batch_id uuid references public.inbound_batches(id) on delete set null,
  agent_slug text,
  decision_type text not null,
  decision_reason text,
  input_summary jsonb not null default '{}'::jsonb,
  output_plan jsonb not null default '{}'::jsonb,
  shadow_mode boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists agent_decision_logs_phone_created_idx
  on public.agent_decision_logs (phone, created_at desc);

create index if not exists agent_decision_logs_conversation_created_idx
  on public.agent_decision_logs (conversation_id, created_at desc);

create table if not exists public.agent_memory_snapshots (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  agent_slug text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  summary text,
  facts jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  pending_questions jsonb not null default '[]'::jsonb,
  last_catalog jsonb not null default '[]'::jsonb,
  qdrant_collection text,
  qdrant_point_id text,
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone, agent_slug)
);

create index if not exists agent_memory_snapshots_phone_idx
  on public.agent_memory_snapshots (phone);

create table if not exists public.catalog_product_facts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  agent_line text,
  normalized_category text,
  normalized_subcategory text,
  normalized_color text,
  material text,
  finish text,
  searchable_text text,
  tags text[] not null default '{}',
  aliases text[] not null default '{}',
  sizes text[] not null default '{}',
  stock_total int not null default 0,
  auto_catalog_enabled boolean not null default false,
  needs_review boolean not null default true,
  review_reason text,
  qdrant_collection text,
  qdrant_point_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id)
);

create index if not exists catalog_product_facts_agent_category_idx
  on public.catalog_product_facts (agent_line, normalized_category, normalized_color);

create index if not exists catalog_product_facts_auto_idx
  on public.catalog_product_facts (auto_catalog_enabled, needs_review);

create table if not exists public.catalog_product_embeddings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  provider text not null default 'qdrant',
  collection text,
  point_id text,
  embedding_model text,
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, collection, point_id)
);

create index if not exists catalog_product_embeddings_product_idx
  on public.catalog_product_embeddings (product_id);
