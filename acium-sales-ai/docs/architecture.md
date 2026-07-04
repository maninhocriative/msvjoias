# Architecture

ACIUM Sales AI is a new monorepo. Legacy code is reference material only.

## Runtime

- Cloudflare Pages hosts `apps/web`.
- Cloudflare Workers hosts `apps/api`.
- Cloudflare D1 stores operational conversations, messages, statuses, outbox, webhook events and follow-up jobs.
- Cloudflare Durable Objects coordinate realtime conversation rooms.
- Cloudflare Queues decouple Meta webhooks from message normalization and agent routing.
- Cloudflare R2 stores media.
- Supabase stores users, roles, catalog, orders, customer memory, embeddings, agent configs and decision logs.

## Message Flow

Meta webhook enters `/webhooks/meta`, is verified, sanitized and stored in D1, then queued. Queue consumers normalize channel payloads into `NormalizedInboundMessage`, upsert conversations, insert messages, notify the Durable Object room and then hand off to the agent router.

Agents never receive raw Meta payloads.
