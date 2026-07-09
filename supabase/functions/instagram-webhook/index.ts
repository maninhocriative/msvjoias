import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_VERIFY_TOKEN = "msv_acium_instagram_2026";
const ENABLE_INSTAGRAM_PUBLIC_COMMENT_REPLIES = false;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInstagramAttachmentLabel(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized === "ephemeral") return "midia temporaria do Instagram";
  if (["share", "story_mention", "ig_story", "instagram_story"].includes(normalized)) {
    return "midia do Instagram";
  }
  return type;
}

function inferMediaTypeFromUrl(url: string): string {
  const lower = url.toLowerCase().split("?")[0];
  if (/\.(mp4|mov|webm|m4v)$/.test(lower)) return "video";
  if (/\.(mp3|m4a|ogg|oga|opus|wav|aac|amr)$/.test(lower)) return "audio";
  if (/\.(pdf|doc|docx|xls|xlsx|csv|txt|zip)$/.test(lower)) return "document";
  return "image";
}

function getInstagramAccessToken(): string {
  return (
    Deno.env.get("INSTAGRAM_ACCESS_TOKEN") ||
    Deno.env.get("INSTAGRAM_PAGE_ACCESS_TOKEN") ||
    Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN") ||
    Deno.env.get("META_ACCESS_TOKEN") ||
    Deno.env.get("IG_ACCESS_TOKEN") ||
    Deno.env.get("INSTAGRAM_TOKEN") ||
    ""
  ).trim();
}

function getInstagramSenderAccountId(): string {
  return (
    Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID") ||
    Deno.env.get("INSTAGRAM_PAGE_ID") ||
    "me"
  );
}

function getMessageText(message: any): string {
  const text = asString(message?.text);
  if (text) return text;

  const quickReply = asString(message?.quick_reply?.payload);
  if (quickReply) return quickReply;

  const firstAttachment = Array.isArray(message?.attachments) ? message.attachments[0] : null;
  const attachmentType = asString(firstAttachment?.type);
  return attachmentType ? `[${normalizeInstagramAttachmentLabel(attachmentType)}]` : "";
}

function getCommentEvents(body: any): any[] {
  const comments: any[] = [];

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const field = asString(change?.field);
      const value = change?.value || {};
      if (!/comments?|live_comments?/i.test(field)) continue;

      const commentId =
        asString(value?.id) ||
        asString(value?.comment_id) ||
        asString(value?.comment?.id);
      const text =
        asString(value?.text) ||
        asString(value?.message) ||
        asString(value?.comment?.text) ||
        asString(value?.comment?.message);
      const from = value?.from || value?.user || value?.comment?.from || {};
      const fromId = asString(from?.id) || asString(value?.from_id) || asString(value?.user_id);
      const username = asString(from?.username) || asString(from?.name) || asString(value?.username);
      const mediaId = asString(value?.media?.id) || asString(value?.media_id) || asString(value?.parent_id);

      if (commentId && text) {
        comments.push({
          id: commentId,
          text,
          from_id: fromId,
          username,
          media_id: mediaId,
          raw: value,
        });
      }
    }
  }

  return comments;
}

function getEventText(event: any): string {
  const postbackPayload = asString(event?.postback?.payload);
  if (postbackPayload) return postbackPayload;
  return getMessageText(event?.message);
}

function getEventMessage(event: any): any {
  if (event?.message) return event.message;
  if (event?.postback) {
    return {
      mid: event.postback?.mid || `postback:${event?.timestamp || Date.now()}`,
      text: asString(event.postback?.payload) || asString(event.postback?.title),
    };
  }
  return null;
}

