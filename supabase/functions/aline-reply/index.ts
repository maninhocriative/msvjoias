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
// TUNGSTÊNIO (casamento): dourada, prata, azul, preta
// AÇO (namoro): prata, dourada
const SYSTEM_ACTIONS: Record<string, { type: string; filters: Record<string, string>; material?: string }> = {
  // Alianças de AÇO (namoro/compromisso) - cores: prata, dourada
  'show_catalog_alianca_aco': { type: 'catalog', filters: { category: 'aliancas' }, material: 'aco' },
  'show_catalog_alianca_aco_prata': { type: 'catalog', filters: { category: 'aliancas', color: 'prata' }, material: 'aco' },
  'show_catalog_alianca_aco_dourada': { type: 'catalog', filters: { category: 'aliancas', color: 'dourada' }, material: 'aco' },
  // Alianças de TUNGSTÊNIO (casamento) - cores: dourada, prata, azul, preta
  'show_catalog_alianca_tungstenio': { type: 'catalog', filters: { category: 'aliancas' }, material: 'tungstenio' },
  'show_catalog_alianca_tungstenio_dourada': { type: 'catalog', filters: { category: 'aliancas', color: 'dourada' }, material: 'tungstenio' },
  'show_catalog_alianca_tungstenio_prata': { type: 'catalog', filters: { category: 'aliancas', color: 'prata' }, material: 'tungstenio' },
  'show_catalog_alianca_tungstenio_azul': { type: 'catalog', filters: { category: 'aliancas', color: 'azul' }, material: 'tungstenio' },
  'show_catalog_alianca_tungstenio_preta': { type: 'catalog', filters: { category: 'aliancas', color: 'preta' }, material: 'tungstenio' },
  // Genérico por cor (mantido para compatibilidade)
  'show_catalog_alianca_dourada': { type: 'catalog', filters: { category: 'aliancas', color: 'dourada' } },
  'show_catalog_alianca_preta': { type: 'catalog', filters: { category: 'aliancas', color: 'preta' } },
  'show_catalog_alianca_azul': { type: 'catalog', filters: { category: 'aliancas', color: 'azul' } },
  'show_catalog_alianca_prata': { type: 'catalog', filters: { category: 'aliancas', color: 'prata' } },
  // Pingentes
  'show_catalog_pingentes': { type: 'catalog', filters: { category: 'pingente' } },
  'show_catalog_pingente_prata': { type: 'catalog', filters: { category: 'pingente', color: 'prata' } },
  'show_catalog_pingente_dourada': { type: 'catalog', filters: { category: 'pingente', color: 'dourada' } },
  'register_lead_crm': { type: 'lead', filters: {} },
};

