import type { Channel } from "../constants/channels";

export type NormalizedInboundMessage = {
  source: Channel;
  provider: "meta";
  channelAccountId: string;
  externalConversationId: string | null;
  externalMessageId: string;
  customerChannelId: string;
  customerName: string | null;
  customerAvatarUrl: string | null;
  timestamp: string;
  text: string | null;
  normalizedText: string | null;
  messageType:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "document"
    | "sticker"
    | "location"
    | "contact"
    | "button"
    | "list"
    | "reaction"
    | "unknown";
  media: {
    url: string | null;
    mimeType: string | null;
    caption: string | null;
    storageKey: string | null;
  };
  raw: unknown;
};

export type OutboxStatus =
  | "pending"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled";
