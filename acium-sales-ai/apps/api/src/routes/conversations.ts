import { jsonResponse } from "../http/cors";
import type { Env } from "../types";

export async function handleConversations(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT
       id,
       customer_ref,
       channel,
       channel_customer_id,
       customer_name,
       customer_avatar_url,
       current_agent,
       stage,
       status,
       human_takeover,
       human_required,
       automation_paused,
       assigned_user_id,
       assigned_queue,
       handoff_reason,
       handoff_priority,
       handoff_summary,
       last_message_text,
       last_message_at,
       next_followup_at,
       created_at,
       updated_at
     FROM conversations
     ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC
     LIMIT 80`
  ).all();

  return jsonResponse({ conversations: rows.results ?? [] });
}

export async function handleConversationMessages(env: Env, conversationId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT
       id,
       conversation_id,
       channel,
       direction,
       sender_type,
       sender_id,
       agent_name,
       body,
       normalized_body,
       message_type,
       media_url,
       media_mime_type,
       media_storage_key,
       external_message_id,
       reply_to_message_id,
       status,
       metadata_json,
       created_at,
       updated_at
     FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC
     LIMIT 120`
  )
    .bind(conversationId)
    .all();

  return jsonResponse({ messages: rows.results ?? [] });
}
