import type { Env } from "../types";

export async function sendPendingOutbox(_env: Env): Promise<void> {
  // The implementation must load pending outbox rows, send them through the
  // channel-specific Meta API endpoint, then update status or retry metadata.
}
