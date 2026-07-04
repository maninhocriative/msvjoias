# Rollback

Rollback principles:

- Keep production migrations small and versioned.
- Do not overwrite legacy runtime until the new Cloudflare stack passes real inbound and outbound tests.
- Keep Cloudflare Pages and Workers releases identifiable by environment.
- If webhook processing fails, disable Meta webhook delivery to the new URL and inspect D1 `webhook_events`.
- Failed queue messages should go to DLQ after retry exhaustion.

Rollback checklist:

1. Stop new deploys.
2. Repoint Meta webhook to the last known stable endpoint.
3. Pause queue consumers if duplicate processing is suspected.
4. Preserve D1, R2 and Supabase logs for investigation.
5. Re-enable only after idempotency and message status updates are verified.
