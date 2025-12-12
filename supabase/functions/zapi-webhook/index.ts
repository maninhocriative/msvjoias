import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('ZAPI Webhook received:', JSON.stringify(body, null, 2));

    // ZAPI webhook payload structure
    const {
      phone,
      event,
      messageId,
      text,
      type,
      image,
      audio,
      document,
      video,
      senderName,
      senderPhoto,
      isGroup,
      participantPhone,
    } = body;

    // Only process received messages
    if (event !== 'message' && event !== 'message-status-update') {
      console.log('Event not handled:', event);
      return new Response(JSON.stringify({ success: true, message: 'Event ignored' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle message status updates
    if (event === 'message-status-update') {
      const { data: message } = await supabase
        .from('messages')
        .update({ status: body.status })
        .eq('zapi_message_id', messageId)
        .select()
        .single();
      
      console.log('Message status updated:', message);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract contact number (remove @c.us or @g.us suffix)
    const contactNumber = phone?.replace(/@[cg]\.us$/, '') || '';
    const contactName = senderName || contactNumber;

    // Find or create conversation
    let { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_number', contactNumber)
      .single();

    if (!conversation) {
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          contact_name: contactName,
          contact_number: contactNumber,
          platform: 'whatsapp',
          last_message: text?.message || '[Mídia]',
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select()
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        throw convError;
      }
      conversation = newConversation;
    } else {
      // Update conversation with last message
      await supabase
        .from('conversations')
        .update({
          contact_name: contactName,
          last_message: text?.message || '[Mídia]',
          last_message_at: new Date().toISOString(),
          unread_count: (conversation.unread_count || 0) + 1,
        })
        .eq('id', conversation.id);
    }

    // Determine message type and content
    let messageType = 'text';
    let content = text?.message || '';
    let mediaUrl = null;

    if (image) {
      messageType = 'image';
      mediaUrl = image.imageUrl;
      content = image.caption || '';
    } else if (audio) {
      messageType = 'audio';
      mediaUrl = audio.audioUrl;
    } else if (document) {
      messageType = 'document';
      mediaUrl = document.documentUrl;
      content = document.fileName || '';
    } else if (video) {
      messageType = 'video';
      mediaUrl = video.videoUrl;
      content = video.caption || '';
    }

    // Save message
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        content,
        message_type: messageType,
        media_url: mediaUrl,
        is_from_me: false,
        zapi_message_id: messageId,
        status: 'received',
      })
      .select()
      .single();

    if (msgError) {
      console.error('Error saving message:', msgError);
      throw msgError;
    }

    console.log('Message saved:', message);

    return new Response(JSON.stringify({ success: true, message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
