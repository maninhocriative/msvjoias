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
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error('ZAPI credentials not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { conversation_id, phone, message, message_type = 'text', media_url } = body;

    console.log('Sending message via ZAPI:', { phone, message, message_type });

    // Format phone number for ZAPI (add @c.us suffix)
    const formattedPhone = phone.replace(/\D/g, '');
    
    let zapiEndpoint = '';
    let zapiBody: Record<string, unknown> = {};

    // Determine ZAPI endpoint based on message type
    switch (message_type) {
      case 'text':
        zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
        zapiBody = {
          phone: formattedPhone,
          message: message,
        };
        break;
      case 'image':
        zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-image`;
        zapiBody = {
          phone: formattedPhone,
          image: media_url,
          caption: message || '',
        };
        break;
      case 'audio':
        zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-audio`;
        zapiBody = {
          phone: formattedPhone,
          audio: media_url,
        };
        break;
      case 'document':
        zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-document`;
        zapiBody = {
          phone: formattedPhone,
          document: media_url,
          fileName: message || 'document',
        };
        break;
      default:
        zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
        zapiBody = {
          phone: formattedPhone,
          message: message,
        };
    }

    // Add Client-Token header if available
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (ZAPI_CLIENT_TOKEN) {
      headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
    }

    // Send message via ZAPI
    const zapiResponse = await fetch(zapiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(zapiBody),
    });

    const zapiResult = await zapiResponse.json();
    console.log('ZAPI response:', zapiResult);

    if (!zapiResponse.ok) {
      throw new Error(`ZAPI error: ${JSON.stringify(zapiResult)}`);
    }

    // Save message to database
    const { data: savedMessage, error: dbError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        content: message,
        message_type,
        media_url,
        is_from_me: true,
        zapi_message_id: zapiResult.messageId,
        status: 'sent',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Error saving message:', dbError);
      throw dbError;
    }

    // Update conversation last message
    await supabase
      .from('conversations')
      .update({
        last_message: message || '[Mídia]',
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    console.log('Message sent and saved:', savedMessage);

    return new Response(JSON.stringify({ 
      success: true, 
      message: savedMessage,
      zapi_response: zapiResult 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Send message error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
