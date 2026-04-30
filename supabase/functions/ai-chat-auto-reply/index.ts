import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ZapiConfig = {
  instanceId: string | null;
  token: string | null;
  clientToken: string | null;
};

type ParsedPayload = {
  phone: string;
  messageContent: string;
  mediaUrl: string | null;
  isFromMe: boolean;
  contactName: string;
  productInterest: string | null;
  platform: string;
  messageType: string;
  buttonResponseId: string | null;
};

async function sendTextMessage(phone: string, message: string, zapiConfig: ZapiConfig): Promise<any> {
  const { instanceId, token, clientToken } = zapiConfig;
  const formattedPhone = phone.replace(/\D/g, "");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clientToken) headers["Client-Token"] = clientToken;

  const response = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: formattedPhone,
        message,
      }),
    },
  );

  return await response.json();
}

async function sendImageMessage(phone: string, imageUrl: string, caption: string, zapiConfig: ZapiConfig): Promise<any> {
  const { instanceId, token, clientToken } = zapiConfig;
  const formattedPhone = phone.replace(/\D/g, "");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clientToken) headers["Client-Token"] = clientToken;

  const response = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/send-image`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: formattedPhone,
        image: imageUrl,
        caption: caption || "",
      }),
    },
  );

  return await response.json();
}

async function sendVideoMessage(phone: string, videoUrl: string, caption: string, zapiConfig: ZapiConfig): Promise<any> {
  const { instanceId, token, clientToken } = zapiConfig;
  const formattedPhone = phone.replace(/\D/g, "");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clientToken) headers["Client-Token"] = clientToken;

  const response = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/send-video`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: formattedPhone,
        video: videoUrl,
        caption: caption || "",
      }),
    },
  );

  return await response.json();
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function derivePlaceholder(messageType: string) {
  switch (messageType) {
    case "image":
      return "[Imagem]";
    case "audio":
      return "[Audio]";
    case "video":
      return "[Video]";
    case "document":
      return "[Documento]";
    default:
      return "";
  }
}

async function upsertConversationAndMessage(args: {
  supabase: any;
  phone: string;
  contactName: string;
  content: string;
  mediaUrl: string | null;
  isFromMe: boolean;
  platform: string;
  messageType: string;
  productInterest: string | null;
}) {
  const {
    supabase,
    phone,
    contactName,
    content,
    mediaUrl,
    isFromMe,
    platform,
    messageType,
    productInterest,
  } = args;

  let conversationId: string;

  const { data: existingConv } = await supabase
    .from("conversations")
    .select("id, unread_count")
    .eq("contact_number", phone)
    .single();

  if (existingConv) {
    conversationId = existingConv.id;
    await supabase
      .from("conversations")
      .update({
        contact_name: contactName,
        platform,
        last_message: content || `[${messageType}]`,
        last_message_at: new Date().toISOString(),
        unread_count: isFromMe ? 0 : (existingConv.unread_count || 0) + 1,
      })
      .eq("id", conversationId);
  } else {
    const { data: newConv, error: createError } = await supabase
      .from("conversations")
      .insert({
        contact_number: phone,
        contact_name: contactName,
        platform,
        last_message: content || `[${messageType}]`,
        unread_count: isFromMe ? 0 : 1,
      })
      .select()
      .single();

    if (createError) throw createError;
    conversationId = newConv.id;
  }

  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: existingMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("is_from_me", isFromMe)
    .eq("content", content)
    .gte("created_at", twoMinutesAgo)
    .maybeSingle();

  if (!existingMsg) {
    const { error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        content,
        is_from_me: isFromMe,
        message_type: messageType,
        media_url: mediaUrl,
        status: isFromMe ? "sent" : "delivered",
        product_interest: productInterest,
      });

    if (msgError) throw msgError;
  }

  return conversationId;
}

