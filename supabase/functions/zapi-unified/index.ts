import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ZAPIMessage {
  phone?: string;
  isFromMe?: boolean;
  fromMe?: boolean;
  senderName?: string;
  pushName?: string;
  text?: { phone?: string; message?: string; senderName?: string };
  message?: string;
  image?: { imageUrl?: string; caption?: string };
  audio?: { audioUrl?: string };
  video?: { videoUrl?: string; caption?: string };
  document?: { documentUrl?: string; fileName?: string };
  event?: string;
  type?: string;
  status?: string;
  messageId?: string;
  zaapId?: string;
  buttonResponseId?: string;
  buttonId?: string;
  listResponseId?: string;
  buttonResponse?: {
    buttonId?: string;
    message?: string;
  };
  buttonsResponseMessage?: {
    buttonId?: string;
    message?: string;
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateHash(phone: string, message: string): string {
  const now = new Date();
  const minuteKey = `${now.getFullYear()}${now.getMonth()}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
  const msgKey = message.toLowerCase().replace(/\s+/g, "").substring(0, 100);
  return `${phone}_${msgKey}_${minuteKey}`;
}

function buildHeaders(clientToken?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (clientToken) {
    headers["Client-Token"] = clientToken;
  }

  return headers;
}

async function sendText(
  phone: string,
  message: string,
  instanceId: string,
  token: string,
  clientToken?: string,
) {
  const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
    method: "POST",
    headers: buildHeaders(clientToken),
    body: JSON.stringify({ phone, message }),
  });

  const result = await response.json();
  return {
    success: response.ok && !!(result.messageId || result.zaapId),
    messageId: result.messageId || result.zaapId || null,
    error: response.ok ? null : result,
  };
}

async function sendMedia(
  phone: string,
  type: "image" | "video",
  url: string,
  caption: string,
  instanceId: string,
  token: string,
  clientToken?: string,
) {
  const endpoint =
    type === "video"
      ? `https://api.z-api.io/instances/${instanceId}/token/${token}/send-video`
      : `https://api.z-api.io/instances/${instanceId}/token/${token}/send-image`;

  const body =
    type === "video"
      ? { phone, video: url, caption }
      : { phone, image: url, caption };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders(clientToken),
    body: JSON.stringify(body),
  });

  const result = await response.json();
  return {
    success: response.ok && !!(result.messageId || result.zaapId),
    messageId: result.messageId || result.zaapId || null,
    error: response.ok ? null : result,
  };
}

