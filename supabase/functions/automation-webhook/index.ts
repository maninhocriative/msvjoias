import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. TRATAMENTO DE CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 2. Cria o cliente do Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Lê o JSON
    const { text, contact_name, platform } = await req.json()

    console.log('Payload recebido:', JSON.stringify({ text, contact_name, platform }))

    // Validação simples
    if (!text || !text.phone) {
      throw new Error('Dados incompletos: phone é obrigatório')
    }

    const phone = text.phone.replace(/\D/g, '') // Limpa o número
    const messageContent = text.message || ''
    const photoUrl = text.photo || null
    const isFromMe = text.fromMe || false

    console.log('Dados extraídos:', { phone, messageContent, photoUrl, isFromMe })

    // 4. Lógica de Banco de Dados
    // A. Verifica/Cria Conversa
    let conversationId
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, unread_count')
      .eq('contact_number', phone)
      .single()

    if (existingConv) {
      conversationId = existingConv.id
      // Atualiza última mensagem e incrementa unread se não for do bot
      await supabase
        .from('conversations')
        .update({ 
          last_message: messageContent || (photoUrl ? '[Imagem]' : ''),
          unread_count: isFromMe ? 0 : (existingConv.unread_count || 0) + 1
        })
        .eq('id', conversationId)
      
      console.log('Conversa existente atualizada:', conversationId)
    } else {
      // Cria novo contato
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({
          contact_number: phone,
          contact_name: contact_name || phone,
          platform: platform || 'whatsapp',
          last_message: messageContent || (photoUrl ? '[Imagem]' : ''),
          unread_count: isFromMe ? 0 : 1
        })
        .select()
        .single()
      
      if (createError) {
        console.error('Erro ao criar conversa:', createError)
        throw createError
      }
      conversationId = newConv.id
      console.log('Nova conversa criada:', conversationId)
    }

    // B. Salva a Mensagem
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: messageContent,
        is_from_me: isFromMe,
        message_type: photoUrl ? 'image' : 'text',
        media_url: photoUrl,
        status: 'delivered'
      })

    if (msgError) {
      console.error('Erro ao salvar mensagem:', msgError)
      throw msgError
    }

    console.log('Mensagem salva com sucesso!')

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
