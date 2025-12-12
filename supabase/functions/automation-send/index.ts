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
      conversation_id: rawConversationId,
      phone,
      message,
      message_type = 'text',
      media_url = null,
      platform = 'whatsapp'
    } = payload;

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and normalize conversation_id (must be a valid UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let conversationId: string | null = null;

    if (typeof rawConversationId === 'string' && uuidRegex.test(rawConversationId)) {
      conversationId = rawConversationId;
    } else if (rawConversationId) {
      console.warn('Invalid conversation_id received, will resolve by phone:', rawConversationId);
    }

    // If no valid conversation_id was provided, try to find or create one by phone + platform
    if (!conversationId) {
      console.log('Resolving conversation by phone:', phone, 'platform:', platform);

      const { data: existingConversation, error: findError } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_number', phone)
        .eq('platform', platform)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError) {
        console.error('Error finding conversation by phone:', findError);
      }

      if (existingConversation?.id) {
        conversationId = existingConversation.id as string;
      } else {
        console.log('No existing conversation found, creating a new one');
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert({
            contact_number: phone,
            platform,
            contact_name: phone,
            last_message: message || `[${message_type}]`,
            unread_count: 0,
          })
          .select('id')
          .single();

        if (createError || !newConversation) {
          console.error('Error creating conversation:', createError);
          throw createError || new Error('Failed to create conversation');
        }

        conversationId = newConversation.id as string;
      }
    }

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: 'Could not resolve a conversation for this phone number' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert message into database first
    const { data: newMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
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
      .eq('id', conversationId);

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
