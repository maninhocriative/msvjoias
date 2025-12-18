import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    console.log('Payload recebido:', JSON.stringify(payload))

    // Suporta múltiplos formatos de payload
    let phone = ''
    let messageContent = ''
    let mediaUrl: string | null = null
    let isFromMe = false
    let contactName = ''
    let productInterest: string | null = null
    let platform = 'whatsapp'
    let messageType = 'text'

    // Formato 1: { text: { phone, message, photo, fromMe, product_id }, contact_name, platform }
    if (payload.text && payload.text.phone) {
      phone = payload.text.phone.replace(/\D/g, '')
      messageContent = payload.text.message || ''
      isFromMe = payload.text.fromMe === true
      contactName = payload.contact_name || phone
      platform = payload.platform || 'whatsapp'
      
      // Product interest - quando o cliente pergunta sobre um produto específico
      productInterest = payload.text.product_id || payload.product_id || null
      
      // Detectar imagem real (não foto de perfil)
      // Foto de perfil geralmente vem em pps.whatsapp.net
      // Imagem de catálogo/mídia vem em mmg.whatsapp.net ou outros domínios
      const photo = payload.text.photo || ''
      if (photo && !photo.includes('pps.whatsapp.net')) {
        mediaUrl = photo
        messageType = 'image'
      }
      
      // Se tiver imageUrl ou mediaUrl específico, usar
      if (payload.text.imageUrl) {
        mediaUrl = payload.text.imageUrl
        messageType = 'image'
      }
      if (payload.text.mediaUrl) {
        mediaUrl = payload.text.mediaUrl
        messageType = payload.text.type || 'image'
      }
      if (payload.text.audioUrl) {
        mediaUrl = payload.text.audioUrl
        messageType = 'audio'
      }
      if (payload.text.videoUrl) {
        mediaUrl = payload.text.videoUrl
        messageType = 'video'
      }
      if (payload.text.documentUrl) {
        mediaUrl = payload.text.documentUrl
        messageType = 'document'
      }
    }
    
    // Formato 2: Formato ZAPI direto
    else if (payload.phone) {
      phone = payload.phone.replace(/\D/g, '')
      messageContent = payload.text?.message || payload.message || ''
      isFromMe = payload.fromMe === true
      contactName = payload.senderName || payload.pushName || phone
      platform = payload.isInstagram ? 'instagram' : 'whatsapp'
      productInterest = payload.product_id || null
      
      // Mídia ZAPI
      if (payload.image) {
        mediaUrl = payload.image.imageUrl || payload.image.url
        messageType = 'image'
        messageContent = payload.image.caption || messageContent || '[Imagem]'
      }
      if (payload.audio) {
        mediaUrl = payload.audio.audioUrl || payload.audio.url
        messageType = 'audio'
      }
      if (payload.video) {
        mediaUrl = payload.video.videoUrl || payload.video.url
        messageType = 'video'
        messageContent = payload.video.caption || messageContent || '[Vídeo]'
      }
      if (payload.document) {
        mediaUrl = payload.document.documentUrl || payload.document.url
        messageType = 'document'
        messageContent = payload.document.fileName || messageContent || '[Documento]'
      }
    }
    
    // Formato 3: Formato genérico
    else if (payload.contact_number) {
      phone = payload.contact_number.replace(/\D/g, '')
      messageContent = payload.message || ''
      isFromMe = payload.is_from_me === true
      contactName = payload.contact_name || phone
      platform = payload.platform || 'whatsapp'
      mediaUrl = payload.media_url || null
      messageType = payload.message_type || 'text'
      productInterest = payload.product_id || null
    }

    if (!phone) {
      throw new Error('Dados incompletos: phone/contact_number é obrigatório')
    }

    console.log('Dados processados:', { 
      phone, 
      messageContent: messageContent.substring(0, 50), 
      mediaUrl: mediaUrl ? 'SIM' : 'NÃO', 
      isFromMe, 
      platform,
      messageType,
      productInterest
    })

    // Buscar ou criar conversa
    let conversationId
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, unread_count')
      .eq('contact_number', phone)
      .single()

    if (existingConv) {
      conversationId = existingConv.id
      await supabase
        .from('conversations')
        .update({ 
          last_message: messageContent || `[${messageType}]`,
          unread_count: isFromMe ? 0 : (existingConv.unread_count || 0) + 1
        })
        .eq('id', conversationId)
      
      console.log('Conversa atualizada:', conversationId)
    } else {
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({
          contact_number: phone,
          contact_name: contactName,
          platform: platform,
          last_message: messageContent || `[${messageType}]`,
          unread_count: isFromMe ? 0 : 1
        })
        .select()
        .single()
      
      if (createError) {
        console.error('Erro ao criar conversa:', createError)
        throw createError
      }
      conversationId = newConv.id
      console.log('Nova conversa:', conversationId)
    }

    // Salvar mensagem
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: messageContent,
        is_from_me: isFromMe,
        message_type: messageType,
        media_url: mediaUrl,
        status: isFromMe ? 'sent' : 'delivered',
        product_interest: productInterest
      })

    if (msgError) {
      console.error('Erro ao salvar mensagem:', msgError)
      throw msgError
    }

    console.log('Mensagem salva! isFromMe:', isFromMe, 'tipo:', messageType)

    return new Response(JSON.stringify({ success: true, conversation_id: conversationId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Webhook error:', errorMessage)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
