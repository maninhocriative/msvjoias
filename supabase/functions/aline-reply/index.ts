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
    const runData = await runResponse.json();
    console.log(`[ALINE-REPLY] Run criado: ${runData.id}, status: ${runData.status}`);

    // Aguardar conclusão com timeout maior
    let runStatus = runData.status;
    let attempts = 0;
    const maxAttempts = 60; // 60 segundos

    while (runStatus !== 'completed' && runStatus !== 'failed' && runStatus !== 'expired' && attempts < maxAttempts) {
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
      
      if (attempts % 5 === 0) {
        console.log(`[ALINE-REPLY] Aguardando... attempt=${attempts}, status=${runStatus}`);
      }
    }

    if (runStatus !== 'completed') {
      console.error(`[ALINE-REPLY] Run falhou: status=${runStatus}, attempts=${attempts}`);
      throw new Error(`Assistant run failed: ${runStatus}`);
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
    // PASSO 5: ANTI-LOOP E VALIDAÇÃO
    // ========================================
    let validatedNode = extractedNode;
    
    // Verificar se a transição é válida
    const allowedTransitions = NODE_FLOW[conversation.current_node] || [];
    if (extractedNode !== conversation.current_node && !allowedTransitions.includes(extractedNode)) {
      console.warn(`[ALINE-REPLY] Transição inválida: ${conversation.current_node} -> ${extractedNode}`);
      // Manter no node atual se transição inválida
      validatedNode = conversation.current_node;
    }

    // Anti-loop: detectar repetição excessiva
    const { data: recentMessages } = await supabase
      .from('aline_messages')
      .select('node')
      .eq('conversation_id', conversation.id)
      .eq('role', 'aline')
      .order('created_at', { ascending: false })
      .limit(3);

    const sameNodeCount = recentMessages?.filter(m => m.node === validatedNode).length || 0;
    if (sameNodeCount >= 2 && validatedNode === conversation.current_node) {
      console.warn(`[ALINE-REPLY] Detectado loop no node: ${validatedNode}`);
      // Forçar avanço ou mensagem de escape
      if (allowedTransitions.length > 0) {
        validatedNode = allowedTransitions[0];
        replyText = 'Desculpe, parece que tivemos uma confusão. Vamos continuar de onde paramos.';
      }
    }

    // ========================================
    // PASSO 6: EXECUTAR SYSTEM_ACTION
    // ========================================
    const actionsExecuted: Record<string, unknown>[] = [];
    let catalogProducts: unknown[] = [];

    if (systemAction && SYSTEM_ACTIONS[systemAction]) {
      const actionConfig = SYSTEM_ACTIONS[systemAction];
      console.log(`[ALINE-REPLY] Executando action: ${systemAction}`, actionConfig);

      if (actionConfig.type === 'catalog') {
        // Buscar catálogo
        const { data: products, error: prodError } = await supabase
          .from('products')
          .select(`
            id, name, sku, price, image_url, video_url, category, color,
            product_variants(size, stock)
          `)
          .eq('active', true)
          .ilike('category', `%${actionConfig.filters.category || ''}%`)
          .order('created_at', { ascending: false })
          .limit(10);

        if (!prodError && products) {
          // Filtrar por cor se especificado
          catalogProducts = actionConfig.filters.color
            ? products.filter(p => p.color?.toLowerCase().includes(actionConfig.filters.color!.toLowerCase()))
            : products;

          actionsExecuted.push({
            action: systemAction,
            type: 'catalog',
            products_count: catalogProducts.length,
            filters: actionConfig.filters,
          });
          console.log(`[ALINE-REPLY] Catálogo encontrado: ${catalogProducts.length} produtos`);
        }
      } else if (actionConfig.type === 'lead') {
        // Registrar lead
        actionsExecuted.push({
          action: systemAction,
          type: 'lead',
          collected_data: conversation.collected_data,
        });

        // Atualizar status para finalizado
        validatedNode = 'finalizado';
      }
    }

    // ========================================
    // PASSO 7: ATUALIZAR ESTADO
    // ========================================
    const newCollectedData: Record<string, unknown> = {
      ...conversation.collected_data,
      thread_id: threadId,
    };

    // Coletar dados baseado no node
    if (validatedNode === 'escolha_finalidade_alianca' || validatedNode === 'menu_categoria') {
      const categoryMap: Record<string, string> = {
        '1': 'aliancas', 'aliança': 'aliancas', 'aliancas': 'aliancas',
        '2': 'pingente', 'pingente': 'pingente', 'pingentes': 'pingente',
      };
      const normalizedMsg = message.toLowerCase().trim();
      if (categoryMap[normalizedMsg]) {
        newCollectedData.categoria = categoryMap[normalizedMsg];
      }
    }

    if (validatedNode === 'escolha_cor_alianca' || validatedNode === 'escolha_cor_pingente') {
      const finalidadeMap: Record<string, string> = {
        '1': 'casamento', 'casamento': 'casamento',
        '2': 'noivado', 'noivado': 'noivado',
        '3': 'namoro', 'namoro': 'namoro',
      };
      const normalizedMsg = message.toLowerCase().trim();
      if (finalidadeMap[normalizedMsg]) {
        newCollectedData.finalidade = finalidadeMap[normalizedMsg];
      }
    }

    if (validatedNode.includes('catalogo')) {
      const colorMap: Record<string, string> = {
        '1': 'prata', 'prata': 'prata', 'aço': 'prata',
        '2': 'dourada', 'dourada': 'dourada', 'dourado': 'dourada',
        '3': 'preta', 'preta': 'preta', 'tungstênio': 'preta',
      };
      const normalizedMsg = message.toLowerCase().trim();
      if (colorMap[normalizedMsg]) {
        newCollectedData.cor = colorMap[normalizedMsg];
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
      // Produtos para envio (se houver)
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

    console.log(`[ALINE-REPLY] Resposta final: node=${validatedNode}, actions=${actionsExecuted.length}, produtos=${catalogProducts.length}`);

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
