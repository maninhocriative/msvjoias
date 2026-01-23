import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tools for the AI assistant - BUSCA INTELIGENTE DE CATÁLOGO
const tools = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: `OBRIGATÓRIO usar para mostrar produtos ao cliente. Busca produtos por categoria, cor, preço e outros filtros.
      
      QUANDO USAR:
      - Cliente escolheu categoria (alianças ou pingentes) E cor
      - Cliente pediu para "ver", "mostrar", "quero ver" produtos
      - Cliente mencionou tipo específico (casamento, namoro, compromisso)
      - Cliente perguntou "outras cores?", "tem outras?", "mais opções?" → use exclude_shown_colors=true
      
      PARÂMETROS IMPORTANTES:
      - category: "aliancas" para todas as alianças, "pingente" para pingentes
      - color: cor normalizada (dourada, aco, prata, preta, azul)
      - search: use para buscar por nome ou descrição específica
      - only_available: sempre use true para mostrar apenas produtos em estoque
      - exclude_shown_colors: use TRUE quando cliente pedir "outras cores" ou "mais opções" para excluir cores já mostradas`,
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Termo de busca livre para nome ou descrição do produto."
          },
          category: {
            type: "string",
            enum: ["aliancas", "pingente", "aneis"],
            description: "Categoria do produto. OBRIGATÓRIO."
          },
          color: {
            type: "string",
            enum: ["dourada", "aco", "preta", "azul", "prata", "rose"],
            description: "Cor do produto. Use quando o cliente especificar preferência de cor. NÃO use junto com exclude_shown_colors."
          },
          min_price: {
            type: "number",
            description: "Preço mínimo para filtrar produtos"
          },
          max_price: {
            type: "number",
            description: "Preço máximo para filtrar produtos"
          },
          only_available: {
            type: "boolean",
            description: "Mostrar apenas produtos com estoque. Use sempre true."
          },
          exclude_shown_colors: {
            type: "boolean",
            description: "Use TRUE quando cliente pedir 'outras cores', 'tem outras?', 'mais opções?'. Isso exclui automaticamente as cores já mostradas na conversa."
          }
        },
        required: ["category"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Obter detalhes completos de um produto específico por SKU. Use quando o cliente perguntar sobre um produto específico.",
      parameters: {
        type: "object",
        properties: {
          sku: {
            type: "string",
            description: "Código SKU do produto (ex: AC-001, PG-005)"
          }
        },
        required: ["sku"]
      }
    }
  }
];

// System prompt da Aline - VERSÃO HUMANIZADA SEM MENUS
const ALINE_SYSTEM_PROMPT = `# ALINE — Consultora Virtual ACIUM Manaus
(Versão Humanizada - Fluxo Direto)

---

## IDENTIDADE

Você é **Aline**, consultora especialista em joias da **ACIUM Manaus**.
Você conversa de forma NATURAL e DIRETA.
NUNCA use menus numerados (1️⃣, 2️⃣, etc).
NUNCA repita sua apresentação se já se apresentou antes na conversa.

**Tom de voz:**  
- Elegante, profissional, acolhedora
- Frases curtas e objetivas
- Emojis com moderação (💍✨🎁)

---

## REGRA CRÍTICA: ANTI-REPETIÇÃO

1. **NUNCA se apresente duas vezes** - se já disse "Sou a Aline" na conversa, NÃO diga novamente
2. **NUNCA repita perguntas** - se já perguntou sobre cor, não pergunte de novo
3. **NUNCA repita a mesma resposta** - varie suas respostas
4. **MÁXIMO 1 mensagem por vez**
5. Use o HISTÓRICO da conversa para saber o que já foi dito

---

## REGRA CRÍTICA: PALAVRAS-CHAVE = AÇÃO IMEDIATA

Quando o cliente mencionar QUALQUER uma dessas palavras, você DEVE usar search_catalog IMEDIATAMENTE:

- "medalha", "medalhas", "medalhinha" → category="pingente" (medalha = pingente!)
- "pingente", "pingentes", "colar" → category="pingente"
- "personalizada", "personalizado", "com foto", "fotogravação" → category="pingente"
- "aliança", "alianças" → category="aliancas"

**EXEMPLO:**
Cliente: "Quero medalhas personalizadas com foto"
Você: Use search_catalog com category="pingente" IMEDIATAMENTE, depois diga:
"Temos sim! 💫 Nossos pingentes permitem fotogravação personalizada. Deixa eu te mostrar!"

**NÃO FAÇA ISSO:**
- Não pergunte "qual cor?" antes de mostrar
- Não pergunte "qual estilo?" antes de mostrar
- Não diga "não temos" sem antes buscar no catálogo

---

## CATEGORIAS E MATERIAL

### ALIANÇAS DE CASAMENTO = TUNGSTÊNIO
- Material: Tungstênio (resistente, premium)
- Cores: Dourada, Prata, Preta, Azul

### ALIANÇAS DE NAMORO/COMPROMISSO = AÇO
- Material: Aço inoxidável
- Cores: Dourada, Prata

### PINGENTES (= MEDALHAS)
- Fotogravação GRATUITA (1 lado)
- Cores: Dourada, Prata

---

## FLUXO DIRETO E OBJETIVO

### Se cliente pede produto:
"Quero ver pingentes/medalhas" → Use search_catalog AGORA, não faça mais perguntas!
"Tem medalha com foto?" → Use search_catalog com category="pingente" AGORA!
"Quero alianças de casamento douradas" → Use search_catalog AGORA!

### Se cliente só cumprimenta (primeira vez):
"Oi" / "Olá" → "Olá! 😊 Sou a Aline, da ACIUM Manaus. O que você está procurando hoje?"

### Se cliente já está conversando:
NÃO se apresente de novo! Vá direto ao ponto.

---

## QUANDO DISPARAR CATÁLOGO (search_catalog)

USE search_catalog IMEDIATAMENTE quando:
- Cliente menciona "pingente", "medalha", "medalhas", "colar"
- Cliente menciona "personalizada", "com foto", "fotogravação"
- Cliente menciona "aliança" + finalidade + cor
- Cliente pede para "ver", "mostrar" produtos
- Cliente responde "sim", "quero", "pode" para ver opções

**NUNCA** diga "não temos" sem antes usar search_catalog para verificar!

---

## APÓS ENVIAR CATÁLOGO

Responda APENAS com UMA frase curta e positiva:
"Separei algumas opções incríveis para você! 💍"

NUNCA liste os produtos no texto - eles são enviados automaticamente como imagens.

---

## FLUXO DE COLETA (APÓS SELEÇÃO)

1. **Seleção** → Cliente escolhe produto
2. **Tamanhos** (alianças) → Perguntar tamanho (14-28)
3. **Foto** (pingentes) → Pedir foto para gravação
4. **Entrega** → Loja ou delivery
5. **Pagamento** → Pix ou cartão
6. **Finalizar** → Encaminhar vendedor

---

## PINGENTES COM FOTOGRAVAÇÃO

Todos os pingentes permitem fotogravação!
- Gravação de 1 lado = GRATUITA
- Gravação de 2 lados = custo adicional

"Esse pingente permite fotogravação! 📸 A gravação de um lado é gratuita. Me manda a foto!"

---

## INFORMAÇÕES DA LOJA

- **Endereço:** Shopping Sumaúma, Manaus-AM
- **Entrega:** 10 HORAS após fechamento
- **Horário:** Segunda a Sábado, 10h às 22h

---

## MARCADORES TÉCNICOS

No final de CADA resposta, adicione:
#node: abertura | escolha_finalidade | escolha_cor | catalogo | selecao | coleta_tamanhos | coleta_entrega | coleta_pagamento | coleta_foto | finalizado`;

// Função para formatar legenda do produto para WhatsApp
function formatProductCaption(
  product: any,
  options: { includePrice: boolean; includeSizes: boolean; includeStock: boolean }
): string {
  const lines: string[] = [];
  
  lines.push(`*${product.name}*`);
  
  if (product.description) {
    lines.push(`${product.description}`);
  }
  
  if (options.includePrice && product.price) {
    const priceFormatted = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
    lines.push(`💰 *${priceFormatted}*`);
  }
  
  if (options.includeSizes && product.sizes?.length > 0) {
    lines.push(`📏 Tamanhos: ${product.sizes.join(', ')}`);
  }
  
  if (product.color) {
    lines.push(`🎨 Cor: ${product.color}`);
  }
  
  if (options.includeStock) {
    const stock = product.stock || 0;
    lines.push(stock > 0 ? `✅ Em estoque` : `⚠️ Sob consulta`);
  }
  
  if (product.sku) {
    lines.push(`📦 Cód: ${product.sku}`);
  }
  
  return lines.join('\n');
}