async function detectProductInterest(supabase: any, messageContent: string): Promise<string | null> {
  const normalizedMessage = String(messageContent || "").toLowerCase().trim();
  if (!normalizedMessage) return null;

  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku")
    .eq("active", true);

  if (!products?.length) return null;

  const skuMatch = products.find((p: any) => p.sku && normalizedMessage.includes(String(p.sku).toLowerCase()));
  if (skuMatch) return skuMatch.id;

  for (const product of products) {
    if (!product.name) continue;

    const productNameLower = String(product.name).toLowerCase();
    const productWords = productNameLower.split(/\s+/).filter((w: string) => w.length > 3);
    const matchingWords = productWords.filter((word: string) => normalizedMessage.includes(word));

    if (
      normalizedMessage.includes(productNameLower) ||
      (productWords.length >= 2 && matchingWords.length >= 2) ||
      (productWords.length === 1 && matchingWords.length === 1)
    ) {
      return product.id;
    }
  }

  return null;
}

function parsePayload(payload: any): ParsedPayload {
  let phone = "";
  let messageContent = "";
  let mediaUrl: string | null = null;
  let isFromMe = false;
  let contactName = "";
  let productInterest: string | null = null;
  let platform = "whatsapp";
  let messageType = "text";
  let buttonResponseId: string | null = null;

  if (payload.text && payload.text.phone) {
    phone = String(payload.text.phone).replace(/\D/g, "");
    messageContent =
      payload.text.message ||
      payload.text.text ||
      payload.text.body ||
      payload.text.reply_text ||
      (payload.text.body && typeof payload.text.body === "object" ? payload.text.body.reply_text : "") ||
      "";

    if (String(messageContent).startsWith("$")) messageContent = "";

    isFromMe = payload.text.fromMe === true;
    contactName = payload.contact_name || payload.text.pushName || payload.text.senderName || phone;
    platform = payload.platform || "whatsapp";
    productInterest = payload.text.product_id || payload.product_id || null;
    buttonResponseId =
      payload.text.buttonResponseId ||
      payload.text.buttonId ||
      payload.buttonResponseId ||
      payload.buttonId ||
      null;

    const photo = payload.text.photo || "";
    if (photo && !String(photo).includes("pps.whatsapp.net")) {
      mediaUrl = photo;
      messageType = "image";
    }
    if (payload.text.imageUrl) {
      mediaUrl = payload.text.imageUrl;
      messageType = "image";
    }
    if (payload.text.mediaUrl) {
      mediaUrl = payload.text.mediaUrl;
      messageType = payload.text.type || "image";
    }
    if (payload.text.audioUrl) {
      mediaUrl = payload.text.audioUrl;
      messageType = "audio";
    }
    if (payload.text.videoUrl) {
      mediaUrl = payload.text.videoUrl;
      messageType = "video";
    }
    if (payload.text.documentUrl) {
      mediaUrl = payload.text.documentUrl;
      messageType = "document";
    }
  } else if (payload.phone && (payload.body || payload.message || payload.text)) {
    phone = String(payload.phone).replace(/\D/g, "");

    if (typeof payload.body === "object" && payload.body.reply_text) {
      messageContent = payload.body.reply_text;
    } else if (typeof payload.body === "string") {
      messageContent = payload.body;
    } else {
      messageContent = payload.message || payload.text || "";
    }

    if (String(messageContent).startsWith("$")) messageContent = "";

    isFromMe = payload.fromMe === true;
    contactName = payload.pushName || payload.senderName || payload.contact_name || phone;
    platform = payload.isInstagram ? "instagram" : "whatsapp";
    productInterest = payload.product_id || null;
    buttonResponseId = payload.buttonResponseId || payload.buttonId || null;
  } else if (payload.phone) {
    phone = String(payload.phone).replace(/\D/g, "");
    messageContent = payload.text?.message || payload.message || "";
    isFromMe = payload.fromMe === true;
    contactName = payload.senderName || payload.pushName || phone;
    platform = payload.isInstagram ? "instagram" : "whatsapp";
    productInterest = payload.product_id || null;
    buttonResponseId = payload.buttonResponseId || payload.buttonId || payload.text?.buttonId || null;

    if (payload.image) {
      mediaUrl = payload.image.imageUrl || payload.image.url;
      messageType = "image";
      messageContent = payload.image.caption || messageContent || "[Imagem]";
    }
    if (payload.audio) {
      mediaUrl = payload.audio.audioUrl || payload.audio.url;
      messageType = "audio";
      messageContent = messageContent || "[Audio]";
    }
    if (payload.video) {
      mediaUrl = payload.video.videoUrl || payload.video.url;
      messageType = "video";
      messageContent = payload.video.caption || messageContent || "[Video]";
    }
    if (payload.document) {
      mediaUrl = payload.document.documentUrl || payload.document.url;
      messageType = "document";
      messageContent = payload.document.fileName || messageContent || "[Documento]";
    }
  } else if (payload.contact_number) {
    phone = String(payload.contact_number).replace(/\D/g, "");
    messageContent = payload.message || "";
    isFromMe = payload.is_from_me === true;
    contactName = payload.contact_name || phone;
    platform = payload.platform || "whatsapp";
    mediaUrl = payload.media_url || null;
    messageType = payload.message_type || "text";
    productInterest = payload.product_id || null;
    buttonResponseId = payload.button_response_id || null;
  }

  return {
    phone,
    messageContent,
    mediaUrl,
    isFromMe,
    contactName,
    productInterest,
    platform,
    messageType,
    buttonResponseId,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const zapiConfig: ZapiConfig = {
      instanceId: Deno.env.get("ZAPI_INSTANCE_ID"),
      token: Deno.env.get("ZAPI_TOKEN"),
      clientToken: Deno.env.get("ZAPI_CLIENT_TOKEN"),
    };

    if (!zapiConfig.instanceId || !zapiConfig.token) {
      throw new Error("ZAPI credentials not configured (ZAPI_INSTANCE_ID, ZAPI_TOKEN)");
    }

    const payload = await req.json();
    const parsed = parsePayload(payload);

    if (!parsed.phone) {
      return new Response(
        JSON.stringify({ success: false, error: "phone/contact_number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!parsed.productInterest && parsed.messageContent && !parsed.isFromMe) {
      parsed.productInterest = await detectProductInterest(supabase, parsed.messageContent);
    }

    const inboundContent = parsed.messageContent || derivePlaceholder(parsed.messageType);

    const conversationId = await upsertConversationAndMessage({
      supabase,
      phone: parsed.phone,
      contactName: parsed.contactName || parsed.phone,
      content: inboundContent,
      mediaUrl: parsed.mediaUrl,
      isFromMe: parsed.isFromMe,
      platform: parsed.platform,
      messageType: parsed.messageType,
      productInterest: parsed.productInterest,
    });

    if (parsed.isFromMe || (!parsed.messageContent && !parsed.mediaUrl)) {
      return new Response(
        JSON.stringify({ success: true, conversation_id: conversationId, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const alineResponse = await fetch(`${supabaseUrl}/functions/v1/aline-reply`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: parsed.phone,
        message: parsed.messageContent || "",
        contact_name: parsed.contactName,
        media_type: parsed.mediaUrl ? parsed.messageType : "text",
        media_url: parsed.mediaUrl,
        button_response_id: parsed.buttonResponseId,
      }),
    });

    if (!alineResponse.ok) {
      const errorText = await alineResponse.text();
      throw new Error(`aline-reply error: ${alineResponse.status} - ${errorText}`);
    }

    const agentResult = await alineResponse.json();
    if (!agentResult.success) {
      throw new Error(agentResult.error || "aline-reply failed");
    }

    const enviados: any[] = [];
    const erros: any[] = [];

    const textMessage = agentResult.mensagem_whatsapp || agentResult.response;
    if (textMessage) {
      const textResult = await sendTextMessage(parsed.phone, textMessage, zapiConfig);
      enviados.push({ type: "text", success: !!(textResult?.zapiId || textResult?.messageId) });

      await upsertConversationAndMessage({
        supabase,
        phone: parsed.phone,
        contactName: parsed.contactName || parsed.phone,
        content: textMessage,
        mediaUrl: null,
        isFromMe: true,
        platform: parsed.platform,
        messageType: "text",
        productInterest: null,
      });
    }

    for (const mediaItem of agentResult.media_items || []) {
      try {
        if (mediaItem.type === "image" && mediaItem.image_url) {
          const imageResult = await sendImageMessage(
            parsed.phone,
            mediaItem.image_url,
            mediaItem.caption || "",
            zapiConfig,
          );
          enviados.push({ type: "image", success: !!(imageResult?.zapiId || imageResult?.messageId) });

          await upsertConversationAndMessage({
            supabase,
            phone: parsed.phone,
            contactName: parsed.contactName || parsed.phone,
            content: mediaItem.caption || "[Imagem]",
            mediaUrl: mediaItem.image_url,
            isFromMe: true,
            platform: parsed.platform,
            messageType: "image",
            productInterest: null,
          });
        }
      } catch (mediaError) {
        erros.push({ type: "image", error: mediaError instanceof Error ? mediaError.message : "unknown" });
      }
    }

    const produtos = agentResult.produtos || [];
    if (produtos.length > 0) {
      await delay(500);
    }

    for (let i = 0; i < produtos.length; i++) {
      const produto = produtos[i];
      try {
        if (i > 0) await delay(800);

        if (produto.has_video && produto.video_url) {
          const videoResult = await sendVideoMessage(
            parsed.phone,
            produto.video_url,
            produto.caption || produto.name || "",
            zapiConfig,
          );
          enviados.push({
            index: i + 1,
            sku: produto.sku,
            type: "video",
            success: !!(videoResult?.zapiId || videoResult?.messageId),
          });

          await upsertConversationAndMessage({
            supabase,
            phone: parsed.phone,
            contactName: parsed.contactName || parsed.phone,
            content: produto.caption || produto.name || "[Video]",
            mediaUrl: produto.video_url,
            isFromMe: true,
            platform: parsed.platform,
            messageType: "video",
            productInterest: null,
          });
        } else if (produto.image_url) {
          const imageResult = await sendImageMessage(
            parsed.phone,
            produto.image_url,
            produto.caption || produto.name || "",
            zapiConfig,
          );
          enviados.push({
            index: i + 1,
            sku: produto.sku,
            type: "image",
            success: !!(imageResult?.zapiId || imageResult?.messageId),
          });

          await upsertConversationAndMessage({
            supabase,
            phone: parsed.phone,
            contactName: parsed.contactName || parsed.phone,
            content: produto.caption || produto.name || "[Imagem]",
            mediaUrl: produto.image_url,
            isFromMe: true,
            platform: parsed.platform,
            messageType: "image",
            productInterest: null,
          });
        } else {
          erros.push({ index: i + 1, sku: produto.sku, error: "no_media" });
        }
      } catch (mediaError) {
        erros.push({
          index: i + 1,
          sku: produto.sku,
          error: mediaError instanceof Error ? mediaError.message : "unknown",
        });
      }
    }

    if (agentResult.enviar_mensagem_pos_catalogo && agentResult.mensagem_pos_catalogo) {
      try {
        const postText = agentResult.mensagem_pos_catalogo;
        const postResult = await sendTextMessage(parsed.phone, postText, zapiConfig);
        enviados.push({ type: "post_catalog", success: !!(postResult?.zapiId || postResult?.messageId) });

        await upsertConversationAndMessage({
          supabase,
          phone: parsed.phone,
          contactName: parsed.contactName || parsed.phone,
          content: postText,
          mediaUrl: null,
          isFromMe: true,
          platform: parsed.platform,
          messageType: "text",
          productInterest: null,
        });
      } catch (postError) {
        erros.push({ type: "post_catalog", error: postError instanceof Error ? postError.message : "unknown" });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        resumo: {
          texto_enviado: !!textMessage,
          produtos_enviados: enviados.filter((item: any) => item.type === "image" || item.type === "video").length,
          produtos_com_erro: erros.length,
          transferir_humano: agentResult.agente_atual === "human",
        },
        ai: {
          mensagem: textMessage,
          node: agentResult.node_tecnico,
          agente: agentResult.agente_atual,
          categoria: agentResult.categoria_crm,
          cor: agentResult.cor_crm,
        },
        produtos_enviados: enviados,
        produtos_com_erro: erros,
        memoria: agentResult.memoria,
        filtros: {
          node: agentResult.node_tecnico,
          agente: agentResult.agente_atual,
          categoria: agentResult.categoria_crm,
          cor: agentResult.cor_crm,
        },
        conversation_id: conversationId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[AUTO-REPLY] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        resumo: {
          texto_enviado: false,
          produtos_enviados: 0,
          produtos_com_erro: 0,
          transferir_humano: false,
        },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
