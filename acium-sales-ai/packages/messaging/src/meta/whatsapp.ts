import { normalizeText, type NormalizedInboundMessage } from "@acium/shared";

type WhatsAppPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<Record<string, unknown>>;
      };
    }>;
  }>;
};

export function normalizeWhatsAppPayload(payload: WhatsAppPayload): NormalizedInboundMessage[] {
  const normalized: NormalizedInboundMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const channelAccountId = value?.metadata?.phone_number_id;
      if (!value || !channelAccountId) continue;

      const contact = value.contacts?.[0];
      for (const message of value.messages ?? []) {
        const id = stringValue(message.id);
        const from = stringValue(message.from) ?? contact?.wa_id;
        if (!id || !from) continue;

        const type = mapWhatsAppType(stringValue(message.type));
        const text = extractWhatsAppText(message, type);
        const media = extractWhatsAppMedia(message, type);

        normalized.push({
          source: "whatsapp",
          provider: "meta",
          channelAccountId,
          externalConversationId: from,
          externalMessageId: id,
          customerChannelId: from,
          customerName: contact?.profile?.name ?? null,
          customerAvatarUrl: null,
          timestamp: toIsoTimestamp(stringValue(message.timestamp)),
          text,
          normalizedText: normalizeText(text),
          messageType: type,
          media,
          raw: message
        });
      }
    }
  }

  return normalized;
}

function extractWhatsAppText(message: Record<string, unknown>, type: NormalizedInboundMessage["messageType"]) {
  if (type === "text") return nestedString(message, "text", "body");
  if (type === "button") return nestedString(message, "button", "text") ?? nestedString(message, "interactive", "button_reply", "title");
  if (type === "list") return nestedString(message, "interactive", "list_reply", "title");
  return nestedString(message, type, "caption");
}

function extractWhatsAppMedia(message: Record<string, unknown>, type: NormalizedInboundMessage["messageType"]) {
  return {
    url: null,
    mimeType: nestedString(message, type, "mime_type"),
    caption: nestedString(message, type, "caption"),
    storageKey: null
  };
}

function mapWhatsAppType(type: string | null): NormalizedInboundMessage["messageType"] {
  if (!type) return "unknown";
  if (["text", "image", "video", "audio", "document", "sticker", "location", "contacts", "button", "reaction"].includes(type)) {
    return type === "contacts" ? "contact" : (type as NormalizedInboundMessage["messageType"]);
  }
  if (type === "interactive") return "button";
  return "unknown";
}

function toIsoTimestamp(timestamp: string | null): string {
  const millis = timestamp ? Number(timestamp) * 1000 : Date.now();
  return new Date(Number.isFinite(millis) ? millis : Date.now()).toISOString();
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nestedString(input: Record<string, unknown>, ...path: string[]): string | null {
  let current: unknown = input;
  for (const part of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return stringValue(current);
}
