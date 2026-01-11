import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Product {
  sku: string;
  name: string;
  price?: number;
  image_url?: string;
  video_url?: string;
  sizes?: { size: string; stock: number }[];
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Helper function to send a single message via Z-API
async function sendViaZAPI(
  phone: string,
  messageType: string,
  content: string | null,
  mediaUrl: string | null,
  ZAPI_INSTANCE_ID: string,
  ZAPI_TOKEN: string,
  ZAPI_CLIENT_TOKEN?: string
): Promise<SendResult> {
  let zapiEndpoint = '';
  let zapiBody: Record<string, unknown> = {};

  switch (messageType) {
    case 'text':
      zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
      zapiBody = { phone, message: content };
      break;
    case 'image':
      zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-image`;
      zapiBody = { phone, image: mediaUrl, caption: content || '' };
      break;
    case 'video':
      zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-video`;
      zapiBody = { phone, video: mediaUrl, caption: content || '' };
      break;
    case 'audio':
      zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-audio`;
      zapiBody = { phone, audio: mediaUrl };
      break;
    case 'document':
      zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-document`;
      zapiBody = { phone, document: mediaUrl, fileName: content || 'document' };
      break;
    default:
      zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
      zapiBody = { phone, message: content };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ZAPI_CLIENT_TOKEN) {
    headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
  }

  try {
    const response = await fetch(zapiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(zapiBody),
    });

    const result = await response.json();
    console.log('[ZAPI] Response:', JSON.stringify(result));
    
    // Z-API returns messageId or zaapId on success
    if (response.ok && (result.messageId || result.zaapId)) {
      return { success: true, messageId: result.messageId || result.zaapId };
    } else {
      return { success: false, error: JSON.stringify(result) };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Helper function to format product caption
function formatProductCaption(product: Product, index: number): string {
  const lines: string[] = [];
  
  lines.push(`*${index}️⃣ ${product.name}*`);
  
  if (product.sku) {
    lines.push(`📦 SKU: ${product.sku}`);
  }
  
  if (product.price) {
    const priceFormatted = product.price.toLocaleString('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    });
    lines.push(`💰 ${priceFormatted}`);
  }
  
  if (product.sizes && product.sizes.length > 0) {
    const availableSizes = product.sizes
      .filter(s => s.stock > 0)
      .map(s => s.size)
      .join(', ');
    if (availableSizes) {
      lines.push(`📏 Tamanhos: ${availableSizes}`);
    }
  }
  
  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const automationWebhook = Deno.env.get('AUTOMATION_OUTGOING_WEBHOOK');
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
      fromMe = true,
      // New: catalog products support
      products = null,
      send_video_priority = true,
      // Skip saving to CRM (used when caller already saved the message)
      skip_crm_save = false
    } = payload;

    if (!phone) {
      console.error('[AUTOMATION-SEND] Missing phone number');
      return new Response(
        JSON.stringify({ error: 'phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedPhone = phone.replace(/\D/g, '');
    console.log('[AUTOMATION-SEND] Normalized phone:', normalizedPhone);

    // Resolve conversation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let conversationId: string | null = null;

    if (typeof rawConversationId === 'string' && uuidRegex.test(rawConversationId)) {
      conversationId = rawConversationId;
    }

    if (!conversationId) {
      console.log('[AUTOMATION-SEND] Resolving conversation by phone:', normalizedPhone);

      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_number', normalizedPhone)
        .eq('platform', platform)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingConversation?.id) {
        conversationId = existingConversation.id as string;
      } else {
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert({
            contact_number: normalizedPhone,
            platform,
            contact_name: normalizedPhone,
            last_message: message || '[Catálogo]',
            unread_count: 0,
          })
          .select('id')
          .single();

        if (createError || !newConversation) {
          throw createError || new Error('Failed to create conversation');
        }
        conversationId = newConversation.id as string;
      }
    }

    const results: { messages: string[]; forwarded: number; errors: string[] } = {
      messages: [],
      forwarded: 0,
      errors: []
    };

    // Check if Z-API is configured
    const hasZAPI = !!(ZAPI_INSTANCE_ID && ZAPI_TOKEN);

    // ========================================
    // CATALOG PRODUCTS MODE
    // ========================================
    if (products && Array.isArray(products) && products.length > 0) {
      console.log(`[AUTOMATION-SEND] Sending catalog with ${products.length} products`);

      // Send intro message if provided
      if (message) {
        let introMsgId: string | null = null;
        
        // Only save to CRM if not already saved by caller
        if (!skip_crm_save) {
          const { data: introMsg } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              content: message,
              message_type: 'text',
              is_from_me: true,
              status: 'pending'
            })
            .select('id')
            .single();
          introMsgId = introMsg?.id || null;
          results.messages.push(introMsgId || 'intro');
        }

        if (hasZAPI) {
          const result = await sendViaZAPI(
            normalizedPhone, 'text', message, null,
            ZAPI_INSTANCE_ID!, ZAPI_TOKEN!, ZAPI_CLIENT_TOKEN
          );
          
          if (result.success) {
            results.forwarded++;
            if (introMsgId) {
              await supabase.from('messages').update({ status: 'sent' }).eq('id', introMsgId);
            }
          } else {
            results.errors.push(`Intro: ${result.error}`);
          }
        }
        
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Send each product
      for (let i = 0; i < products.length; i++) {
        const product = products[i] as Product;
        const caption = formatProductCaption(product, i + 1);
        
        // Determine media type and URL (video priority or image)
        let mediaType: 'image' | 'video' = 'image';
        let mediaUrl: string | null = null;

        if (send_video_priority && product.video_url) {
          mediaType = 'video';
          mediaUrl = product.video_url;
        } else if (product.image_url) {
          mediaType = 'image';
          mediaUrl = product.image_url;
        } else if (product.video_url) {
          mediaType = 'video';
          mediaUrl = product.video_url;
        }

        // If no media, send as text
        if (!mediaUrl) {
          const { data: textMsg } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              content: caption,
              message_type: 'text',
              is_from_me: true,
              status: 'pending'
            })
            .select('id')
            .single();

          if (textMsg && hasZAPI) {
            const result = await sendViaZAPI(
              normalizedPhone, 'text', caption, null,
              ZAPI_INSTANCE_ID!, ZAPI_TOKEN!, ZAPI_CLIENT_TOKEN
            );
            if (result.success) {
              results.forwarded++;
              await supabase.from('messages').update({ status: 'sent' }).eq('id', textMsg.id);
            } else {
              results.errors.push(`Product ${i + 1}: ${result.error}`);
            }
          }
          results.messages.push(textMsg?.id || `product-${i}`);
        } else {
          // Send media with caption
          const { data: mediaMsg } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              content: caption,
              message_type: mediaType,
              media_url: mediaUrl,
              is_from_me: true,
              status: 'pending'
            })
            .select('id')
            .single();

          if (mediaMsg && hasZAPI) {
            console.log(`[AUTOMATION-SEND] Sending ${mediaType} for product ${i + 1}: ${product.name}`);
            
            const result = await sendViaZAPI(
              normalizedPhone, mediaType, caption, mediaUrl,
              ZAPI_INSTANCE_ID!, ZAPI_TOKEN!, ZAPI_CLIENT_TOKEN
            );
            
            if (result.success) {
              results.forwarded++;
              await supabase.from('messages').update({ status: 'sent' }).eq('id', mediaMsg.id);
              console.log(`[AUTOMATION-SEND] Product ${i + 1} sent successfully`);
            } else {
              results.errors.push(`Product ${i + 1}: ${result.error}`);
              console.error(`[AUTOMATION-SEND] Failed to send product ${i + 1}:`, result.error);
            }
          }
          results.messages.push(mediaMsg?.id || `product-${i}`);
        }

        // Delay between products to avoid rate limiting
        if (i < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Update conversation last message
      await supabase
        .from('conversations')
        .update({ last_message: `[Catálogo: ${products.length} produtos]` })
        .eq('id', conversationId);

      return new Response(
        JSON.stringify({
          success: true,
          mode: 'catalog',
          products_count: products.length,
          messages_sent: results.messages.length,
          forwarded: results.forwarded,
          errors: results.errors,
          conversation_id: conversationId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // SINGLE MESSAGE MODE (original behavior)
    // ========================================
    let newMessageId: string | null = null;
    
    // Only save to CRM if not already saved by caller
    if (!skip_crm_save) {
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
        throw messageError;
      }
      
      newMessageId = newMessage.id;

      await supabase
        .from('conversations')
        .update({ last_message: message || `[${message_type}]` })
        .eq('id', conversationId);
    }

    let forwarded = false;
    let forwardError: string | null = null;

    // Try automation webhook first
    if (automationWebhook) {
      try {
        const webhookResponse = await fetch(automationWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            contact_number: normalizedPhone,
            message,
            message_type,
            media_url,
            message_id: newMessageId,
            direction: 'outgoing'
          }),
        });

        if (webhookResponse.ok) {
          forwarded = true;
          if (newMessageId) {
            await supabase.from('messages').update({ status: 'delivered' }).eq('id', newMessageId);
          }
        } else {
          forwardError = await webhookResponse.text();
        }
      } catch (error) {
        forwardError = error instanceof Error ? error.message : 'Webhook error';
      }
    }
    // Try Z-API
    else if (hasZAPI) {
      const result = await sendViaZAPI(
        normalizedPhone, message_type, message, media_url,
        ZAPI_INSTANCE_ID!, ZAPI_TOKEN!, ZAPI_CLIENT_TOKEN
      );

      if (result.success) {
        forwarded = true;
        if (newMessageId) {
          await supabase.from('messages').update({ status: 'sent' }).eq('id', newMessageId);
        }
      } else {
        forwardError = result.error || 'Z-API error';
      }
    } else {
      forwardError = 'No forwarding method configured';
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'single',
        message_id: newMessageId,
        conversation_id: conversationId,
        forwarded,
        forward_error: forwardError
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AUTOMATION-SEND] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});