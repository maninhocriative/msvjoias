import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de nodes válidos e suas transições permitidas
const NODE_FLOW: Record<string, string[]> = {
  'abertura': ['menu_categoria'],
  'menu_categoria': ['escolha_finalidade_alianca', 'escolha_cor_pingente'],
  'escolha_finalidade_alianca': ['escolha_cor_alianca'],
  'escolha_cor_alianca': ['catalogo_alianca'],
  'escolha_cor_pingente': ['catalogo_pingente'],
  'catalogo_alianca': ['confirmacao_produto', 'menu_categoria'],
  'catalogo_pingente': ['confirmacao_produto', 'menu_categoria'],
  'confirmacao_produto': ['coleta_entrega'],
  'coleta_entrega': ['coleta_pagamento'],
  'coleta_pagamento': ['finalizado'],
  'finalizado': [],
};

// Mapeamento de ações técnicas
const SYSTEM_ACTIONS: Record<string, { type: string; filters: Record<string, string> }> = {
  'show_catalog_alianca_aco': { type: 'catalog', filters: { category: 'aliancas', color: 'prata' } },
  'show_catalog_alianca_tungstenio': { type: 'catalog', filters: { category: 'aliancas', color: 'preta' } },
  'show_catalog_alianca_dourada': { type: 'catalog', filters: { category: 'aliancas', color: 'dourada' } },
  'show_catalog_pingentes': { type: 'catalog', filters: { category: 'pingente' } },
  'register_lead_crm': { type: 'lead', filters: {} },
};

interface AlineConversation {
  id: string;
  phone: string;
  current_node: string;
  last_node: string | null;
  collected_data: Record<string, unknown>;
  status: 'active' | 'finished';
  last_message_at: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const assistantId = Deno.env.get('OPENAI_ASSISTANT_ID');

    if (!openaiApiKey || !assistantId) {
      throw new Error('OpenAI credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { phone, message, contact_name } = await req.json();

    if (!phone || !message) {
      throw new Error('phone and message are required');
    }

    console.log(`[ALINE-REPLY] Recebido: phone=${phone}, message="${message}"`);

    // ========================================
    // PASSO 1: RESOLVER CONVERSA
    // ========================================
    let conversation: AlineConversation;
    
    const { data: existingConv, error: convError } = await supabase
      .from('aline_conversations')
      .select('*')
      .eq('phone', phone)
      .eq('status', 'active')
      .single();

    if (convError && convError.code !== 'PGRST116') {
      console.error('[ALINE-REPLY] Erro ao buscar conversa:', convError);
      throw convError;
    }

    if (existingConv) {
      conversation = existingConv as AlineConversation;
      console.log(`[ALINE-REPLY] Conversa existente: node=${conversation.current_node}`);
    } else {
      const { data: newConv, error: createError } = await supabase
        .from('aline_conversations')
        .insert({
          phone,
          current_node: 'abertura',
          collected_data: { contact_name: contact_name || 'Cliente' },
          status: 'active',
        })
        .select()
        .single();

      if (createError) throw createError;
      conversation = newConv as AlineConversation;
      console.log(`[ALINE-REPLY] Nova conversa criada: id=${conversation.id}`);
    }

    // Salvar mensagem do usuário
    await supabase.from('aline_messages').insert({
      conversation_id: conversation.id,
      role: 'user',
      message,
      node: conversation.current_node,
    });

    // ========================================
    // PASSO 2: CONSTRUIR CONTEXTO PARA ALINE
    // ========================================
    const contextMessage = `
[CONTEXTO DO CRM]
current_node: ${conversation.current_node}
last_node: ${conversation.last_node || 'nenhum'}
collected_data: ${JSON.stringify(conversation.collected_data)}
contact_name: ${contact_name || conversation.collected_data?.contact_name || 'Cliente'}

[MENSAGEM DO CLIENTE]
${message}

[INSTRUÇÕES]
- Responda de acordo com o node atual
- Inclua SEMPRE o marcador #node:<nome_do_node> no final
- Se precisar executar ação técnica, inclua [SYSTEM_ACTION action:"nome_da_acao"]
- Envie apenas UMA mensagem
`;

    // ========================================
    // PASSO 3: CHAMAR ALINE (OPENAI ASSISTANT)
    // ========================================
    console.log(`[ALINE-REPLY] Chamando Assistant ID: ${assistantId}`);

    // Buscar ou criar thread
    let threadId = conversation.collected_data?.thread_id as string | undefined;
    
    if (!threadId) {
      const threadResponse = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2',
        },
        body: JSON.stringify({}),
      });
      const threadData = await threadResponse.json();
      threadId = threadData.id;
      