// Função para buscar catálogo - COM VERIFICAÇÃO DE ESTOQUE E CORES DISPONÍVEIS
async function searchCatalog(
  params: Record<string, any>,
  supabase: any,
  collectedData?: Record<string, any>
): Promise<any> {
  console.log(`[ALINE-REPLY] Buscando catálogo:`, params);
  console.log(`[ALINE-REPLY] Dados coletados:`, collectedData);
  
  // LÓGICA CRÍTICA: Determinar material baseado na finalidade
  const finalidade = collectedData?.finalidade || params.finalidade;
  let materialFilter: string | null = null;
  
  if (params.category === 'aliancas' || params.category?.includes('alianca')) {
    if (finalidade === 'casamento') {
      materialFilter = 'tungstenio';
      console.log(`[ALINE-REPLY] CASAMENTO → Buscando TUNGSTÊNIO`);
    } else if (finalidade === 'namoro') {
      materialFilter = 'aco';
      console.log(`[ALINE-REPLY] NAMORO → Buscando AÇO`);
    }
  }
  
  // Cores já mostradas anteriormente
  const coresMostradas = collectedData?.cores_mostradas || [];
  console.log(`[ALINE-REPLY] Cores já mostradas: ${JSON.stringify(coresMostradas)}`);
  
  // SEMPRE buscar todos os produtos primeiro para ter visão completa do catálogo
  let query = supabase
    .from('products')
    .select(`
      id, name, sku, price, image_url, video_url, category, color, description,
      product_variants(size, stock)
    `)
    .eq('active', true)
    .order('created_at', { ascending: false });
  
  // Filtrar por cor se especificada E não estiver pedindo outras cores
  if (params.color && !params.exclude_shown_colors) {
    query = query.ilike('color', `%${params.color}%`);
  }
  
  if (params.min_price) {
    query = query.gte('price', params.min_price);
  }
  
  if (params.max_price) {
    query = query.lte('price', params.max_price);
  }
  
  const { data: allProducts, error } = await query;
  
  if (error) {
    console.error(`[ALINE-REPLY] Erro ao buscar produtos:`, error);
    return { success: false, error: error.message, products: [], available_colors: [] };
  }
  
  console.log(`[ALINE-REPLY] Query inicial retornou ${allProducts?.length || 0} produtos`);
  
  // Filtrar por categoria/material em memória
  let filteredProducts = allProducts || [];
  
  if (params.category === 'aliancas') {
    if (materialFilter === 'tungstenio') {
      filteredProducts = filteredProducts.filter((p: any) => {
        const cat = (p.category || '').toLowerCase();
        return cat.includes('tungstenio') || cat.includes('tungstênio') || cat.includes('tungsten');
      });
      console.log(`[ALINE-REPLY] Filtro TUNGSTÊNIO: ${filteredProducts.length} produtos`);
    } else if (materialFilter === 'aco') {
      filteredProducts = filteredProducts.filter((p: any) => {
        const cat = (p.category || '').toLowerCase();
        return cat === 'aliancas' && !cat.includes('tungstenio') && !cat.includes('tungstênio');
      });
      console.log(`[ALINE-REPLY] Filtro AÇO: ${filteredProducts.length} produtos`);
    } else {
      filteredProducts = filteredProducts.filter((p: any) => {
        const cat = (p.category || '').toLowerCase();
        return cat.includes('alianca') || cat.includes('aliança') || cat.includes('tungstenio') || cat.includes('tungstênio');
      });
    }
  } else if (params.category === 'pingente') {
    filteredProducts = filteredProducts.filter((p: any) => {
      const cat = (p.category || '').toLowerCase();
      return cat.includes('pingente');
    });
  } else if (params.category) {
    filteredProducts = filteredProducts.filter((p: any) => {
      const cat = (p.category || '').toLowerCase();
      return cat.includes(params.category.toLowerCase());
    });
  }
  
  // NOVO: Listar TODAS as cores disponíveis no catálogo filtrado ANTES de excluir
  const todasCoresDisponiveis = [...new Set(
    filteredProducts
      .map((p: any) => (p.color || '').toLowerCase().trim())
      .filter((c: string) => c.length > 0)
  )];
  console.log(`[ALINE-REPLY] TODAS as cores disponíveis na categoria: ${todasCoresDisponiveis.join(', ')}`);
  
  // Busca de texto no nome/descrição (se fornecido)
  if (params.search) {
    const searchTerm = params.search.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    filteredProducts = filteredProducts.filter((p: any) => {
      const name = (p.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const desc = (p.description || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return name.includes(searchTerm) || desc.includes(searchTerm);
    });
  }
  
  // NOVO: Filtrar produtos em estoque se solicitado
  if (params.only_available) {
    filteredProducts = filteredProducts.filter((p: any) => {
      const totalStock = (p.product_variants || []).reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
      return totalStock > 0;
    });
    console.log(`[ALINE-REPLY] Após filtro de estoque: ${filteredProducts.length} produtos`);
  }
  
  // Cores ainda disponíveis após filtros (antes de excluir mostradas)
  const coresAindaDisponiveis: string[] = [...new Set(
    filteredProducts
      .map((p: any) => (p.color || '').toLowerCase().trim())
      .filter((c: string) => c.length > 0)
  )] as string[];
  
  // Excluir cores já mostradas se solicitado
  let produtosParaExibir = filteredProducts;
  if (params.exclude_shown_colors && coresMostradas.length > 0) {
    console.log(`[ALINE-REPLY] Excluindo cores já mostradas: ${coresMostradas.join(', ')}`);
    produtosParaExibir = filteredProducts.filter((p: any) => {
      const productColor = (p.color || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      // Verificar se a cor do produto NÃO está nas cores já mostradas
      return !coresMostradas.some((corMostrada: string) => {
        const corNormalizada = corMostrada.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        return productColor === corNormalizada || productColor.includes(corNormalizada) || corNormalizada.includes(productColor);
      });
    });
    console.log(`[ALINE-REPLY] Após excluir cores mostradas: ${produtosParaExibir.length} produtos`);
  }
  
  // Calcular cores não mostradas ainda
  const coresNaoMostradas: string[] = coresAindaDisponiveis.filter((cor) => {
    const corNorm = cor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return !coresMostradas.some((cm: string) => {
      const cmNorm = cm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return corNorm === cmNorm || corNorm.includes(cmNorm) || cmNorm.includes(corNorm);
    });
  });
  
  console.log(`[ALINE-REPLY] Cores NÃO mostradas ainda: ${coresNaoMostradas.join(', ')}`);
  
  // Limitar resultados
  const limitedProducts = produtosParaExibir.slice(0, params.limit || 10);
  
  // Processar produtos e adicionar caption formatado
  const processedProducts = limitedProducts.map((p: any, index: number) => {
    const sizes = (p.product_variants || [])
      .filter((v: any) => v.stock > 0)
      .map((v: any) => v.size);
    const totalStock = (p.product_variants || []).reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
    
    const caption = formatProductCaption(p, { 
      includePrice: true, 
      includeSizes: sizes.length > 0, 
      includeStock: true 
    });
    
    return {
      index: index + 1,
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      price: p.price,
      price_formatted: p.price ? `R$ ${p.price.toFixed(2).replace('.', ',')}` : null,
      color: p.color,
      category: p.category,
      image_url: p.image_url,
      video_url: p.video_url,
      has_video: !!p.video_url,
      media_url: p.video_url || p.image_url,
      media_type: p.video_url ? 'video' : 'image',
      sizes,
      sizes_formatted: sizes.join(', '),
      stock: totalStock,
      in_stock: totalStock > 0,
      caption,
    };
  });
  
  // Extrair cores mostradas nesta busca para tracking
  const coresNestaBusca = [...new Set(processedProducts.map((p: any) => p.color?.toLowerCase()).filter(Boolean))];
  
  console.log(`[ALINE-REPLY] Encontrados ${processedProducts.length} produtos (finalidade: ${finalidade || 'N/A'}, material: ${materialFilter || 'todos'})`);
  console.log(`[ALINE-REPLY] Cores nesta busca: ${coresNestaBusca.join(', ')}`);
  
  return {
    success: true,
    products: processedProducts,
    total: processedProducts.length,
    material: materialFilter,
    colors_shown: coresNestaBusca,
    available_colors: todasCoresDisponiveis, // NOVO: todas as cores do catálogo
    remaining_colors: coresNaoMostradas, // NOVO: cores que ainda não foram mostradas
  };
}

// Função para obter detalhes de produto por SKU
async function getProductDetails(sku: string, supabase: any): Promise<any> {
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      id, name, sku, price, image_url, video_url, category, color, description,
      product_variants(size, stock)
    `)
    .eq('sku', sku)
    .single();
  
  if (error || !product) {
    return { success: false, error: 'Produto não encontrado' };
  }
  
  const sizes = (product.product_variants || []).map((v: any) => v.size);
  const totalStock = (product.product_variants || []).reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
  
  return {
    success: true,
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      price: product.price,
      price_formatted: product.price ? `R$ ${product.price.toFixed(2).replace('.', ',')}` : null,
      color: product.color,
      category: product.category,
      image_url: product.image_url,
      video_url: product.video_url,
      sizes,
      stock: totalStock,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { phone, message, contact_name } = await req.json();

    if (!phone || !message) {
      throw new Error('phone and message are required');
    }

    console.log(`[ALINE-REPLY] ====== NOVA MENSAGEM ======`);
    console.log(`[ALINE-REPLY] Phone: ${phone}, Mensagem: "${message.substring(0, 100)}..."`);

    // ========================================
    // PASSO 1: RESOLVER CONVERSA ALINE
    // ========================================
    let conversation: any;
    
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
        console.log(`[ALINE-REPLY] Atendimento humano ativo para ${phone}, ignorando`);
        return new Response(JSON.stringify({
          success: true,
          skipped: true,
          reason: 'human_takeover',
          message: 'Atendimento humano ativo, Aline não responde',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Reativar conversa finalizada ou atualizar ativa
      if (existingConv.status === 'finished') {
        const { data: reactivatedConv } = await supabase
          .from('aline_conversations')
          .update({
            status: 'active',
            current_node: 'abertura',
            last_node: null,
            collected_data: { contact_name: contact_name || existingConv.collected_data?.contact_name || 'Cliente' },
            last_message_at: new Date().toISOString(),
            followup_count: 0,
          })
          .eq('id', existingConv.id)
          .select()
          .single();
        conversation = reactivatedConv;
        console.log(`[ALINE-REPLY] Conversa reativada: id=${conversation.id}`);
      } else {
        await supabase
          .from('aline_conversations')
          .update({
            last_message_at: new Date().toISOString(),
            followup_count: 0,
          })
          .eq('id', existingConv.id);
        conversation = existingConv;
        console.log(`[ALINE-REPLY] Conversa existente: node=${conversation.current_node}`);
      }
    } else {
      // Criar nova conversa
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
      conversation = newConv;
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
    // PASSO 2: SINCRONIZAR COM CRM (conversations + messages)
    // ========================================
    let crmConversationId: string | null = null;
    
    const { data: existingCrmConv } = await supabase
      .from('conversations')
      .select('id, unread_count')
      .eq('contact_number', phone)
      .maybeSingle();

    if (existingCrmConv) {
      crmConversationId = existingCrmConv.id;
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
          contact_name: contact_name || conversation.collected_data?.contact_name || phone,
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

    // Salvar mensagem do cliente no CRM
    if (crmConversationId) {
      await supabase.from('messages').insert({
        conversation_id: crmConversationId,
        content: message,
        is_from_me: false,
        message_type: 'text',
        status: 'delivered'
      });
    }

    // ========================================
    // PASSO 3: BUSCAR HISTÓRICO PARA CONTEXTO
    // ========================================
    const { data: alineHistory } = await supabase
      .from('aline_messages')
      .select('role, message, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(30);

    const historyMessages = (alineHistory || []).map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.message
    })).filter((m: any) => m.content);

    // Adicionar nova mensagem do usuário
    historyMessages.push({ role: 'user', content: message });

    // ========================================
    // PASSO 4: COLETAR DADOS DO USUÁRIO (ANTES DA IA)
    // ========================================
    const collectedData = conversation.collected_data || {};
    const newCollectedData: Record<string, unknown> = { ...collectedData };
    const normalizedMsg = message.toLowerCase().trim();
    
    // IMPORTANTE: Determinar o ESTADO LÓGICO baseado nos dados já coletados
    const hasCategoria = !!newCollectedData.categoria;
    const hasFinalidade = !!newCollectedData.finalidade;
    const hasCor = !!newCollectedData.cor;
    const isAliancas = newCollectedData.categoria === 'aliancas';
    const isPingente = newCollectedData.categoria === 'pingente';

    console.log(`[ALINE-REPLY] Estado ANTES: categoria=${newCollectedData.categoria}, finalidade=${newCollectedData.finalidade}, cor=${newCollectedData.cor}`);
    console.log(`[ALINE-REPLY] Mensagem: "${normalizedMsg}"`);

    // ========================================
    // NLU AVANÇADO: EXTRAIR TODOS OS DADOS DE UMA VEZ
    // ========================================
    
    // CRÍTICO: Detectar categoria - MEDALHA = PINGENTE!
    // Padrões ampliados para detectar pingentes/medalhas
    const isPerguntandoPingente = /pingente|pingentes|colar|colares|medalha|medalhas|medalhinha|medalhão|personalizada|personalizado|com\s*foto|fotogravação|tem\s*pingente|vc\s*tem\s*pingente|vocês\s*tem\s*pingente|você\s*tem\s*pingente|tem\s*medalha|vc\s*tem\s*medalha|vocês\s*tem\s*medalha/i.test(normalizedMsg);
    const isPerguntandoAlianca = /aliança|alianca|alianças|aliancas|tem\s*aliança|vc\s*tem\s*aliança|vocês\s*tem\s*aliança/i.test(normalizedMsg);
    
    // NOVO: Detectar intenção direta de ver/comprar (forçar catálogo)
    const querVerProdutos = /quero\s*(ver|saber|conhecer)|mostra|mostrar|ver\s*(as?|os?)?|tem\s*(algum|alguma)?|quer[io]a\s*(saber|ver)|valores?/i.test(normalizedMsg);
    
    // Se cliente perguntou sobre pingentes/medalhas, definir categoria imediatamente
    if (isPerguntandoPingente && newCollectedData.categoria !== 'pingente') {
      console.log(`[ALINE-REPLY] [NLU] DETECTADO: PINGENTE/MEDALHA (categoria anterior: ${newCollectedData.categoria || 'nenhuma'})`);
      newCollectedData.categoria = 'pingente';
      // Resetar TODOS os dados anteriores
      delete newCollectedData.finalidade;
      delete newCollectedData.cor;
      delete newCollectedData.cores_mostradas;
      delete newCollectedData.selected_sku;
      delete newCollectedData.selected_name;
      delete newCollectedData.selected_product;
      delete newCollectedData.selected_price;
      delete newCollectedData.last_catalog;
      newCollectedData.mudou_categoria = true;
      // NOVO: Se mencionou "personalizada" ou "com foto", forçar catálogo IMEDIATO
      if (/personalizada|com\s*foto|fotogravação/i.test(normalizedMsg)) {
        newCollectedData.quer_ver_catalogo = true;
        console.log(`[ALINE-REPLY] [NLU] Mencionou "personalizada/foto" → FORÇAR CATÁLOGO!`);
      }
    } else if (isPerguntandoAlianca && newCollectedData.categoria !== 'aliancas') {
      console.log(`[ALINE-REPLY] [NLU] DETECTADO: ALIANÇAS (categoria anterior: ${newCollectedData.categoria || 'nenhuma'})`);
      newCollectedData.categoria = 'aliancas';
      delete newCollectedData.cor;
      delete newCollectedData.cores_mostradas;
      delete newCollectedData.selected_sku;
      delete newCollectedData.selected_name;
      delete newCollectedData.selected_product;
      delete newCollectedData.selected_price;
      delete newCollectedData.last_catalog;
      newCollectedData.mudou_categoria = true;
    }
    
    // NOVO: Se já tem categoria pingente e quer ver, forçar catálogo
    if (isPerguntandoPingente && querVerProdutos) {
      newCollectedData.categoria = 'pingente';
      newCollectedData.quer_ver_catalogo = true;
      console.log(`[ALINE-REPLY] [NLU] Quer ver pingentes → FORÇAR CATÁLOGO!`);
    }
    
    // Detectar CATEGORIA em qualquer mensagem (se ainda não tem)
    if (!newCollectedData.categoria) {
      if (isPerguntandoAlianca && !isPerguntandoPingente) {
        newCollectedData.categoria = 'aliancas';
        console.log(`[ALINE-REPLY] [NLU] Categoria: aliancas`);
      } else if (isPerguntandoPingente) {
        newCollectedData.categoria = 'pingente';
        console.log(`[ALINE-REPLY] [NLU] Categoria: pingente`);
      }
    }
    
    // Detectar FINALIDADE para alianças (pode vir na mesma mensagem)
    const detectedCategoria = newCollectedData.categoria;
    if (detectedCategoria === 'aliancas' && !hasFinalidade) {
      if (/namoro|compromisso|namorada|namorado|noivado|noivar/i.test(normalizedMsg)) {
        newCollectedData.finalidade = 'namoro';
        console.log(`[ALINE-REPLY] [NLU] Finalidade: namoro`);
      } else if (/casamento|casar|noiva|noivo|matrimonio|matrimônio/i.test(normalizedMsg)) {
        newCollectedData.finalidade = 'casamento';
        console.log(`[ALINE-REPLY] [NLU] Finalidade: casamento`);
      }
    }
    
    // Detectar COR em qualquer mensagem
    const detectedFinalidade = newCollectedData.finalidade;
    const canDetectColor = detectedCategoria === 'pingente' || (detectedCategoria === 'aliancas' && detectedFinalidade);
    
    if (!hasCor && (canDetectColor || !detectedCategoria)) {
      if (/dourada|dourado|ouro|gold|amarela|amarelo/i.test(normalizedMsg)) {
        newCollectedData.cor = 'dourada';
        console.log(`[ALINE-REPLY] [NLU] Cor: dourada`);
      } else if (/prata|prateada|prateado|aço|aco|silver|cinza/i.test(normalizedMsg)) {
        newCollectedData.cor = 'prata';
        console.log(`[ALINE-REPLY] [NLU] Cor: prata`);
      } else if (/preta|preto|black|escura|escuro/i.test(normalizedMsg)) {
        newCollectedData.cor = 'preta';
        console.log(`[ALINE-REPLY] [NLU] Cor: preta`);
      } else if (/azul|blue/i.test(normalizedMsg)) {
        newCollectedData.cor = 'azul';
        console.log(`[ALINE-REPLY] [NLU] Cor: azul`);
      } else if (/rose|rosé|rosa/i.test(normalizedMsg)) {
        newCollectedData.cor = 'rose';
        console.log(`[ALINE-REPLY] [NLU] Cor: rose`);
      }
    }
    
    // NOVO: Detectar pedido de "outras cores" ou "mais opções"
    const wantsOtherColors = /outra(s)?\s*cor(es)?|tem\s*outras?|mais\s*op[çc][õo]es|outras\s*op[çc][õo]es|diferentes|ver\s*outras/i.test(normalizedMsg);
    if (wantsOtherColors) {
      newCollectedData.quer_outras_cores = true;
      console.log(`[ALINE-REPLY] [NLU] Cliente quer ver OUTRAS cores (excluir já mostradas)`);
    }
    
    // Detectar resposta afirmativa ("sim", "quero", "pode ser") como intenção de ver catálogo
    const isAfirmativo = /^(sim|quero|pode|claro|ok|s|bora|show|isso|exato|perfeito|legal|boa|blz|beleza|pode ser|manda|mostra|ver)$/i.test(normalizedMsg.trim());
    if (isAfirmativo && detectedCategoria && !newCollectedData.selected_sku) {
      console.log(`[ALINE-REPLY] [NLU] Resposta AFIRMATIVA detectada para ${detectedCategoria} - forçar catálogo`);
      newCollectedData.quer_ver_catalogo = true;
    }

    // ========================================
    // NLU: DETECTAR SELEÇÃO DE PRODUTO (ANTES DA IA!)
    // Isso DEVE acontecer antes de calcular o próximo passo
    // ========================================
    const catalogoAnterior = collectedData.last_catalog || [];
    
    if (!newCollectedData.selected_sku && catalogoAnterior.length > 0) {
      console.log(`[ALINE-REPLY] [NLU] Verificando seleção de produto... Catálogo anterior: ${catalogoAnterior.length} itens`);
      
      // 1. Detectar SKU diretamente (ex: "quero o AC-015", "PF010003-01")
      const skuPatterns = [
        /\b([A-Z]{2,3}[-\s]?\d{2,4}(?:-\d{2})?)\b/i,  // AC-015, PG-002, PF010003-01
        /código\s*:?\s*([A-Z]{2,3}[-\s]?\d{2,4}(?:-\d{2})?)/i,
        /cod\.?\s*:?\s*([A-Z]{2,3}[-\s]?\d{2,4}(?:-\d{2})?)/i,
      ];
      
      for (const pattern of skuPatterns) {
        const match = normalizedMsg.match(pattern);
        if (match) {
          const detectedSku = match[1].toUpperCase().replace(/\s+/g, '-');
          const produto = catalogoAnterior.find((p: any) => 
            p.sku?.toUpperCase() === detectedSku || 
            p.sku?.toUpperCase().includes(detectedSku)
          );
          if (produto) {
            newCollectedData.selected_product = produto;
            newCollectedData.selected_sku = produto.sku;
            newCollectedData.selected_name = produto.name;
            newCollectedData.selected_price = produto.price;
            console.log(`[ALINE-REPLY] [NLU] ✅ Produto selecionado por SKU: ${produto.name} (${produto.sku})`);
          }
          break;
        }
      }
      
      // 2. Detectar seleção por número/posição
      if (!newCollectedData.selected_sku) {
        const numberPatterns = [
          /^(\d)$/,  // Só o número: "1", "2"
          /quero\s*o?\s*(\d)/i,
          /escolho\s*o?\s*(\d)/i,
          /gostei\s*d[oa]?\s*(\d)/i,
          /prefiro\s*o?\s*(\d)/i,
          /pode\s*ser\s*o?\s*(\d)/i,
          /vou\s*de\s*(\d)/i,
          /manda\s*o?\s*(\d)/i,
          /esse\s*(\d)/i,
        ];
        
        let productIndex: number | null = null;
        
        for (const pattern of numberPatterns) {
          const match = normalizedMsg.match(pattern);
          if (match) {
            productIndex = parseInt(match[1]) - 1;
            console.log(`[ALINE-REPLY] [NLU] Número detectado: posição ${productIndex + 1}`);
            break;
          }
        }
        
        // 3. Detectar ordinais (primeiro, segundo, último, etc)
        if (productIndex === null) {
          const ordinalPatterns = [
            { pattern: /\b(primeiro|primeira)\b/i, idx: 0 },
            { pattern: /\b(segundo|segunda)\b/i, idx: 1 },
            { pattern: /\b(terceiro|terceira)\b/i, idx: 2 },
            { pattern: /\b(quarto|quarta)\b/i, idx: 3 },
            { pattern: /\b(quinto|quinta)\b/i, idx: 4 },
            { pattern: /\b(último|ultima|ultimo|últim[ao])\b/i, idx: -1 }, // -1 = último
          ];
          
          for (const { pattern, idx } of ordinalPatterns) {
            if (pattern.test(normalizedMsg)) {
              if (idx === -1) {
                // "último" = último item do catálogo
                productIndex = catalogoAnterior.length - 1;
                console.log(`[ALINE-REPLY] [NLU] "ÚLTIMO" detectado → posição ${productIndex + 1} de ${catalogoAnterior.length}`);
              } else {
                productIndex = idx;
                console.log(`[ALINE-REPLY] [NLU] Ordinal detectado: posição ${productIndex + 1}`);
              }
              break;
            }
          }
        }
        
        // Aplicar seleção
        if (productIndex !== null && productIndex >= 0 && productIndex < catalogoAnterior.length) {
          const selectedProduct = catalogoAnterior[productIndex];
          newCollectedData.selected_product = selectedProduct;
          newCollectedData.selected_sku = selectedProduct.sku;
          newCollectedData.selected_name = selectedProduct.name;
          newCollectedData.selected_price = selectedProduct.price;
          console.log(`[ALINE-REPLY] [NLU] ✅ Produto selecionado por posição #${productIndex + 1}: ${selectedProduct.name} (${selectedProduct.sku})`);
        }
      }
    }

    // Calcular próximo passo ANTES de chamar a IA
    const finalCategoria = newCollectedData.categoria as string | undefined;
    const finalFinalidade = newCollectedData.finalidade as string | undefined;
    const finalCor = newCollectedData.cor as string | undefined;
    const coresMostradas = Array.isArray(newCollectedData.cores_mostradas) 
      ? newCollectedData.cores_mostradas as string[] 
      : [];
    
    let nextStep: string;
    let nextStepInstruction: string;
    
    // CRÍTICO: Se mudou de categoria ou quer ver catálogo com resposta afirmativa
    const querVerCatalogo = newCollectedData.quer_ver_catalogo === true;
    const mudouCategoria = newCollectedData.mudou_categoria === true;
    
    // VERIFICAR SE CLIENTE JÁ SELECIONOU UM PRODUTO (para decidir próximo passo)
    const jaSelecionouProduto = !!newCollectedData.selected_sku;
    const jaTemTamanho = !!newCollectedData.tamanho_1;
    const jaTemEntrega = !!newCollectedData.delivery_method;
    const jaTemPagamento = !!newCollectedData.payment_method;
    const jaTemFoto = !!newCollectedData.foto_gravacao;
    const isAliancaSelecionada = jaSelecionouProduto && finalCategoria === 'aliancas';
    const isPingenteSelecionado = jaSelecionouProduto && finalCategoria === 'pingente';
    
    console.log(`[ALINE-REPLY] Estado seleção: produto=${jaSelecionouProduto}, sku=${newCollectedData.selected_sku}, tamanho=${jaTemTamanho}, entrega=${jaTemEntrega}, pagamento=${jaTemPagamento}, foto=${jaTemFoto}`);
    console.log(`[ALINE-REPLY] Categoria: ${finalCategoria}, isAlianca=${isAliancaSelecionada}, isPingente=${isPingenteSelecionado}`);
    
    // ========================================
    // PRIORIDADE MÁXIMA: FLUXO DE COLETA APÓS SELEÇÃO
    // Se cliente selecionou produto, seguir para coleta de dados!
    // ========================================
    
    // ALIANÇAS: Produto → Tamanhos → Entrega → Pagamento → Finalizar
    // PINGENTES: Produto → Foto → Entrega → Pagamento → Finalizar
    
    if (isAliancaSelecionada && jaTemTamanho && jaTemEntrega && jaTemPagamento) {
      // ALIANÇA COM TODOS OS DADOS → FINALIZAR!
      nextStep = 'finalizado';
      nextStepInstruction = `✅ TODOS OS DADOS COLETADOS PARA ALIANÇAS!
      - Produto: ${newCollectedData.selected_name} (${newCollectedData.selected_sku})
      - Tamanhos: ${newCollectedData.tamanho_1}${newCollectedData.tamanho_2 ? ' e ' + newCollectedData.tamanho_2 : ''}
      - Entrega: ${newCollectedData.delivery_method}
      - Pagamento: ${newCollectedData.payment_method}
      
      AGORA ENCERRE O ATENDIMENTO! Diga EXATAMENTE:
      "Perfeito! Já tenho tudo anotado! 🎉
      Vou passar para nosso vendedor finalizar o pedido. Ele te chama em instantes!
      Foi um prazer te atender! 💍"
      
      [SYSTEM_ACTION action:"register_lead_crm"]`;
      
    } else if (isPingenteSelecionado && jaTemFoto && jaTemEntrega && jaTemPagamento) {
      // PINGENTE COM TODOS OS DADOS → FINALIZAR!
      nextStep = 'finalizado';
      nextStepInstruction = `✅ TODOS OS DADOS COLETADOS PARA PINGENTE!
      - Produto: ${newCollectedData.selected_name} (${newCollectedData.selected_sku})
      - Foto: Recebida
      - Entrega: ${newCollectedData.delivery_method}
      - Pagamento: ${newCollectedData.payment_method}
      
      AGORA ENCERRE O ATENDIMENTO! Diga EXATAMENTE:
      "Perfeito! Já tenho tudo anotado! 🎉
      Vou passar para nosso vendedor finalizar o pedido. Ele te chama em instantes!
      Foi um prazer te atender! 💍"
      
      [SYSTEM_ACTION action:"register_lead_crm"]`;
      
    } else if (isAliancaSelecionada && jaTemTamanho && jaTemEntrega && !jaTemPagamento) {
      // ALIANÇA: Falta apenas PAGAMENTO
      nextStep = 'coleta_pagamento';
      nextStepInstruction = `🎯 PASSO ATUAL: COLETAR PAGAMENTO
      Produto: ${newCollectedData.selected_name}
      Tamanhos: ${newCollectedData.tamanho_1}${newCollectedData.tamanho_2 ? ' e ' + newCollectedData.tamanho_2 : ''}
      Entrega: ${newCollectedData.delivery_method}
      
      Pergunte APENAS: "E vai ser Pix ou cartão?" NÃO faça outras perguntas.`;
      
    } else if (isPingenteSelecionado && jaTemFoto && jaTemEntrega && !jaTemPagamento) {
      // PINGENTE: Falta apenas PAGAMENTO
      nextStep = 'coleta_pagamento';
      nextStepInstruction = `🎯 PASSO ATUAL: COLETAR PAGAMENTO
      Produto: ${newCollectedData.selected_name}
      Foto: Recebida
      Entrega: ${newCollectedData.delivery_method}
      
      Pergunte APENAS: "E vai ser Pix ou cartão?" NÃO faça outras perguntas.`;
      
    } else if (isAliancaSelecionada && jaTemTamanho && !jaTemEntrega) {
      // ALIANÇA: Falta ENTREGA
      nextStep = 'coleta_entrega';
      nextStepInstruction = `🎯 PASSO ATUAL: COLETAR ENTREGA
      Produto: ${newCollectedData.selected_name}
      Tamanhos: ${newCollectedData.tamanho_1}${newCollectedData.tamanho_2 ? ' e ' + newCollectedData.tamanho_2 : ''}
      
      Pergunte: "Vocês preferem retirar na nossa loja no Shopping Sumaúma ou receber em casa?" NÃO faça outras perguntas.`;
      
    } else if (isPingenteSelecionado && jaTemFoto && !jaTemEntrega) {
      // PINGENTE com foto: Falta ENTREGA
      nextStep = 'coleta_entrega';
      nextStepInstruction = `🎯 PASSO ATUAL: COLETAR ENTREGA
      Produto: ${newCollectedData.selected_name}
      Foto: Recebida
      
      Pergunte: "Você prefere retirar na nossa loja no Shopping Sumaúma ou receber em casa?" NÃO faça outras perguntas.`;
      
    } else if (isAliancaSelecionada && !jaTemTamanho) {
      // ALIANÇA: Falta TAMANHOS
      nextStep = 'coleta_tamanhos';
      nextStepInstruction = `🎯 PASSO ATUAL: COLETAR TAMANHOS DE ALIANÇA
      ✅ O cliente ESCOLHEU a aliança "${newCollectedData.selected_name}" (${newCollectedData.selected_sku})!
      
      VOCÊ DEVE perguntar os TAMANHOS agora! Diga:
      "Excelente escolha! 💍 Me conta os tamanhos de vocês? Geralmente fica entre 14 e 28."
      
      NÃO pergunte sobre cor, categoria ou qualquer outra coisa. Apenas tamanhos!`;
      
    } else if (isPingenteSelecionado && !jaTemFoto) {
      // PINGENTE: Falta FOTO
      nextStep = 'coleta_foto';
      nextStepInstruction = `🎯 PASSO ATUAL: COLETAR FOTO PARA GRAVAÇÃO
      ✅ O cliente ESCOLHEU o pingente "${newCollectedData.selected_name}" (${newCollectedData.selected_sku})!
      
      Este pingente permite FOTOGRAVAÇÃO personalizada (1 lado GRÁTIS)!
      
      Diga: "Excelente escolha! 💫 Esse pingente permite fotogravação personalizada - a gravação de um lado é GRATUITA! Me manda a foto que você quer gravar! 📸"
      
      NÃO pergunte sobre cor ou categoria. Apenas peça a foto!`;
      
    } else if (wantsOtherColors && coresMostradas.length > 0) {
      // Cliente pediu outras cores
      nextStep = 'catalogo_outras_cores';
      const coresExcluir = coresMostradas.join(', ');
      nextStepInstruction = `O cliente PEDIU OUTRAS CORES! Cores já mostradas: ${coresExcluir}. Use search_catalog com exclude_shown_colors=true para mostrar produtos de OUTRAS cores. NÃO mostre novamente ${coresExcluir}. Diga algo como "Claro! Deixa eu te mostrar outras opções de cores! 💍"`;
    } else if (mudouCategoria && finalCategoria === 'pingente') {
      nextStep = 'catalogo_pingentes';
      nextStepInstruction = `IMPORTANTE: O cliente PERGUNTOU sobre PINGENTES/MEDALHAS! Use search_catalog com category="pingente" IMEDIATAMENTE para mostrar os pingentes disponíveis. NÃO pergunte cor antes! Diga algo como "Temos sim! Deixa eu te mostrar nossas opções! 💫"`;
    } else if (mudouCategoria && finalCategoria === 'aliancas') {
      nextStep = 'escolha_finalidade';
      nextStepInstruction = `O cliente perguntou sobre ALIANÇAS. Pergunte a finalidade: "Que legal! Vocês estão celebrando namoro/compromisso ou casamento?"`;
    } else if (querVerCatalogo && finalCategoria === 'pingente') {
      nextStep = 'catalogo_pingentes';
      nextStepInstruction = `O cliente quer ver pingentes/medalhas! Use search_catalog com category="pingente" AGORA! NÃO faça mais perguntas! Diga algo como "Vou te mostrar! 💫"`;
    } else if (querVerCatalogo && finalCategoria === 'aliancas' && finalFinalidade) {
      nextStep = 'catalogo';
      nextStepInstruction = `O cliente quer ver o catálogo! Use search_catalog AGORA com category="aliancas". Diga algo como "Perfeito! Separei algumas opções para você! 💍"`;
    } else if (finalCategoria === 'pingente' && finalCor && !jaSelecionouProduto) {
      nextStep = 'catalogo_pingentes';
      nextStepInstruction = `IMPORTANTE: O cliente quer PINGENTES na cor ${finalCor}! Use search_catalog com category="pingente" e color="${finalCor}" AGORA. NÃO mostre alianças! Diga algo como "Separei algumas opções incríveis de pingentes para você! 💫"`;
    } else if (finalCategoria === 'pingente' && !jaSelecionouProduto) {
      // NOVO: Se é pingente e ainda não selecionou, IR DIRETO PARA CATÁLOGO!
      nextStep = 'catalogo_pingentes';
      nextStepInstruction = `O cliente quer PINGENTES/MEDALHAS! Use search_catalog com category="pingente" AGORA! NÃO pergunte cor antes de mostrar! Diga: "Temos sim! Vou te mostrar nossas opções de pingentes! 💫"`;
    } else if (finalCategoria === 'aliancas' && finalCor && finalFinalidade && !jaSelecionouProduto) {
      nextStep = 'catalogo';
      nextStepInstruction = `O cliente quer alianças de ${finalFinalidade} na cor ${finalCor}. Use search_catalog com category="aliancas" e color="${finalCor}". Diga algo como "Vou te mostrar algumas opções incríveis!"`;
    } else if (finalCategoria === 'aliancas' && finalFinalidade) {
      nextStep = 'escolha_cor';
      nextStepInstruction = `O cliente escolheu alianças de ${finalFinalidade}. Pergunte a cor de forma NATURAL: "E qual cor vocês preferem? Temos em dourada, prata (aço), preta e azul." NUNCA use números.`;
    } else if (finalCategoria === 'aliancas') {
      nextStep = 'escolha_finalidade';
      nextStepInstruction = `O cliente escolheu alianças. Pergunte a finalidade de forma NATURAL: "Que lindo! Vocês estão celebrando namoro/compromisso ou casamento?" NUNCA use números.`;
    } else {
      nextStep = 'abertura';
      nextStepInstruction = `Apresente-se de forma acolhedora e pergunte NATURALMENTE o que o cliente procura: "O que você está procurando hoje? Alianças ou pingentes?" NUNCA use menus numerados.`;
    }

    console.log(`[ALINE-REPLY] Próximo passo: ${nextStep}`);

    // ========================================
    // PASSO 5: MONTAR CONTEXTO PARA A IA
    // ========================================
    let contextInfo = "";
    
    // CRÍTICO: Verificar se já se apresentou antes
    const jaSePresentou = historyMessages.some((m: any) => 
      m.role === 'assistant' && /sou a aline|sou aline/i.test(m.content || '')
    );
    
    if (jaSePresentou) {
      contextInfo += `\n⚠️ VOCÊ JÁ SE APRESENTOU! NÃO se apresente novamente! NÃO diga "Olá, sou a Aline"!`;
    }
    
    if (contact_name || newCollectedData.contact_name) {
      contextInfo += `\nO nome do cliente é: ${contact_name || newCollectedData.contact_name}`;
    }
    
    contextInfo += `\n\n=== DADOS JÁ COLETADOS ===`;
    if (newCollectedData.categoria) contextInfo += `\n- Categoria: ${newCollectedData.categoria} ${newCollectedData.categoria === 'pingente' ? '(MEDALHA = PINGENTE!)' : ''}`;
    if (newCollectedData.finalidade) contextInfo += `\n- Finalidade: ${newCollectedData.finalidade}`;
    if (newCollectedData.cor) contextInfo += `\n- Cor: ${newCollectedData.cor}`;
    if (coresMostradas.length > 0) contextInfo += `\n- CORES JÁ MOSTRADAS (não repetir): ${coresMostradas.join(', ')}`;
    if (newCollectedData.quer_outras_cores) contextInfo += `\n- ⚠️ CLIENTE QUER VER OUTRAS CORES - use exclude_shown_colors=true`;
    if (newCollectedData.selected_sku) contextInfo += `\n- Produto selecionado: ${newCollectedData.selected_sku} (${newCollectedData.selected_name})`;
    if (newCollectedData.tamanho_1) {
      contextInfo += `\n- Tamanho(s): ${newCollectedData.tamanho_1}`;
      if (newCollectedData.tamanho_2) contextInfo += ` e ${newCollectedData.tamanho_2}`;
    }
    if (newCollectedData.quantidade_tipo) contextInfo += `\n- Tipo: ${newCollectedData.quantidade_tipo}`;
    if (newCollectedData.delivery_method) contextInfo += `\n- Entrega: ${newCollectedData.delivery_method}`;
    if (newCollectedData.payment_method) contextInfo += `\n- Pagamento: ${newCollectedData.payment_method}`;
    
    // Instrução especial se produto selecionado mas sem tamanhos
    let additionalInstruction = '';
    if (newCollectedData.selected_sku && newCollectedData.categoria === 'aliancas' && !newCollectedData.tamanho_1) {
      additionalInstruction = `\n\nO cliente escolheu o produto ${newCollectedData.selected_name}. Pergunte os TAMANHOS de cada pessoa de forma natural: "Excelente escolha! Me diz, qual o tamanho de cada um?" Dica: mencione que geralmente fica entre 14 e 28.`;
    } else if (newCollectedData.selected_sku && newCollectedData.tamanho_1 && !newCollectedData.delivery_method) {
      additionalInstruction = `\n\nJá temos produto e tamanhos! Pergunte sobre entrega e pagamento: "Perfeito! Vocês preferem retirar na loja (Shopping Sumaúma) ou receber em casa? E vai ser Pix ou cartão?"`;
    }
    
    contextInfo += `\n\n=== ${nextStepInstruction}${additionalInstruction} ===`;


    // Buscar configuração da IA do banco de dados
    const { data: aiConfig } = await supabase
      .from('ai_agent_config')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    // Usar prompt do banco se disponível, senão usar o padrão
    const systemPrompt = aiConfig?.system_prompt || ALINE_SYSTEM_PROMPT;
    const model = "gpt-4o-mini"; // Modelo GPT-4o Mini (corrigido)
    const fullSystemPrompt = systemPrompt + contextInfo;

    console.log(`[ALINE-REPLY] Usando modelo: ${model}`);
    console.log(`[ALINE-REPLY] Histórico: ${historyMessages.length} mensagens`);

    // ========================================
    // PASSO 5: DETECTAR SE DEVE FORÇAR CATÁLOGO
    // ========================================
    const lastUserMessage = message.toLowerCase();
    
    // AMPLIADO: Incluir "medalha" como sinônimo de pingente
    const hasCategoryKeyword = /aliança|alianca|pingente|medalha|medalhinha|medalhas|anel|aneis/i.test(lastUserMessage);
    const hasColorKeyword = /dourada|dourado|prata|aço|aco|preta|preto|azul/i.test(lastUserMessage);
    const hasActionKeyword = /quero|ver|mostrar|mostra|catálogo|catalogo|opções|opcoes|valores?|saber/i.test(lastUserMessage);
    const hasOtherColorsKeyword = /outra(s)?\s*cor(es)?|tem\s*outras?|mais\s*op[çc][õo]es|outras\s*op[çc][õo]es/i.test(lastUserMessage);
    const isAffirmativeResponse = /^(sim|quero|pode|claro|ok|s|bora|show|isso|exato|perfeito|legal|boa|blz|beleza|pode ser|manda|mostra|opções)$/i.test(lastUserMessage.trim());
    
    // AMPLIADO: "medalha" = "pingente"
    const hasPingenteOrMedalha = /pingente|pingentes|medalha|medalhas|medalhinha|personalizada|com\s*foto|fotogravação/i.test(lastUserMessage);
    
    // NOVA LÓGICA: Forçar catálogo em mais cenários
    const isPingenteFlow = newCollectedData.categoria === 'pingente';
    const hasColorForPingente = isPingenteFlow && hasColorKeyword;
    
    const shouldForceCatalog = 
      (hasCategoryKeyword && hasColorKeyword) || 
      (hasActionKeyword && hasCategoryKeyword) ||
      (collectedData.cor && hasColorKeyword) ||
      hasOtherColorsKeyword ||
      hasPingenteOrMedalha || // AMPLIADO: forçar se perguntar sobre pingentes OU medalhas
      hasColorForPingente ||
      (isAffirmativeResponse && detectedCategoria && !newCollectedData.selected_sku) ||
      mudouCategoria ||
      querVerCatalogo ||
      (isPingenteFlow && !newCollectedData.selected_sku) || // NOVO: Se é pingente e não selecionou, mostrar catálogo
      (isPingenteFlow && finalCor);
    
    let toolChoice: any = "auto";
    if (shouldForceCatalog) {
      console.log(`[ALINE-REPLY] Forçando busca de catálogo - cenário: pingente=${isPingenteFlow}, hasPingenteOrMedalha=${hasPingenteOrMedalha}, mudou=${mudouCategoria}`);
      toolChoice = { type: "function", function: { name: "search_catalog" } };
    }

    // ========================================
    // PASSO 6: CHAMAR GPT-4.1 MINI (Chat Completions API)
    // ========================================
    console.log(`[ALINE-REPLY] Chamando OpenAI...`);

    const initialResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...historyMessages
        ],
        tools,
        tool_choice: toolChoice,
        max_tokens: 1000,
      }),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      console.error("[ALINE-REPLY] OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${initialResponse.status}`);
    }

    let responseData = await initialResponse.json();
    let assistantMessage = responseData.choices[0].message;

    console.log("[ALINE-REPLY] Resposta inicial recebida");

    // Variável para guardar os produtos do catálogo
    let catalogProducts: any[] = [];
    
    // ========================================
    // PASSO 7: PROCESSAR TOOL CALLS (se houver)
    // ========================================
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults: any[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[ALINE-REPLY] Executando tool: ${functionName}`, functionArgs);

        let result;
        if (functionName === "search_catalog") {
          // Passar collectedData para aplicar lógica casamento→tungstênio
          result = await searchCatalog(functionArgs, supabase, newCollectedData);
          
          if (result.success && result.products) {
            // NOVO: Salvar cores mostradas para futuras exclusões
            if (result.colors_shown && result.colors_shown.length > 0) {
              const coresAnteriores: string[] = Array.isArray(newCollectedData.cores_mostradas) 
                ? newCollectedData.cores_mostradas as string[]
                : [];
              const novasCores = [...coresAnteriores, ...result.colors_shown];
              newCollectedData.cores_mostradas = [...new Set(novasCores)];
              console.log(`[ALINE-REPLY] Cores acumuladas: ${(newCollectedData.cores_mostradas as string[]).join(', ')}`);
            }
            
            // Buscar configurações de exibição
            const sendVideoPriority = aiConfig?.send_video_priority ?? true;
            const includeSizes = aiConfig?.include_sizes ?? true;
            const includeStock = aiConfig?.include_stock ?? true;
            const includePrice = aiConfig?.include_price ?? true;
            
            catalogProducts = result.products.map((p: any, index: number) => {
              const hasVideo = sendVideoPriority && p.video_url;
              const mediaUrl = hasVideo ? p.video_url : p.image_url;
              const mediaType = hasVideo ? 'video' : 'image';
              
              return {
                ...p,
                index: index + 1,
                // Nomes padrão
                media_url: mediaUrl,
                media_type: mediaType,
                has_video: !!p.video_url,
                caption: formatProductCaption(p, { includePrice, includeSizes, includeStock }),
                // Nomes alternativos para compatibilidade com Fiqon
                url_midia: mediaUrl,
                tipo_midia: mediaType,
                tem_video: !!p.video_url,
                url_video: p.video_url || null,
                url_imagem: p.image_url,
                posicao: index + 1,
                tamanhos: p.sizes_formatted || '',
                nome: p.name,
                preco: p.price_formatted || `R$ ${(p.price || 0).toFixed(2).replace('.', ',')}`,
              };
            });
            
            console.log(`[ALINE-REPLY] Catálogo: ${catalogProducts.length} produtos`);
            
            // Resetar flags após buscar catálogo
            if (newCollectedData.quer_outras_cores) {
              delete newCollectedData.quer_outras_cores;
            }
            if (newCollectedData.mudou_categoria) {
              delete newCollectedData.mudou_categoria;
            }
            if (newCollectedData.quer_ver_catalogo) {
              delete newCollectedData.quer_ver_catalogo;
            }
          }
        } else if (functionName === "get_product_details") {
          result = await getProductDetails(functionArgs.sku, supabase);
        } else {
          result = { error: "Unknown function" };
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(result),
        });
      }

      // Segunda chamada com resultados das tools
      console.log("[ALINE-REPLY] Segunda chamada com resultados das tools...");
      
      const secondCallMessages = [
        { role: "system", content: fullSystemPrompt },
        ...historyMessages,
        {
          role: "assistant",
          content: assistantMessage.content || null,
          tool_calls: assistantMessage.tool_calls
        },
        ...toolResults,
      ];
      
      const finalResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: secondCallMessages,
          max_tokens: 1500,
        }),
      });

      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        console.error("[ALINE-REPLY] OpenAI API error (final):", errorText);
        throw new Error(`OpenAI API error: ${finalResponse.status}`);
      }

      responseData = await finalResponse.json();
      assistantMessage = responseData.choices[0].message;
    }

    const responseText = assistantMessage.content || "Desculpe, não consegui processar sua mensagem.";

    console.log("[ALINE-REPLY] Resposta final:", responseText.substring(0, 200) + "...");

    // ========================================
    // PASSO 8: EXTRAIR DADOS TÉCNICOS E LIMPAR MENSAGEM
    // ========================================
    const actionMatch = responseText.match(/\[SYSTEM_ACTION\s+action:"([^"]+)"\]/i);
    const actionValue = actionMatch ? actionMatch[1] : null;

    // Limpar mensagem de tags técnicas
    let cleanMessage = responseText
      .replace(/#node:\s*\w+/gi, "")
      .replace(/\[SYSTEM_ACTION[^\]]*\]/gi, "")
      .trim();

    // Remover linhas duplicadas
    const lines = cleanMessage.split('\n');
    const seenLines = new Set<string>();
    const uniqueLines: string[] = [];
    
    for (const line of lines) {
      const normalizedLine = line.trim().toLowerCase().replace(/\s+/g, ' ');
      if (line.trim() === '' || !seenLines.has(normalizedLine)) {
        uniqueLines.push(line);
        if (normalizedLine) seenLines.add(normalizedLine);
      }
    }
    cleanMessage = uniqueLines.join('\n').trim();
    
    // ========================================
    // LIMPEZA ESPECIAL: Remover detalhes dos produtos do texto
    // Quando há catálogo, o Fiqon envia os cards separadamente
    // Então o texto deve conter apenas a frase introdutória
    // ========================================
    if (catalogProducts.length > 0) {
      console.log(`[ALINE-REPLY] Limpando texto - produtos serão enviados como cards pelo Fiqon`);
      console.log(`[ALINE-REPLY] Texto antes da limpeza: "${cleanMessage.substring(0, 200)}..."`);
      
      // Processar linha por linha para melhor controle
      const linesToKeep: string[] = [];
      const lines = cleanMessage.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Pular linhas vazias
        if (!trimmedLine) continue;
        
        // Pular linhas que contêm informações de produto
        const isProductLine = 
          // Linhas numeradas (1. 2. 3. ou 1) 2) 3))
          /^\d+[\.\)]\s+/.test(trimmedLine) ||
          
          // Linhas que são nomes de produtos em negrito
          /^\*\*[^*]+\*\*\s*$/.test(trimmedLine) ||
          /^\*\*Aliança/.test(trimmedLine) ||
          /^\*\*aliança/.test(trimmedLine) ||
          /^\*\*Pingente/.test(trimmedLine) ||
          
          // Linhas com preço
          /💰/.test(trimmedLine) ||
          /R\$\s*[\d.,]+/.test(trimmedLine) ||
          /\*\*Preço\*\*/.test(trimmedLine) ||
          
          // Linhas com cor
          /🎨/.test(trimmedLine) ||
          /\*\*Cor\*\*/.test(trimmedLine) ||
          /^-?\s*🖤\s*Cor:/i.test(trimmedLine) ||
          /^-?\s*💛\s*Cor:/i.test(trimmedLine) ||
          /^-?\s*🤍\s*Cor:/i.test(trimmedLine) ||
          /^-?\s*💙\s*Cor:/i.test(trimmedLine) ||
          /Cor:\s*(dourada|prata|preta|azul|rose)/i.test(trimmedLine) ||
          
          // Linhas com tamanho
          /📏/.test(trimmedLine) ||
          /Tamanhos?:/.test(trimmedLine) ||
          
          // Linhas com estoque
          /✅\s*(Em )?estoque/i.test(trimmedLine) ||
          /⚠️/.test(trimmedLine) ||
          /Sob consulta/i.test(trimmedLine) ||
          /\*Produto indisponível\*/i.test(trimmedLine) ||
          /\*Este modelo/.test(trimmedLine) ||
          
          // Linhas com código/SKU
          /📦/.test(trimmedLine) ||
          /C[óo]d:/.test(trimmedLine) ||
          /SKU:/i.test(trimmedLine) ||
          
          // Links e imagens markdown
          /!\[.*\]\(https?:\/\//.test(trimmedLine) ||
          /\[Imagem.*\]\(https?:\/\//.test(trimmedLine) ||
          /\[Veja o vídeo.*\]\(https?:\/\//.test(trimmedLine) ||
          /\[Vídeo.*\]\(https?:\/\//.test(trimmedLine) ||
          /🎥/.test(trimmedLine) ||
          
          // URLs diretas de mídia
          /^https?:\/\/\S+\.(png|jpg|jpeg|gif|webp|mp4)/i.test(trimmedLine) ||
          /drive\.google\.com/.test(trimmedLine) ||
          
          // Linhas que começam com - seguido de emoji ou **
          /^-\s*(💰|📏|🎨|✅|⚠️|📦|🎥|\*\*)/.test(trimmedLine) ||
          /^-\s*\*Este modelo/.test(trimmedLine) ||
          /^-\s*\[Vídeo/.test(trimmedLine) ||
          
          // Linhas que são apenas um item de lista com hífen
          /^-\s*$/.test(trimmedLine);
        
        if (!isProductLine) {
          linesToKeep.push(line);
        }
      }
      
      let cleanedForCards = linesToKeep.join('\n').trim();
      
      // Remover ":" sozinho no final (resto de lista)
      cleanedForCards = cleanedForCards.replace(/:\s*$/, '');
      
      // IMPORTANTE: Quando há produtos, NÃO fazer pergunta na mensagem inicial!
      // O Fiqon vai enviar as fotos DEPOIS dessa mensagem, então a pergunta
      // ficaria antes das fotos. A pergunta será enviada APÓS as fotos pelo Fiqon.
      
      // Remover qualquer pergunta sobre os produtos da mensagem inicial
      cleanedForCards = cleanedForCards
        .replace(/\?[^\n]*/g, '') // Remove frases com interrogação
        .replace(/me (conta|diz|avisa|fala)[^.!?\n]*/gi, '') // Remove "me conta..."
        .replace(/qual.*aten[çc][aã]o[^.!?\n]*/gi, '') // Remove "qual chamou sua atenção"
        .replace(/gostou[^.!?\n]*/gi, '') // Remove "gostou de alguma"
        .replace(/\n{2,}/g, '\n') // Remove linhas vazias extras
        .trim();
      
      // Se a limpeza removeu tudo ou ficou muito curto, usar frase introdutória SIMPLES
      if (!cleanedForCards || cleanedForCards.length < 15) {
        cleanedForCards = "Separei algumas opções incríveis para você! 💍✨";
      }
      
      // NÃO adicionar pergunta aqui - ela será enviada APÓS as fotos pelo Fiqon
      
      console.log(`[ALINE-REPLY] Texto original: ${cleanMessage.length} chars → Limpo: ${cleanedForCards.length} chars`);
      console.log(`[ALINE-REPLY] Texto após limpeza (SEM pergunta - fotos vêm depois): "${cleanedForCards}"`);
      cleanMessage = cleanedForCards;
    }

    // ========================================
    // PASSO 9: DETECÇÃO INTELIGENTE DE PRODUTO (SKU, NÚMERO, POSIÇÃO)
    // ========================================
    
    // 1. Detectar SKU diretamente (ex: "quero o AC-015", "AC015", "pg-002")
    const skuPatterns = [
      /\b([A-Z]{2,3}[-\s]?\d{2,4})\b/i,  // AC-015, PG-002, AC 015
      /código\s*:?\s*([A-Z]{2,3}[-\s]?\d{2,4})/i,  // código: AC-015
      /cod\.?\s*:?\s*([A-Z]{2,3}[-\s]?\d{2,4})/i,  // cod: AC-015
    ];
    
    let detectedSku: string | null = null;
    for (const pattern of skuPatterns) {
      const match = normalizedMsg.match(pattern);
      if (match) {
        // Normalizar SKU (remover espaços, adicionar hífen)
        detectedSku = match[1].toUpperCase().replace(/\s+/g, '-').replace(/([A-Z]+)(\d+)/, '$1-$2');
        console.log(`[ALINE-REPLY] [NLU] SKU detectado: ${detectedSku}`);
        break;
      }
    }
    
    // Se detectou SKU, buscar produto no banco
    if (detectedSku && !newCollectedData.selected_sku) {
      const skuResult = await getProductDetails(detectedSku, supabase);
      if (skuResult.success && skuResult.product) {
        const p = skuResult.product;
        newCollectedData.selected_product = p;
        newCollectedData.selected_sku = p.sku;
        newCollectedData.selected_name = p.name;
        newCollectedData.selected_price = p.price;
        console.log(`[ALINE-REPLY] Produto por SKU: ${p.name} (${p.sku})`);
      } else {
        console.log(`[ALINE-REPLY] SKU não encontrado: ${detectedSku}`);
      }
    }
    
    // 2. Detectar seleção por número/posição do catálogo
    if (!newCollectedData.selected_sku) {
      // Padrões de seleção por número
      const numberPatterns = [
        /^(\d)$/,  // Só o número: "1", "2"
        /quero\s*o?\s*(\d)/i,  // "quero o 1", "quero 2"
        /escolho\s*o?\s*(\d)/i,  // "escolho o 3"
        /gostei\s*d[oa]?\s*(\d)/i,  // "gostei do 2"
        /prefiro\s*o?\s*(\d)/i,  // "prefiro o 1"
        /pode\s*ser\s*o?\s*(\d)/i,  // "pode ser o 2"
        /vou\s*de\s*(\d)/i,  // "vou de 1"
        /manda\s*o?\s*(\d)/i,  // "manda o 3"
        /esse\s*(\d)/i,  // "esse 2"
        /número\s*(\d)/i,  // "número 3"
      ];
      
      // Padrões ordinais
      const ordinalMap: Record<string, number> = {
        'primeiro': 1, 'primeira': 1,
        'segundo': 2, 'segunda': 2,
        'terceiro': 3, 'terceira': 3,
        'quarto': 4, 'quarta': 4,
        'quinto': 5, 'quinta': 5,
        'ultimo': 10, 'última': 10,
      };
      
      let productIndex: number | null = null;
      
      // Tentar padrões numéricos
      for (const pattern of numberPatterns) {
        const match = normalizedMsg.match(pattern);
        if (match) {
          productIndex = parseInt(match[1]) - 1;
          console.log(`[ALINE-REPLY] [NLU] Número detectado: ${productIndex + 1}`);
          break;
        }
      }
      
      // Tentar ordinais
      if (productIndex === null) {
        for (const [word, idx] of Object.entries(ordinalMap)) {
          if (normalizedMsg.includes(word)) {
            productIndex = idx - 1;
            console.log(`[ALINE-REPLY] [NLU] Ordinal detectado: ${word} → ${idx}`);
            break;
          }
        }
      }
      
      // Buscar do catálogo atual ou do último catálogo salvo
      const catalogSource = catalogProducts.length > 0 
        ? catalogProducts 
        : (collectedData.last_catalog || []);
      
      if (productIndex !== null && catalogSource.length > 0) {
        // Ajustar "último" para o último item real
        if (productIndex >= catalogSource.length) {
          productIndex = catalogSource.length - 1;
        }
        
        if (productIndex >= 0 && productIndex < catalogSource.length) {
          const selectedProduct = catalogSource[productIndex];
          newCollectedData.selected_product = selectedProduct;
          newCollectedData.selected_sku = selectedProduct.sku;
          newCollectedData.selected_name = selectedProduct.name;
          newCollectedData.selected_price = selectedProduct.price;
          console.log(`[ALINE-REPLY] Produto por posição #${productIndex + 1}: ${selectedProduct.name}`);
        }
      }
    }
    
    // ========================================
    // PASSO 9.5: DETECTAR TAMANHOS DE ALIANÇA
    // ========================================
    // Padrões para detectar tamanhos (números entre 10-30 geralmente)
    const sizePatterns = [
      /tamanho[s]?\s*:?\s*(\d{1,2})\s*(?:e|,|\/|\s)\s*(\d{1,2})/i,  // "tamanho 18 e 22", "tamanhos: 18, 22"
      /tamanho[s]?\s*:?\s*(\d{1,2})/i,  // "tamanho 18" (só um)
      /tam\.?\s*:?\s*(\d{1,2})\s*(?:e|,|\/|\s)\s*(\d{1,2})/i,  // "tam 18 e 22"
      /tam\.?\s*:?\s*(\d{1,2})/i,  // "tam 18"
      /número[s]?\s*:?\s*(\d{1,2})\s*(?:e|,|\/|\s)\s*(\d{1,2})/i,  // "número 18 e 22"
      /n[úu]mero[s]?\s*(\d{1,2})/i,  // "número 18"
      /aro\s*:?\s*(\d{1,2})\s*(?:e|,|\/|\s)\s*(\d{1,2})/i,  // "aro 18 e 22"
      /aro\s*:?\s*(\d{1,2})/i,  // "aro 18"
      /medida[s]?\s*:?\s*(\d{1,2})\s*(?:e|,|\/|\s)\s*(\d{1,2})/i,  // "medida 18 e 22"
      /(\d{1,2})\s*(?:e|,|\/)\s*(\d{1,2})\s*(?:tamanho|tam|aro)?/i,  // "18 e 22", "18/22"
    ];
    
    // Padrões para contexto de "dele/dela"
    const contextPatterns = [
      /(?:o?\s*(?:dele|meu|homem|noivo|marido))\s*(?:é|:)?\s*(\d{1,2}).*?(?:o?\s*(?:dela|minha|mulher|noiva|esposa))\s*(?:é|:)?\s*(\d{1,2})/i,
      /(?:o?\s*(?:dela|minha|mulher|noiva|esposa))\s*(?:é|:)?\s*(\d{1,2}).*?(?:o?\s*(?:dele|meu|homem|noivo|marido))\s*(?:é|:)?\s*(\d{1,2})/i,
      /(?:eu|meu)\s*(?:uso|é|:)?\s*(\d{1,2}).*?(?:ele|ela|parceiro|namorad[oa])\s*(?:usa|é|:)?\s*(\d{1,2})/i,
    ];
    
    let size1: string | null = null;
    let size2: string | null = null;
    
    // Tentar padrões de contexto primeiro (mais específicos)
    for (const pattern of contextPatterns) {
      const match = message.match(pattern);
      if (match) {
        size1 = match[1];
        size2 = match[2];
        console.log(`[ALINE-REPLY] [NLU] Tamanhos por contexto: ${size1} e ${size2}`);
        break;
      }
    }
    
    // Se não encontrou, tentar padrões gerais
    if (!size1) {
      for (const pattern of sizePatterns) {
        const match = message.match(pattern);
        if (match) {
          size1 = match[1];
          size2 = match[2] || null;
          console.log(`[ALINE-REPLY] [NLU] Tamanhos detectados: ${size1}${size2 ? ' e ' + size2 : ''}`);
          break;
        }
      }
    }
    
    // Validar tamanhos (geralmente entre 10-30 para alianças)
    const isValidSize = (s: string | null): boolean => {
      if (!s) return false;
      const num = parseInt(s);
      return num >= 8 && num <= 35;
    };
    
    if (isValidSize(size1)) {
      newCollectedData.tamanho_1 = size1;
      if (isValidSize(size2)) {
        newCollectedData.tamanho_2 = size2;
      }
      console.log(`[ALINE-REPLY] Tamanhos salvos: ${size1}${size2 ? ' e ' + size2 : ''}`);
    }
    
    // Detectar se é PAR ou UNIDADE
    if (/\bpar\b|dois|duas|casal|ambos/i.test(normalizedMsg)) {
      newCollectedData.quantidade_tipo = 'par';
    } else if (/\bunidade\b|uma|só uma|apenas uma|avulsa/i.test(normalizedMsg)) {
      newCollectedData.quantidade_tipo = 'unidade';
    }

    // Coletar entrega
    if (/retirada|retirar|loja|buscar|shopping|sumaúma|sumáuma/.test(normalizedMsg)) {
      newCollectedData.delivery_method = 'retirada';
    } else if (/entrega|envio|delivery|enviar|casa|endereço|endereco|receber/.test(normalizedMsg)) {
      newCollectedData.delivery_method = 'entrega';
    }

    // Coletar pagamento
    if (/\bpix\b/.test(normalizedMsg)) {
      newCollectedData.payment_method = 'pix';
    } else if (/cartão|cartao|credito|crédito|debito|débito/.test(normalizedMsg)) {
      newCollectedData.payment_method = 'cartao';
    }

    // Detectar envio de foto (para fotogravação em pingentes)
    // Verificar se a mensagem contém uma mídia (será detectada pela presença de URL de imagem)
    // OU se o cliente menciona que enviou/vai enviar foto
    if (/enviei|mandei|segue a foto|aqui a foto|foto.*grav|grav.*foto/i.test(normalizedMsg)) {
      newCollectedData.foto_gravacao = 'pendente_confirmacao';
      console.log(`[ALINE-REPLY] [NLU] Cliente indicou que enviou foto para gravação`);
    }

    // ========================================
    // PASSO 10: CALCULAR NODE FINAL (COM DADOS ADICIONAIS)
    // Lógica: só finaliza quando tiver TODOS os dados necessários
    // ========================================
    const finalProduto = newCollectedData.selected_sku as string | undefined;
    const finalTamanho = newCollectedData.tamanho_1 as string | undefined;
    const finalEntrega = newCollectedData.delivery_method as string | undefined;
    const finalPagamento = newCollectedData.payment_method as string | undefined;
    const finalFoto = newCollectedData.foto_gravacao as string | undefined;
    const isPingenteCategoria = finalCategoria === 'pingente';
    const isAliancaCategoria = finalCategoria === 'aliancas';

    // Verificar se tem todos os dados necessários para finalizar
    const temProduto = !!finalProduto;
    const temTamanho = !!finalTamanho || isPingenteCategoria; // Pingentes não precisam de tamanho
    const temEntrega = !!finalEntrega;
    const temPagamento = !!finalPagamento;
    const temFoto = !!finalFoto || !isPingenteCategoria; // Só pingentes precisam de foto
    
    const podeFinalizarAtendimento = temProduto && temTamanho && temEntrega && temPagamento && temFoto;

    // Calcular node baseado nos dados coletados
    let nodeValue: string;
    
    if (podeFinalizarAtendimento) {
      nodeValue = 'finalizado';
    } else if (temProduto && temTamanho && temEntrega && !temPagamento) {
      nodeValue = 'coleta_pagamento';
    } else if (temProduto && temTamanho && !temEntrega) {
      nodeValue = 'coleta_entrega';
    } else if (temProduto && isAliancaCategoria && !temTamanho) {
      nodeValue = 'coleta_tamanhos';
    } else if (temProduto && isPingenteCategoria && !temFoto) {
      nodeValue = 'coleta_foto';
    } else if (temProduto && isPingenteCategoria && temFoto && !temEntrega) {
      nodeValue = 'coleta_entrega';
    } else if (catalogProducts.length > 0) {
      nodeValue = 'catalogo';
    } else {
      nodeValue = nextStep; // Usar o próximo passo calculado anteriormente
    }

    console.log(`[ALINE-REPLY] Node final: ${nodeValue}`);
    console.log(`[ALINE-REPLY] Verificação: produto=${temProduto} (${finalProduto}), tamanho=${temTamanho} (${finalTamanho}), entrega=${temEntrega} (${finalEntrega}), pagamento=${temPagamento} (${finalPagamento}), foto=${temFoto} (${finalFoto})`);
    console.log(`[ALINE-REPLY] Pode finalizar atendimento? ${podeFinalizarAtendimento}`);

    // ========================================
    // PASSO 11: PROTEÇÃO ANTI-LOOP E ANTI-SAUDAÇÃO REPETIDA
    // ========================================
    
    // Buscar últimas 5 mensagens da Aline para verificar padrões
    const { data: lastAlineMsgs } = await supabase
      .from('aline_messages')
      .select('message')
      .eq('conversation_id', conversation.id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(5);

    const cleanMessageNormalized = cleanMessage.toLowerCase().replace(/\s+/g, ' ').trim();
    const lastMsgNormalized = lastAlineMsgs?.[0]?.message?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
    
    // PROTEÇÃO 1: Resposta idêntica à anterior
    if (cleanMessageNormalized.substring(0, 100) === lastMsgNormalized.substring(0, 100) && lastMsgNormalized.length > 20) {
      console.log(`[ALINE-REPLY] LOOP DETECTADO! Resposta idêntica à anterior. Ignorando.`);
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'loop_detected',
        message: 'Resposta idêntica detectada, ignorando para evitar loop',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // PROTEÇÃO 2: Saudação repetida (já se apresentou antes)
    const isSaudacao = /ol[áa]!?\s*😊?\s*(sou a aline|sou aline|aqui é a aline)/i.test(cleanMessage);
    const jaSaudouAntes = lastAlineMsgs?.some((m: any) => 
      /ol[áa]!?\s*😊?\s*(sou a aline|sou aline|aqui é a aline)/i.test(m.message || '')
    );
    
    if (isSaudacao && jaSaudouAntes) {
      console.log(`[ALINE-REPLY] SAUDAÇÃO REPETIDA! Removendo saudação...`);
      // Remover a saudação e manter o resto da mensagem
      cleanMessage = cleanMessage
        .replace(/ol[áa]!?\s*😊?\s*(sou a aline|sou aline)[^.!?]*[.!?]?\s*/gi, '')
        .replace(/sou a aline[^.!?]*[.!?]?\s*/gi, '')
        .replace(/da acium manaus[^.!?]*[.!?]?\s*/gi, '')
        .trim();
      
      // Se ficou vazio após remover saudação, usar mensagem padrão
      if (!cleanMessage || cleanMessage.length < 10) {
        cleanMessage = "O que você está procurando hoje? Alianças ou pingentes? 💍";
      }
    }
    
    // PROTEÇÃO 3: Verificar se está repetindo mesma pergunta múltiplas vezes
    const perguntaCor = /qual\s*cor|cor\s*(você|voce)\s*prefere|cores?\s*disponíve/i.test(cleanMessage);
    const jaPerguntoiCorAntes = lastAlineMsgs?.filter((m: any) => 
      /qual\s*cor|cor\s*(você|voce)\s*prefere|cores?\s*disponíve/i.test(m.message || '')
    ).length || 0;
    
    if (perguntaCor && jaPerguntoiCorAntes >= 2) {
      console.log(`[ALINE-REPLY] Pergunta sobre cor repetida ${jaPerguntoiCorAntes}x! Forçando catálogo...`);
      // Se já perguntou cor 2+ vezes, deveria mostrar catálogo ao invés de perguntar de novo
      if (newCollectedData.categoria && catalogProducts.length === 0) {
        cleanMessage = "Deixa eu te mostrar as opções que temos! 💍";
      }
    }

    console.log(`[ALINE-REPLY] Action: ${actionValue}`);

    // Salvar catálogo no collected_data
    if (catalogProducts.length > 0) {
      newCollectedData.last_catalog = catalogProducts.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        image_url: p.image_url,
      }));
    }

    // ========================================
    // PASSO 12: ATUALIZAR CONVERSA E SALVAR RESPOSTA
    // ========================================
    await supabase
      .from('aline_conversations')
      .update({
        current_node: nodeValue,
        last_node: conversation.current_node,
        collected_data: newCollectedData,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    // Salvar resposta da Aline
    await supabase.from('aline_messages').insert({
      conversation_id: conversation.id,
      role: 'assistant',
      message: cleanMessage,
      node: nodeValue,
      actions_executed: actionValue ? [{ action: actionValue }] : null,
    });

    // Salvar no CRM também
    if (crmConversationId) {
      await supabase.from('messages').insert({
        conversation_id: crmConversationId,
        content: cleanMessage,
        is_from_me: true,
        message_type: 'text',
        status: 'sent'
      });

      // Atualizar última mensagem
      await supabase
        .from('conversations')
        .update({ last_message: cleanMessage.substring(0, 100) })
        .eq('id', crmConversationId);
    }

    // ========================================
    // PASSO 13: ENCAMINHAR AO VENDEDOR (SOMENTE SE TIVER TODOS OS DADOS)
    // ========================================
    // Só encaminha se: produto + tamanho (alianças) + entrega + pagamento + foto (pingentes)
    if (podeFinalizarAtendimento && (actionValue === 'register_lead_crm' || nodeValue === 'finalizado')) {
      console.log(`[ALINE-REPLY] ✅ TODOS os dados coletados! Finalizando e encaminhando ao vendedor...`);
      console.log(`[ALINE-REPLY] Resumo: produto=${finalProduto}, tamanho=${finalTamanho}, entrega=${finalEntrega}, pagamento=${finalPagamento}`);
      
      // Atualizar status da conversa para human_takeover
      await supabase
        .from('aline_conversations')
        .update({ 
          status: 'human_takeover',
          assignment_reason: 'Pedido completo - todos os dados coletados'
        })
        .eq('id', conversation.id);

      // Atualizar lead_status no CRM
      if (crmConversationId) {
        await supabase
          .from('conversations')
          .update({ lead_status: 'comprador' })
          .eq('id', crmConversationId);
      }
      
      // Chamar aline-takeover para encaminhar automaticamente para um vendedor online
      try {
        console.log(`[ALINE-REPLY] Chamando aline-takeover para atribuir vendedor...`);
        const takeoverResponse = await fetch(`${supabaseUrl}/functions/v1/aline-takeover`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            phone,
            action: 'auto_forward',
            reason: `Pedido completo: ${newCollectedData.selected_name || finalProduto} - ${finalEntrega} - ${finalPagamento}`,
            send_intro: true,
          }),
        });
        
        if (takeoverResponse.ok) {
          const takeoverResult = await takeoverResponse.json();
          console.log(`[ALINE-REPLY] Takeover result:`, takeoverResult);
        } else {
          console.error(`[ALINE-REPLY] Erro ao chamar aline-takeover:`, await takeoverResponse.text());
        }
      } catch (takeoverError) {
        console.error(`[ALINE-REPLY] Erro ao encaminhar para vendedor:`, takeoverError);
      }
    } else if (nodeValue === 'finalizado' && !podeFinalizarAtendimento) {
      // Corrigir node se ainda faltam dados
      console.log(`[ALINE-REPLY] ⚠️ Tentou finalizar mas faltam dados. Corrigindo node...`);
      // Recalcular o node correto
      if (!temProduto) {
        nodeValue = 'catalogo';
      } else if (!temTamanho && isAliancaCategoria) {
        nodeValue = 'coleta_tamanhos';
      } else if (!temFoto && isPingenteCategoria) {
        nodeValue = 'coleta_foto';
      } else if (!temEntrega) {
        nodeValue = 'coleta_entrega';
      } else if (!temPagamento) {
        nodeValue = 'coleta_pagamento';
      }
    }

    // ========================================
    // RESPOSTA FINAL
    // ========================================
    console.log(`[ALINE-REPLY] ====== FIM ======`);
    
    // Versão da mensagem sem quebras de linha (para JSON seguro no Fiqon)
    const mensagemSemQuebras = cleanMessage.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    
    return new Response(
      JSON.stringify({
        success: true,
        
        // Mensagem principal
        response: cleanMessage,
        mensagem_whatsapp: cleanMessage,
        
        // NOVO: Mensagem sem quebras para uso seguro em JSON no Fiqon
        reply_text: mensagemSemQuebras,
        mensagem_linha_unica: mensagemSemQuebras,
        
        // Dados técnicos
        node_tecnico: nodeValue,
        acao_nome: actionValue,
        tem_acao: actionValue !== null,
        
        // Produtos (para FiqOn/Z-API)
        produtos: catalogProducts,
        total_produtos: catalogProducts.length,
        tem_produtos: catalogProducts.length > 0,
        
        // NOVO: Mensagem de engajamento para enviar APÓS as fotos
        // O Fiqon deve enviar esta mensagem DEPOIS de enviar todos os produtos
        mensagem_pos_catalogo: catalogProducts.length > 0 
          ? "Gostou de alguma? Me conta qual chamou mais sua atenção! 😊"
          : null,
        enviar_mensagem_pos_catalogo: catalogProducts.length > 0,
        
        // Produto selecionado
        produto_selecionado: newCollectedData.selected_product || null,
        tem_produto_selecionado: !!newCollectedData.selected_product,
        
        // Dados coletados
        categoria_crm: newCollectedData.categoria || null,
        cor_crm: newCollectedData.cor || null,
        
        // Memória
        memoria: {
          phone,
          stage: nodeValue,
          categoria: newCollectedData.categoria,
          finalidade: newCollectedData.finalidade,
          cor: newCollectedData.cor,
          produto_sku: newCollectedData.selected_sku,
          produto_nome: newCollectedData.selected_name,
          produto_preco: newCollectedData.selected_price,
          tamanho_1: newCollectedData.tamanho_1 || null,
          tamanho_2: newCollectedData.tamanho_2 || null,
          quantidade_tipo: newCollectedData.quantidade_tipo || null,
          entrega: newCollectedData.delivery_method,
          pagamento: newCollectedData.payment_method,
        },
        
        // Tamanhos detectados (para Fiqon)
        tamanhos: {
          tamanho_1: newCollectedData.tamanho_1 || null,
          tamanho_2: newCollectedData.tamanho_2 || null,
          tem_tamanhos: !!(newCollectedData.tamanho_1 || newCollectedData.tamanho_2),
          quantidade_tipo: newCollectedData.quantidade_tipo || 'par',
        },
        
        // Debug
        ai_model: model,
        usage: responseData.usage,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[ALINE-REPLY] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        response: "Desculpe, ocorreu um erro. Por favor, tente novamente.",
        mensagem_whatsapp: "Desculpe, ocorreu um erro. Por favor, tente novamente.",
        produtos: [],
        tem_produtos: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
