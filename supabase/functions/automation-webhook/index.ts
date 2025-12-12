import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log('Webhook received:', JSON.stringify(payload, null, 2));

    // Detectar formato: ZAPI ou formato customizado
    let platform = 'whatsapp';
    let contact_number = '';
    let contact_name = '';
    let message = '';
    let message_type = 'text';
    let media_url: string | null = null;
    let is_from_me = false;

    // Formato ZAPI (vem da Z-API via Fiqon/automação)
    if (payload.phone || payload.chatLid || payload.type) {
      console.log('Detected ZAPI format');
      
      // Extrair número do telefone
      contact_number = payload.phone || '';
      
      // Extrair nome do contato (ZAPI pode enviar em diferentes campos)
      contact_name = payload.senderName || payload.pushName || payload.name || '';
      
      // Detectar se é mensagem enviada ou recebida
      is_from_me = payload.fromMe === true;
      
      // Detectar plataforma pelo chatLid ou outros indicadores
      const chatLid = payload.chatLid || '';
      if (chatLid.includes('@g.us')) {
        // É um grupo - por enquanto ignoramos grupos
        console.log('Group message ignored');
        return new Response(
          JSON.stringify({ success: true, message: 'Group messages ignored' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Detectar Instagram pelo formato ou campo específico
      if (payload.isInstagram || chatLid.includes('instagram')) {
        platform = 'instagram';
      }
      
      // Extrair conteúdo da mensagem baseado no tipo
      // ZAPI pode enviar em diferentes estruturas
      if (payload.text) {
        // Mensagem de texto - pode ser objeto ou string
        if (typeof payload.text === 'object') {
          message = payload.text.message || '';
        } else {
          message = payload.text;
        }
        message_type = 'text';
      } else if (payload.message) {
        // Formato alternativo
        message = payload.message;
        message_type = 'text';
      }
      
      // Mídia: imagem
      if (payload.image || payload.imageMessage) {
        const imgData = payload.image || payload.imageMessage;
        message_type = 'image';
        media_url = imgData.imageUrl || imgData.url || imgData.mediaUrl || null;
        message = imgData.caption || message || '[Imagem]';
      }
      
      // Mídia: áudio
      if (payload.audio || payload.audioMessage) {
        const audioData = payload.audio || payload.audioMessage;
        message_type = 'audio';
        media_url = audioData.audioUrl || audioData.url || audioData.mediaUrl || null;
        message = message || '[Áudio]';
      }
      
      // Mídia: vídeo
      if (payload.video || payload.videoMessage) {
        const videoData = payload.video || payload.videoMessage;
        message_type = 'video';
        media_url = videoData.videoUrl || videoData.url || videoData.mediaUrl || null;
        message = videoData.caption || message || '[Vídeo]';
      }
      
      // Mídia: documento
      if (payload.document || payload.documentMessage) {
        const docData = payload.document || payload.documentMessage;
        message_type = 'document';
        media_url = docData.documentUrl || docData.url || docData.mediaUrl || null;
        message = docData.fileName || docData.caption || message || '[Documento]';
      }
      
      // Sticker
      if (payload.sticker || payload.stickerMessage) {
        const stickerData = payload.sticker || payload.stickerMessage;
        message_type = 'image';
        media_url = stickerData.stickerUrl || stickerData.url || null;
        message = '[Sticker]';
      }
      
    } else {
      // Formato customizado/genérico (fallback)
      console.log('Using custom format');
      platform = payload.platform || 'whatsapp';
      contact_number = payload.contact_number || '';
      contact_name = payload.contact_name || '';
      message = payload.message || '';
      message_type = payload.message_type || 'text';
      media_url = payload.media_url || null;
      is_from_me = payload.is_from_me === true;
    }

    // Validação
    if (!contact_number) {
      console.error('Missing contact_number/phone');
      return new Response(
        JSON.stringify({ error: 'contact_number/phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limpar número (remover caracteres não numéricos)
    const cleanNumber = contact_number.replace(/\D/g, '');
    
    // Log para debug
    console.log('Processed message:', {
      platform,
      cleanNumber,
      contact_name,
      message: message.substring(0, 100),
      message_type,
      is_from_me,
      has_media: !!media_url
    });

    // Buscar ou criar conversa
    let conversation;
    const { data: existingConversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_number', cleanNumber)
      .eq('platform', platform)
      .maybeSingle();

    if (existingConversation) {
      // Atualizar conversa existente
      const { data: updatedConversation, error: updateError } = await supabase
        .from('conversations')
        .update({
          last_message: message || `[${message_type}]`,
          contact_name: contact_name || existingConversation.contact_name,
          unread_count: is_from_me ? existingConversation.unread_count : (existingConversation.unread_count || 0) + 1
        })
        .eq('id', existingConversation.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating conversation:', updateError);
        throw updateError;
      }
      conversation = updatedConversation;
    } else {
      // Criar nova conversa
      const { data: newConversation, error: insertError } = await supabase
        .from('conversations')
        .insert({
          contact_number: cleanNumber,
          contact_name: contact_name || cleanNumber,
          platform: platform,
          last_message: message || `[${message_type}]`,
          unread_count: is_from_me ? 0 : 1
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating conversation:', insertError);
        throw insertError;
      }
      conversation = newConversation;
    }

    // Inserir mensagem
    const { data: newMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        content: message,
        message_type: message_type,
        media_url: media_url,
        is_from_me: is_from_me,
        status: is_from_me ? 'sent' : 'received'
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error inserting message:', messageError);
      throw messageError;
    }

    console.log('Message saved successfully:', newMessage.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: newMessage.id,
        conversation_id: conversation.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
