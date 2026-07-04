import { z } from "zod";
import { CHANNELS } from "../constants/channels";

export const normalizedInboundMessageSchema = z.object({
  source: z.enum(CHANNELS),
  provider: z.literal("meta"),
  channelAccountId: z.string().min(1),
  externalConversationId: z.string().nullable(),
  externalMessageId: z.string().min(1),
  customerChannelId: z.string().min(1),
  customerName: z.string().nullable(),
  customerAvatarUrl: z.string().url().nullable(),
  timestamp: z.string().datetime(),
  text: z.string().nullable(),
  normalizedText: z.string().nullable(),
  messageType: z.enum([
    "text",
    "image",
    "video",
    "audio",
    "document",
    "sticker",
    "location",
    "contact",
    "button",
    "list",
    "reaction",
    "unknown"
  ]),
  media: z.object({
    url: z.string().url().nullable(),
    mimeType: z.string().nullable(),
    caption: z.string().nullable(),
    storageKey: z.string().nullable()
  }),
  raw: z.unknown()
});
