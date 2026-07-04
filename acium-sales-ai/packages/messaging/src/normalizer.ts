import type { NormalizedInboundMessage } from "@acium/shared";
import { normalizeFacebookPayload } from "./meta/facebook";
import { normalizeInstagramPayload } from "./meta/instagram";
import { normalizeWhatsAppPayload } from "./meta/whatsapp";

export function normalizeMetaPayload(payload: unknown): NormalizedInboundMessage[] {
  const object = getObjectField(payload, "object");
  if (object === "whatsapp_business_account") return normalizeWhatsAppPayload(payload as never);
  if (object === "instagram") return normalizeInstagramPayload(payload as never);
  if (object === "page") return normalizeFacebookPayload(payload as never);
  return [];
}

function getObjectField(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
