import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ai-chat-auto-reply
 * 
 * Função que recebe mensagem do FiqOn, processa com a Aline (ai-chat)
 * e responde DIRETAMENTE para o WhatsApp via Z-API.
 * 
 * Fluxo simplificado na FiqOn:
 * 1. Webhook recebe mensagem do WhatsApp
 * 2. FiqOn envia para este endpoint
 * 3. Este endpoint responde via Z-API automaticamente
 * 
 * Payload esperado:
 * {
 *   phone: "5592999999999",
 *   message: "texto da mensagem",
 *   contact_name?: "Nome do cliente",
 *   isAd?: boolean,
 *   source?: "whatsapp"
 * }
 */

// Função para enviar mensagem de texto via Z-API
async function sendTextMessage(phone: string, message: string, zapiConfig: any): Promise<any> {
  const { instanceId, token, clientToken } = zapiConfig;
  
  const formattedPhone = phone.replace(/\D/g, '');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  console.log(`[Z-API] Sending text to ${formattedPhone}`);
  
  const response = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: formattedPhone,
        message: message,
      }),
    }
  );

  const result = await response.json();
  console.log(`[Z-API] Text response:`, result);
  return result;
}

// Função para enviar imagem via Z-API
async function sendImageMessage(phone: string, imageUrl: string, caption: string, zapiConfig: any): Promise<any> {
  const { instanceId, token, clientToken } = zapiConfig;
  
  const formattedPhone = phone.replace(/\D/g, '');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  console.log(`[Z-API] Sending image to ${formattedPhone}:`, imageUrl);
  
  const response = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/send-image`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: formattedPhone,
        image: imageUrl,
        caption: caption || '',
      }),
    }
  );

  const result = await response.json();
  console.log(`[Z-API] Image response:`, result);
  return result;
}

// Função para enviar vídeo via Z-API
async function sendVideoMessage(phone: string, videoUrl: string, caption: string, zapiConfig: any): Promise<any> {
  const { instanceId, token, clientToken } = zapiConfig;
  
  const formattedPhone = phone.replace(/\D/g, '');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  console.log(`[Z-API] Sending video to ${formattedPhone}:`, videoUrl);
  
  const response = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/send-video`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: formattedPhone,
        video: videoUrl,
        caption: caption || '',
      }),
    }
  );

  const result = await response.json();
  console.log(`[Z-API] Video response:`, result);
  return result;
}

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Configuração Z-API
    const zapiConfig = {
      instanceId: Deno.env.get("ZAPI_INSTANCE_ID"),
      token: Deno.env.get("ZAPI_TOKEN"),
      clientToken: Deno.env.get("ZAPI_CLIENT_TOKEN"),
    };

    if (!zapiConfig.instanceId || !zapiConfig.token) {
      throw new Error("ZAPI credentials not configured (ZAPI_INSTANCE_ID, ZAPI_TOKEN)");
    }

    const body = await req.json();
    const phone = body.phone?.replace(/\D/g, '');
    const message = body.message || body.text;
    const contactName = body.contact_name || body.senderName || null;
    const isAd = body.isAd || false;
    const source = body.source || 'whatsapp';

    console.log(`[AUTO-REPLY] Received from ${phone}: "${message?.slice(0, 50)}..."`);

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "phone and message are required" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== PASSO 1: Chamar ai-chat para processar a mensagem =====
    console.log(`[AUTO-REPLY] Calling ai-chat...`);
    
    const aiChatResponse = await fetch(
      `${supabaseUrl}/functions/v1/ai-chat`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone,
          message,
          contact_name: contactName,
          save_history: true,
        }),
      }
    );

    if (!aiChatResponse.ok) {
      const errorText = await aiChatResponse.text();
      console.error(`[AUTO-REPLY] ai-chat error:`, errorText);
      throw new Error(`ai-chat error: ${aiChatResponse.status}`);
    }

    const aiResult = await aiChatResponse.json();
    console.log(`[AUTO-REPLY] ai-chat result:`, {
      success: aiResult.success,
      mensagem: aiResult.mensagem_whatsapp?.slice(0, 100),
      tem_produtos: aiResult.tem_produtos,
      total_produtos: aiResult.total_produtos,
      acao_sugerida: aiResult.filtros?.acao_sugerida,
    });

    if (!aiResult.success) {
      throw new Error(aiResult.error || "ai-chat failed");
    }

    // ===== PASSO 2: Enviar resposta de texto via Z-API =====
    const textMessage = aiResult.mensagem_whatsapp || aiResult.response;
    
    if (textMessage) {
      console.log(`[AUTO-REPLY] Sending text message...`);
      const textResult = await sendTextMessage(phone, textMessage, zapiConfig);
      
      if (textResult.zapiId || textResult.messageId) {
        console.log(`[AUTO-REPLY] Text sent successfully: ${textResult.zapiId || textResult.messageId}`);
      }
    }

    // ===== PASSO 3: Enviar catálogo de produtos (se houver) =====
    const produtos = aiResult.produtos || [];
    const enviados: any[] = [];
    const erros: any[] = [];

    if (produtos.length > 0) {
      console.log(`[AUTO-REPLY] Sending ${produtos.length} products...`);
      
      // Pequeno delay para não enviar tudo junto
      await delay(500);
      
      for (let i = 0; i < produtos.length; i++) {
        const produto = produtos[i];
        
        try {
          // Pequeno delay entre produtos (evitar spam/rate limit)
          if (i > 0) await delay(800);
          
          // Decidir se envia vídeo ou imagem
          if (produto.has_video && produto.video_url) {
            // Enviar vídeo
            console.log(`[AUTO-REPLY] Sending video for ${produto.sku}...`);
            const videoResult = await sendVideoMessage(
              phone, 
              produto.video_url, 
              produto.caption || produto.name, 
              zapiConfig
            );
            
            enviados.push({
              index: i + 1,
              sku: produto.sku,
              type: 'video',
              success: !!(videoResult.zapiId || videoResult.messageId),
              zapiId: videoResult.zapiId || videoResult.messageId,
            });
          } else if (produto.image_url) {
            // Enviar imagem
            console.log(`[AUTO-REPLY] Sending image for ${produto.sku}...`);
            const imageResult = await sendImageMessage(
              phone, 
              produto.image_url, 
              produto.caption || produto.name, 
              zapiConfig
            );
            
            enviados.push({
              index: i + 1,
              sku: produto.sku,
              type: 'image',
              success: !!(imageResult.zapiId || imageResult.messageId),
              zapiId: imageResult.zapiId || imageResult.messageId,
            });
          } else {
            console.log(`[AUTO-REPLY] Product ${produto.sku} has no media, skipping...`);
            erros.push({
              index: i + 1,
              sku: produto.sku,
              error: 'no_media',
            });
          }
        } catch (mediaError) {
          console.error(`[AUTO-REPLY] Error sending media for ${produto.sku}:`, mediaError);
          erros.push({
            index: i + 1,
            sku: produto.sku,
            error: mediaError instanceof Error ? mediaError.message : 'unknown',
          });
        }
      }
    }

    // ===== PASSO 4: Verificar se precisa transferir para humano =====
    const transferirHumano = aiResult.filtros?.transferir_humano || false;
    const finalizarVenda = aiResult.filtros?.finalizar_venda || false;

    if (transferirHumano) {
      console.log(`[AUTO-REPLY] Action required: transfer to human`);
      // Aqui poderia enviar notificação para o vendedor
    }

    if (finalizarVenda) {
      console.log(`[AUTO-REPLY] Action required: finalize sale`);
      // Aqui poderia criar pedido pendente
      // Enviar notificação para vendedor
      const notificationNumber = "5592984145531";
      const orderSummary = `🛒 *NOVO PEDIDO!*\n\n📱 Cliente: ${phone}\n👤 Nome: ${contactName || 'Não informado'}\n\n📦 Produto: ${aiResult.memoria?.produto_nome || 'Ver conversa'}\n💰 Valor: ${aiResult.produto_selecionado?.price_formatted || 'Ver conversa'}\n\n🚚 Entrega: ${aiResult.crm?.entrega || 'Não definida'}\n💳 Pagamento: ${aiResult.crm?.pagamento || 'Não definido'}`;
      
      try {
        await sendTextMessage(notificationNumber, orderSummary, zapiConfig);
        console.log(`[AUTO-REPLY] Order notification sent to ${notificationNumber}`);
      } catch (notifError) {
        console.error(`[AUTO-REPLY] Failed to send order notification:`, notifError);
      }
    }

    // ===== RESPOSTA FINAL =====
    return new Response(
      JSON.stringify({
        success: true,
        
        // Resumo do que foi feito
        resumo: {
          texto_enviado: !!textMessage,
          produtos_enviados: enviados.length,
          produtos_com_erro: erros.length,
          transferir_humano: transferirHumano,
          finalizar_venda: finalizarVenda,
        },
        
        // Dados da Aline (para debug)
        ai: {
          mensagem: textMessage,
          node: aiResult.filtros?.node,
          acao_sugerida: aiResult.filtros?.acao_sugerida,
          intencao: aiResult.filtros?.intencao,
        },
        
        // Produtos enviados
        produtos_enviados: enviados,
        produtos_com_erro: erros,
        
        // Estado da conversa
        memoria: aiResult.memoria,
        crm: aiResult.crm,
        
        // Para FiqOn usar em filtros (se precisar)
        filtros: aiResult.filtros,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
          transferir_humano: true,
        },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
