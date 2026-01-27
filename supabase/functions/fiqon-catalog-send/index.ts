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
}

// Helper to clean nil/null values from Fiqon (ONLY for strings!)
function cleanValue(val: any): string | null {
  if (val === null || val === undefined) return null;
  // Se for número, retornar como string
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

  console.log(`[FIQON-SEND] Enviando texto para ${phone}: "${message.substring(0, 50)}..."`);

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

  console.log(`[FIQON-SEND] Enviando ${mediaType} para ${phone}: ${mediaUrl.substring(0, 50)}...`);

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

// Helper function to send button message via Z-API (para seleção rápida)
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

  console.log(`[FIQON-SEND] Enviando botões para ${phone}: ${buttons.map(b => b.label).join(', ')}`);

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
      console.error('[FIQON-SEND] Z-API not configured');
      return new Response(
        JSON.stringify({ error: 'Z-API credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const payload = await req.json();

    console.log('[FIQON-SEND] ====== NOVA REQUISIÇÃO ======');
    console.log('[FIQON-SEND] Payload keys:', Object.keys(payload));

    // Extract phone - support multiple formats
    let phone = cleanValue(payload.phone) || cleanValue(payload.telefone) || cleanValue(payload.numero);
    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    phone = phone.replace(/\D/g, '');
    console.log(`[FIQON-SEND] Phone: ${phone}`);

    // Extract message from user
    const userMessage = cleanValue(payload.message) || cleanValue(payload.mensagem) || cleanValue(payload.text);
    const contactName = cleanValue(payload.contact_name) || cleanValue(payload.nome_contato);
    
    // Delay between messages (ms)
    const delayMs = payload.delay_ms || payload.delay || 1500;

    let alineResponse: any = null;
    let products: ProductItem[] = [];
    let textMessage: string | null = null;

    // ========================================
    // MODO 1: Processar mensagem do usuário com Aline
    // ========================================
    if (userMessage) {
      console.log(`[FIQON-SEND] Modo: Processar mensagem do usuário com Aline`);
      console.log(`[FIQON-SEND] Mensagem do usuário: "${userMessage}"`);
      
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
          console.error('[FIQON-SEND] Erro ao chamar aline-reply:', errorText);
          throw new Error(`aline-reply error: ${alineReq.status}`);
        }

        alineResponse = await alineReq.json();
        console.log(`[FIQON-SEND] Aline respondeu: success=${alineResponse.success}`);
        
        // Verificar se foi pulado (human_takeover, loop, etc.)
        if (alineResponse.skipped) {
          console.log(`[FIQON-SEND] Aline pulou: ${alineResponse.reason}`);
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
        
        console.log(`[FIQON-SEND] Texto: "${textMessage?.substring(0, 50)}..."`);
        console.log(`[FIQON-SEND] Produtos: ${products.length}`);

      } catch (alineError) {
        console.error('[FIQON-SEND] Erro na chamada aline-reply:', alineError);
        throw alineError;
      }
    }
    // ========================================
    // MODO 2: Enviar mensagem e produtos já processados (legacy)
    // ========================================
    else {
      console.log(`[FIQON-SEND] Modo: Legacy (mensagem e produtos já processados)`);
      
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
      console.log(`[FIQON-SEND] Enviando mensagem de texto...`);
      
      const textResult = await sendTextToZAPI(
        phone,
        textMessage,
        ZAPI_INSTANCE_ID!,
        ZAPI_TOKEN!,
        ZAPI_CLIENT_TOKEN
      );

      if (textResult.success) {
        console.log(`[FIQON-SEND] ✅ Texto enviado: ${textResult.messageId}`);
        textSent = true;
      } else {
        console.error(`[FIQON-SEND] ❌ Texto falhou: ${textResult.error}`);
      }

      // Aguardar antes de enviar produtos
      if (products.length > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // ========================================
    // ENVIAR CADA PRODUTO (com iteração correta)
    // ========================================
    const sendVideoPriority = payload.send_video_priority !== false && payload.priorizar_video !== false;

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
        const isVideo = /\.(mp4|webm|mov|avi)/i.test(mediaUrlGeneric) || 
                        mediaUrlGeneric.includes('video') ||
                        (product.media_type === 'video' || product.tipo_midia === 'video');
        finalMediaUrl = mediaUrlGeneric;
        finalMediaType = isVideo ? 'video' : 'image';
      } else {
        console.warn(`[FIQON-SEND] Produto ${productIndex} (${sku}) sem mídia, pulando...`);
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

      // SEMPRE construir caption completo - não confiar no caption pré-formatado
      const captionLines: string[] = [`*${name}*`];
      
      // Descrição - SEMPRE incluir se existir
      const desc = cleanValue(product.description) || cleanValue(product.descricao);
      if (desc) {
        captionLines.push(desc);
      }
      
      // Preço - CRÍTICO: Tentar TODOS os campos possíveis
      // Campos possíveis: price, preco, price_formatted, preco_formatado
      let priceNum = getNumber(product.price);
      if (priceNum === null) priceNum = getNumber(product.preco);
      
      let priceFormatted = cleanValue(product.price_formatted);
      if (!priceFormatted) priceFormatted = cleanValue(product.preco_formatado);
      
      console.log(`[FIQON-SEND] 💰 Produto ${sku} - TODOS CAMPOS:`);
      console.log(`[FIQON-SEND]   price: ${JSON.stringify(product.price)}`);
      console.log(`[FIQON-SEND]   preco: ${JSON.stringify(product.preco)}`);
      console.log(`[FIQON-SEND]   price_formatted: ${JSON.stringify(product.price_formatted)}`);
      console.log(`[FIQON-SEND]   preco_formatado: ${JSON.stringify(product.preco_formatado)}`);
      console.log(`[FIQON-SEND]   priceNum calculado: ${priceNum}`);
      console.log(`[FIQON-SEND]   priceFormatted calculado: ${priceFormatted}`);
      
      // PRIORIDADE: price_formatted > priceNum > nenhum
      if (priceFormatted && priceFormatted !== 'null' && priceFormatted !== 'undefined' && !priceFormatted.includes('null')) {
        // Garantir que o formato está correto (começar com R$)
        if (!priceFormatted.startsWith('R$')) {
          captionLines.push(`💰 *R$ ${priceFormatted}*`);
        } else {
          captionLines.push(`💰 *${priceFormatted}*`);
        }
      } else if (priceNum !== null && priceNum >= 0) {
        // IMPORTANTE: Aceitar priceNum >= 0 (antes era > 0, o que excluía preços legítimos!)
        captionLines.push(`💰 *R$ ${priceNum.toFixed(2).replace('.', ',')}*`);
      } else {
        console.error(`[FIQON-SEND] ❌ PRODUTO ${sku} SEM PREÇO! Todo o objeto:`);
        console.error(`[FIQON-SEND]   ${JSON.stringify(product).substring(0, 500)}`);
        // Ainda assim, adicionar uma linha indicando que não tem preço
        captionLines.push(`💰 Consulte o preço`);
      }
      
      // Cor
      const color = cleanValue(product.color) || cleanValue(product.cor);
      if (color) captionLines.push(`🎨 Cor: ${color}`);
      
      // Tamanhos
      const sizes = product.sizes || product.tamanhos || product.sizes_formatted || product.tamanhos_formatado;
      if (sizes) {
        const sizesStr = Array.isArray(sizes) ? sizes.join(', ') : String(sizes);
        if (sizesStr.trim()) captionLines.push(`📏 Tamanhos: ${sizesStr}`);
      }
      
      // Estoque
      const stockNum = getNumber(product.stock) ?? getNumber(product.estoque);
      if (stockNum !== null && stockNum >= 0) {
        captionLines.push(stockNum > 0 ? `✅ Em estoque` : `⚠️ Sob consulta`);
      }
      
      // SKU
      captionLines.push(`📦 Cód: ${sku}`);
      
      const caption = captionLines.join('\n');
      
      console.log(`[FIQON-SEND] ✅ Caption FINAL gerado: ${caption}`);

      console.log(`[FIQON-SEND] Produto ${productIndex}/${products.length}: ${name}`);
      console.log(`[FIQON-SEND]   SKU: ${sku}`);
      console.log(`[FIQON-SEND]   Tipo: ${finalMediaType}`);
      console.log(`[FIQON-SEND]   URL: ${finalMediaUrl.substring(0, 80)}...`);

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
      });

      if (sendResult.success) {
        successCount++;
        console.log(`[FIQON-SEND] ✅ Produto ${productIndex} enviado: ${sendResult.messageId}`);
      } else {
        errorCount++;
        console.error(`[FIQON-SEND] ❌ Produto ${productIndex} falhou: ${sendResult.error}`);
      }

      // Delay between products (except for last one)
      if (i < products.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // ========================================
    // ENVIAR MENSAGEM PÓS-CATÁLOGO (CRÍTICO para engajamento!)
    // A Aline PRECISA perguntar algo após enviar o catálogo
    // ========================================
    let postCatalogSent = false;
    
    if (successCount > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs)); // Delay após produtos
      
      // Pegar a mensagem pós-catálogo da Aline OU usar uma padrão
      const postCatalogMessage = alineResponse?.mensagem_pos_catalogo 
        || "Gostou de alguma? Me conta qual chamou mais sua atenção! 😊";
      
      console.log(`[FIQON-SEND] 📝 Enviando mensagem pós-catálogo: "${postCatalogMessage}"`);
      
      const postResult = await sendTextToZAPI(
        phone,
        postCatalogMessage,
        ZAPI_INSTANCE_ID!,
        ZAPI_TOKEN!,
        ZAPI_CLIENT_TOKEN
      );
      
      if (postResult.success) {
        postCatalogSent = true;
        console.log(`[FIQON-SEND] ✅ Mensagem pós-catálogo enviada: ${postResult.messageId}`);
      } else {
        console.error(`[FIQON-SEND] ❌ Mensagem pós-catálogo falhou: ${postResult.error}`);
      }
    }

    // ========================================
    // ENVIAR BOTÕES DE SELEÇÃO RÁPIDA (OPCIONAL - após mensagem pós-catálogo)
    // ========================================
    if (successCount > 0 && successCount <= 5) {
      // Só enviar botões se temos 1-5 produtos (limite do WhatsApp)
      try {
        await new Promise(resolve => setTimeout(resolve, delayMs)); // Delay antes dos botões
        
        // Criar botões para cada produto enviado
        const buttons = results
          .filter(r => r.success)
          .slice(0, 3) // Máximo 3 botões no WhatsApp
          .map((r, idx) => {
            const product = products[r.index - 1];
            const productName = cleanValue(product?.name) || cleanValue(product?.nome) || 'Produto';
            // Truncar nome para caber no botão (limite ~20 chars)
            const shortName = productName.length > 18 ? productName.substring(0, 15) + '...' : productName;
            return {
              id: `select_${r.sku}`,
              label: `${idx + 1}️⃣ ${shortName}`
            };
          });

        if (buttons.length > 0) {
          const buttonMessage = `Clique para escolher rapidamente:`;
          
          const buttonResult = await sendButtonMessageToZAPI(
            phone,
            buttonMessage,
            buttons,
            ZAPI_INSTANCE_ID!,
            ZAPI_TOKEN!,
            ZAPI_CLIENT_TOKEN
          );
          
          if (buttonResult.success) {
            console.log(`[FIQON-SEND] ✅ Botões de seleção enviados: ${buttonResult.messageId}`);
          } else {
            console.warn(`[FIQON-SEND] ⚠️ Botões falharam (não crítico): ${buttonResult.error}`);
          }
        }
      } catch (buttonError) {
        console.warn(`[FIQON-SEND] ⚠️ Erro ao enviar botões (não crítico):`, buttonError);
        // Não bloqueia o fluxo se os botões falharem
      }
    }

    // ========================================
    // SALVAR NO CRM E ALINE_MESSAGES (CRÍTICO para follow-up!)
    // ========================================
    if (payload.save_to_crm !== false) {
      try {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_number', phone)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const conversationId = conv?.id;
        
        if (conversationId) {
          // Salvar mensagem de texto da Aline
          if (textMessage && textSent) {
            await supabase.from('messages').insert({
              conversation_id: conversationId,
              content: textMessage,
              message_type: 'text',
              is_from_me: true,
              status: 'sent',
            });
          }

          // Salvar CADA produto como mensagem separada com media_url
          for (const result of results) {
            if (result.success && result.mediaUrl) {
              const product = products[result.index - 1];
              const productName = cleanValue(product?.name) || cleanValue(product?.nome) || 'Produto';
              const sku = result.sku;
              
              await supabase.from('messages').insert({
                conversation_id: conversationId,
                content: `*${productName}*\n📦 Cód: ${sku}`,
                message_type: result.mediaType === 'video' ? 'video' : 'image',
                media_url: result.mediaUrl,
                is_from_me: true,
                status: 'sent',
              });
            }
          }

          // Atualizar última mensagem da conversa
          if (products.length > 0) {
            await supabase.from('conversations').update({
              last_message: `[Catálogo: ${successCount} produtos enviados]`,
            }).eq('id', conversationId);
          }
        }

        // ==============================================
        // CRÍTICO: Salvar no aline_messages para follow-up funcionar!
        // O aline-followup verifica se a última mensagem é do assistant
        // ==============================================
        const { data: alineConv } = await supabase
          .from('aline_conversations')
          .select('id, current_node')
          .eq('phone', phone)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (alineConv) {
          // Salvar mensagem inicial da Aline
          if (textSent && textMessage) {
            await supabase.from('aline_messages').insert({
              conversation_id: alineConv.id,
              role: 'assistant',
              message: textMessage,
              node: alineConv.current_node,
            });
            console.log(`[FIQON-SEND] ✅ Texto inicial salvo em aline_messages`);
          }
          
          // CRÍTICO: Salvar mensagem pós-catálogo também!
          // Esta é a ÚLTIMA mensagem da Aline, então é a que importa para follow-up
          if (postCatalogSent) {
            const postCatalogMessage = alineResponse?.mensagem_pos_catalogo 
              || "Gostou de alguma? Me conta qual chamou mais sua atenção! 😊";
            
            await supabase.from('aline_messages').insert({
              conversation_id: alineConv.id,
              role: 'assistant',
              message: postCatalogMessage,
              node: 'catalogo',
            });
            console.log(`[FIQON-SEND] ✅ Mensagem pós-catálogo salva em aline_messages`);
          }

          // Atualizar last_message_at para recalcular follow-up
          await supabase.from('aline_conversations').update({
            last_message_at: new Date().toISOString(),
            followup_count: 0, // Reset follow-up count após enviar catálogo
          }).eq('id', alineConv.id);
          
          console.log(`[FIQON-SEND] ✅ aline_conversation atualizada (last_message_at, followup_count=0)`);
        } else {
          console.warn(`[FIQON-SEND] ⚠️ Não encontrou aline_conversation para phone=${phone}`);
        }

      } catch (crmError) {
        console.warn('[FIQON-SEND] Erro ao salvar no CRM:', crmError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[FIQON-SEND] ====== CONCLUÍDO ======`);
    console.log(`[FIQON-SEND] Texto: ${textSent ? 'OK' : 'N/A'}, Produtos: ${successCount}/${products.length}, Duração: ${duration}ms`);

    // ========================================
    // RESPOSTA FINAL (inclui dados da Aline se processou)
    // ========================================
    return new Response(
      JSON.stringify({
        success: true,
        phone,
        
        // Envio de texto
        text_sent: textSent,
        text_message: textMessage,
        
        // Envio de produtos
        total_products: products.length,
        products_sent: successCount,
        products_failed: errorCount,
        results,
        
        // Dados da Aline (se processou)
        aline: alineResponse ? {
          node: alineResponse.node_tecnico,
          action: alineResponse.acao_nome,
          has_action: alineResponse.tem_acao,
          categoria: alineResponse.categoria_crm,
          cor: alineResponse.cor_crm,
          memoria: alineResponse.memoria,
          tamanhos: alineResponse.tamanhos,
        } : null,
        
        // Tempo de execução
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FIQON-SEND] Erro geral:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
