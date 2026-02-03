import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * ZAPI-UNIFIED: Endpoint único para:
 * 1. Receber mensagens do Z-API (webhook)
 * 2. Processar com Aline
 * 3. Responder via Z-API
 * 4. Salvar tudo no banco
 */

interface ZAPIMessage {
  phone?: string;
  isFromMe?: boolean;
  senderName?: string;
  pushName?: string;
  text?: { message?: string };
  message?: string;
  image?: { imageUrl?: string; caption?: string };
  audio?: { audioUrl?: string };
  video?: { videoUrl?: string; caption?: string };
  document?: { documentUrl?: string; fileName?: string };
  messageId?: string;
  event?: string;
  status?: string;
}

// Gerar hash para deduplicação
function generateHash(phone: string, message: string): string {
  const now = new Date();
  const minuteKey = `${now.getFullYear()}${now.getMonth()}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
  const msgKey = message.toLowerCase().replace(/\s+/g, '').substring(0, 100);
  return `${phone}_${msgKey}_${minuteKey}`;
}

// Enviar texto via Z-API
async function sendText(phone: string, message: string, instanceId: string, token: string, clientToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (clientToken) headers['Client-Token'] = clientToken;

  const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone, message }),
  });

  const result = await response.json();
  return { success: response.ok && (result.messageId || result.zaapId), messageId: result.messageId || result.zaapId, error: result };
}

// Enviar mídia via Z-API
async function sendMedia(
  phone: string, 
  type: 'image' | 'video', 
  url: string, 
  caption: string, 
  instanceId: string, 
  token: string, 
  clientToken?: string
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (clientToken) headers['Client-Token'] = clientToken;

  const endpoint = type === 'video' 
    ? `https://api.z-api.io/instances/${instanceId}/token/${token}/send-video`
    : `https://api.z-api.io/instances/${instanceId}/token/${token}/send-image`;
  
  const body = type === 'video' 
    ? { phone, video: url, caption }
    : { phone, image: url, caption };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const result = await response.json();
  return { success: response.ok && (result.messageId || result.zaapId), messageId: result.messageId || result.zaapId };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error('Z-API credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const payload: ZAPIMessage = await req.json();
    
    console.log('[ZAPI-UNIFIED] ====== NOVA REQUISIÇÃO ======');
    console.log('[ZAPI-UNIFIED] Payload:', JSON.stringify(payload, null, 2));

    // ========================================
    // FILTRAR EVENTOS QUE NÃO SÃO MENSAGENS
    // ========================================
    const eventType = (payload as any).type || payload.event || '';
    const hasError = !!(payload as any).error;
    
    // ReceivedCallback É uma mensagem real recebida - NÃO filtrar!
    // Apenas filtrar callbacks de status (Delivery, Read, Sent)
    const isStatusCallback = eventType === 'DeliveryCallback' ||
                             eventType === 'ReadCallback' ||
                             eventType === 'SentCallback' ||
                             eventType === 'MessageStatusCallback' ||
                             eventType === 'message-status-update' ||
                             hasError;
    
    if (isStatusCallback) {
      console.log(`[ZAPI-UNIFIED] Evento de status callback ignorado: ${eventType || 'error'}`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'status_callback' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`[ZAPI-UNIFIED] Processando evento: ${eventType || 'mensagem'}`)

    // ========================================
    // PROCESSAR EVENTOS DE STATUS (delivered, read, etc.)
    // ========================================
    if (payload.event === 'message-status-update' && payload.messageId) {
      console.log(`[ZAPI-UNIFIED] Status update: ${payload.status} para ${payload.messageId}`);
      
      await supabase
        .from('messages')
        .update({ status: payload.status })
        .eq('zapi_message_id', payload.messageId);
      
      return new Response(JSON.stringify({ success: true, type: 'status_update' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================
    // EXTRAIR DADOS DA MENSAGEM - SUPORTE A MÚLTIPLOS FORMATOS
    // ========================================
    // Formato 1: payload.phone (ZAPI padrão)
    // Formato 2: payload.text?.phone (Fiqon wrapper)
    // Formato 3: campo phone com @c.us/@g.us
    const rawPhone = payload.phone || (payload as any).text?.phone || '';
    const phone = rawPhone.replace(/\D/g, '').replace(/@[cg]\.us$/, '');
    
    const isFromMe = payload.isFromMe === true || (payload as any).fromMe === true;
    const contactName = payload.senderName || payload.pushName || (payload as any).text?.senderName || phone;
    
    // Extrair conteúdo da mensagem - SUPORTE A MÚLTIPLOS FORMATOS
    let messageContent = '';
    let messageType = 'text';
    let mediaUrl: string | null = null;

    // Formato ZAPI padrão: text.message
    if (payload.text?.message) {
      messageContent = payload.text.message;
    } 
    // Formato Fiqon: text.message diretamente
    else if ((payload as any).text?.message) {
      messageContent = (payload as any).text.message;
    }
    // Formato direto: message string
    else if (typeof payload.message === 'string' && payload.message) {
      messageContent = payload.message;
    }
    // Fallback: procurar em qualquer lugar
    else if ((payload as any).message) {
      messageContent = String((payload as any).message);
    }
    // Mídia
    else if (payload.image) {
      messageType = 'image';
      mediaUrl = payload.image.imageUrl || null;
      messageContent = payload.image.caption || '';
    } else if (payload.audio) {
      messageType = 'audio';
      mediaUrl = payload.audio.audioUrl || null;
      // Transcrição será feita depois
      messageContent = '[Áudio - aguardando transcrição]';
    } else if (payload.video) {
      messageType = 'video';
      mediaUrl = payload.video.videoUrl || null;
      messageContent = payload.video.caption || '';
    } else if (payload.document) {
      messageType = 'document';
      mediaUrl = payload.document.documentUrl || null;
      messageContent = payload.document.fileName || '';
    }

    // Fallback final - tentar extrair de payload.text como string
    if (!messageContent && typeof (payload as any).text === 'string') {
      messageContent = (payload as any).text;
    }

    if (!phone) {
      console.log('[ZAPI-UNIFIED] Phone vazio, ignorando');
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ZAPI-UNIFIED] Phone: ${phone}, isFromMe: ${isFromMe}, type: ${messageType}`);
    console.log(`[ZAPI-UNIFIED] Content extraído: "${messageContent.substring(0, 100)}"`);

    // ========================================
    // IGNORAR MENSAGENS ENVIADAS POR NÓS
    // ========================================
    if (isFromMe) {
      console.log('[ZAPI-UNIFIED] Mensagem enviada por nós, ignorando processamento');
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'from_me' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================
    // IGNORAR MENSAGENS SEM CONTEÚDO (eventos vazios)
    // ========================================
    if (!messageContent && messageType === 'text') {
      console.log('[ZAPI-UNIFIED] Mensagem sem conteúdo, ignorando');
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'empty_content' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================
    // DEDUPLICAÇÃO USANDO HASH (MAIS RÁPIDO) E MESSAGE_ID
    // ========================================
    const zapiMessageId = payload.messageId || (payload as any).zaapId;
    
    // Criar hash único para deduplicação rápida
    const dedupeKey = zapiMessageId || generateHash(phone, messageContent || 'no-content');
    console.log(`[ZAPI-UNIFIED] Dedupe key: ${dedupeKey}`);
    
    // Tentar inserir o hash PRIMEIRO (upsert atômico)
    const { error: insertError } = await supabase
      .from('processed_messages')
      .insert({ message_id: dedupeKey, phone });

    if (insertError?.code === '23505') {
      console.log('[ZAPI-UNIFIED] Duplicata detectada (constraint), ignorando');
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'duplicate' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Se deu outro erro que não é constraint, verificar manualmente
    if (insertError) {
      console.log(`[ZAPI-UNIFIED] Erro ao inserir hash: ${insertError.message}`);
      
      // Verificar se já existe
      const { data: existing } = await supabase
        .from('processed_messages')
        .select('id')
        .eq('message_id', dedupeKey)
        .maybeSingle();

      if (existing) {
        console.log('[ZAPI-UNIFIED] Duplicata detectada (manual check), ignorando');
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'duplicate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    console.log('[ZAPI-UNIFIED] Hash inserido, processando mensagem...');

    // ========================================
    // BUSCAR OU CRIAR CONVERSA (para UI do Chat)
    // ========================================
    let conversationId: string;
    
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, unread_count')
      .eq('contact_number', phone)
      .maybeSingle();

    if (existingConv) {
      conversationId = existingConv.id;
      
      // Atualizar conversa
      await supabase
        .from('conversations')
        .update({
          contact_name: contactName,
          last_message: messageContent || `[${messageType}]`,
          unread_count: (existingConv.unread_count || 0) + 1,
          last_message_at: new Date().toISOString(), // Isso faz aparecer no topo!
        })
        .eq('id', conversationId);
      
      console.log(`[ZAPI-UNIFIED] Conversa atualizada: ${conversationId}`);
    } else {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          contact_number: phone,
          contact_name: contactName,
          platform: 'whatsapp',
          last_message: messageContent || `[${messageType}]`,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select()
        .single();

      if (convError) throw convError;
      conversationId = newConv.id;
      console.log(`[ZAPI-UNIFIED] Nova conversa criada: ${conversationId}`);
    }

    // ========================================
    // SALVAR MENSAGEM DO CLIENTE
    // ========================================
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: messageContent,
        message_type: messageType,
        media_url: mediaUrl,
        is_from_me: false,
        status: 'received',
        zapi_message_id: zapiMessageId,
      });

    if (msgError) {
      console.error('[ZAPI-UNIFIED] Erro ao salvar mensagem:', msgError);
    } else {
      console.log('[ZAPI-UNIFIED] Mensagem do cliente salva');
    }

    // ========================================
    // TRANSCREVER ÁUDIO SE NECESSÁRIO
    // ========================================
    let messageForAline = messageContent;
    
    if (messageType === 'audio' && mediaUrl) {
      console.log('[ZAPI-UNIFIED] 🎤 Transcrevendo áudio...');
      
      try {
        const transcribeEndpoint = `${supabaseUrl}/functions/v1/transcribe-audio`;
        const transcribeReq = await fetch(transcribeEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ audioUrl: mediaUrl }),
        });

        if (transcribeReq.ok) {
          const transcribeResult = await transcribeReq.json();
          if (transcribeResult.transcription) {
            messageForAline = transcribeResult.transcription;
            console.log(`[ZAPI-UNIFIED] ✅ Transcrição: "${messageForAline.substring(0, 100)}..."`);
            
            // Atualizar a mensagem salva com a transcrição
            await supabase
              .from('messages')
              .update({ content: `🎤 ${messageForAline}` })
              .eq('conversation_id', conversationId)
              .eq('zapi_message_id', zapiMessageId);
              
            // Atualizar last_message na conversa
            await supabase
              .from('conversations')
              .update({ last_message: `🎤 ${messageForAline.substring(0, 80)}...` })
              .eq('id', conversationId);
          }
        } else {
          console.error('[ZAPI-UNIFIED] Erro na transcrição:', await transcribeReq.text());
          messageForAline = '[Áudio recebido]';
        }
      } catch (transcribeError) {
        console.error('[ZAPI-UNIFIED] Erro ao transcrever:', transcribeError);
        messageForAline = '[Áudio recebido]';
      }
    }

    // ========================================
    // PROCESSAR COM ALINE
    // ========================================
    console.log('[ZAPI-UNIFIED] Chamando aline-reply...');
    
    const alineEndpoint = `${supabaseUrl}/functions/v1/aline-reply`;
    const alineReq = await fetch(alineEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        phone,
        message: messageForAline, // Usar transcrição se for áudio
        contact_name: contactName,
        media_type: messageType,
        media_url: mediaUrl,
      }),
    });

    if (!alineReq.ok) {
      const errorText = await alineReq.text();
      console.error('[ZAPI-UNIFIED] Erro aline-reply:', errorText);
      throw new Error(`aline-reply failed: ${alineReq.status}`);
    }

    const alineResponse = await alineReq.json();
    console.log('[ZAPI-UNIFIED] Aline response:', JSON.stringify(alineResponse, null, 2).substring(0, 500));

    // Verificar se foi pulado
    if (alineResponse.skipped) {
      console.log(`[ZAPI-UNIFIED] Aline pulou: ${alineResponse.reason}`);
      return new Response(JSON.stringify({ 
        success: true, 
        skipped: true, 
        reason: alineResponse.reason,
        message_saved: true 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================
    // ENVIAR RESPOSTA VIA Z-API
    // ========================================
    const textMessage = alineResponse.mensagem_whatsapp || alineResponse.response;
    const products = alineResponse.produtos || [];

    let textSent = false;
    let productsSent = 0;

    // 1. Enviar texto
    if (textMessage) {
      console.log(`[ZAPI-UNIFIED] Enviando texto: "${textMessage.substring(0, 80)}..."`);
      
      const result = await sendText(phone, textMessage, ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN);
      
      if (result.success) {
        textSent = true;
        console.log(`[ZAPI-UNIFIED] ✅ Texto enviado: ${result.messageId}`);

        // Salvar resposta da Aline na tabela messages (para aparecer no chat)
        await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            content: textMessage,
            message_type: 'text',
            is_from_me: true,
            status: 'sent',
            zapi_message_id: result.messageId,
          });

        // Atualizar last_message
        await supabase
          .from('conversations')
          .update({
            last_message: textMessage.substring(0, 100),
            unread_count: 0, // Resetar porque respondemos
          })
          .eq('id', conversationId);

      } else {
        console.error('[ZAPI-UNIFIED] ❌ Texto falhou:', result.error);
      }
    }

    // 2. Enviar produtos (cards com imagem/vídeo)
    if (products.length > 0) {
      console.log(`[ZAPI-UNIFIED] Enviando ${products.length} produtos...`);
      
      // Delay entre texto e produtos
      await new Promise(r => setTimeout(r, 1500));

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const sku = product.sku || '';
        const name = product.name || product.nome || '';
        const price = product.price || product.preco || 0;
        const imageUrl = product.image_url || product.url_imagem || '';
        const videoUrl = product.video_url || product.url_video || '';
        
        // Formatar preço
        const priceFormatted = price > 0 
          ? `R$ ${Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          : '';
        
        // Montar caption
        const caption = `${i + 1}️⃣ *${name}*\n💰 ${priceFormatted}\n🏷️ Cód: ${sku}`;
        
        // Decidir se envia vídeo ou imagem
        const hasVideo = !!videoUrl && !videoUrl.includes('<nil>');
        const mediaType = hasVideo ? 'video' : 'image';
        const mediaUrlToSend = hasVideo ? videoUrl : imageUrl;

        if (mediaUrlToSend && !mediaUrlToSend.includes('<nil>')) {
          console.log(`[ZAPI-UNIFIED] Enviando produto ${i + 1}: ${sku} (${mediaType})`);
          
          const result = await sendMedia(
            phone, 
            mediaType, 
            mediaUrlToSend, 
            caption, 
            ZAPI_INSTANCE_ID, 
            ZAPI_TOKEN, 
            ZAPI_CLIENT_TOKEN
          );

          if (result.success) {
            productsSent++;
            console.log(`[ZAPI-UNIFIED] ✅ Produto ${i + 1} enviado: ${result.messageId}`);

            // Salvar na tabela messages
            await supabase
              .from('messages')
              .insert({
                conversation_id: conversationId,
                content: caption,
                message_type: mediaType,
                media_url: mediaUrlToSend,
                is_from_me: true,
                status: 'sent',
                zapi_message_id: result.messageId,
              });
          } else {
            console.error(`[ZAPI-UNIFIED] ❌ Produto ${i + 1} falhou`);
          }

          // Delay entre produtos
          if (i < products.length - 1) {
            await new Promise(r => setTimeout(r, 1200));
          }
        }
      }
    }

    console.log('[ZAPI-UNIFIED] ====== FIM ======');
    console.log(`[ZAPI-UNIFIED] Texto: ${textSent}, Produtos: ${productsSent}/${products.length}`);

    return new Response(JSON.stringify({
      success: true,
      conversation_id: conversationId,
      text_sent: textSent,
      products_sent: productsSent,
      aline_node: alineResponse.node_tecnico,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ZAPI-UNIFIED] ERRO:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
