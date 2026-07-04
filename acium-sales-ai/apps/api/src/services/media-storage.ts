import { buildMediaStorageKey } from "@acium/messaging";
import type { NormalizedInboundMessage } from "@acium/shared";
import type { Env } from "../types";

export async function storeInboundMedia(env: Env, conversationId: string, message: NormalizedInboundMessage): Promise<string | null> {
  if (!message.media.url) return null;

  const response = await fetch(message.media.url);
  if (!response.ok) {
    throw new Error(`Media download failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? message.media.mimeType ?? "application/octet-stream";
  const extension = extensionFromContentType(contentType);
  const storageKey = buildMediaStorageKey(conversationId, message.externalMessageId, `attachment${extension}`);

  await env.MEDIA_BUCKET.put(storageKey, response.body, {
    httpMetadata: {
      contentType
    },
    customMetadata: {
      conversationId,
      messageId: message.externalMessageId,
      source: message.source
    }
  });

  return storageKey;
}

function extensionFromContentType(contentType: string): string {
  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("image/webp")) return ".webp";
  if (contentType.includes("video/mp4")) return ".mp4";
  if (contentType.includes("audio/mpeg")) return ".mp3";
  if (contentType.includes("audio/ogg")) return ".ogg";
  if (contentType.includes("application/pdf")) return ".pdf";
  return ".bin";
}