function getMedia(message: any): { type: string; url: string | null } {
  const firstAttachment = Array.isArray(message?.attachments) ? message.attachments[0] : null;
  const type = asString(firstAttachment?.type) || "text";
  const normalizedType = type.toLowerCase();
  const url =
    asString(firstAttachment?.payload?.url) ||
    asString(firstAttachment?.payload?.image_url) ||
    asString(firstAttachment?.payload?.video_url) ||
    asString(firstAttachment?.payload?.media_url) ||
    asString(firstAttachment?.payload?.sticker_id) ||
    null;

  if (!firstAttachment) return { type: "text", url: null };
  if (["image", "audio", "video", "file"].includes(type)) {
    return { type: type === "file" ? "document" : type, url };
  }
  if (url && ["ephemeral", "share", "story_mention", "ig_story", "instagram_story"].includes(normalizedType)) {
    return { type: inferMediaTypeFromUrl(url), url };
  }

  return { type, url };
}

async function fetchInstagramProfile(senderId: string): Promise<string | null> {
  const accessToken = getInstagramAccessToken();
  if (!accessToken) return null;

  try {
    const response = await fetch(
      `https://graph.instagram.com/v20.0/${senderId}?fields=name,username`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
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
  const accessToken = getInstagramAccessToken();
  const senderAccountId = getInstagramSenderAccountId();

  if (!accessToken) {
    return {
      success: false,
      messageId: null,
      error: "Instagram access token not configured. Expected one of: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_PAGE_ACCESS_TOKEN, FACEBOOK_PAGE_ACCESS_TOKEN, META_ACCESS_TOKEN, IG_ACCESS_TOKEN, INSTAGRAM_TOKEN",
    };
  }

  const sendToEndpoint = async (accountId: string) =>
    fetch(`https://graph.instagram.com/v20.0/${accountId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
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

async function sendInstagramCommentReply(commentId: string, text: string) {
  const accessToken = getInstagramAccessToken();
  if (!accessToken) {
    return { success: false, messageId: null, error: "Instagram access token not configured" };
  }

  const body = JSON.stringify({ message: text });
  const sendToEndpoint = (baseUrl: string) =>
    fetch(`${baseUrl}/v20.0/${commentId}/replies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    });

  let response = await sendToEndpoint("https://graph.facebook.com");
  if (!response.ok) {
    response = await sendToEndpoint("https://graph.instagram.com");
  }

  const result = await response.json().catch(() => null);
  return {
    success: response.ok,
    messageId: result?.id || result?.comment_id || null,
    error: response.ok ? null : result,
  };
}

function formatMoney(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function productImageUrl(product: any): string {
  return asString(product?.image_url) || asString(product?.media_url);
}

function productTitle(product: any): string {
  return (asString(product?.name) || asString(product?.nome) || "Produto").substring(0, 80);
}

function productSubtitle(product: any): string {
  const parts = [
    formatMoney(product?.price ?? product?.preco),
    asString(product?.sku) ? `SKU ${asString(product.sku)}` : "",
  ].filter(Boolean);
  return (parts.join(" • ") || "Toque para escolher este modelo").substring(0, 80);
}

function productPayload(product: any, index: number): string {
  const key = asString(product?.sku) || asString(product?.id) || String(index + 1);
  return `select_${key}`;
}

async function sendInstagramProductCards(recipientId: string, products: any[]) {
  const accessToken = getInstagramAccessToken();
  const senderAccountId =
    Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID") ||
    Deno.env.get("INSTAGRAM_PAGE_ID") ||
    "me";

  if (!accessToken) {
    return { success: false, sent: 0, error: "Instagram access token not configured" };
  }

  const cardProducts = products
    .filter((product) => productImageUrl(product))
    .slice(0, 10);

  if (cardProducts.length === 0) {
    return { success: true, sent: 0, skipped: true };
  }

  let sent = 0;
  let lastError: unknown = null;

  for (const group of chunk(cardProducts, 10)) {
    const elements = group.map((product, index) => ({
      title: productTitle(product),
      image_url: productImageUrl(product),
      subtitle: productSubtitle(product),
      buttons: [
        {
          type: "postback",
          title: "Quero este",
          payload: productPayload(product, index),
        },
      ],
    }));

    const body = {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements,
          },
        },
      },
    };

    const sendToEndpoint = async (accountId: string) =>
      fetch(`https://graph.instagram.com/v20.0/${accountId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

    let response = await sendToEndpoint(senderAccountId);
    if (!response.ok && senderAccountId !== "me") {
      response = await sendToEndpoint("me");
    }

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      lastError = result;
      break;
    }

    sent += group.length;
  }

  return { success: sent > 0, sent, error: lastError };
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

function buildPublicCommentReply(args: { comment: string; agentText: string; products: any[] }): string {
  const normalizedComment = args.comment.toLowerCase();

  if (args.products.length > 0) {
    if (/pre[cç]o|valor|quanto|custa/.test(normalizedComment)) {
      const first = args.products[0];
      const price = formatMoney(first?.price ?? first?.preco);
      return price
        ? `Temos sim! Esse modelo fica a partir de ${price}. Me chama no direct que te envio os detalhes certinhos.`
        : "Temos sim! Me chama no direct que te envio os modelos e valores certinhos.";
    }

    return "Temos sim! Me chama no direct que te envio os modelos disponiveis e te ajudo a escolher.";
  }

  const cleaned = args.agentText
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/toque em quero este.*$/i, "me chama no direct que te ajudo a escolher.")
    .replace(/vou te mandar os produtos.*$/i, "me chama no direct que te envio as opcoes.")
    .trim();

  if (!cleaned) {
    return "Oi! Me chama no direct que eu te ajudo com os detalhes.";
  }

  if (cleaned.length <= 240) return cleaned;
  return `${cleaned.slice(0, 230).replace(/\s+\S*$/, "")}...`;
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
  const products = Array.isArray(data?.produtos) ? data.produtos : [];
  const postCatalogMessage = asString(data?.mensagem_pos_catalogo);
  let textSent = false;
  let cardsSent = 0;

  if (text) {
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

    textSent = true;

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
  }

  if (products.length > 0) {
    const cardResult = await sendInstagramProductCards(args.senderId, products);
    if (!cardResult.success && cardResult.error) {
      await insertInternalNote(
        args.supabase,
        args.conversationId,
        `Falha ao enviar cards no Instagram: ${JSON.stringify(cardResult.error).substring(0, 500)}`,
      );
    } else {
      cardsSent = cardResult.sent || 0;
      for (const product of products.slice(0, cardsSent)) {
        await args.supabase.from("messages").insert({
          conversation_id: args.conversationId,
          content: `${productTitle(product)}\n${productSubtitle(product)}`,
          message_type: "image",
          media_url: productImageUrl(product),
          is_from_me: true,
          status: "sent",
          zapi_message_id: `instagram-card:${asString(product?.sku) || asString(product?.id) || crypto.randomUUID()}`,
        });
      }
    }
  }

  if (cardsSent > 0 && postCatalogMessage) {
    const postResult = await sendInstagramText(args.senderId, postCatalogMessage);
    if (postResult.success) {
      await args.supabase.from("messages").insert({
        conversation_id: args.conversationId,
        content: postCatalogMessage,
        message_type: "text",
        is_from_me: true,
        status: "sent",
        zapi_message_id: `instagram:${postResult.messageId}`,
      });
      await args.supabase
        .from("conversations")
        .update({
          last_message: postCatalogMessage.substring(0, 100),
          last_message_at: new Date().toISOString(),
          unread_count: 0,
        })
        .eq("id", args.conversationId);
    }
  }

  if (!textSent && cardsSent === 0) return { skipped: true, reason: "empty_agent_response" };

  return { sent: true, text_sent: textSent, cards_sent: cardsSent };
}

async function runAgentAndReplyToComment(args: {
  supabase: any;
  supabaseUrl: string;
  supabaseKey: string;
  comment: any;
  conversationId: string;
  contactNumber: string;
  contactName: string;
}) {
  const agentResponse = await fetch(`${args.supabaseUrl}/functions/v1/aline-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.supabaseKey}`,
    },
    body: JSON.stringify({
      phone: args.contactNumber,
      message: `Comentario publico no Instagram: "${args.comment.text}". Responda de forma curta, natural e segura para comentario publico. Se precisar enviar catalogo, valores completos, dados pessoais ou finalizar venda, convide para o direct.`,
      contact_name: args.contactName,
      platform: "instagram_comment",
      isInstagram: true,
    }),
  });

  if (!agentResponse.ok) {
    const errorText = await agentResponse.text();
    throw new Error(`aline-reply comment failed: ${agentResponse.status} - ${errorText}`);
  }

  const data = await agentResponse.json();
  const agentText = asString(data?.mensagem_whatsapp) || asString(data?.response);
  const products = Array.isArray(data?.produtos) ? data.produtos : [];
  const publicReply = buildPublicCommentReply({
    comment: args.comment.text,
    agentText,
    products,
  });

  const sendResult = await sendInstagramCommentReply(args.comment.id, publicReply);
  if (!sendResult.success) {
    await insertInternalNote(
      args.supabase,
      args.conversationId,
      `Falha ao responder comentario no Instagram: ${JSON.stringify(sendResult.error).substring(0, 500)}`,
    );
    return { sent: false, error: sendResult.error, reply: publicReply };
  }

  await args.supabase.from("messages").insert({
    conversation_id: args.conversationId,
    content: publicReply,
    message_type: "instagram_comment_reply",
    is_from_me: true,
    status: "sent",
    zapi_message_id: `instagram-comment-reply:${sendResult.messageId || crypto.randomUUID()}`,
  });

  await args.supabase
    .from("conversations")
    .update({
      last_message: publicReply.substring(0, 100),
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    })
    .eq("id", args.conversationId);

  return { sent: true, reply: publicReply, comment_reply_id: sendResult.messageId };
}

async function storeInstagramComment(supabase: any, comment: any) {
  const commentId = asString(comment?.id);
  const text = asString(comment?.text);
  if (!commentId || !text) return { skipped: true, reason: "empty_comment" };

  const ownAccountId = getInstagramSenderAccountId();
  if (comment.from_id && ownAccountId !== "me" && comment.from_id === ownAccountId) {
    return { skipped: true, reason: "own_comment" };
  }

  const contactNumber = `ig-comment:${comment.from_id || comment.username || commentId}`;
  const contactName = comment.username ? `@${comment.username}` : `Instagram comentario ${comment.from_id || commentId}`;
  const nowIso = new Date().toISOString();

  const { error: dedupeError } = await supabase
    .from("processed_messages")
    .insert({ message_id: `instagram-comment:${commentId}`, phone: contactNumber });

  if (dedupeError) {
    const { data: existing } = await supabase
      .from("processed_messages")
      .select("id")
      .eq("message_id", `instagram-comment:${commentId}`)
      .maybeSingle();

    if (existing?.id) return { skipped: true, reason: "duplicate" };
  }

  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("id, unread_count, lead_status, attending_by, attending_name")
    .eq("contact_number", contactNumber)
    .maybeSingle();

  let conversationId = existingConversation?.id;
  const content = `[Comentario Instagram] ${text}`;
  const automationBlocked = isHumanHandledConversation(existingConversation);

  if (!conversationId) {
    const { data: createdConversation, error } = await supabase
      .from("conversations")
      .insert({
        contact_number: contactNumber,
        contact_name: contactName,
        platform: "instagram",
        last_message: content.substring(0, 100),
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
        last_message: content.substring(0, 100),
        last_message_at: nowIso,
        unread_count: Number(existingConversation?.unread_count || 0) + 1,
      })
      .eq("id", conversationId);
  }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    content,
    message_type: "instagram_comment",
    is_from_me: false,
    status: "received",
    zapi_message_id: `instagram-comment:${commentId}`,
  });

  if (automationBlocked) {
    await syncInstagramHumanTakeover(
      supabase,
      contactNumber,
      existingConversation?.attending_name
        ? `Atendimento humano ativo no CRM: ${existingConversation.attending_name}`
        : `Lead status no CRM: ${existingConversation?.lead_status || "humano"}`,
    );
  }

  return {
    stored: true,
    automation_blocked: automationBlocked,
    automation_block_reason: automationBlocked
      ? existingConversation?.attending_by || existingConversation?.attending_name
        ? "crm_attending_human"
        : `crm_lead_status_${existingConversation?.lead_status || "human"}`
      : null,
    conversation_id: conversationId,
    contact_number: contactNumber,
    contact_name: contactName,
    comment,
  };
}

function isHumanLeadStatus(value: unknown): boolean {
  const status = String(value || "").trim().toLowerCase();
  return status === "humano" || status === "venda_iniciada" || status === "vendido";
}

function isHumanHandledConversation(conversation: any): boolean {
  return (
    isHumanLeadStatus(conversation?.lead_status) ||
    Boolean(conversation?.attending_by || conversation?.attending_name)
  );
}

async function syncInstagramHumanTakeover(supabase: any, contactNumber: string, reason: string) {
  await supabase
    .from("aline_conversations")
    .update({
      status: "human_takeover",
      active_agent: "human",
      assignment_reason: reason,
      last_message_at: new Date().toISOString(),
      followup_count: 0,
    })
    .eq("phone", contactNumber);
}

async function storeInstagramMessage(supabase: any, event: any) {
  const senderId = asString(event?.sender?.id);
  const message = getEventMessage(event);

  if (!senderId || !message || message?.is_echo) {
    return { skipped: true, reason: "no_sender_or_echo" };
  }

  const mid = asString(message?.mid) || `ig:${senderId}:${event?.timestamp || Date.now()}`;
  const contactNumber = `ig:${senderId}`;
  const contactName = (await fetchInstagramProfile(senderId)) || `Instagram ${senderId}`;
  const text = getEventText(event);
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
    .select("id, unread_count, lead_status, attending_by, attending_name")
    .eq("contact_number", contactNumber)
    .maybeSingle();

  let conversationId = existingConversation?.id;
  const unreadCount = Number(existingConversation?.unread_count || 0) + 1;
  const automationBlocked = isHumanHandledConversation(existingConversation);

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

  if (automationBlocked) {
    await syncInstagramHumanTakeover(
      supabase,
      contactNumber,
      existingConversation?.attending_name
        ? `Atendimento humano ativo no CRM: ${existingConversation.attending_name}`
        : `Lead status no CRM: ${existingConversation?.lead_status || "humano"}`,
    );
  }

  return {
    stored: true,
    automation_blocked: automationBlocked,
    automation_block_reason: automationBlocked
      ? existingConversation?.attending_by || existingConversation?.attending_name
        ? "crm_attending_human"
        : `crm_lead_status_${existingConversation?.lead_status || "human"}`
      : null,
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
        if (stored?.stored && stored?.automation_blocked) {
          results.push({
            ...stored,
            agent: { skipped: true, reason: stored.automation_block_reason || "human_takeover" },
          });
        } else if (stored?.stored) {
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

    for (const comment of getCommentEvents(body)) {
      const stored = await storeInstagramComment(supabase, comment);
      if (stored?.stored && stored?.automation_blocked) {
        results.push({
          ...stored,
          agent: { skipped: true, reason: stored.automation_block_reason || "human_takeover" },
        });
      } else if (stored?.stored) {
        if (!ENABLE_INSTAGRAM_PUBLIC_COMMENT_REPLIES) {
          results.push({
            ...stored,
            agent: {
              skipped: true,
              reason: "instagram_public_comment_replies_disabled",
            },
          });
          continue;
        }

        try {
          const agent = await runAgentAndReplyToComment({
            supabase,
            supabaseUrl,
            supabaseKey,
            comment: stored.comment,
            conversationId: stored.conversation_id,
            contactNumber: stored.contact_number,
            contactName: stored.contact_name,
          });
          results.push({ ...stored, agent });
        } catch (agentError) {
          console.error("[INSTAGRAM-WEBHOOK] Falha ao responder comentario:", agentError);
          await insertInternalNote(
            supabase,
            stored.conversation_id,
            `Falha ao responder comentario com agente: ${agentError instanceof Error ? agentError.message : String(agentError)}`.substring(0, 800),
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
