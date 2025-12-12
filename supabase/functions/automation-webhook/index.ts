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

    // Expected payload format:
    // {
    //   "platform": "whatsapp" | "instagram",
    //   "contact_number": "5511999999999",
    //   "contact_name": "João",
    //   "message": "Olá!",
    //   "message_type": "text" | "image" | "audio" | "document" | "video",
    //   "media_url": null | "https://..."
    // }

    const {
      platform = 'whatsapp',
      contact_number,
      contact_name,
      message,
      message_type = 'text',
      media_url = null
    } = payload;

    if (!contact_number) {
      console.error('Missing contact_number');
      return new Response(
        JSON.stringify({ error: 'contact_number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean contact number (remove non-numeric characters)
    const cleanNumber = contact_number.replace(/\D/g, '');

    // Find or create conversation
    let conversation;
    const { data: existingConversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_number', cleanNumber)
      .eq('platform', platform)
      .maybeSingle();

    if (existingConversation) {
      // Update existing conversation
      const { data: updatedConversation, error: updateError } = await supabase
        .from('conversations')
        .update({
          last_message: message || `[${message_type}]`,
          contact_name: contact_name || existingConversation.contact_name,
          unread_count: (existingConversation.unread_count || 0) + 1
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
      // Create new conversation
      const { data: newConversation, error: insertError } = await supabase
        .from('conversations')
        .insert({
          contact_number: cleanNumber,
          contact_name: contact_name || cleanNumber,
          platform: platform,
          last_message: message || `[${message_type}]`,
          unread_count: 1
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating conversation:', insertError);
        throw insertError;
      }
      conversation = newConversation;
    }

    // Insert message
    const { data: newMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        content: message,
        message_type: message_type,
        media_url: media_url,
        is_from_me: false,
        status: 'received'
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
