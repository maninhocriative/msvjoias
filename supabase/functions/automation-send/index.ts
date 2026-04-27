import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Product {
  sku: string;
  name: string;
  price?: number;
  image_url?: string;
  video_url?: string;
  sizes?: { size: string; stock: number }[];
}

interface OutgoingAttachment {
  message?: string | null;
  message_type?: string | null;
  media_url?: string | null;
  product_interest?: string | null;
}

interface SendResult {
  success: boolean;
  messageId?: string | null;
  error?: string | null;
}

function buildZapiHeaders(clientToken?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (clientToken) {
    headers["Client-Token"] = clientToken;
  }

  return headers;
}

async function readResponseBody(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function sendViaZAPI(
  phone: string,
  messageType: string,
  content: string | null,
  mediaUrl: string | null,
  instanceId: string,
  token: string,
  clientToken?: string,
): Promise<SendResult> {
  let endpoint = "";
  let body: Record<string, unknown> = {};

  switch (messageType) {
    case "text":
      endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
      body = { phone, message: content || "" };
      break;
    case "image":
      endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-image`;
      body = { phone, image: mediaUrl, caption: content || "" };
      break;
    case "video":
      endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-video`;
      body = { phone, video: mediaUrl, caption: content || "" };
      break;
    case "audio":
      endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-audio`;
      body = { phone, audio: mediaUrl };
      break;
    case "document":
      endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document`;
      body = { phone, document: mediaUrl, fileName: content || "document" };
      break;
    default:
      endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
      body = { phone, message: content || "" };
      break;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildZapiHeaders(clientToken),
      body: JSON.stringify(body),
    });

    const result = await readResponseBody(response);
    const messageId =
      typeof result === "object" && result
        ? (result as Record<string, unknown>).messageId || (result as Record<string, unknown>).zaapId
        : null;

    if (response.ok && messageId) {
      return {
        success: true,
        messageId: String(messageId),
      };
    }

    return {
      success: false,
      error: typeof result === "string" ? result : JSON.stringify(result),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function deleteViaZAPI(
  phone: string,
  messageId: string,
  instanceId: string,
  token: string,
  clientToken?: string,
) {
  const searchParams = new URLSearchParams({
    messageId,
    phone,
    owner: "true",
  });

  const response = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/messages?${searchParams.toString()}`,
    {
      method: "DELETE",
      headers: buildZapiHeaders(clientToken),
    },
  );

  if (response.status === 204) {
    return { success: true };
  }

  const result = await readResponseBody(response);
  return {
    success: response.ok,
    error: response.ok ? null : typeof result === "string" ? result : JSON.stringify(result),
  };
}

function formatProductCaption(product: Product, index: number): string {
  const lines: string[] = [];

  lines.push(`*${index}. ${product.name}*`);

  if (product.sku) {
    lines.push(`SKU: ${product.sku}`);
  }

  if (product.price) {
    const priceFormatted = product.price.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    lines.push(`${priceFormatted}`);
  }

  if (product.sizes && product.sizes.length > 0) {
    const availableSizes = product.sizes
      .filter((item) => item.stock > 0)
      .map((item) => item.size)
      .join(", ");

    if (availableSizes) {
      lines.push(`Tamanhos: ${availableSizes}`);
    }
  }

  return lines.join("\n");
}

function buildConversationPreview(message: string | null, messageType: string) {
  const trimmed = String(message || "").trim();

  if (trimmed) {
    return trimmed;
  }

  switch (messageType) {
    case "image":
      return "[Imagem]";
    case "video":
      return "[Video]";
    case "audio":
      return "[Audio]";
    case "document":
      return "[Documento]";
    default:
      return `[${messageType}]`;
  }
}

async function resolveConversationId(
  supabase: ReturnType<typeof createClient>,
  rawConversationId: unknown,
  phone: string,
  platform: string,
  fallbackMessage: string | null,
) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (typeof rawConversationId === "string" && uuidRegex.test(rawConversationId)) {
    return rawConversationId;
  }

  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_number", phone)
    .eq("platform", platform)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingConversation?.id) {
    return String(existingConversation.id);
  }

  const { data: newConversation, error: createError } = await supabase
    .from("conversations")
    .insert({
      contact_number: phone,
      platform,
      contact_name: phone,
      last_message: fallbackMessage || "[Nova conversa]",
      unread_count: 0,
    })
    .select("id")
    .single();

  if (createError || !newConversation?.id) {
    throw createError || new Error("Failed to create conversation");
  }

  return String(newConversation.id);
}

async function createStoredMessage(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  item: {
    message: string | null;
    messageType: string;
    mediaUrl: string | null;
    fromMe: boolean;
    productInterest?: string | null;
    editedAt?: string | null;
    deletedAt?: string | null;
    replacedMessageId?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      content: item.message || "",
      message_type: item.messageType,
      media_url: item.mediaUrl,
      is_from_me: item.fromMe,
      product_interest: item.productInterest || null,
      status: "pending",
      edited_at: item.editedAt || null,
      deleted_at: item.deletedAt || null,
      replaced_message_id: item.replacedMessageId || null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw error || new Error("Failed to persist message");
  }

  return String(data.id);
}

async function updateStoredMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  values: Record<string, unknown>,
) {
  await supabase.from("messages").update(values).eq("id", messageId);
}

async function sendOutgoingItem(args: {
  normalizedPhone: string;
  message: string | null;
  messageType: string;
  mediaUrl: string | null;
  automationWebhook: string | null;
  preferZapi: boolean;
  hasZapi: boolean;
  zapiInstanceId: string | null;
  zapiToken: string | null;
  zapiClientToken?: string | null;
  platform: string;
  messageId: string | null;
}) {
  const {
    normalizedPhone,
    message,
    messageType,
    mediaUrl,
    automationWebhook,
    preferZapi,
    hasZapi,
    zapiInstanceId,
    zapiToken,
    zapiClientToken,
    platform,
    messageId,
  } = args;

  if (preferZapi && hasZapi && zapiInstanceId && zapiToken) {
    const result = await sendViaZAPI(
      normalizedPhone,
      messageType,
      message,
      mediaUrl,
      zapiInstanceId,
      zapiToken,
      zapiClientToken || undefined,
    );

    return {
      forwarded: result.success,
      status: result.success ? "sent" : "failed",
      zapiMessageId: result.messageId || null,
      error: result.error || null,
    };
  }

  if (automationWebhook) {
    try {
      const webhookResponse = await fetch(automationWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          contact_number: normalizedPhone,
          message,
          message_type: messageType,
          media_url: mediaUrl,
          message_id: messageId,
          direction: "outgoing",
        }),
      });

      if (webhookResponse.ok) {
        return {
          forwarded: true,
          status: "delivered",
          zapiMessageId: null,
          error: null,
        };
      }

      return {
        forwarded: false,
        status: "failed",
        zapiMessageId: null,
        error: await webhookResponse.text(),
      };
    } catch (error) {
      return {
        forwarded: false,
        status: "failed",
        zapiMessageId: null,
        error: error instanceof Error ? error.message : "Webhook error",
      };
    }
  }

  if (hasZapi && zapiInstanceId && zapiToken) {
    const result = await sendViaZAPI(
      normalizedPhone,
      messageType,
      message,
      mediaUrl,
      zapiInstanceId,
      zapiToken,
      zapiClientToken || undefined,
    );

    return {
      forwarded: result.success,
      status: result.success ? "sent" : "failed",
      zapiMessageId: result.messageId || null,
      error: result.error || null,
    };
  }

  return {
    forwarded: false,
    status: "failed",
    zapiMessageId: null,
    error: "No forwarding method configured",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const automationWebhook = Deno.env.get("AUTOMATION_OUTGOING_WEBHOOK");
    const zapiInstanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const zapiToken = Deno.env.get("ZAPI_TOKEN");
    const zapiClientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const payload = await req.json();

    console.log("[AUTOMATION-SEND] Request received:", JSON.stringify(payload, null, 2));

    const {
      conversation_id: rawConversationId,
      phone,
      message,
      message_type = "text",
      media_url = null,
      platform = "whatsapp",
      fromMe = true,
      products = null,
      attachments = null,
      send_video_priority = true,
      skip_crm_save = false,
      prefer_zapi = false,
      replace_message_id = null,
      replace_zapi_message_id = null,
    } = payload;

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedPhone = String(phone).replace(/\D/g, "");
    const hasZapi = !!(zapiInstanceId && zapiToken);
    const preferZapi = prefer_zapi === true;

    const fallbackPreview = buildConversationPreview(String(message || ""), String(message_type || "text"));
    const conversationId = await resolveConversationId(
      supabase,
      rawConversationId,
      normalizedPhone,
      platform,
      fallbackPreview,
    );

    if (replace_message_id) {
      if (!hasZapi || !zapiInstanceId || !zapiToken) {
        return new Response(
          JSON.stringify({ error: "Z-API is required to edit outgoing messages." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!replace_zapi_message_id) {
        return new Response(
          JSON.stringify({ error: "This message cannot be edited because it has no Z-API message id." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const deleteResult = await deleteViaZAPI(
        normalizedPhone,
        String(replace_zapi_message_id),
        zapiInstanceId,
        zapiToken,
        zapiClientToken || undefined,
      );

      if (!deleteResult.success) {
        return new Response(
          JSON.stringify({ error: deleteResult.error || "Unable to delete the original message in Z-API." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await updateStoredMessage(supabase, String(replace_message_id), {
        deleted_at: new Date().toISOString(),
        status: "deleted",
      });
    }

    const results: { messages: string[]; forwarded: number; errors: string[] } = {
      messages: [],
      forwarded: 0,
      errors: [],
    };

    if (products && Array.isArray(products) && products.length > 0) {
      if (message) {
        const introMessageId = skip_crm_save
          ? null
          : await createStoredMessage(supabase, conversationId, {
              message: String(message),
              messageType: "text",
              mediaUrl: null,
              fromMe: true,
            });

        const introResult = await sendOutgoingItem({
          normalizedPhone,
          message: String(message),
          messageType: "text",
          mediaUrl: null,
          automationWebhook,
          preferZapi,
          hasZapi,
          zapiInstanceId,
          zapiToken,
          zapiClientToken,
          platform,
          messageId: introMessageId,
        });

        if (introResult.forwarded) {
          results.forwarded += 1;
        } else if (introResult.error) {
          results.errors.push(`Intro: ${introResult.error}`);
        }

        if (introMessageId) {
          await updateStoredMessage(supabase, introMessageId, {
            status: introResult.status,
            zapi_message_id: introResult.zapiMessageId,
          });
          results.messages.push(introMessageId);
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      for (let index = 0; index < products.length; index += 1) {
        const product = products[index] as Product;
        const caption = formatProductCaption(product, index + 1);

        let mediaType: "image" | "video" | "text" = "text";
        let currentMediaUrl: string | null = null;

        if (send_video_priority && product.video_url) {
          mediaType = "video";
          currentMediaUrl = product.video_url;
        } else if (product.image_url) {
          mediaType = "image";
          currentMediaUrl = product.image_url;
        } else if (product.video_url) {
          mediaType = "video";
          currentMediaUrl = product.video_url;
        }

        const storedMessageId = skip_crm_save
          ? null
          : await createStoredMessage(supabase, conversationId, {
              message: caption,
              messageType: currentMediaUrl ? mediaType : "text",
              mediaUrl: currentMediaUrl,
              fromMe: true,
            });

        const result = await sendOutgoingItem({
          normalizedPhone,
          message: caption,
          messageType: currentMediaUrl ? mediaType : "text",
          mediaUrl: currentMediaUrl,
          automationWebhook,
          preferZapi,
          hasZapi,
          zapiInstanceId,
          zapiToken,
          zapiClientToken,
          platform,
          messageId: storedMessageId,
        });

        if (result.forwarded) {
          results.forwarded += 1;
        } else if (result.error) {
          results.errors.push(`Product ${index + 1}: ${result.error}`);
        }

        if (storedMessageId) {
          await updateStoredMessage(supabase, storedMessageId, {
            status: result.status,
            zapi_message_id: result.zapiMessageId,
          });
          results.messages.push(storedMessageId);
        }

        if (index < products.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      await supabase
        .from("conversations")
        .update({ last_message: `[Catalogo: ${products.length} produtos]` })
        .eq("id", conversationId);

      return new Response(
        JSON.stringify({
          success: true,
          mode: "catalog",
          products_count: products.length,
          messages_sent: results.messages.length,
          message_ids: results.messages,
          forwarded: results.forwarded,
          errors: results.errors,
          conversation_id: conversationId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedAttachments: OutgoingAttachment[] = Array.isArray(attachments)
      ? attachments.filter((item) => item && item.media_url)
      : [];

    if (normalizedAttachments.length > 0) {
      for (const [index, item] of normalizedAttachments.entries()) {
        const attachmentMessage = item.message ? String(item.message) : "";
        const attachmentType = item.message_type ? String(item.message_type) : "document";
        const attachmentMediaUrl = item.media_url ? String(item.media_url) : null;

        const storedMessageId = skip_crm_save
          ? null
          : await createStoredMessage(supabase, conversationId, {
              message: attachmentMessage,
              messageType: attachmentType,
              mediaUrl: attachmentMediaUrl,
              fromMe: fromMe !== false,
              productInterest: item.product_interest || null,
              editedAt: replace_message_id ? new Date().toISOString() : null,
              replacedMessageId: replace_message_id ? String(replace_message_id) : null,
            });

        const sendResult = await sendOutgoingItem({
          normalizedPhone,
          message: attachmentMessage,
          messageType: attachmentType,
          mediaUrl: attachmentMediaUrl,
          automationWebhook,
          preferZapi,
          hasZapi,
          zapiInstanceId,
          zapiToken,
          zapiClientToken,
          platform,
          messageId: storedMessageId,
        });

        if (sendResult.forwarded) {
          results.forwarded += 1;
        } else if (sendResult.error) {
          results.errors.push(`Attachment ${index + 1}: ${sendResult.error}`);
        }

        if (storedMessageId) {
          await updateStoredMessage(supabase, storedMessageId, {
            status: sendResult.status,
            zapi_message_id: sendResult.zapiMessageId,
          });
          results.messages.push(storedMessageId);
        }
      }

      const lastPreview =
        normalizedAttachments.length === 1
          ? buildConversationPreview(
              normalizedAttachments[0].message ? String(normalizedAttachments[0].message) : "",
              normalizedAttachments[0].message_type ? String(normalizedAttachments[0].message_type) : "document",
            )
          : `[${normalizedAttachments.length} arquivos]`;

      await supabase
        .from("conversations")
        .update({ last_message: lastPreview })
        .eq("id", conversationId);

      return new Response(
        JSON.stringify({
          success: true,
          mode: "attachments",
          message_ids: results.messages,
          forwarded: results.forwarded,
          errors: results.errors,
          attachments_count: normalizedAttachments.length,
          conversation_id: conversationId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const outgoingMessage = message ? String(message) : "";
    const outgoingMessageType = String(message_type || "text");
    const outgoingMediaUrl = media_url ? String(media_url) : null;

    const storedMessageId = skip_crm_save
      ? null
      : await createStoredMessage(supabase, conversationId, {
          message: outgoingMessage,
          messageType: outgoingMessageType,
          mediaUrl: outgoingMediaUrl,
          fromMe: fromMe !== false,
          editedAt: replace_message_id ? new Date().toISOString() : null,
          replacedMessageId: replace_message_id ? String(replace_message_id) : null,
        });

    const sendResult = await sendOutgoingItem({
      normalizedPhone,
      message: outgoingMessage,
      messageType: outgoingMessageType,
      mediaUrl: outgoingMediaUrl,
      automationWebhook,
      preferZapi,
      hasZapi,
      zapiInstanceId,
      zapiToken,
      zapiClientToken,
      platform,
      messageId: storedMessageId,
    });

    if (storedMessageId) {
      await updateStoredMessage(supabase, storedMessageId, {
        status: sendResult.status,
        zapi_message_id: sendResult.zapiMessageId,
      });

      await supabase
        .from("conversations")
        .update({ last_message: buildConversationPreview(outgoingMessage, outgoingMessageType) })
        .eq("id", conversationId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: replace_message_id ? "edit" : "single",
        message_id: storedMessageId,
        conversation_id: conversationId,
        forwarded: sendResult.forwarded,
        zapi_message_id: sendResult.zapiMessageId,
        forward_error: sendResult.error,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[AUTOMATION-SEND] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