      // Salvar thread_id
      await supabase
        .from('aline_conversations')
        .update({ collected_data: { ...conversation.collected_data, thread_id: threadId } })
        .eq('id', conversation.id);
      
      console.log(`[ALINE-REPLY] Nova thread criada: ${threadId}`);
    }

    // Adicionar mensagem à thread
    await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
      body: JSON.stringify({
        role: 'user',
        content: contextMessage,
      }),
    });

    // Executar o assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
      body: JSON.stringify({
        assistant_id: assistantId,
      }),
    });
    
    const runText = await runResponse.text();
    console.log(`[ALINE-REPLY] Run response raw: ${runText.substring(0, 500)}`);
    
    let runData;
    try {
      runData = JSON.parse(runText);
    } catch (e) {
      console.error(`[ALINE-REPLY] Erro ao parsear run response: ${e}`);
      throw new Error(`Failed to parse run response: ${runText.substring(0, 200)}`);
    }
    
    if (runData.error) {
      console.error(`[ALINE-REPLY] OpenAI API Error: ${JSON.stringify(runData.error)}`);
      throw new Error(`OpenAI API Error: ${runData.error.message || JSON.stringify(runData.error)}`);
    }
    
    console.log(`[ALINE-REPLY] Run criado: id=${runData.id}, status=${runData.status}`);

    // Aguardar conclusão com timeout maior
    let runStatus = runData.status;
    let attempts = 0;
    const maxAttempts = 60; // 60 segundos

    while (runStatus !== 'completed' && runStatus !== 'failed' && runStatus !== 'expired' && runStatus !== 'cancelled' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runData.id}`, {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      });
      const statusData = await statusResponse.json();
      runStatus = statusData.status;
      attempts++;
      
      if (attempts % 10 === 0) {
        console.log(`[ALINE-REPLY] Polling... attempt=${attempts}, status=${runStatus}`);
      }
      
      // Se o run requer ação (tool calls), precisamos tratar
      if (runStatus === 'requires_action') {
        console.log(`[ALINE-REPLY] Run requer ação - tools: ${JSON.stringify(statusData.required_action)}`);
        // Por enquanto, cancelar runs que pedem tools (o Assistant do Playground não deveria pedir)
        break;
      }
    }

    if (runStatus !== 'completed') {
      console.error(`[ALINE-REPLY] Run não completou: status=${runStatus}, attempts=${attempts}`);
      throw new Error(`Assistant run failed with status: ${runStatus}`);
    }

    console.log(`[ALINE-REPLY] Run completado após ${attempts} tentativas`);

    // Buscar resposta
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1`, {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'OpenAI-Beta': 'assistants=v2',
      },
    });
    const messagesData = await messagesResponse.json();
    const alineResponse = messagesData.data?.[0]?.content?.[0]?.text?.value || '';

    console.log(`[ALINE-REPLY] Resposta da Aline: ${alineResponse.substring(0, 200)}...`);

    // ========================================
    // PASSO 4: INTERPRETAR RESPOSTA
    // ========================================
    
    // Extrair #node
    const nodeMatch = alineResponse.match(/#node[:\s]*(\w+)/i);
    const extractedNode = nodeMatch ? nodeMatch[1] : conversation.current_node;
    
    // Extrair SYSTEM_ACTION
    const actionMatch = alineResponse.match(/\[SYSTEM_ACTION\s+action[:\s]*["']?(\w+)["']?\]/i);
    const systemAction = actionMatch ? actionMatch[1] : null;

    // Limpar texto da resposta (remover marcadores técnicos)
    let replyText = alineResponse
      .replace(/#node[:\s]*\w+/gi, '')
      .replace(/\[SYSTEM_ACTION[^\]]+\]/gi, '')
      .replace(/\[CONTEXTO[^\]]*\]/gi, '')
      .trim();

    console.log(`[ALINE-REPLY] Node extraído: ${extractedNode}, Action: ${systemAction}`);

    // ========================================
    // PASSO 5: DETECÇÃO AUTOMÁTICA DE NODE
    // ========================================
    let validatedNode = extractedNode;
    
    // Se o Assistant não retornou #node, inferir baseado no conteúdo
    if (!nodeMatch) {
      console.log(`[ALINE-REPLY] Node não detectado, inferindo do conteúdo...`);
      const replyLower = replyText.toLowerCase();
      
      if (replyLower.includes('alianças') && replyLower.includes('pingentes') && (replyLower.includes('1️⃣') || replyLower.includes('menu'))) {
        validatedNode = 'menu_categoria';
      } else if (replyLower.includes('namoro') || replyLower.includes('casamento') || replyLower.includes('momento especial')) {
        validatedNode = 'escolha_finalidade_alianca';
      } else if ((replyLower.includes('cor') || replyLower.includes('material')) && (replyLower.includes('prata') || replyLower.includes('dourada') || replyLower.includes('preta'))) {
        validatedNode = 'escolha_cor_alianca';
      } else if (replyLower.includes('catálogo') || replyLower.includes('opções') || replyLower.includes('modelos')) {
        validatedNode = 'catalogo_alianca';
      } else if (replyLower.includes('entrega') || replyLower.includes('envio') || replyLower.includes('retirada')) {
        validatedNode = 'coleta_entrega';
      } else if (replyLower.includes('pagamento') || replyLower.includes('pix') || replyLower.includes('cartão')) {
        validatedNode = 'coleta_pagamento';
      } else if (replyLower.includes('vendedor') || replyLower.includes('humano') || replyLower.includes('atendimento')) {
        validatedNode = 'finalizado';
      }
      
      console.log(`[ALINE-REPLY] Node inferido: ${validatedNode}`);
    }
    
    // Verificar se a transição é válida (permitir avanço livre)
    const allowedTransitions = NODE_FLOW[conversation.current_node] || [];
    if (extractedNode !== conversation.current_node && !allowedTransitions.includes(validatedNode) && validatedNode !== conversation.current_node) {
      console.warn(`[ALINE-REPLY] Transição não mapeada: ${conversation.current_node} -> ${validatedNode}, permitindo...`);
      // Permitir transições não mapeadas se o Assistant indicou
    }

    // ========================================
    // PASSO 6: COLETAR DADOS DO USUÁRIO
    // ========================================
    const newCollectedData: Record<string, unknown> = {
      ...conversation.collected_data,
      thread_id: threadId,
    };

    const normalizedMsg = message.toLowerCase().trim();
    const currentNode = conversation.current_node;

    // Coletar categoria APENAS quando estiver no node correto (abertura ou menu_categoria)
    if (currentNode === 'abertura' || currentNode === 'menu_categoria' || currentNode.includes('escolha_tipo')) {
      const categoryMap: Record<string, string> = {
        '1': 'aliancas', 'aliança': 'aliancas', 'aliancas': 'aliancas', 'alianças': 'aliancas',
        '2': 'pingente', 'pingente': 'pingente', 'pingentes': 'pingente',
      };
      if (categoryMap[normalizedMsg]) {
        newCollectedData.categoria = categoryMap[normalizedMsg];
        console.log(`[ALINE-REPLY] Categoria coletada: ${categoryMap[normalizedMsg]} (node: ${currentNode})`);
      }
    }

    // Coletar finalidade APENAS no node de escolha de finalidade
    if (currentNode.includes('finalidade')) {
      const finalidadeMap: Record<string, string> = {
        '1': 'namoro', 'namoro': 'namoro', 'compromisso': 'namoro',
        '2': 'casamento', 'casamento': 'casamento',
      };
      if (finalidadeMap[normalizedMsg]) {
        newCollectedData.finalidade = finalidadeMap[normalizedMsg];
        console.log(`[ALINE-REPLY] Finalidade coletada: ${finalidadeMap[normalizedMsg]}`);
      }
    }

    // Coletar cor APENAS no node de escolha de cor
    if (currentNode.includes('cor') || currentNode.includes('escolha_cor')) {
      const colorMap: Record<string, string> = {
        '1': 'dourada', 'dourada': 'dourada', 'dourado': 'dourada',
        '2': 'prata', 'prata': 'prata', 'aço': 'prata',
        '3': 'preta', 'preta': 'preta', 'tungstênio': 'preta',
        '4': 'azul', 'azul': 'azul',
      };
      if (colorMap[normalizedMsg]) {
        newCollectedData.cor = colorMap[normalizedMsg];
        console.log(`[ALINE-REPLY] Cor coletada: ${colorMap[normalizedMsg]}`);
      }
    }

    // Coletar produto escolhido (quando estiver no node de catálogo ou confirmação)
    if (currentNode.includes('catalogo') || validatedNode.includes('confirmacao')) {
      // Tentar identificar o produto escolhido pelo número ou nome
      const productIndex = parseInt(normalizedMsg) - 1;
      const lastCatalog = (conversation.collected_data?.last_catalog as any[]) || [];
      
      if (!isNaN(productIndex) && productIndex >= 0 && productIndex < lastCatalog.length) {
        const selectedProduct = lastCatalog[productIndex];
        newCollectedData.selected_product = selectedProduct;
        newCollectedData.selected_sku = selectedProduct.sku;
        newCollectedData.selected_name = selectedProduct.name;
        newCollectedData.selected_price = selectedProduct.price;
        console.log(`[ALINE-REPLY] Produto selecionado: ${selectedProduct.name}`);
      }
    }

    // Coletar método de entrega
    if (currentNode.includes('entrega') || currentNode.includes('coleta_entrega')) {
      const entregaMap: Record<string, string> = {
        '1': 'retirada', 'retirada': 'retirada', 'loja': 'retirada',
        '2': 'entrega', 'entrega': 'entrega', 'envio': 'entrega', 'correios': 'entrega',
      };
      if (entregaMap[normalizedMsg]) {
        newCollectedData.delivery_method = entregaMap[normalizedMsg];
        console.log(`[ALINE-REPLY] Método de entrega: ${entregaMap[normalizedMsg]}`);
      } else if (normalizedMsg.length > 10) {
        // Se for texto longo, provavelmente é endereço
        newCollectedData.delivery_address = message;
        newCollectedData.delivery_method = 'entrega';
        console.log(`[ALINE-REPLY] Endereço coletado`);
      }
    }

    // Coletar método de pagamento
    if (currentNode.includes('pagamento') || currentNode.includes('coleta_pagamento')) {
      const pagamentoMap: Record<string, string> = {
        '1': 'pix', 'pix': 'pix',
        '2': 'cartao', 'cartao': 'cartao', 'cartão': 'cartao', 'credito': 'cartao', 'crédito': 'cartao',
        '3': 'dinheiro', 'dinheiro': 'dinheiro', 'espécie': 'dinheiro',
      };
      if (pagamentoMap[normalizedMsg]) {
        newCollectedData.payment_method = pagamentoMap[normalizedMsg];
        console.log(`[ALINE-REPLY] Método de pagamento: ${pagamentoMap[normalizedMsg]}`);
      }
    }

    // ========================================
    // PASSO 7: EXECUTAR SYSTEM_ACTION OU BUSCAR CATÁLOGO AUTOMATICAMENTE
    // ========================================
    const actionsExecuted: Record<string, unknown>[] = [];
    let catalogProducts: unknown[] = [];

    // Verificar se devemos buscar catálogo (pelo node ou pela action)
    const shouldFetchCatalog = validatedNode.includes('catalogo') || 
                               replyText.toLowerCase().includes('buscar no nosso catálogo');
    
    if (shouldFetchCatalog || (systemAction && SYSTEM_ACTIONS[systemAction]?.type === 'catalog')) {
      // Usar cor coletada do usuário
      const userColor = (newCollectedData.cor as string) || null;
      const categoria = (newCollectedData.categoria as string) || 'aliancas';
      
      console.log(`[ALINE-REPLY] Buscando catálogo: categoria=${categoria}, cor=${userColor}`);
      
      // Buscar catálogo baseado nos dados coletados
      let query = supabase
        .from('products')
        .select(`
          id, name, sku, price, image_url, video_url, category, color,
          product_variants(size, stock)
        `)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(10);
      
      // Filtrar por categoria
      if (categoria) {
        query = query.ilike('category', `%${categoria}%`);
      }
      
      const { data: products, error: prodError } = await query;

      if (!prodError && products) {
        // Filtrar por cor se especificado
        catalogProducts = userColor
          ? products.filter(p => p.color?.toLowerCase().includes(userColor.toLowerCase()))
          : products;

        // Salvar catálogo enviado para referência futura
        newCollectedData.last_catalog = catalogProducts.map((p: any) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          price: p.price,
        }));

        actionsExecuted.push({
          action: systemAction || 'auto_catalog',
          type: 'catalog',
          products_count: catalogProducts.length,
          filters: { category: categoria, color: userColor },
        });
        console.log(`[ALINE-REPLY] Catálogo encontrado: ${catalogProducts.length} produtos`);
      }
    } else if (systemAction && SYSTEM_ACTIONS[systemAction]?.type === 'lead') {
      // Registrar lead
      actionsExecuted.push({
        action: systemAction,
        type: 'lead',
        collected_data: newCollectedData,
      });

      // Atualizar status para finalizado
      validatedNode = 'finalizado';
    }

    // ========================================
    // PASSO 7.1: FINALIZAR PEDIDO E GRAVAR NO CRM
    // ========================================
    if (validatedNode === 'finalizado' && newCollectedData.selected_product) {
      console.log(`[ALINE-REPLY] Finalizando pedido...`);
      
      const selectedProduct = newCollectedData.selected_product as any;
      const deliveryMethod = (newCollectedData.delivery_method as string) || 'retirada';
      const paymentMethod = (newCollectedData.payment_method as string) || 'pix';
      const deliveryAddress = (newCollectedData.delivery_address as string) || null;
      const customerName = (newCollectedData.contact_name as string) || 'Cliente';
      
      // Criar resumo do pedido
      const summaryText = `
📋 *NOVO PEDIDO VIA ALINE*

👤 Cliente: ${customerName}
📱 WhatsApp: ${phone}

🛍️ Produto: ${selectedProduct.name}
🏷️ SKU: ${selectedProduct.sku || 'N/A'}
💰 Valor: R$ ${selectedProduct.price?.toFixed(2) || '0,00'}

🚚 Entrega: ${deliveryMethod === 'retirada' ? 'Retirada na loja' : 'Envio'}
${deliveryAddress ? `📍 Endereço: ${deliveryAddress}` : ''}
💳 Pagamento: ${paymentMethod.toUpperCase()}

📊 Dados coletados:
- Categoria: ${newCollectedData.categoria || 'N/A'}
- Cor: ${newCollectedData.cor || 'N/A'}
- Finalidade: ${newCollectedData.finalidade || 'N/A'}

⏰ Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}
      `.trim();

      // Gravar pedido no banco
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_phone: phone,
          customer_name: customerName,
          product_id: selectedProduct.id || null,
          selected_sku: selectedProduct.sku,
          selected_name: selectedProduct.name,
          unit_price: selectedProduct.price || 0,
          total_price: selectedProduct.price || 0,
          quantity: 1,
          delivery_method: deliveryMethod,
          delivery_address: deliveryAddress,
          payment_method: paymentMethod,
          source: 'aline',
          status: 'pending',
          summary_text: summaryText,
          notes: `Conversa ID: ${conversation.id}`,
        })
        .select()
        .single();

      if (orderError) {
        console.error(`[ALINE-REPLY] Erro ao gravar pedido:`, orderError);
      } else {
        console.log(`[ALINE-REPLY] Pedido gravado: ${orderData.id}`);
        newCollectedData.order_id = orderData.id;
        
        actionsExecuted.push({
          action: 'create_order',
          type: 'order',
          order_id: orderData.id,
        });
      }

      // Buscar número de notificação da Acium
      const { data: notifSetting } = await supabase
        .from('store_settings')
        .select('value')
        .eq('key', 'notification_whatsapp')
        .maybeSingle();
      
      const aciumPhone = notifSetting?.value || '5592984145531';
      
      // Enviar resumo para o WhatsApp da Acium
      try {
        await fetch(`${supabaseUrl}/functions/v1/automation-send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: aciumPhone,
            message: summaryText,
          }),
        });
        console.log(`[ALINE-REPLY] Resumo enviado para Acium: ${aciumPhone}`);
        
        actionsExecuted.push({
          action: 'notify_acium',
          type: 'notification',
          phone: aciumPhone,
        });
      } catch (notifError) {
        console.error(`[ALINE-REPLY] Erro ao notificar Acium:`, notifError);
      }
    }


    // Atualizar conversa
    await supabase
      .from('aline_conversations')
      .update({
        current_node: validatedNode,
        last_node: conversation.current_node,
        collected_data: newCollectedData,
        status: validatedNode === 'finalizado' ? 'finished' : 'active',
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    // Salvar mensagem da Aline
    await supabase.from('aline_messages').insert({
      conversation_id: conversation.id,
      role: 'aline',
      message: replyText,
      node: validatedNode,
      actions_executed: actionsExecuted.length > 0 ? actionsExecuted : null,
    });

    // ========================================
    // PASSO 7.5: ENVIAR AUTOMATICAMENTE VIA AUTOMATION-SEND
    // ========================================
    let sendResult = null;
    
    if (catalogProducts.length > 0 || replyText) {
      console.log(`[ALINE-REPLY] Enviando via automation-send: texto="${replyText.substring(0, 50)}...", produtos=${catalogProducts.length}`);
      
      try {
        // Preparar produtos para envio
        const productsForSend = catalogProducts.map((p: any) => ({
          sku: p.sku || 'N/A',
          name: p.name,
          price: p.price,
          image_url: p.image_url,
          video_url: p.video_url,
          sizes: p.product_variants?.filter((v: any) => v.stock > 0)?.map((v: any) => ({
            size: v.size,
            stock: v.stock,
          })) || [],
        }));

        // Chamar automation-send
        const automationPayload = {
          phone,
          message: replyText,
          products: productsForSend.length > 0 ? productsForSend : undefined,
          send_video_priority: true,
        };

        const automationResponse = await fetch(`${supabaseUrl}/functions/v1/automation-send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(automationPayload),
        });

        const automationResult = await automationResponse.json();
        sendResult = automationResult;
        
        console.log(`[ALINE-REPLY] automation-send result: ${JSON.stringify(automationResult).substring(0, 200)}`);
        
        if (!automationResult.success) {
          console.error(`[ALINE-REPLY] Erro no automation-send: ${automationResult.error}`);
        } else {
          actionsExecuted.push({
            action: 'automation_send',
            type: 'send',
            messages_sent: automationResult.results?.length || 1,
            products_sent: productsForSend.length,
          });
          
          // ========================================
          // MENSAGEM DE FOLLOW-UP APÓS CATÁLOGO
          // ========================================
          if (productsForSend.length > 0) {
            // Aguardar um pouco para não sobrecarregar
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const followUpMessage = `Esses são alguns modelos que separei para você! 💍\n\nQual deles chamou mais a sua atenção? Me diz o número ou o nome do modelo que você gostou que eu te conto mais sobre ele! 😊`;
            
            await fetch(`${supabaseUrl}/functions/v1/automation-send`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                phone,
                message: followUpMessage,
              }),
            });
            
            // Salvar mensagem de follow-up
            await supabase.from('aline_messages').insert({
              conversation_id: conversation.id,
              role: 'aline',
              message: followUpMessage,
              node: validatedNode,
            });
            
            console.log(`[ALINE-REPLY] Mensagem de follow-up enviada`);
          }
        }
      } catch (sendError) {
        console.error(`[ALINE-REPLY] Erro ao chamar automation-send:`, sendError);
        sendResult = { success: false, error: sendError instanceof Error ? sendError.message : 'Unknown error' };
      }
    }

    // ========================================
    // PASSO 8: RETORNAR RESPOSTA
    // ========================================
    const response = {
      success: true,
      reply_text: replyText,
      node: validatedNode,
      last_node: conversation.current_node,
      actions_executed: actionsExecuted,
      conversation_status: validatedNode === 'finalizado' ? 'finished' : 'active',
      collected_data: newCollectedData,
      // Resultado do envio automático
      send_result: sendResult,
      // Produtos encontrados (para referência)
      produtos: catalogProducts.map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        image_url: p.image_url,
        video_url: p.video_url,
        category: p.category,
        color: p.color,
        variants: p.product_variants,
      })),
    };

    console.log(`[ALINE-REPLY] Resposta final: node=${validatedNode}, actions=${actionsExecuted.length}, produtos=${catalogProducts.length}, enviado=${sendResult?.success || false}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ALINE-REPLY] Erro:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
