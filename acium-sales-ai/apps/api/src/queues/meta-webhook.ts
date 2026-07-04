import { buildConversationId, buildMessageInsert, normalizeMetaPayload } from "@acium/messaging";
import type { Env } from "../types";

type QueueBody = {
  eventId: string;
  payload: unknown;
};

export async function processMetaWebhookBatch(batch: MessageBatch, env: Env, _ctx: ExecutionContext): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body as QueueBody;
    try {
      await processWebhookEvent(body, env);
      message.ack();
    } catch (error) {
      await markWebhookError(env, body.eventId, error);
      message.retry();
    }
  }
}

async function processWebhookEvent(body: QueueBody, env: Env): Promise<void> {
  const inboundMessages = normalizeMetaPayload(body.payload);
  const now = new Date().toISOString();

  for (const inbound of inboundMessages) {
    const conversationId = buildConversationId(inbound);
    await env.DB.prepare(
      `INSERT INTO conversations
        (id, channel, channel_conversation_id, channel_customer_id, customer_name, customer_avatar_url,
         current_agent, stage, status, human_takeover, human_required, automation_paused,
         last_message_text, last_message_at, last_customer_message_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'auto_router', 'new_lead', 'ai_active', 0, 0, 0, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         customer_name = COALESCE(excluded.customer_name, conversations.customer_name),
         customer_avatar_url = COALESCE(excluded.customer_avatar_url, conversations.customer_avatar_url),
         last_message_text = excluded.last_message_text,
         last_message_at = excluded.last_message_at,
         last_customer_message_at = excluded.last_customer_message_at,
         updated_at = excluded.updated_at`
    )
      .bind(
        conversationId,
        inbound.source,
        inbound.externalConversationId,
        inbound.customerChannelId,
        inbound.customerName,
        inbound.customerAvatarUrl,
        inbound.text,
        inbound.timestamp,
        inbound.timestamp,
        now,
        now
      )
      .run();

    const row = buildMessageInsert(inbound, conversationId);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO messages
        (id, conversation_id, channel, direction, sender_type, sender_id, agent_name, body, normalized_body,
         message_type, media_url, media_mime_type, media_storage_key, external_message_id, reply_to_message_id,
         status, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        row.id,
        row.conversation_id,
        row.channel,
        row.direction,
        row.sender_type,
        row.sender_id,
        row.agent_name,
        row.body,
        row.normalized_body,
        row.message_type,
        row.media_url,
        row.media_mime_type,
        row.media_storage_key,
        row.external_message_id,
        row.reply_to_message_id,
        row.status,
        row.metadata_json,
        row.created_at,
        row.updated_at
      )
      .run();

    await notifyConversationRoom(env, conversationId, {
      type: "message.created",
      conversationId,
      payload: row
    });
  }

  await env.DB.prepare("UPDATE webhook_events SET processed = 1, processed_at = ? WHERE id = ?").bind(now, body.eventId).run();
}

async function notifyConversationRoom(env: Env, conversationId: string, event: unknown) {
  const id = env.CONVERSATION_ROOM.idFromName(conversationId);
  const stub = env.CONVERSATION_ROOM.get(id);
  await stub.fetch("https://conversation-room.internal/broadcast", {
    method: "POST",
    body: JSON.stringify(event)
  });
}

async function markWebhookError(env: Env, eventId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown queue processing error";
  await env.DB.prepare("UPDATE webhook_events SET processing_error = ? WHERE id = ?").bind(message, eventId).run();
}
