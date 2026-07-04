import { normalizeText, type NormalizedInboundMessage } from "@acium/shared";

type InstagramPayload = {
  entry?: Array<{
    id?: string;
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        attachments?: Array<{ type?: string; payload?: { url?: string } }>;
      };
    }>;
  }>;
};

export function normalizeInstagramPayload(payload: InstagramPayload): NormalizedInboundMessage[] {
  const messages: NormalizedInboundMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const item of entry.messaging ?? []) {
      const externalMessageId = item.message?.mid;
      const customerChannelId = item.sender?.id;
      const channelAccountId = item.recipient?.id ?? entry.id;
      if (!externalMessageId || !customerChannelId || !channelAccountId) continue;

      const attachment = item.message?.attachments?.[0];
      const messageType = mapAttachmentType(attachment?.type, item.message?.text);
      const text = item.message?.text ?? null;

      messages.push({
        source: "instagram",
        provider: "meta",
        channelAccountId,
        externalConversationId: customerChannelId,
        externalMessageId,
        customerChannelId,
        customerName: null,
        customerAvatarUrl: null,
        timestamp: new Date(item.timestamp ?? Date.now()).toISOString(),
        text,
        normalizedText: normalizeText(text),
        messageType,
        media: {
          url: attachment?.payload?.url ?? null,
          mimeType: null,
          caption: null,
          storageKey: null
        },
        raw: item
      });
    }
  }

  return messages;
}

function mapAttachmentType(type: string | undefined, text: string | undefined): NormalizedInboundMessage["messageType"] {
  if (text) return "text";
  if (type === "image" || type === "video" || type === "audio") return type;
  if (type === "file") return "document";
  return type ? "unknown" : "text";
}
