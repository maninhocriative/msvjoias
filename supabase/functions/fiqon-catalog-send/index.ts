import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductItem {
  sku?: string;
  name?: string;
  nome?: string;
  price?: number;
  preco?: string;
  caption?: string;
  image_url?: string;
  url_imagem?: string;
  video_url?: string;
  url_video?: string;
  media_url?: string;
  url_midia?: string;
  media_type?: string;
  tipo_midia?: string;
  has_video?: boolean;
  tem_video?: boolean;
  tamanhos?: string;
  sizes_formatted?: string;
}

interface SendResult {
  index: number;
  sku: string;
  success: boolean;
  messageId?: string;
  error?: string;
  mediaType: string;
  mediaUrl: string;
}

// Helper to clean nil/null values from Fiqon
function cleanValue(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    if (lower === '<nil>' || lower === 'nil' || lower === 'null' || lower === 'undefined' || lower === '') {
      return null;
    }
  }
  return String(val);
}

// Helper function to send via Z-API
async function sendToZAPI(
  phone: string,
  mediaType: 'image' | 'video',
  mediaUrl: string,
  caption: string,
  instanceId: string,
  token: string,
  clientToken?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  
  const endpoint = mediaType === 'video'
    ? `https://api.z-api.io/instances/${instanceId}/token/${token}/send-video`
    : `https://api.z-api.io/instances/${instanceId}/token/${token}/send-image`;
  
  const body = mediaType === 'video'
    ? { phone, video: mediaUrl, caption }
    : { phone, image: mediaUrl, caption };
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  console.log(`[FIQON-CATALOG] Sending ${mediaType} to ${phone}: ${mediaUrl.substring(0, 50)}...`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const result = await response.json();
    
    if (response.ok && (result.messageId || result.zaapId)) {
      return { success: true, messageId: result.messageId || result.zaapId };
    }
    
    return { success: false, error: JSON.stringify(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      console.error('[FIQON-CATALOG] Z-API not configured');
      return new Response(
        JSON.stringify({ error: 'Z-API credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const payload = await req.json();

    console.log('[FIQON-CATALOG] ====== NOVA REQUISIÇÃO ======');
    console.log('[FIQON-CATALOG] Payload keys:', Object.keys(payload));

    // Extract phone - support multiple formats
    let phone = cleanValue(payload.phone) || cleanValue(payload.telefone) || cleanValue(payload.numero);
    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    phone = phone.replace(/\D/g, '');
    console.log(`[FIQON-CATALOG] Phone: ${phone}`);

    // Extract products array - support multiple formats
    let products: ProductItem[] = [];
    
    if (Array.isArray(payload.produtos)) {
      products = payload.produtos;
    } else if (Array.isArray(payload.products)) {
      products = payload.products;
    } else if (payload.produto || payload.product) {
      // Single product
      products = [payload.produto || payload.product];
    }

    if (products.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No products provided. Use "produtos" or "products" array.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[FIQON-CATALOG] Produtos recebidos: ${products.length}`);

    // Optional intro message
    const introMessage = cleanValue(payload.mensagem) || cleanValue(payload.message) || cleanValue(payload.intro);
    
    // Send video priority
    const sendVideoPriority = payload.send_video_priority !== false && payload.priorizar_video !== false;
    
    // Delay between messages (ms)
    const delayMs = payload.delay_ms || payload.delay || 1500;

    const results: SendResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    // ========================================
    // SEND INTRO MESSAGE (if provided)
    // ========================================
    if (introMessage) {
      console.log(`[FIQON-CATALOG] Enviando mensagem introdutória...`);
      
      const introEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
      const introHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ZAPI_CLIENT_TOKEN) introHeaders['Client-Token'] = ZAPI_CLIENT_TOKEN;

      try {
        const introResponse = await fetch(introEndpoint, {
          method: 'POST',
          headers: introHeaders,
          body: JSON.stringify({ phone, message: introMessage }),
        });
        const introResult = await introResponse.json();
        
        if (introResponse.ok && (introResult.messageId || introResult.zaapId)) {
          console.log(`[FIQON-CATALOG] Intro enviada: ${introResult.messageId || introResult.zaapId}`);
        } else {
          console.error(`[FIQON-CATALOG] Erro na intro:`, introResult);
        }
      } catch (err) {
        console.error(`[FIQON-CATALOG] Erro ao enviar intro:`, err);
      }

      // Wait before sending products
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // ========================================
    // SEND EACH PRODUCT (with proper iteration)
    // ========================================
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const productIndex = i + 1;
      
      // Get product details with fallbacks
      const sku = cleanValue(product.sku) || `item-${productIndex}`;
      const name = cleanValue(product.name) || cleanValue(product.nome) || 'Produto';
      
      // Determine media URL - try multiple field names
      let imageUrl = cleanValue(product.image_url) || cleanValue(product.url_imagem);
      let videoUrl = cleanValue(product.video_url) || cleanValue(product.url_video);
      let mediaUrlGeneric = cleanValue(product.media_url) || cleanValue(product.url_midia);
      
      // Check if it has video
      const hasVideo = product.has_video === true || product.tem_video === true || !!videoUrl;
      
      // Determine final media to send
      let finalMediaUrl: string;
      let finalMediaType: 'image' | 'video';
      
      if (sendVideoPriority && videoUrl) {
        finalMediaUrl = videoUrl;
        finalMediaType = 'video';
      } else if (imageUrl) {
        finalMediaUrl = imageUrl;
        finalMediaType = 'image';
      } else if (videoUrl) {
        finalMediaUrl = videoUrl;
        finalMediaType = 'video';
      } else if (mediaUrlGeneric) {
        // Try to determine type from URL or fallback to image
        const isVideo = /\.(mp4|webm|mov|avi)/i.test(mediaUrlGeneric) || 
                        mediaUrlGeneric.includes('video') ||
                        (product.media_type === 'video' || product.tipo_midia === 'video');
        finalMediaUrl = mediaUrlGeneric;
        finalMediaType = isVideo ? 'video' : 'image';
      } else {
        // No media found
        console.warn(`[FIQON-CATALOG] Produto ${productIndex} (${sku}) sem mídia, pulando...`);
        results.push({
          index: productIndex,
          sku,
          success: false,
          error: 'No media URL found',
          mediaType: 'none',
          mediaUrl: '',
        });
        errorCount++;
        continue;
      }

      // Get caption
      const caption = cleanValue(product.caption) || `*${name}*\n📦 Cód: ${sku}`;

      console.log(`[FIQON-CATALOG] Produto ${productIndex}/${products.length}: ${name}`);
      console.log(`[FIQON-CATALOG]   SKU: ${sku}`);
      console.log(`[FIQON-CATALOG]   Tipo: ${finalMediaType}`);
      console.log(`[FIQON-CATALOG]   URL: ${finalMediaUrl.substring(0, 80)}...`);

      // Send to Z-API
      const sendResult = await sendToZAPI(
        phone,
        finalMediaType,
        finalMediaUrl,
        caption,
        ZAPI_INSTANCE_ID!,
        ZAPI_TOKEN!,
        ZAPI_CLIENT_TOKEN
      );

      results.push({
        index: productIndex,
        sku,
        success: sendResult.success,
        messageId: sendResult.messageId,
        error: sendResult.error,
        mediaType: finalMediaType,
        mediaUrl: finalMediaUrl,
      });

      if (sendResult.success) {
        successCount++;
        console.log(`[FIQON-CATALOG] ✅ Produto ${productIndex} enviado: ${sendResult.messageId}`);
      } else {
        errorCount++;
        console.error(`[FIQON-CATALOG] ❌ Produto ${productIndex} falhou: ${sendResult.error}`);
      }

      // Delay between products (except for last one)
      if (i < products.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // ========================================
    // SAVE TO CRM (optional)
    // ========================================
    if (payload.save_to_crm !== false) {
      try {
        // Find or create conversation
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_number', phone)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const conversationId = conv?.id;
        
        if (conversationId) {
          // Save a summary message
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            content: `[Catálogo enviado: ${successCount}/${products.length} produtos]`,
            message_type: 'text',
            is_from_me: true,
            status: 'sent',
          });

          await supabase.from('conversations').update({
            last_message: `[Catálogo: ${products.length} produtos]`,
          }).eq('id', conversationId);
        }
      } catch (crmError) {
        console.warn('[FIQON-CATALOG] Erro ao salvar no CRM:', crmError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[FIQON-CATALOG] ====== CONCLUÍDO ======`);
    console.log(`[FIQON-CATALOG] Sucesso: ${successCount}/${products.length}, Duração: ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        phone,
        total_products: products.length,
        sent: successCount,
        failed: errorCount,
        duration_ms: duration,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FIQON-CATALOG] Erro geral:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