// Cores disponíveis por material
const CORES_TUNGSTENIO = ['dourada', 'prata', 'azul', 'preta'];
const CORES_ACO = ['prata', 'dourada'];
const CORES_PINGENTE = ['prata', 'dourada'];

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
    
    // Primeiro, buscar qualquer conversa existente para este telefone (ativa ou não)
    const { data: existingConv, error: convError } = await supabase
      .from('aline_conversations')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (convError) {
      console.error('[ALINE-REPLY] Erro ao buscar conversa:', convError);
      throw convError;
    }

    if (existingConv) {
      // Se atendimento humano assumiu, NÃO responder
      if (existingConv.status === 'human_takeover') {
        console.log(`[ALINE-REPLY] Atendimento humano ativo para ${phone}, ignorando mensagem`);
        return new Response(JSON.stringify({
          success: true,
          skipped: true,
          reason: 'human_takeover',
          message: 'Atendimento humano ativo, Aline não responde',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Se a conversa existente está finished, reativar e resetar
      if (existingConv.status === 'finished') {
        const { data: reactivatedConv, error: updateError } = await supabase
          .from('aline_conversations')
          .update({
            status: 'active',
            current_node: 'abertura',
            last_node: null,
            collected_data: { contact_name: contact_name || existingConv.collected_data?.contact_name || 'Cliente' },
            last_message_at: new Date().toISOString(),
            followup_count: 0, // Resetar contador de follow-ups
          })
          .eq('id', existingConv.id)
          .select()
          .single();

        if (updateError) throw updateError;
        conversation = reactivatedConv as AlineConversation;
        console.log(`[ALINE-REPLY] Conversa reativada: id=${conversation.id}`);
      } else {
        // Conversa ativa existente - resetar followup_count quando cliente responde
        const { data: updatedConv, error: updateError } = await supabase
          .from('aline_conversations')
          .update({
            last_message_at: new Date().toISOString(),
            followup_count: 0, // Cliente respondeu, resetar contador
          })
          .eq('id', existingConv.id)
          .select()
          .single();
        
        if (updateError) {
          console.error('[ALINE-REPLY] Erro ao resetar followup_count:', updateError);
          conversation = existingConv as AlineConversation;
        } else {
          conversation = updatedConv as AlineConversation;
        }
        console.log(`[ALINE-REPLY] Conversa existente: node=${conversation.current_node}, followup_count resetado`);
      }
    } else {
      // Nenhuma conversa existente, criar nova
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

    // Salvar mensagem do usuário em aline_messages
    await supabase.from('aline_messages').insert({
      conversation_id: conversation.id,
      role: 'user',
      message,
      node: conversation.current_node,
    });

    // ========================================
    // SINCRONIZAR COM CHAT CRM (conversations + messages)
    // ========================================
    let crmConversationId: string | null = null;
    
    // Buscar ou criar conversa no Chat CRM
    const { data: existingCrmConv } = await supabase
      .from('conversations')
      .select('id, unread_count')
      .eq('contact_number', phone)
      .maybeSingle();

    if (existingCrmConv) {
      crmConversationId = existingCrmConv.id;
      // Atualizar last_message e incrementar unread
      await supabase
        .from('conversations')
        .update({ 
          last_message: message,
          unread_count: (existingCrmConv.unread_count || 0) + 1
        })
        .eq('id', crmConversationId);
    } else {
      const { data: newCrmConv } = await supabase
        .from('conversations')
        .insert({
          contact_number: phone,
          contact_name: contact_name || conversation.collected_data?.contact_name as string || phone,
          platform: 'whatsapp',
          last_message: message,
          unread_count: 1,
          lead_status: 'novo'
        })
        .select()
        .single();
      
      if (newCrmConv) {
        crmConversationId = newCrmConv.id;
      }
    }

    // Salvar mensagem do CLIENTE no Chat CRM
    if (crmConversationId) {
      await supabase.from('messages').insert({
        conversation_id: crmConversationId,
        content: message,
        is_from_me: false,
        message_type: 'text',
        status: 'delivered'
      });
      console.log(`[ALINE-REPLY] Mensagem do cliente salva no CRM: conv=${crmConversationId}`);
    }

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
    
    // ========================================
    // REMOVER MENSAGENS DUPLICADAS - SISTEMA AVANÇADO
    // ========================================
    
    // 1. Remover linhas completamente duplicadas
    const lines = replyText.split('\n');
    const seenLines = new Set<string>();
    const uniqueLines: string[] = [];
    
    for (const line of lines) {
      const normalizedLine = line.trim().toLowerCase().replace(/\s+/g, ' ');
      if (line.trim() === '' || !seenLines.has(normalizedLine)) {
        uniqueLines.push(line);
        if (normalizedLine) seenLines.add(normalizedLine);
      }
    }
    replyText = uniqueLines.join('\n').trim();
    
    // 2. Remover parágrafos duplicados
    const paragraphs = replyText.split(/\n\n+/);
    const seenParagraphs = new Set<string>();
    const uniqueParagraphs: string[] = [];
    
    for (const para of paragraphs) {
      const normalizedPara = para.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!seenParagraphs.has(normalizedPara)) {
        uniqueParagraphs.push(para);
        seenParagraphs.add(normalizedPara);
      }
    }
    replyText = uniqueParagraphs.join('\n\n').trim();
    
    // 3. Remover frases duplicadas (mesmo se aparecem em lugares diferentes)
    const sentences = replyText.split(/(?<=[.!?])\s+/);
    const seenSentences = new Set<string>();
    const uniqueSentences: string[] = [];
    
    for (const sentence of sentences) {
      const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ');
      // Ignorar frases muito curtas (menos de 10 caracteres)
      if (normalized.length < 10 || !seenSentences.has(normalized)) {
        uniqueSentences.push(sentence);
        if (normalized.length >= 10) seenSentences.add(normalized);
      }
    }
    replyText = uniqueSentences.join(' ').trim();
    
    // 4. Limpar espaços múltiplos e quebras de linha excessivas
    replyText = replyText.replace(/\n{3,}/g, '\n\n').replace(/  +/g, ' ').trim();

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
      // Detectar categoria por correspondência parcial para capturar variações
      let detectedCategory: string | null = null;
      
      // Verificar se é aliança (prioridade - verifica PRIMEIRO)
      if (normalizedMsg === '1' || 
          normalizedMsg.includes('aliança') || 
          normalizedMsg.includes('alianca') || 
          normalizedMsg.includes('alianças') || 
          normalizedMsg.includes('aliancas')) {
        detectedCategory = 'aliancas';
      }
      // Verificar se é pingente (só se NÃO for aliança)
      else if (normalizedMsg === '2' || 
               normalizedMsg.includes('pingente') || 
               normalizedMsg.includes('pingentes')) {
        detectedCategory = 'pingente';
      }
      
      if (detectedCategory) {
        newCollectedData.categoria = detectedCategory;
        console.log(`[ALINE-REPLY] Categoria coletada: ${detectedCategory} (msg: "${normalizedMsg}", node: ${currentNode})`);
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
      // Extrair número da mensagem (aceita "3", "Ou 3", "quero o 3", etc.)
      const numberMatch = normalizedMsg.match(/(\d+)/);
      const productIndex = numberMatch ? parseInt(numberMatch[1]) - 1 : -1;
      const lastCatalog = (conversation.collected_data?.last_catalog as any[]) || [];
      
      console.log(`[ALINE-REPLY] Tentando selecionar produto: msg="${normalizedMsg}", index=${productIndex}, catalog_size=${lastCatalog.length}`);
      
      if (productIndex >= 0 && productIndex < lastCatalog.length) {
        const selectedProduct = lastCatalog[productIndex];
        newCollectedData.selected_product = selectedProduct;
        newCollectedData.selected_sku = selectedProduct.sku;
        newCollectedData.selected_name = selectedProduct.name;
        newCollectedData.selected_price = selectedProduct.price;
        console.log(`[ALINE-REPLY] Produto selecionado: ${selectedProduct.name}`);
      }
    }

    // Coletar método de entrega - verificar SEMPRE que o usuário mencionar entrega/retirada
    // Não precisa estar em um node específico
    let deliveryMethodJustCollected = false;
    const entregaMap: Record<string, string> = {
      'retirada': 'retirada', 'retirar': 'retirada', 'loja': 'retirada', 'buscar': 'retirada', 'retirar na loja': 'retirada',
      'entrega': 'entrega', 'envio': 'entrega', 'correios': 'entrega', 'delivery': 'entrega', 'enviar': 'entrega',
      'via delivery': 'entrega', 'via entrega': 'entrega', 'receber em casa': 'entrega', 'mandar': 'entrega',
    };
    // Verificar se alguma chave corresponde na mensagem
    const entregaKey = Object.keys(entregaMap).find(key => normalizedMsg.includes(key));
    if (entregaKey && !newCollectedData.delivery_method) {
      newCollectedData.delivery_method = entregaMap[entregaKey];
      deliveryMethodJustCollected = true;
      console.log(`[ALINE-REPLY] Método de entrega coletado (global): ${entregaMap[entregaKey]} (msg: "${normalizedMsg}")`);
    } else if (currentNode.includes('entrega') || currentNode.includes('coleta')) {
      // Se estiver no node de entrega e for texto longo, provavelmente é endereço
      if (normalizedMsg.length > 15 && !entregaKey) {
        newCollectedData.delivery_address = message;
        newCollectedData.delivery_method = 'entrega';
        deliveryMethodJustCollected = true;
        console.log(`[ALINE-REPLY] Endereço coletado: ${message.substring(0, 50)}...`);
      }
    }

    // Coletar método de pagamento
    let paymentMethodJustCollected = false;
    if (currentNode.includes('pagamento') || currentNode.includes('coleta_pagamento')) {
      const pagamentoMap: Record<string, string> = {
        '1': 'pix', 'pix': 'pix',
        '2': 'cartao', 'cartao': 'cartao', 'cartão': 'cartao', 'credito': 'cartao', 'crédito': 'cartao',
        '3': 'dinheiro', 'dinheiro': 'dinheiro', 'espécie': 'dinheiro',
      };
      if (pagamentoMap[normalizedMsg]) {
        newCollectedData.payment_method = pagamentoMap[normalizedMsg];
        paymentMethodJustCollected = true;
        console.log(`[ALINE-REPLY] Método de pagamento: ${pagamentoMap[normalizedMsg]}`);
      }
    }

    // ========================================
    // ENCAMINHAR AO VENDEDOR SE COLETOU ENTREGA OU PAGAMENTO
    // ========================================
    const shouldForwardToSeller = deliveryMethodJustCollected || paymentMethodJustCollected;

    // ========================================
    // PASSO 7: EXECUTAR SYSTEM_ACTION OU BUSCAR CATÁLOGO AUTOMATICAMENTE
    // ========================================
    const actionsExecuted: Record<string, unknown>[] = [];
    let catalogProducts: unknown[] = [];

    // Verificar se devemos buscar catálogo (pelo node ou pela action ou pela resposta da IA)
    const replyLower = replyText.toLowerCase();
    const shouldFetchCatalog = validatedNode.includes('catalogo') || 
                               replyLower.includes('buscar no nosso catálogo') ||
                               replyLower.includes('catálogo alguns modelos') ||
                               replyLower.includes('aguarde um momento');
    
    if (shouldFetchCatalog || (systemAction && SYSTEM_ACTIONS[systemAction]?.type === 'catalog')) {
      // Obter cor selecionada pelo usuário
      let userColor = (newCollectedData.cor as string) || null;
      const finalidade = (newCollectedData.finalidade as string) || null;
      const categoria = (newCollectedData.categoria as string) || 'aliancas';
      
      // Determinar material baseado na finalidade
      // CASAMENTO = Tungstênio (cores: dourada, prata, azul, preta)
      // NAMORO = Aço (cores: prata, dourada)
      let material: string | null = null;
      
      if (categoria === 'aliancas' && finalidade) {
        if (finalidade === 'casamento') {
          material = 'tungstenio';
          console.log(`[ALINE-REPLY] Finalidade CASAMENTO -> Material TUNGSTÊNIO (cores disponíveis: dourada, prata, azul, preta)`);
        } else if (finalidade === 'namoro') {
          material = 'aco';
          console.log(`[ALINE-REPLY] Finalidade NAMORO -> Material AÇO (cores disponíveis: prata, dourada)`);
        }
      }
      
      // Se SYSTEM_ACTION especificou filtros, usar esses
      if (systemAction && SYSTEM_ACTIONS[systemAction]) {
        const actionConfig = SYSTEM_ACTIONS[systemAction];
        if (actionConfig.filters.color) {
          userColor = actionConfig.filters.color;
        }
        if (actionConfig.material) {
          material = actionConfig.material;
        }
      }
      
      console.log(`[ALINE-REPLY] Buscando catálogo: categoria=${categoria}, cor=${userColor}, finalidade=${finalidade}, material=${material}`);
      
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
        // Filtrar produtos
        let filteredProducts = [...products];
        
        // Filtrar por cor se especificado
        if (userColor) {
          filteredProducts = filteredProducts.filter(p => 
            p.color?.toLowerCase().includes(userColor.toLowerCase())
          );
        }
        
        // Filtrar por material (baseado na descrição/tags ou nome do produto)
        // Tungstênio: geralmente tem "tungstênio" no nome ou descrição
        // Aço: geralmente tem "aço" no nome ou descrição
        if (material && !userColor) {
          // Se material foi definido mas cor não, filtrar por tags ou descrição
          // Por enquanto, confia na cor selecionada pelo usuário
          console.log(`[ALINE-REPLY] Material ${material} definido, aguardando seleção de cor`);
        }
        
        catalogProducts = filteredProducts;

        // Salvar catálogo enviado para referência futura
        newCollectedData.last_catalog = catalogProducts.map((p: any) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          price: p.price,
          image_url: p.image_url,
        }));

        actionsExecuted.push({
          action: systemAction || 'auto_catalog',
          type: 'catalog',
          products_count: catalogProducts.length,
          filters: { category: categoria, color: userColor, finalidade, material },
        });
        console.log(`[ALINE-REPLY] Catálogo encontrado: ${catalogProducts.length} produtos`);

        // ========================================
        // REGISTRAR PROCURAS (product_interest) PARA CADA PRODUTO DO CATÁLOGO
        // ========================================
        if (crmConversationId && catalogProducts.length > 0) {
          for (const prod of catalogProducts as any[]) {
            await supabase.from('messages').insert({
              conversation_id: crmConversationId,
              content: `[CATÁLOGO] Produto enviado: ${prod.name}`,
              is_from_me: true,
              message_type: 'text',
              status: 'sent',
              product_interest: prod.id,
            });
          }
          console.log(`[ALINE-REPLY] Procuras registradas para ${catalogProducts.length} produtos`);
        }
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
    // PASSO 7.1: ENCAMINHAR AO VENDEDOR QUANDO COLETAR ENTREGA OU PAGAMENTO
    // Agora encaminha mesmo SEM produto selecionado (só ter escolhido forma de entrega já basta)
    // ========================================
    if (shouldForwardToSeller) {
      console.log(`[ALINE-REPLY] Encaminhando ao vendedor (coletou entrega ou pagamento)...`);
      
      const selectedProduct = newCollectedData.selected_product as any || null;
      const deliveryMethod = (newCollectedData.delivery_method as string) || 'N/A';
      const paymentMethod = (newCollectedData.payment_method as string) || 'N/A';
      const deliveryAddress = (newCollectedData.delivery_address as string) || null;
      const customerName = (newCollectedData.contact_name as string) || 'Cliente';
      
      // Criar resumo para encaminhar ao vendedor
      let forwardSummary = `
🔔 *CLIENTE AGUARDANDO ATENDIMENTO*

👤 Cliente: ${customerName}
📱 WhatsApp: ${phone}
`;

      // Se tem produto selecionado, incluir detalhes
      if (selectedProduct) {
        forwardSummary += `
🛍️ Produto escolhido: ${selectedProduct.name}
🏷️ SKU: ${selectedProduct.sku || 'N/A'}
💰 Valor: R$ ${selectedProduct.price?.toFixed(2) || '0,00'}
`;
      } else {
        forwardSummary += `
🛍️ Produto: Ainda não selecionado
`;
      }

      forwardSummary += `
${deliveryMethod !== 'N/A' ? `🚚 Forma de envio: ${deliveryMethod === 'retirada' ? 'Retirada na loja' : 'Delivery/Envio'}` : ''}
${deliveryAddress ? `📍 Endereço: ${deliveryAddress}` : ''}
${paymentMethod !== 'N/A' ? `💳 Pagamento: ${paymentMethod.toUpperCase()}` : ''}

📊 Dados coletados:
- Categoria: ${newCollectedData.categoria || 'N/A'}
- Cor: ${newCollectedData.cor || 'N/A'}
- Finalidade: ${newCollectedData.finalidade || 'N/A'}

⏰ Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}

⚠️ *A Aline encaminhou para atendimento humano. Por favor, entre em contato com o cliente.*
      `.trim();

      // Atualizar lead_status para 'comprador' no CRM (cliente mostrou intenção de compra)
      if (crmConversationId) {
        await supabase
          .from('conversations')
          .update({ lead_status: 'comprador' })
          .eq('id', crmConversationId);
        console.log(`[ALINE-REPLY] Lead atualizado para 'comprador': ${crmConversationId}`);
      }

      // Buscar número de notificação da Acium
      const { data: notifSettingForward } = await supabase
        .from('store_settings')
        .select('value')
        .eq('key', 'notification_whatsapp')
        .maybeSingle();
      
      const aciumPhoneForward = notifSettingForward?.value || '5592984145531';
      const productImageUrlForward = selectedProduct?.image_url || selectedProduct?.video_url || null;
      
      // Enviar notificação para o WhatsApp da Acium
      try {
        // Primeiro enviar a foto do produto se existir
        if (productImageUrlForward) {
          await fetch(`${supabaseUrl}/functions/v1/automation-send`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phone: aciumPhoneForward,
              message: `📸 *Foto do Produto Escolhido*`,
              message_type: 'image',
              media_url: productImageUrlForward,
            }),
          });
          console.log(`[ALINE-REPLY] Foto enviada para Acium (forward): ${productImageUrlForward}`);
        }

        // Depois enviar o resumo
        await fetch(`${supabaseUrl}/functions/v1/automation-send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: aciumPhoneForward,
            message: forwardSummary,
          }),
        });
        console.log(`[ALINE-REPLY] Notificação enviada para vendedor: ${aciumPhoneForward}`);
        
        actionsExecuted.push({
          action: 'forward_to_seller',
          type: 'notification',
          phone: aciumPhoneForward,
        });
      } catch (notifError) {
        console.error(`[ALINE-REPLY] Erro ao notificar vendedor:`, notifError);
      }

      // Marcar para human_takeover e atualizar status na aline_conversations
      validatedNode = 'finalizado';
    }

    // ========================================
    // PASSO 7.2: FINALIZAR PEDIDO E GRAVAR NO CRM (SE TIVER TODOS OS DADOS)
    // ========================================
    if (validatedNode === 'finalizado' && newCollectedData.selected_product && !shouldForwardToSeller) {
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

        // ========================================
        // ATUALIZAR LEAD_STATUS PARA 'comprador' NO CRM
        // ========================================
        if (crmConversationId) {
          await supabase
            .from('conversations')
            .update({ lead_status: 'comprador' })
            .eq('id', crmConversationId);
          console.log(`[ALINE-REPLY] Lead atualizado para 'comprador': ${crmConversationId}`);
        }

        // ========================================
        // INCREMENTAR PROCURAS DO PRODUTO (messages.product_interest)
        // ========================================
        if (selectedProduct.id && crmConversationId) {
          // Registrar interesse no produto (isso é usado para contar procuras)
          await supabase.from('messages').insert({
            conversation_id: crmConversationId,
            content: `[VENDA] Produto selecionado: ${selectedProduct.name}`,
            is_from_me: true,
            message_type: 'text',
            status: 'sent',
            product_interest: selectedProduct.id,
          });
          console.log(`[ALINE-REPLY] Interesse/venda registrado para produto: ${selectedProduct.id}`);
        }
      }

      // Buscar número de notificação da Acium
      const { data: notifSetting } = await supabase
        .from('store_settings')
        .select('value')
        .eq('key', 'notification_whatsapp')
        .maybeSingle();
      
      const aciumPhone = notifSetting?.value || '5592984145531';
      const productImageUrl = selectedProduct.image_url || selectedProduct.video_url || null;
      
      // Enviar resumo para o WhatsApp da Acium (com foto do produto se disponível)
      try {
        // Primeiro enviar a foto do produto se existir
        if (productImageUrl) {
          await fetch(`${supabaseUrl}/functions/v1/automation-send`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phone: aciumPhone,
              message: `📸 *Foto do Produto Escolhido*`,
              message_type: 'image',
              media_url: productImageUrl,
            }),
          });
          console.log(`[ALINE-REPLY] Foto do produto enviada para Acium: ${productImageUrl}`);
        }

        // Depois enviar o resumo do pedido
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
    // Se finalizado ou encaminhado ao vendedor, colocar em human_takeover para que Aline PARE de responder
    const newStatus = (validatedNode === 'finalizado' || shouldForwardToSeller) ? 'human_takeover' : 'active';
    
    await supabase
      .from('aline_conversations')
      .update({
        current_node: validatedNode,
        last_node: conversation.current_node,
        collected_data: newCollectedData,
        status: newStatus,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);
    
    console.log(`[ALINE-REPLY] Conversa atualizada: node=${validatedNode}, status=${newStatus}`);

    // Salvar mensagem da Aline em aline_messages
    await supabase.from('aline_messages').insert({
      conversation_id: conversation.id,
      role: 'aline',
      message: replyText,
      node: validatedNode,
      actions_executed: actionsExecuted.length > 0 ? actionsExecuted : null,
    });

    // Salvar mensagem da Aline no Chat CRM
    if (crmConversationId && replyText) {
      await supabase.from('messages').insert({
        conversation_id: crmConversationId,
        content: replyText,
        is_from_me: true,
        message_type: 'text',
        status: 'sent'
      });
      
      // Atualizar last_message da conversa
      await supabase
        .from('conversations')
        .update({ last_message: replyText.substring(0, 100) })
        .eq('id', crmConversationId);
      
      console.log(`[ALINE-REPLY] Resposta Aline salva no CRM: conv=${crmConversationId}`);
    }

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

        // Chamar automation-send com skip_crm_save para evitar duplicação
        const automationPayload = {
          phone,
          message: replyText,
          products: productsForSend.length > 0 ? productsForSend : undefined,
          send_video_priority: true,
          skip_crm_save: true, // Já salvamos no CRM acima, não duplicar
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
          // (REMOVIDO - mensagem já é enviada pelo automation-send, estava duplicando)
          // ========================================
          console.log(`[ALINE-REPLY] Catálogo enviado com ${productsForSend.length} produtos`);
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
