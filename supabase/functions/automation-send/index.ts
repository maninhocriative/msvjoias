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
    
    // Z-API credentials for direct sending
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log('[AUTOMATION-SEND] Request received:', JSON.stringify(payload, null, 2));

    const {
      conversation_id: rawConversationId,
      phone,
      message,
      message_type = 'text',
      media_url = null,
      platform = 'whatsapp',
      fromMe = true // Default to true for outgoing messages
    } = payload;

    if (!phone) {
      console.error('[AUTOMATION-SEND] Missing phone number');
      return new Response(
        JSON.stringify({ error: 'phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize phone number (remove non-digits)
    const normalizedPhone = phone.replace(/\D/g, '');
    console.log('[AUTOMATION-SEND] Normalized phone:', normalizedPhone);

    // Validate and normalize conversation_id (must be a valid UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let conversationId: string | null = null;

    if (typeof rawConversationId === 'string' && uuidRegex.test(rawConversationId)) {
      conversationId = rawConversationId;
    } else if (rawConversationId) {
      console.warn('[AUTOMATION-SEND] Invalid conversation_id received, will resolve by phone:', rawConversationId);
    }

    // If no valid conversation_id was provided, try to find or create one by phone + platform
    if (!conversationId) {
      console.log('[AUTOMATION-SEND] Resolving conversation by phone:', normalizedPhone, 'platform:', platform);

      const { data: existingConversation, error: findError } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_number', normalizedPhone)
        .eq('platform', platform)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError) {
        console.error('[AUTOMATION-SEND] Error finding conversation by phone:', findError);
      }

      if (existingConversation?.id) {
        conversationId = existingConversation.id as string;
        console.log('[AUTOMATION-SEND] Found existing conversation:', conversationId);
      } else {
        console.log('[AUTOMATION-SEND] No existing conversation found, creating a new one');
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert({
            contact_number: normalizedPhone,
            platform,
            contact_name: normalizedPhone,
            last_message: message || `[${message_type}]`,
            unread_count: 0,
          })
          .select('id')
          .single();

        if (createError || !newConversation) {
          console.error('[AUTOMATION-SEND] Error creating conversation:', createError);
          throw createError || new Error('Failed to create conversation');
        }

        conversationId = newConversation.id as string;
        console.log('[AUTOMATION-SEND] Created new conversation:', conversationId);
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
        is_from_me: fromMe,
        status: 'pending'
      })
      .select()
      .single();

    if (messageError) {
      console.error('[AUTOMATION-SEND] Error inserting message:', messageError);
      throw messageError;
    }

    console.log('[AUTOMATION-SEND] Message saved to DB:', newMessage.id);

    // Update conversation last_message
    await supabase
      .from('conversations')
      .update({
        last_message: message || `[${message_type}]`
      })
      .eq('id', conversationId);

    let forwarded = false;
    let forwardError: string | null = null;

    // Priority 1: If automation webhook is configured, use it
    if (automationWebhook) {
      console.log('[AUTOMATION-SEND] Forwarding to automation webhook:', automationWebhook);
      
      try {
        const outgoingPayload = {
          platform,
          contact_number: normalizedPhone,
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
          forwarded = true;
          await supabase
            .from('messages')
            .update({ status: 'delivered' })
            .eq('id', newMessage.id);
          console.log('[AUTOMATION-SEND] Message forwarded via webhook successfully');
        } else {
          forwardError = await webhookResponse.text();
          console.error('[AUTOMATION-SEND] Automation webhook error:', forwardError);
        }
      } catch (webhookError) {
        forwardError = webhookError instanceof Error ? webhookError.message : 'Unknown webhook error';
        console.error('[AUTOMATION-SEND] Error calling automation webhook:', webhookError);
      }
    }
    // Priority 2: If Z-API credentials are configured, send directly via Z-API
    else if (ZAPI_INSTANCE_ID && ZAPI_TOKEN) {
      console.log('[AUTOMATION-SEND] Sending directly via Z-API');
      
      try {
        let zapiEndpoint = '';
        let zapiBody: Record<string, unknown> = {};

        // Determine Z-API endpoint based on message type
        switch (message_type) {
          case 'text':
            zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
            zapiBody = {
              phone: normalizedPhone,
              message: message,
            };
            break;
          case 'image':
            zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-image`;
            zapiBody = {
              phone: normalizedPhone,
              image: media_url,
              caption: message || '',
            };
            break;
          case 'audio':
            zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-audio`;
            zapiBody = {
              phone: normalizedPhone,
              audio: media_url,
            };
            break;
          case 'document':
            zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-document`;
            zapiBody = {
              phone: normalizedPhone,
              document: media_url,
              fileName: message || 'document',
            };
            break;
          case 'video':
            zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-video`;
            zapiBody = {
              phone: normalizedPhone,
              video: media_url,
              caption: message || '',
            };
            break;
          default:
            zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
            zapiBody = {
              phone: normalizedPhone,
              message: message,
            };
        }

        console.log('[AUTOMATION-SEND] Z-API endpoint:', zapiEndpoint);
        console.log('[AUTOMATION-SEND] Z-API body:', JSON.stringify(zapiBody));

        // Add Client-Token header if available
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (ZAPI_CLIENT_TOKEN) {
          headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
        }

        // Send message via Z-API
        const zapiResponse = await fetch(zapiEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(zapiBody),
        });

        const zapiResult = await zapiResponse.json();
        console.log('[AUTOMATION-SEND] Z-API response:', JSON.stringify(zapiResult));

        if (zapiResponse.ok && zapiResult.zapiMessageId) {
          forwarded = true;
          await supabase
            .from('messages')
            .update({ status: 'sent' })
            .eq('id', newMessage.id);
          console.log('[AUTOMATION-SEND] Message sent via Z-API successfully, messageId:', zapiResult.zapiMessageId);
        } else {
          forwardError = JSON.stringify(zapiResult);
          console.error('[AUTOMATION-SEND] Z-API error:', forwardError);
        }
      } catch (zapiError) {
        forwardError = zapiError instanceof Error ? zapiError.message : 'Unknown Z-API error';
        console.error('[AUTOMATION-SEND] Error calling Z-API:', zapiError);
      }
    } else {
      console.log('[AUTOMATION-SEND] No forwarding method configured (no webhook or Z-API credentials)');
      forwardError = 'No forwarding method configured';
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: newMessage.id,
        conversation_id: conversationId,
        forwarded,
        forward_error: forwardError
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AUTOMATION-SEND] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});