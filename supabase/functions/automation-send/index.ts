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
    const automationWebhook = Deno.env.get('AUTOMATION_OUTGOING_WEBHOOK');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log('Send message request:', JSON.stringify(payload, null, 2));

    const {
      conversation_id,
      phone,
      message,
      message_type = 'text',
      media_url = null,
      platform = 'whatsapp'
    } = payload;

    if (!conversation_id || !phone) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and phone are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert message into database first
    const { data: newMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        content: message,
        message_type,
        media_url,
        is_from_me: true,
        status: 'sent'
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error inserting message:', messageError);
      throw messageError;
    }

    // Update conversation last_message
    await supabase
      .from('conversations')
      .update({
        last_message: message || `[${message_type}]`
      })
      .eq('id', conversation_id);

    // If automation webhook is configured, forward the message
    if (automationWebhook) {
      console.log('Forwarding to automation webhook:', automationWebhook);
      
      try {
        const outgoingPayload = {
          platform,
          contact_number: phone,
          message,
          message_type,
          media_url,
          message_id: newMessage.id,
          direction: 'outgoing'
        };

        const webhookResponse = await fetch(automationWebhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(outgoingPayload),
        });

        if (webhookResponse.ok) {
          // Update message status to delivered
          await supabase
            .from('messages')
            .update({ status: 'delivered' })
            .eq('id', newMessage.id);

          console.log('Message forwarded successfully');
        } else {
          console.error('Automation webhook error:', await webhookResponse.text());
        }
      } catch (webhookError) {
        console.error('Error calling automation webhook:', webhookError);
        // Don't fail the request, message is saved locally
      }
    } else {
      console.log('No AUTOMATION_OUTGOING_WEBHOOK configured, message saved locally only');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: newMessage.id,
        forwarded: !!automationWebhook
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Send message error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
