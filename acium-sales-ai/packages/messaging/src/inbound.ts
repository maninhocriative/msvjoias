import type { NormalizedInboundMessage } from "@acium/shared";

export function buildConversationId(message: NormalizedInboundMessage): string {
  return `${message.source}:${message.channelAccountId}:${message.customerChannelId}`;
}

export function buildMessageInsert(message: NormalizedInboundMessage, conversationId = buildConversationId(message)) {
  const now = new Date().toISOString();
  return {
    id: message.externalMessageId,
    conversation_id: conversationId,
    channel: message.source,
    direction: "inbound",
    sender_type: "customer",
    sender_id: message.customerChannelId,
    agent_name: null,
    body: message.text,
    normalized_body: message.normalizedText,
    message_type: message.messageType,
    media_url: message.media.url,
    media_mime_type: message.media.mimeType,
    media_storage_key: message.media.storageKey,
    external_message_id: message.externalMessageId,
    reply_to_message_id: null,
    status: "received",
    metadata_json: JSON.stringify({ provider: message.provider }),
    created_at: message.timestamp,
    updated_at: now
  };
}
