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

async function fetchInstagramProfile(senderId: string): Promise<string | null> {
  const accessToken = Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
  if (!accessToken) return null;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${senderId}?fields=name,username&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!response.ok) return null;

    const profile = await response.json();
    return asString(profile?.name) || asString(profile?.username) || null;
  } catch (error) {
    console.warn("[INSTAGRAM-WEBHOOK] Nao foi possivel buscar perfil:", error);
    return null;
  }
}

async function sendInstagramText(recipientId: string, text: string) {
  const accessToken = Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
  const senderAccountId =
    Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID") ||
    Deno.env.get("INSTAGRAM_PAGE_ID") ||
    "me";

  if (!accessToken) {
    return { success: false, messageId: null, error: "INSTAGRAM_ACCESS_TOKEN not configured" };
  }

  const sendToEndpoint = async (accountId: string) =>
    fetch(`https://graph.facebook.com/v20.0/${accountId}/messages?access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_type: "RESPONSE",
        recipient: { id: recipientId },
        message: { text },
      }),
    });

  let response = await sendToEndpoint(senderAccountId);
  if (!response.ok && senderAccountId !== "me") {
    response = await sendToEndpoint("me");
  }

  const result = await response.json().catch(() => null);
  return {
    success: response.ok && !!result?.message_id,
    messageId: result?.message_id || null,
    error: response.ok ? null : result,
  };
}

async function insertInternalNote(supabase: any, conversationId: string, content: string) {
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    content,
    message_type: "internal_note",
    is_from_me: true,
    status: "sent",
  });
}

async function runAgentAndReply(args: {
  supabase: any;
  supabaseUrl: string;
  supabaseKey: string;
  senderId: string;
  conversationId: string;
  contactNumber: string;
  contactName: string;
  message: string;
  messageType: string;
  mediaUrl: string | null;
}) {
  const messageForAgent =
    args.message ||
    (args.messageType === "image"
      ? "[imagem recebida]"
      : args.messageType === "video"
        ? "[video recebido]"
        : args.messageType === "audio"
          ? "[audio recebido]"
          : args.messageType !== "text"
            ? `[${args.messageType} recebido]`
            : "");

  if (!messageForAgent) return { skipped: true, reason: "empty_agent_message" };

  const agentResponse = await fetch(`${args.supabaseUrl}/functions/v1/aline-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.supabaseKey}`,
    },
    body: JSON.stringify({
      phone: args.senderId,
      message: messageForAgent,
      contact_name: args.contactName,
      media_type: args.messageType,
      media_url: args.mediaUrl,
      platform: "instagram",
      isInstagram: true,
    }),
  });

  if (!agentResponse.ok) {
    const errorText = await agentResponse.text();
    throw new Error(`aline-reply failed: ${agentResponse.status} - ${errorText}`);
  }

  const data = await agentResponse.json();
  if (data?.skipped) return { skipped: true, reason: data.reason || "agent_skipped" };

  const text = asString(data?.mensagem_whatsapp) || asString(data?.response);
  if (!text) return { skipped: true, reason: "empty_agent_response" };

  const sendResult = await sendInstagramText(args.senderId, text);
  if (!sendResult.success) {
    console.error("[INSTAGRAM-WEBHOOK] Falha ao enviar resposta:", sendResult.error);
    await insertInternalNote(
      args.supabase,
      args.conversationId,
      `Falha ao enviar resposta no Instagram: ${JSON.stringify(sendResult.error).substring(0, 500)}`,
    );
    return { sent: false, error: sendResult.error };
  }

  await args.supabase.from("messages").insert({
    conversation_id: args.conversationId,
    content: text,
    message_type: "text",
    is_from_me: true,
    status: "sent",
    zapi_message_id: `instagram:${sendResult.messageId}`,
  });

  await args.supabase
    .from("conversations")
    .update({
      last_message: text.substring(0, 100),
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    })
    .eq("id", args.conversationId);

  return { sent: true, message_id: sendResult.messageId };
}

async function storeInstagramMessage(supabase: any, event: any) {
  const senderId = asString(event?.sender?.id);
  const message = event?.message;

  if (!senderId || !message || message?.is_echo) {
    return { skipped: true, reason: "no_sender_or_echo" };
  }

  const mid = asString(message?.mid) || `ig:${senderId}:${event?.timestamp || Date.now()}`;
  const contactNumber = `ig:${senderId}`;
  const contactName = (await fetchInstagramProfile(senderId)) || `Instagram ${senderId}`;
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

  return {
    stored: true,
    conversation_id: conversationId,
    message_id: storedMessage.id,
    sender_id: senderId,
    contact_number: contactNumber,
    contact_name: contactName,
    content,
    message_type: media.type,
    media_url: media.url,
  };
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
        const stored = await storeInstagramMessage(supabase, event);
        if (stored?.stored) {
          try {
            const agent = await runAgentAndReply({
              supabase,
              supabaseUrl,
              supabaseKey,
              senderId: stored.sender_id,
              conversationId: stored.conversation_id,
              contactNumber: stored.contact_number,
              contactName: stored.contact_name,
              message: stored.content,
              messageType: stored.message_type,
              mediaUrl: stored.media_url,
            });
            results.push({ ...stored, agent });
          } catch (agentError) {
            console.error("[INSTAGRAM-WEBHOOK] Falha no agente:", agentError);
            await insertInternalNote(
              supabase,
              stored.conversation_id,
              `Falha ao gerar resposta do agente: ${agentError instanceof Error ? agentError.message : String(agentError)}`.substring(0, 800),
            );
            results.push({
              ...stored,
              agent: {
                sent: false,
                error: agentError instanceof Error ? agentError.message : String(agentError),
              },
            });
          }
        } else {
          results.push(stored);
        }
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
