import { jsonResponse } from "../http/cors";
import type { Env } from "../types";

export async function handleConversations(env: Env): Promise<Response> {
  const d1Rows = await env.DB.prepare(
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

  const legacyRows = await fetchLegacyConversations(env);
  const conversations = [...(d1Rows.results ?? []), ...legacyRows].sort((a, b) => {
    const left = Date.parse(String(a.last_message_at ?? a.updated_at ?? a.created_at ?? 0));
    const right = Date.parse(String(b.last_message_at ?? b.updated_at ?? b.created_at ?? 0));
    return right - left;
  });

  return jsonResponse({ conversations: conversations.slice(0, 120) });
}

export async function handleConversationMessages(env: Env, conversationId: string): Promise<Response> {
  if (conversationId.startsWith("legacy:chat:")) {
    return jsonResponse({ messages: await fetchLegacyMessages(env, conversationId.replace("legacy:chat:", ""), "chat") });
  }

  if (conversationId.startsWith("legacy:aline:")) {
    return jsonResponse({ messages: await fetchLegacyMessages(env, conversationId.replace("legacy:aline:", ""), "aline") });
  }

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

type LegacyConversation = {
  id: string;
  customer_ref: string | null;
  channel: string;
  channel_customer_id: string | null;
  customer_name: string | null;
  customer_avatar_url: string | null;
  current_agent: string | null;
  stage: string | null;
  status: string | null;
  human_takeover: number;
  human_required: number;
  automation_paused: number;
  assigned_queue: string | null;
  handoff_priority: string | null;
  handoff_summary: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  next_followup_at: string | null;
  created_at: string;
  updated_at: string;
};

type LegacyMessage = {
  id: string;
  conversation_id: string;
  channel: string;
  direction: string;
  sender_type: string;
  sender_id: string | null;
  agent_name: string | null;
  body: string | null;
  message_type: string;
  media_url: string | null;
  media_mime_type: string | null;
  media_storage_key: string | null;
  status: string | null;
  created_at: string;
};

async function fetchLegacyConversations(env: Env): Promise<LegacyConversation[]> {
  const [chatConversations, alineConversations] = await Promise.all([
    supabaseGet<Array<Record<string, unknown>>>(
      env,
      "/rest/v1/conversations?select=id,contact_name,contact_number,platform,last_message,last_message_at,lead_status,unread_count,created_at&order=last_message_at.desc.nullslast&limit=80"
    ),
    supabaseGet<Array<Record<string, unknown>>>(
      env,
      "/rest/v1/aline_conversations?select=id,phone,status,active_agent,current_node,last_node,last_message_at,created_at,updated_at&order=last_message_at.desc.nullslast&limit=80"
    )
  ]);

  return [
    ...chatConversations.map((row) => ({
      id: `legacy:chat:${String(row.id)}`,
      customer_ref: String(row.id),
      channel: normalizeChannel(String(row.platform ?? "whatsapp")),
      channel_customer_id: stringOrNull(row.contact_number),
      customer_name: stringOrNull(row.contact_name) ?? stringOrNull(row.contact_number),
      customer_avatar_url: null,
      current_agent: null,
      stage: stringOrNull(row.lead_status) ?? "legacy",
      status: "legacy",
      human_takeover: 0,
      human_required: 0,
      automation_paused: 0,
      assigned_queue: null,
      handoff_priority: null,
      handoff_summary: null,
      last_message_text: stringOrNull(row.last_message),
      last_message_at: stringOrNull(row.last_message_at) ?? stringOrNull(row.created_at),
      next_followup_at: null,
      created_at: String(row.created_at ?? new Date().toISOString()),
      updated_at: String(row.last_message_at ?? row.created_at ?? new Date().toISOString())
    })),
    ...alineConversations.map((row) => ({
      id: `legacy:aline:${String(row.id)}`,
      customer_ref: String(row.id),
      channel: "whatsapp",
      channel_customer_id: stringOrNull(row.phone),
      customer_name: stringOrNull(row.phone),
      customer_avatar_url: null,
      current_agent: stringOrNull(row.active_agent),
      stage: stringOrNull(row.current_node) ?? stringOrNull(row.last_node) ?? "legacy_aline",
      status: stringOrNull(row.status) ?? "legacy",
      human_takeover: 0,
      human_required: 0,
      automation_paused: 0,
      assigned_queue: null,
      handoff_priority: null,
      handoff_summary: null,
      last_message_text: stringOrNull(row.last_node) ?? stringOrNull(row.status),
      last_message_at: stringOrNull(row.last_message_at) ?? stringOrNull(row.updated_at) ?? stringOrNull(row.created_at),
      next_followup_at: null,
      created_at: String(row.created_at ?? new Date().toISOString()),
      updated_at: String(row.updated_at ?? row.last_message_at ?? row.created_at ?? new Date().toISOString())
    }))
  ];
}

async function fetchLegacyMessages(env: Env, conversationId: string, source: "chat" | "aline"): Promise<LegacyMessage[]> {
  if (source === "aline") {
    const rows = await supabaseGet<Array<Record<string, unknown>>>(
      env,
      `/rest/v1/aline_messages?select=id,conversation_id,message,role,node,created_at&conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.asc&limit=160`
    );
    return rows.map((row) => ({
      id: `legacy:aline-message:${String(row.id)}`,
      conversation_id: `legacy:aline:${String(row.conversation_id)}`,
      channel: "whatsapp",
      direction: row.role === "user" ? "inbound" : "outbound",
      sender_type: row.role === "user" ? "customer" : "agent",
      sender_id: null,
      agent_name: row.role === "user" ? null : stringOrNull(row.node),
      body: stringOrNull(row.message),
      message_type: "text",
      media_url: null,
      media_mime_type: null,
      media_storage_key: null,
      status: "legacy",
      created_at: String(row.created_at ?? new Date().toISOString())
    }));
  }

  const rows = await supabaseGet<Array<Record<string, unknown>>>(
    env,
    `/rest/v1/messages?select=id,conversation_id,content,is_from_me,media_url,message_type,status,created_at&conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.asc&limit=160`
  );
  return rows.map((row) => ({
    id: `legacy:message:${String(row.id)}`,
    conversation_id: `legacy:chat:${String(row.conversation_id)}`,
    channel: "whatsapp",
    direction: row.is_from_me ? "outbound" : "inbound",
    sender_type: row.is_from_me ? "agent" : "customer",
    sender_id: null,
    agent_name: row.is_from_me ? "humano" : null,
    body: stringOrNull(row.content),
    message_type: stringOrNull(row.message_type) ?? "text",
    media_url: stringOrNull(row.media_url),
    media_mime_type: null,
    media_storage_key: null,
    status: stringOrNull(row.status) ?? "legacy",
    created_at: String(row.created_at ?? new Date().toISOString())
  }));
}

async function supabaseGet<T>(env: Env, path: string): Promise<T> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return [] as T;

  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!response.ok) return [] as T;
  return response.json() as Promise<T>;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeChannel(value: string): string {
  if (value.includes("instagram")) return "instagram";
  if (value.includes("facebook")) return "facebook";
  return "whatsapp";
}
