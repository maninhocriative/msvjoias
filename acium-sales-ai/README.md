# ACIUM Sales AI

New conversational sales CRM for ACIUM.

This monorepo is intentionally separated from the legacy app. The legacy system is reference material for business rules only.

## Apps

- `apps/web`: React + Vite frontend for Cloudflare Pages.
- `apps/api`: Cloudflare Workers API, Meta webhooks, queues and Durable Objects.

## Packages

- `packages/shared`: shared types, schemas, constants and validators.
- `packages/db`: D1 and Supabase schema, migrations and clients.
- `packages/messaging`: Meta inbound/outbound messaging and normalization.
- `packages/agents`: AI agent router, policies, memory and tools.
- `packages/followup`: contextual follow-up scheduler and rules.
- `packages/realtime`: Durable Object room and realtime events.

## Safety

Real secrets must stay in local untracked files under `.secrets/` and must be applied to Cloudflare with Wrangler secure secrets.