async function sendInteractiveProductCard(
  phone: string,
  product: any,
  instanceId: string,
  token: string,
  clientToken?: string,
) {
  const buttonId = product.button_id || `select_${product.sku || product.id}`;
  const buttonLabel = product.button_label || "Quero esta";
  const message = product.caption || product.name || "Produto";
  const buttonList: Record<string, unknown> = {
    buttons: [
      {
        id: buttonId,
        label: buttonLabel,
      },
    ],
  };

  if (product.video_url) {
    buttonList.video = product.video_url;
  } else if (product.image_url) {
    buttonList.image = product.image_url;
  }

  const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-button-list`, {
    method: "POST",
    headers: buildHeaders(clientToken),
    body: JSON.stringify({
      phone,
      message,
      buttonList,
    }),
  });

  const result = await response.json();
  return {
    success: response.ok && !!(result.messageId || result.zaapId),
    messageId: result.messageId || result.zaapId || null,
    error: response.ok ? null : result,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID");
    const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN");
    const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error("Z-API credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const payload: ZAPIMessage = await req.json();

    console.log("[ZAPI-UNIFIED] ====== NOVA REQUISIÇÃO ======");
    console.log("[ZAPI-UNIFIED] Payload:", JSON.stringify(payload).substring(0, 1000));

    const eventType = payload.type || payload.event || "";
    const hasError = !!(payload as any).error;
    const isStatusCallback =
      eventType === "DeliveryCallback" ||
      eventType === "ReadCallback" ||
      eventType === "SentCallback" ||
      eventType === "MessageStatusCallback" ||
      eventType === "message-status-update" ||
      hasError;

    if (isStatusCallback && eventType !== "message-status-update") {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "status_callback" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (eventType === "message-status-update" && payload.messageId) {
      await supabase
        .from("messages")
        .update({ status: payload.status })
        .eq("zapi_message_id", payload.messageId);

      return new Response(
        JSON.stringify({ success: true, type: "status_update" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawPhone = payload.phone || payload.text?.phone || "";
    const phone = rawPhone.replace(/@[cg]\.us$/, "").replace(/\D/g, "");
    const isFromMe = payload.isFromMe === true || payload.fromMe === true;
    const contactName = payload.senderName || payload.pushName || payload.text?.senderName || phone;

    const buttonResponseId =
      payload.buttonResponseId ||
      payload.buttonId ||
      payload.listResponseId ||
      payload.buttonResponse?.buttonId ||
      payload.buttonsResponseMessage?.buttonId ||
      "";

    const buttonResponseLabel =
      payload.buttonResponse?.message ||
      payload.buttonsResponseMessage?.message ||
      "";

    let messageContent = "";
    let messageType = "text";
    let mediaUrl: string | null = null;

    if (payload.text?.message) {
      messageContent = payload.text.message;
    } else if (typeof payload.message === "string" && payload.message) {
      messageContent = payload.message;
    } else if (payload.image) {
      messageType = "image";
      mediaUrl = payload.image.imageUrl || null;
      messageContent = payload.image.caption || "";
    } else if (payload.audio) {
      messageType = "audio";
      mediaUrl = payload.audio.audioUrl || null;
      messageContent = "[Áudio recebido]";
    } else if (payload.video) {
      messageType = "video";
      mediaUrl = payload.video.videoUrl || null;
      messageContent = payload.video.caption || "";
    } else if (payload.document) {
      messageType = "document";
      mediaUrl = payload.document.documentUrl || null;
      messageContent = payload.document.fileName || "";
    }

    if (!messageContent && buttonResponseLabel) {
      messageContent = buttonResponseLabel;
      messageType = "button_reply";
    }

    if (!messageContent && buttonResponseId) {
      messageContent = buttonResponseId;
      messageType = "button_reply";
    }

    if (!phone) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_phone" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isFinalizarButton = buttonResponseId === "retomar_atendimento";

    if (isFinalizarButton) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/aline-followup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            buttonResponse: true,
            phone,
          }),
        });
      } catch (error) {
        console.error("[ZAPI-UNIFIED] Erro ao notificar equipe:", error);
      }
    }

    if (isFromMe) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "from_me" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!messageContent && messageType === "text") {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "empty_content" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dedupeKey = payload.messageId || payload.zaapId || generateHash(phone, messageContent || "no-content");
    const { error: dedupeInsertError } = await supabase
      .from("processed_messages")
      .insert({ message_id: dedupeKey, phone });

    if (dedupeInsertError?.code === "23505") {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "duplicate" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (dedupeInsertError) {
      const { data: existing } = await supabase
        .from("processed_messages")
        .select("id")
        .eq("message_id", dedupeKey)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "duplicate" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    let conversationId: string;
    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id, unread_count")
      .eq("contact_number", phone)
      .maybeSingle();

    if (existingConversation?.id) {
      conversationId = existingConversation.id;

      await supabase
        .from("conversations")
        .update({
          contact_name: contactName,
          last_message: messageContent || `[${messageType}]`,
          unread_count: Number(existingConversation.unread_count || 0) + 1,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    } else {
      const { data: createdConversation, error: createConversationError } = await supabase
        .from("conversations")
        .insert({
          contact_number: phone,
          contact_name: contactName,
          platform: "whatsapp",
          last_message: messageContent || `[${messageType}]`,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select()
        .single();

      if (createConversationError || !createdConversation) {
        throw createConversationError || new Error("Unable to create conversation");
      }

      conversationId = createdConversation.id;
    }

    const zapiMessageId = payload.messageId || payload.zaapId || null;

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      content: messageContent,
      message_type: messageType,
      media_url: mediaUrl,
      is_from_me: false,
      status: "received",
      zapi_message_id: zapiMessageId,
    });

    let messageForAline = messageContent;

    if (messageType === "audio" && mediaUrl) {
      try {
        const transcriptionResponse = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            audioUrl: mediaUrl,
            zapiMessageId,
          }),
        });

        const transcriptionData = await transcriptionResponse.json().catch(() => null);
        const transcription = transcriptionData?.transcription?.trim();

        if (transcriptionResponse.ok && transcription) {
          messageForAline = transcription;

          await supabase
            .from("messages")
            .update({ content: `🎤 ${transcription}` })
            .eq("conversation_id", conversationId)
            .eq("zapi_message_id", zapiMessageId);

          await supabase
            .from("conversations")
            .update({ last_message: `🎤 ${transcription}`.substring(0, 100) })
            .eq("id", conversationId);
        }
      } catch (error) {
        console.error("[ZAPI-UNIFIED] Erro ao transcrever áudio:", error);
      }
    }

    const alineResponseRequest = await fetch(`${supabaseUrl}/functions/v1/aline-reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        phone,
        message: messageForAline,
        contact_name: contactName,
        media_type: messageType,
        media_url: mediaUrl,
        button_response_id: buttonResponseId || null,
      }),
    });

    if (!alineResponseRequest.ok) {
      const errorText = await alineResponseRequest.text();
      throw new Error(`aline-reply failed: ${alineResponseRequest.status} - ${errorText}`);
    }

    const alineResponse = await alineResponseRequest.json();

    if (alineResponse.skipped) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: alineResponse.reason,
          message_saved: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const textMessage = alineResponse.mensagem_whatsapp || alineResponse.response || "";
    const products = Array.isArray(alineResponse.produtos) ? alineResponse.produtos : [];
    const useProductButtons = alineResponse.use_product_buttons === true;
    const postCatalogMessage = alineResponse.mensagem_pos_catalogo || null;

    let textSent = false;
    let productsSent = 0;
    let postCatalogSent = false;

    if (textMessage) {
      const textResult = await sendText(phone, textMessage, ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN);

      if (textResult.success) {
        textSent = true;

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: textMessage,
          message_type: "text",
          is_from_me: true,
          status: "sent",
          zapi_message_id: textResult.messageId,
        });

        await supabase
          .from("conversations")
          .update({
            last_message: textMessage.substring(0, 100),
            unread_count: 0,
          })
          .eq("id", conversationId);
      } else {
        console.error("[ZAPI-UNIFIED] Falha ao enviar texto:", textResult.error);
      }
    }

    if (products.length > 0) {
      await sleep(1200);

      for (let index = 0; index < products.length; index++) {
        const product = products[index];
        const mediaType = product.video_url ? "video" : "image";
        const mediaUrlToSend = product.video_url || product.image_url || null;

        let result:
          | { success: boolean; messageId: string | null; error: unknown }
          | null = null;

        if (useProductButtons) {
          result = await sendInteractiveProductCard(
            phone,
            product,
            ZAPI_INSTANCE_ID,
            ZAPI_TOKEN,
            ZAPI_CLIENT_TOKEN,
          );

          if (!result.success && mediaUrlToSend) {
            console.warn("[ZAPI-UNIFIED] Botão falhou, fallback para mídia simples:", result.error);
            result = await sendMedia(
              phone,
              mediaType,
              mediaUrlToSend,
              product.caption || product.name || "Produto",
              ZAPI_INSTANCE_ID,
              ZAPI_TOKEN,
              ZAPI_CLIENT_TOKEN,
            );
          }
        } else if (mediaUrlToSend) {
          result = await sendMedia(
            phone,
            mediaType,
            mediaUrlToSend,
            product.caption || product.name || "Produto",
            ZAPI_INSTANCE_ID,
            ZAPI_TOKEN,
            ZAPI_CLIENT_TOKEN,
          );
        } else {
          result = await sendText(
            phone,
            product.caption || product.name || "Produto",
            ZAPI_INSTANCE_ID,
            ZAPI_TOKEN,
            ZAPI_CLIENT_TOKEN,
          );
        }

        if (result?.success) {
          productsSent += 1;

          await supabase.from("messages").insert({
            conversation_id: conversationId,
            content: product.caption || product.name || "Produto",
            message_type: mediaUrlToSend ? mediaType : "text",
            media_url: mediaUrlToSend,
            is_from_me: true,
            status: "sent",
            zapi_message_id: result.messageId,
          });
        } else {
          console.error(`[ZAPI-UNIFIED] Falha ao enviar produto ${index + 1}:`, result?.error);
        }

        if (index < products.length - 1) {
          await sleep(1100);
        }
      }
    }

    if (productsSent > 0 && postCatalogMessage) {
      await sleep(1200);

      const postResult = await sendText(
        phone,
        postCatalogMessage,
        ZAPI_INSTANCE_ID,
        ZAPI_TOKEN,
        ZAPI_CLIENT_TOKEN,
      );

      if (postResult.success) {
        postCatalogSent = true;

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: postCatalogMessage,
          message_type: "text",
          is_from_me: true,
          status: "sent",
          zapi_message_id: postResult.messageId,
        });

        await supabase
          .from("conversations")
          .update({
            last_message: postCatalogMessage.substring(0, 100),
            unread_count: 0,
          })
          .eq("id", conversationId);
      }
    }

    if (productsSent > 0) {
      try {
        const { data: sessionId } = await supabase.rpc("create_catalog_session", {
          p_phone: phone,
          p_thread_id: alineResponse.thread_id || null,
          p_categoria: alineResponse.categoria_crm || null,
          p_tipo_alianca: alineResponse.memoria?.finalidade || null,
          p_cor_preferida: alineResponse.cor_crm || null,
        });

        if (sessionId) {
          for (const product of products.slice(0, productsSent)) {
            await supabase.rpc("add_catalog_item", {
              p_session_id: sessionId,
              p_sku: product.sku || null,
              p_name: product.name || null,
              p_price: product.price || null,
              p_image_url: product.image_url || null,
              p_video_url: product.video_url || null,
            });
          }

          await supabase.from("conversation_state").upsert(
            {
              phone,
              last_catalog_session_id: sessionId,
              selected_sku: null,
              selected_name: null,
              selected_price: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "phone" },
          );
        }
      } catch (error) {
        console.warn("[ZAPI-UNIFIED] Aviso ao salvar sessão de catálogo:", error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        conversation_id: conversationId,
        text_sent: textSent,
        products_sent: productsSent,
        post_catalog_sent: postCatalogSent,
        aline_node: alineResponse.node_tecnico,
        use_product_buttons: useProductButtons,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[ZAPI-UNIFIED] ERRO:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
