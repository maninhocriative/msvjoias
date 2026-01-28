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
  description?: string;
  descricao?: string;
  price?: number;
  preco?: string;
  valor?: number;
  valor_formatado?: string;
  price_formatted?: string;
  preco_formatado?: string;
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
  sizes?: string[];
  sizes_formatted?: string;
  tamanhos_formatado?: string;
  color?: string;
  cor?: string;
  stock?: number;
  estoque?: number;
}

interface SendResult {
  index: number;
  sku: string;
  success: boolean;
  messageId?: string;
  error?: string;
  mediaType: string;
  mediaUrl: string;
  price?: number;
}

// Helper to clean nil/null values from Fiqon
function cleanValue(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    if (lower === '<nil>' || lower === 'nil' || lower === 'null' || lower === 'undefined' || lower === '') {
      return null;
    }
    return val.trim();
  }
  return String(val);
}

// Helper para obter número de forma segura
function getNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    if (lower === '<nil>' || lower === 'nil' || lower === 'null' || lower === 'undefined' || lower === '') {
      return null;
    }
    const parsed = parseFloat(val.replace(',', '.'));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

// Gerar hash único para deduplicação
function generateMessageHash(phone: string, message: string): string {
  // Criar um hash simples baseado em phone + primeiros 100 chars da mensagem + minuto atual
  const now = new Date();
  const minuteKey = `${now.getFullYear()}${now.getMonth()}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
  const msgKey = message.toLowerCase().replace(/\s+/g, '').substring(0, 100);
  return `${phone}_${msgKey}_${minuteKey}`;
}

// Helper function to send text via Z-API
async function sendTextToZAPI(
  phone: string,
  message: string,
  instanceId: string,
  token: string,
  clientToken?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  
  const endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  console.log(`[ZAPI-SEND] Enviando texto para ${phone}: "${message.substring(0, 50)}..."`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, message }),
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

// Helper function to send media via Z-API
async function sendMediaToZAPI(
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

  console.log(`[ZAPI-SEND] Enviando ${mediaType} para ${phone}: ${mediaUrl.substring(0, 50)}...`);
  console.log(`[ZAPI-SEND] Caption: ${caption.substring(0, 100)}...`);

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

// Helper function to send button message via Z-API
async function sendButtonMessageToZAPI(
  phone: string,
  message: string,
  buttons: { id: string; label: string }[],
  instanceId: string,
  token: string,
  clientToken?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  
  const endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-button-list`;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  console.log(`[ZAPI-SEND] Enviando botões para ${phone}: ${buttons.map(b => b.label).join(', ')}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone,
        message,
        buttonList: { buttons }
      }),
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
      console.error('[ZAPI-SEND] Z-API not configured');
      return new Response(
        JSON.stringify({ error: 'Z-API credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const payload = await req.json();

    console.log('[ZAPI-SEND] ====== NOVA REQUISIÇÃO ======');
    console.log('[ZAPI-SEND] Payload keys:', Object.keys(payload));

    // Extract phone - support multiple formats
    let phone = cleanValue(payload.phone) || cleanValue(payload.telefone) || cleanValue(payload.numero);
    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    phone = phone.replace(/\D/g, '');
    console.log(`[ZAPI-SEND] Phone: ${phone}`);

    // Extract message from user
    const userMessage = cleanValue(payload.message) || cleanValue(payload.mensagem) || cleanValue(payload.text);
    const contactName = cleanValue(payload.contact_name) || cleanValue(payload.nome_contato);
    
    // ========================================
    // DEDUPLICAÇÃO ROBUSTA: Verificar hash da mensagem + phone + minuto
    // Não depende mais do messageId do Fiqon
    // ========================================
    if (userMessage) {
      const messageHash = generateMessageHash(phone, userMessage);
      console.log(`[ZAPI-SEND] 🔐 Hash de deduplicação: ${messageHash}`);
      
      // Verificar se já processamos esta combinação no último minuto
      const { data: existingMsg } = await supabase
        .from('processed_messages')
        .select('id, created_at')
        .eq('message_id', messageHash)
        .maybeSingle();
      
      if (existingMsg) {
        console.log(`[ZAPI-SEND] ⚠️ DUPLICATA DETECTADA! Hash ${messageHash} já processado em ${existingMsg.created_at}`);
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            reason: 'duplicate_message',
            message: `Mensagem já processada (hash: ${messageHash})`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Registrar ANTES de processar para evitar race condition
      const { error: insertError } = await supabase
        .from('processed_messages')
        .insert({ 
          message_id: messageHash, 
          phone,
          created_at: new Date().toISOString() 
        });
      
      if (insertError) {
        // Se falhou por duplicata (race condition), ignorar
        if (insertError.code === '23505') {
          console.log(`[ZAPI-SEND] ⚠️ Race condition detectada, ignorando duplicata`);
          return new Response(
            JSON.stringify({
              success: true,
              skipped: true,
              reason: 'duplicate_race_condition',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.error(`[ZAPI-SEND] Erro ao registrar hash:`, insertError);
      } else {
        console.log(`[ZAPI-SEND] ✅ Hash registrado para deduplicação`);
      }
    }
    
    // Delay between messages (ms)
    const delayMs = payload.delay_ms || payload.delay || 1500;

    let alineResponse: any = null;
    let products: ProductItem[] = [];
    let textMessage: string | null = null;

    // ========================================
    // MODO 1: Processar mensagem do usuário com Aline
    // ========================================
    if (userMessage) {
      console.log(`[ZAPI-SEND] Modo: Processar mensagem do usuário com Aline`);
      console.log(`[ZAPI-SEND] Mensagem do usuário: "${userMessage}"`);
      
      // Chamar aline-reply internamente
      const alineEndpoint = `${supabaseUrl}/functions/v1/aline-reply`;
      
      try {
        const alineReq = await fetch(alineEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            phone,
            message: userMessage,
            contact_name: contactName,
          }),
        });

        if (!alineReq.ok) {
          const errorText = await alineReq.text();
          console.error('[ZAPI-SEND] Erro ao chamar aline-reply:', errorText);
          throw new Error(`aline-reply error: ${alineReq.status}`);
        }

        alineResponse = await alineReq.json();
        console.log(`[ZAPI-SEND] Aline respondeu: success=${alineResponse.success}`);
        
        // Verificar se foi pulado (human_takeover, loop, etc.)
        if (alineResponse.skipped) {
          console.log(`[ZAPI-SEND] Aline pulou: ${alineResponse.reason}`);
          return new Response(
            JSON.stringify({
              success: true,
              skipped: true,
              reason: alineResponse.reason,
              message: alineResponse.message,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Extrair mensagem de texto e produtos
        textMessage = alineResponse.mensagem_whatsapp || alineResponse.response;
        products = alineResponse.produtos || [];
        
        console.log(`[ZAPI-SEND] Texto: "${textMessage?.substring(0, 50)}..."`);
        console.log(`[ZAPI-SEND] Produtos: ${products.length}`);

      } catch (alineError) {
        console.error('[ZAPI-SEND] Erro na chamada aline-reply:', alineError);
        throw alineError;
      }
    }
    // ========================================
    // MODO 2: Enviar mensagem e produtos já processados (legacy)
    // ========================================
    else {
      console.log(`[ZAPI-SEND] Modo: Legacy (mensagem e produtos já processados)`);
      
      // Get text message
      textMessage = cleanValue(payload.mensagem) || cleanValue(payload.mensagem_whatsapp) || cleanValue(payload.texto);
      
      // Get products array
      if (Array.isArray(payload.produtos)) {
        products = payload.produtos;
      } else if (Array.isArray(payload.products)) {
        products = payload.products;
      } else if (payload.produto || payload.product) {
        products = [payload.produto || payload.product];
      }
    }

    // Validar que temos algo para enviar
    if (!textMessage && products.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No message or products to send. Provide "message" or "produtos" array.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: SendResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let textSent = false;

    // ========================================
    // ENVIAR MENSAGEM DE TEXTO (fala da Aline)
    // ========================================
    if (textMessage) {
      console.log(`[ZAPI-SEND] Enviando mensagem de texto...`);
      
      const textResult = await sendTextToZAPI(
        phone,
        textMessage,
        ZAPI_INSTANCE_ID!,
        ZAPI_TOKEN!,
        ZAPI_CLIENT_TOKEN
      );

      if (textResult.success) {
        console.log(`[ZAPI-SEND] ✅ Texto enviado: ${textResult.messageId}`);
        textSent = true;
        
        // Salvar a resposta da Aline na tabela aline_messages
        try {
          // Buscar ou criar conversa Aline
          const { data: alineConv } = await supabase
            .from('aline_conversations')
            .select('id')
            .eq('phone', phone)
            .maybeSingle();
          
          if (alineConv) {
            await supabase.from('aline_messages').insert({
              conversation_id: alineConv.id,
              role: 'assistant',
              message: textMessage,
              node: alineResponse?.node_tecnico || 'reply'
            });
            
            // Reset followup_count após resposta
            await supabase
              .from('aline_conversations')
              .update({ 
                followup_count: 0,
                last_message_at: new Date().toISOString()
              })
              .eq('id', alineConv.id);
          }
        } catch (dbError) {
          console.warn(`[ZAPI-SEND] Aviso: Não salvou mensagem Aline:`, dbError);
        }
      } else {
        console.error(`[ZAPI-SEND] ❌ Texto falhou: ${textResult.error}`);
      }

      // Aguardar antes de enviar produtos
      if (products.length > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // ========================================
    // BUSCAR PREÇOS DO BANCO - ESTRATÉGIA DEFINITIVA
    // ========================================
    const productSkus = products
      .map((p: ProductItem) => cleanValue(p.sku))
      .filter((sku: string | null): sku is string => sku !== null && sku.length > 0 && !sku.startsWith('item-'));
    
    // Mapa de preços do banco de dados
    let dbProducts: Record<string, { price: number; name: string; description: string; color: string }> = {};
    
    if (productSkus.length > 0) {
      console.log(`[ZAPI-SEND] 💰 BUSCANDO PREÇOS NO BANCO para SKUs: ${productSkus.join(', ')}`);
      
      const { data: productsFromDb, error: dbError } = await supabase
        .from('products')
        .select('sku, price, name, description, color')
        .in('sku', productSkus);
      
      if (dbError) {
        console.error(`[ZAPI-SEND] ❌ Erro ao buscar preços:`, dbError);
      } else if (productsFromDb && productsFromDb.length > 0) {
        for (const p of productsFromDb) {
          if (p.sku) {
            dbProducts[p.sku] = {
              price: p.price || 0,
              name: p.name || '',
              description: p.description || '',
              color: p.color || ''
            };
          }
        }
        console.log(`[ZAPI-SEND] ✅ PREÇOS DO BANCO:`, Object.entries(dbProducts).map(([k, v]) => `${k}: R$${v.price}`).join(' | '));
      } else {
        console.warn(`[ZAPI-SEND] ⚠️ Nenhum produto encontrado no banco para os SKUs`);
      }
    }

    // ========================================
    // ENVIAR CADA PRODUTO COM PREÇO DO BANCO
    // ========================================
    const sendVideoPriority = payload.send_video_priority !== false && payload.priorizar_video !== false;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const productIndex = i + 1;
      
      // Get SKU
      const sku = cleanValue(product.sku) || `item-${productIndex}`;
      
      // PREÇO: SEMPRE DO BANCO DE DADOS (fonte única de verdade)
      const dbData = dbProducts[sku];
      let finalPrice: number | null = dbData?.price || null;
      
      // Fallback: buscar individualmente se não encontrou
      if (finalPrice === null && sku && !sku.startsWith('item-')) {
        console.log(`[ZAPI-SEND] 🔍 Buscando preço individual para SKU: ${sku}`);
        const { data: singleProduct } = await supabase
          .from('products')
          .select('price, name')
          .eq('sku', sku)
          .maybeSingle();
        
        if (singleProduct?.price) {
          finalPrice = singleProduct.price;
          console.log(`[ZAPI-SEND] ✅ Preço individual encontrado: R$${finalPrice}`);
        }
      }
      
      // Nome do produto
      const name = cleanValue(product.name) || cleanValue(product.nome) || dbData?.name || 'Produto';
      
      // Determine media URL
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
        const isVideo = /\.(mp4|webm|mov|avi)/i.test(mediaUrlGeneric) || 
                        mediaUrlGeneric.includes('video') ||
                        (product.media_type === 'video' || product.tipo_midia === 'video');
        finalMediaUrl = mediaUrlGeneric;
        finalMediaType = isVideo ? 'video' : 'image';
      } else {
        console.warn(`[ZAPI-SEND] Produto ${productIndex} (${sku}) sem mídia, pulando...`);
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

      // ========================================
      // CONSTRUIR CAPTION COM PREÇO GARANTIDO
      // ========================================
      const captionLines: string[] = [`*${name}*`];
      
      // PREÇO PRIMEIRO - É O MAIS IMPORTANTE!
      if (finalPrice !== null && finalPrice > 0) {
        const priceFormatted = finalPrice.toFixed(2).replace('.', ',');
        captionLines.push(`💰 *R$ ${priceFormatted}*`);
        console.log(`[ZAPI-SEND] ✅ PREÇO INCLUÍDO NO CARD: ${sku} = R$${priceFormatted}`);
      } else {
        captionLines.push(`💰 *Consulte o valor*`);
        console.error(`[ZAPI-SEND] ⚠️ PRODUTO ${sku} SEM PREÇO NO BANCO!`);
      }
      
      // Cor
      const color = cleanValue(product.color) || cleanValue(product.cor) || dbData?.color;
      if (color) captionLines.push(`🎨 ${color}`);
      
      // Tamanhos
      const sizes = product.sizes || product.tamanhos || product.sizes_formatted || product.tamanhos_formatado;
      if (sizes) {
        const sizesStr = Array.isArray(sizes) ? sizes.join(', ') : String(sizes);
        if (sizesStr.trim()) captionLines.push(`📏 Tam: ${sizesStr}`);
      }
      
      // Estoque
      const stockNum = getNumber(product.stock) ?? getNumber(product.estoque);
      if (stockNum !== null && stockNum > 0) {
        captionLines.push(`✅ Pronta entrega`);
      }
      
      // SKU
      captionLines.push(`📦 Cód: ${sku}`);
      
      const caption = captionLines.join('\n');
      
      console.log(`[ZAPI-SEND] ========== CARD ${productIndex} ==========`);
      console.log(`[ZAPI-SEND] SKU: ${sku}`);
      console.log(`[ZAPI-SEND] Preço: ${finalPrice ? `R$${finalPrice}` : 'NÃO ENCONTRADO'}`);
      console.log(`[ZAPI-SEND] Caption:\n${caption}`);
      console.log(`[ZAPI-SEND] =====================================`);

      // Send to Z-API
      const sendResult = await sendMediaToZAPI(
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
        price: finalPrice || undefined,
      });

      if (sendResult.success) {
        successCount++;
        console.log(`[ZAPI-SEND] ✅ Card ${productIndex} enviado: ${sendResult.messageId}`);
      } else {
        errorCount++;
        console.error(`[ZAPI-SEND] ❌ Card ${productIndex} falhou: ${sendResult.error}`);
      }

      // Delay between products (except for last one)
      if (i < products.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // ========================================
    // ENVIAR MENSAGEM PÓS-CATÁLOGO
    // ========================================
    let postCatalogSent = false;
    
    if (successCount > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      const postCatalogMessage = alineResponse?.mensagem_pos_catalogo 
        || "Gostou de alguma? Me conta qual chamou mais sua atenção! 😊";
      
      console.log(`[ZAPI-SEND] 📝 Enviando mensagem pós-catálogo...`);
      
      const postResult = await sendTextToZAPI(
        phone,
        postCatalogMessage,
        ZAPI_INSTANCE_ID!,
        ZAPI_TOKEN!,
        ZAPI_CLIENT_TOKEN
      );
      
      if (postResult.success) {
        postCatalogSent = true;
        console.log(`[ZAPI-SEND] ✅ Mensagem pós-catálogo enviada`);
      }
    }

    // ========================================
    // ENVIAR LISTA NUMÉRICA PARA SELEÇÃO (substitui botões truncados)
    // Lista clara com número + nome completo + código
    // ========================================
    if (successCount > 0) {
      try {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // Construir lista textual com número + nome COMPLETO + código
        const listaItens = results
          .filter(r => r.success)
          .map((r, idx) => {
            const product = products[r.index - 1];
            const productName = cleanValue(product?.name) || cleanValue(product?.nome) || 'Produto';
            const preco = r.price ? `R$${r.price.toFixed(2).replace('.', ',')}` : '';
            // Nome COMPLETO, não truncado, com preço
            return `${idx + 1}️⃣ *${productName}*${preco ? ` - ${preco}` : ''}\n     📦 Cód: ${r.sku}`;
          });

        if (listaItens.length > 0) {
          const mensagemLista = `📋 *ESCOLHA O SEU:*\n\n${listaItens.join('\n\n')}\n\n✏️ _Digite o número para escolher!_`;
          
          const listResult = await sendTextToZAPI(
            phone,
            mensagemLista,
            ZAPI_INSTANCE_ID!,
            ZAPI_TOKEN!,
            ZAPI_CLIENT_TOKEN
          );
          
          if (listResult.success) {
            console.log(`[ZAPI-SEND] ✅ Lista numérica enviada com ${listaItens.length} itens`);
          }
        }
      } catch (listError) {
        console.warn(`[ZAPI-SEND] Lista falhou (não crítico):`, listError);
      }
    }

    // ========================================
    // REGISTRAR NO BANCO DE DADOS
    // ========================================
    if (successCount > 0 && alineResponse) {
      try {
        // Criar sessão de catálogo
        const { data: session } = await supabase.rpc('create_catalog_session', {
          p_phone: phone,
          p_thread_id: alineResponse.thread_id || null,
          p_categoria: alineResponse.categoria_crm || null,
          p_tipo_alianca: null,
          p_cor_preferida: alineResponse.cor_crm || null
        });
        
        if (session) {
          // Registrar cada item enviado
          for (const result of results.filter(r => r.success)) {
            const product = products[result.index - 1];
            await supabase.rpc('add_catalog_item', {
              p_session_id: session,
              p_sku: result.sku,
              p_name: cleanValue(product?.name) || cleanValue(product?.nome),
              p_price: result.price || null,
              p_image_url: result.mediaType === 'image' ? result.mediaUrl : null,
              p_video_url: result.mediaType === 'video' ? result.mediaUrl : null
            });
          }
          console.log(`[ZAPI-SEND] ✅ Sessão de catálogo registrada: ${session}`);
        }
      } catch (dbError) {
        console.warn(`[ZAPI-SEND] Aviso ao salvar sessão:`, dbError);
      }
    }

    const totalTime = Date.now() - startTime;
    
    console.log(`[ZAPI-SEND] ====== RESUMO ======`);
    console.log(`[ZAPI-SEND] Texto enviado: ${textSent}`);
    console.log(`[ZAPI-SEND] Produtos: ${successCount}/${products.length} enviados`);
    console.log(`[ZAPI-SEND] Pós-catálogo: ${postCatalogSent}`);
    console.log(`[ZAPI-SEND] Tempo total: ${totalTime}ms`);
    console.log(`[ZAPI-SEND] ====================`);

    return new Response(
      JSON.stringify({
        success: true,
        phone,
        text_sent: textSent,
        products_sent: successCount,
        products_failed: errorCount,
        post_catalog_sent: postCatalogSent,
        results,
        execution_time_ms: totalTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ZAPI-SEND] ERRO FATAL:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
