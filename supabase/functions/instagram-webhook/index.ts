import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_VERIFY_TOKEN = "msv_acium_instagram_2026";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getMessageText(message: any): string {
  const text = asString(message?.text);
  if (text) return text;

  const quickReply = asString(message?.quick_reply?.payload);
  if (quickReply) return quickReply;

  const firstAttachment = Array.isArray(message?.attachments) ? message.attachments[0] : null;
  const attachmentType = asString(firstAttachment?.type);
  return attachmentType ? `[${attachmentType}]` : "";
}

function getMedia(message: any): { type: string; url: string | null } {
  const firstAttachment = Array.isArray(message?.attachments) ? message.attachments[0] : null;
  const type = asString(firstAttachment?.type) || "text";
  const url =
    asString(firstAttachment?.payload?.url) ||
    asString(firstAttachment?.payload?.sticker_id) ||
    null;

  if (!firstAttachment) return { type: "text", url: null };
  if (["image", "audio", "video", "file"].includes(type)) {
    return { type: type === "file" ? "document" : type, url };
  }

  return { type, url };
}

async function storeInstagramMessage(supabase: any, event: any) {
  const senderId = asString(event?.sender?.id);
  const message = event?.message;

  if (!senderId || !message || message?.is_echo) {
    return { skipped: true, reason: "no_sender_or_echo" };
  }

  const mid = asString(message?.mid) || `ig:${senderId}:${event?.timestamp || Date.now()}`;
  const contactNumber = `ig:${senderId}`;
  const contactName = `Instagram ${senderId}`;
  const text = getMessageText(message);
  const media = getMedia(message);
  const content = text || (media.type !== "text" ? `[${media.type}]` : "");
  const nowIso = new Date().toISOString();

  const { error: dedupeError } = await supabase
    .from("processed_messages")
    .insert({ message_id: `instagram:${mid}`, phone: contactNumber });

  if (dedupeError) {
    const { data: existing } = await supabase
      .from("processed_messages")
      .select("id")
      .eq("message_id", `instagram:${mid}`)
      .maybeSingle();

    if (existing?.id) return { skipped: true, reason: "duplicate" };
  }

  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("id, unread_count")
    .eq("contact_number", contactNumber)
    .maybeSingle();

  let conversationId = existingConversation?.id;
  const unreadCount = Number(existingConversation?.unread_count || 0) + 1;

  if (!conversationId) {
    const { data: createdConversation, error } = await supabase
      .from("conversations")
      .insert({
        contact_number: contactNumber,
        contact_name: contactName,
        platform: "instagram",
        last_message: content || "[Instagram]",
        last_message_at: nowIso,
        unread_count: 1,
      })
      .select("id")
      .single();

    if (error) throw error;
    conversationId = createdConversation.id;
  } else {
    await supabase
      .from("conversations")
      .update({
        contact_name: contactName,
        platform: "instagram",
        last_message: content || "[Instagram]",
        last_message_at: nowIso,
        unread_count: unreadCount,
      })
      .eq("id", conversationId);
  }

  const { data: storedMessage, error: messageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      content,
      message_type: media.type,
      media_url: media.url,
      is_from_me: false,
      status: "received",
      zapi_message_id: `instagram:${mid}`,
    })
    .select("id")
    .single();

  if (messageError) throw messageError;

  return { stored: true, conversation_id: conversationId, message_id: storedMessage.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") || "";
    const expectedToken = Deno.env.get("INSTAGRAM_VERIFY_TOKEN") || DEFAULT_VERIFY_TOKEN;

    if (mode === "subscribe" && token === expectedToken) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }

    return new Response("Invalid verify token", { status: 403, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const results = [];

    for (const entry of body?.entry || []) {
      for (const event of entry?.messaging || []) {
        results.push(await storeInstagramMessage(supabase, event));
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[INSTAGRAM-WEBHOOK] Erro:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
