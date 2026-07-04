import { sanitizePayload } from "@acium/messaging";
import { verifyMetaSignature } from "../../middleware/meta-signature";
import type { Env } from "../../types";

export async function handleMetaWebhookGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.META_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function handleMetaWebhookPost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const signatureOk = await verifyMetaSignature(request, env.META_WEBHOOK_SECRET);
  if (!signatureOk) return new Response("Invalid signature", { status: 401 });

  const payload = await request.json();
  const sanitizedPayload = sanitizePayload(payload);
  const payloadHash = await sha256(JSON.stringify(sanitizedPayload));
  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO webhook_events
      (id, provider, event_type, external_event_id, payload_hash, payload_json, processed, received_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  )
    .bind(eventId, "meta", readEventType(payload), readExternalEventId(payload), payloadHash, JSON.stringify(sanitizedPayload), now)
    .run();

  ctx.waitUntil(env.META_WEBHOOK_QUEUE.send({ eventId, payload: sanitizedPayload }));
  return Response.json({ ok: true });
}

function readEventType(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).object;
  return typeof value === "string" ? value : null;
}

function readExternalEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const entry = (payload as { entry?: Array<{ id?: string }> }).entry?.[0];
  return entry?.id ?? null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
