# Meta Webhooks

Endpoints:

- `GET /webhooks/meta`: validates `hub.verify_token` and returns `hub.challenge`.
- `POST /webhooks/meta`: validates signature when configured, sanitizes payload, stores `webhook_events`, pushes to Queue and returns quickly.

Queue processing:

1. Normalize WhatsApp, Instagram or Facebook payload.
2. Upsert D1 conversation.
3. Insert D1 message with idempotency.
4. Notify Durable Object conversation room.
5. Mark webhook event as processed.

Payloads are sanitized before persistence. Secrets and tokens are redacted.
