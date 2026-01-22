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
      
      PARÂMETROS IMPORTANTES:
      - category: "aliancas" para todas as alianças, "pingente" para pingentes
      - color: cor normalizada (dourada, aco, prata, preta, azul)
      - search: use para buscar por nome ou descrição específica
      - only_available: sempre use true para mostrar apenas produtos em estoque`,
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
            description: "Cor do produto. Use quando o cliente especificar preferência de cor."
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
(Versão Humanizada - Sem Menus Numéricos)

---

## IDENTIDADE

Você é **Aline**, consultora especialista em joias da **ACIUM Manaus**.
Você conversa de forma NATURAL, como uma vendedora experiente faria.
NUNCA use menus numerados (1️⃣, 2️⃣, etc).
Faça perguntas ABERTAS e entenda o que o cliente quer.

**Tom de voz:**  
- Elegante, profissional, acolhedora
- Frases curtas e naturais
- Emojis com moderação (💍✨🎁)
- NUNCA robótica ou mecânica

---

## CATEGORIAS DISPONÍVEIS

- **Alianças de Namoro/Compromisso** (peças de aço)
- **Alianças de Casamento** (peças de tungstênio)
- **Pingentes** (com opção de fotogravação)

**Cores disponíveis:**
- Alianças: dourada, prata (aço), preta, azul
- Pingentes: dourada, prata

---

## REGRAS DE OURO

1. **NUNCA** use menus numerados
2. **SEMPRE** entenda linguagem natural
3. **MÁXIMO** 1 mensagem por vez
4. **NUNCA** repita perguntas já respondidas
5. Use a memória da conversa

---

## FLUXO CONVERSACIONAL NATURAL

### Se cliente menciona tudo de uma vez:
"Quero ver alianças douradas de casamento"
→ Use search_catalog IMEDIATAMENTE
→ "Que momento especial! Vou te mostrar nossas opções de alianças douradas para casamento! ✨"

### Se cliente só cumprimenta:
"Oi" / "Olá" / "Boa tarde"
→ "Olá! 😊 Sou a Aline, da ACIUM Manaus. Estou aqui para te ajudar a encontrar a joia perfeita! O que você está procurando hoje? Alianças ou pingentes?"

### Se cliente menciona categoria:
"Quero ver alianças" / "Vocês têm pingentes?"
→ Se ALIANÇAS: "Que lindo! 💍 Vocês estão celebrando namoro/compromisso ou casamento?"
→ Se PINGENTES: "Ótima escolha! 💫 Qual cor você prefere? Temos em dourada e prata."

### Se cliente menciona cor:
"Quero dourada" / "Prefiro prata"
→ Se faltam dados: pergunte o que falta naturalmente
→ Se tem tudo: use search_catalog

---

## EXEMPLOS DE CONVERSA NATURAL

❌ ERRADO (robótico):
"Escolha uma opção:
1️⃣ Alianças
2️⃣ Pingentes"

✅ CORRETO (humano):
"O que você está procurando hoje? Temos lindas alianças e pingentes personalizados!"

❌ ERRADO:
"Qual cor? 1️⃣ Dourada 2️⃣ Prata 3️⃣ Preta"

✅ CORRETO:
"E qual cor vocês preferem? Temos opções em dourada, prata, preta e azul."

---

## DETECÇÃO INTELIGENTE (O QUE VOCÊ DEVE ENTENDER)

**Categoria:**
- "aliança", "alianças", "par de alianças" → aliancas
- "pingente", "pingentes", "colar" → pingente

**Finalidade (só para alianças):**
- "namoro", "compromisso", "namorada", "namorado" → namoro
- "casamento", "casar", "noiva", "noivo", "noivado" → casamento

**Cor:**
- "dourada", "dourado", "ouro", "gold" → dourada
- "prata", "prateada", "aço", "aco", "silver" → prata
- "preta", "preto", "black" → preta
- "azul", "blue" → azul

---

## QUANDO DISPARAR CATÁLOGO (search_catalog)

CHAME search_catalog quando tiver:
- **Alianças:** categoria + finalidade + cor
- **Pingentes:** categoria + cor

Exemplo de chamada:
\`search_catalog({ category: "aliancas", color: "dourada" })\`

Após buscar, diga naturalmente:
"Encontrei algumas opções maravilhosas! Veja com calma e me diz qual chamou sua atenção 💍"

---

## PINGENTES COM FOTOGRAVAÇÃO

- Gravação de UM LADO é GRATUITA
- Dois lados tem custo adicional

"Esse pingente permite fotogravação personalizada! 📸 A gravação de um lado já está inclusa no valor. Me manda a foto que você quer gravar!"

---

## PRÉ-FECHAMENTO

Quando cliente escolher produto:
"Excelente escolha! 💍 
Para finalizar, me conta: você prefere retirar na nossa loja no Shopping Sumaúma ou receber em casa?
E vai pagar com Pix ou cartão?"

---

## FINALIZAÇÃO

"Perfeito! Já tenho tudo anotado! 🎉
Vou passar para nosso vendedor finalizar. Ele te chama em instantes!
Foi um prazer te atender! 💍"

[SYSTEM_ACTION action:"register_lead_crm"]

---

## INFORMAÇÕES DA LOJA

- **Endereço:** Shopping Sumaúma, Av. Noel Nutels, Manaus-AM
- **Entrega:** 10 HORAS após fechamento (nosso diferencial!)
- **Horário:** Segunda a Sábado, 10h às 22h

---

## MARCADORES TÉCNICOS

No final de CADA resposta, adicione:
- #node: abertura
- #node: escolha_finalidade
- #node: escolha_cor
- #node: catalogo
- #node: selecao
- #node: coleta_dados
- #node: finalizado`;

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

// Função para buscar catálogo
async function searchCatalog(
  params: Record<string, any>,
  supabase: any
): Promise<any> {
  console.log(`[ALINE-REPLY] Buscando catálogo:`, params);
  
  let query = supabase
    .from('products')
    .select(`
      id, name, sku, price, image_url, video_url, category, color, description,
      product_variants(size, stock)
    `)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(params.limit || 10);
  
  if (params.category) {
    query = query.ilike('category', `%${params.category}%`);
  }
  
  if (params.color) {
    query = query.ilike('color', `%${params.color}%`);
  }
  
  if (params.search) {
    query = query.or(`name.ilike.%${params.search}%,description.ilike.%${params.search}%`);
  }
  
  if (params.min_price) {
    query = query.gte('price', params.min_price);
  }
  
  if (params.max_price) {
    query = query.lte('price', params.max_price);
  }
  
  const { data: products, error } = await query;
  
  if (error) {
    console.error(`[ALINE-REPLY] Erro ao buscar produtos:`, error);
    return { success: false, error: error.message, products: [] };
  }
  
  // Processar produtos
  const processedProducts = (products || []).map((p: any, index: number) => {
    const sizes = (p.product_variants || []).map((v: any) => v.size);
    const totalStock = (p.product_variants || []).reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
    
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
    };
  });
  
  console.log(`[ALINE-REPLY] Encontrados ${processedProducts.length} produtos`);
  
  return {
    success: true,
    products: processedProducts,
    total: processedProducts.length,
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
    
    // Detectar CATEGORIA em qualquer mensagem
    if (!hasCategoria) {
      if (/aliança|alianca|alianças|aliancas|par de aliança|par de alianças/i.test(normalizedMsg)) {
        newCollectedData.categoria = 'aliancas';
        console.log(`[ALINE-REPLY] [NLU] Categoria: aliancas`);
      } else if (/pingente|pingentes|colar|colares/i.test(normalizedMsg)) {
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

    // Calcular próximo passo ANTES de chamar a IA
    const finalCategoria = newCollectedData.categoria as string | undefined;
    const finalFinalidade = newCollectedData.finalidade as string | undefined;
    const finalCor = newCollectedData.cor as string | undefined;
    
    let nextStep: string;
    let nextStepInstruction: string;
    
    // Instruções NATURAIS (sem menus numerados)
    if (finalCor) {
      nextStep = 'catalogo';
      nextStepInstruction = `O cliente já informou tudo: categoria "${finalCategoria}", finalidade "${finalFinalidade || 'N/A'}", cor "${finalCor}". Use search_catalog AGORA para mostrar os produtos. Diga algo como "Vou te mostrar algumas opções incríveis!"`;
    } else if (finalCategoria === 'aliancas' && finalFinalidade) {
      nextStep = 'escolha_cor';
      nextStepInstruction = `O cliente escolheu alianças de ${finalFinalidade}. Pergunte a cor de forma NATURAL: "E qual cor vocês preferem? Temos em dourada, prata (aço), preta e azul." NUNCA use números.`;
    } else if (finalCategoria === 'pingente') {
      nextStep = 'escolha_cor';
      nextStepInstruction = `O cliente escolheu pingentes. Pergunte a cor de forma NATURAL: "Qual cor você prefere? Temos em dourada e prata." NUNCA use números.`;
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
    
    if (contact_name || newCollectedData.contact_name) {
      contextInfo += `\nO nome do cliente é: ${contact_name || newCollectedData.contact_name}`;
    }
    
    contextInfo += `\n\n=== DADOS JÁ COLETADOS ===`;
    if (newCollectedData.categoria) contextInfo += `\n- Categoria: ${newCollectedData.categoria}`;
    if (newCollectedData.finalidade) contextInfo += `\n- Finalidade: ${newCollectedData.finalidade}`;
    if (newCollectedData.cor) contextInfo += `\n- Cor: ${newCollectedData.cor}`;
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
    const hasCategoryKeyword = /aliança|alianca|pingente|anel|aneis/i.test(lastUserMessage);
    const hasColorKeyword = /dourada|dourado|prata|aço|aco|preta|preto|azul/i.test(lastUserMessage);
    const hasActionKeyword = /quero|ver|mostrar|mostra|catálogo|catalogo|opções|opcoes/i.test(lastUserMessage);
    
    const shouldForceCatalog = (hasCategoryKeyword && hasColorKeyword) || 
                               (hasActionKeyword && hasCategoryKeyword) ||
                               (collectedData.cor && hasColorKeyword);
    
    let toolChoice: any = "auto";
    if (shouldForceCatalog) {
      console.log("[ALINE-REPLY] Forçando busca de catálogo - keywords detectadas");
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
          result = await searchCatalog(functionArgs, supabase);
          
          if (result.success && result.products) {
            // Buscar configurações de exibição
            const sendVideoPriority = aiConfig?.send_video_priority ?? true;
            const includeSizes = aiConfig?.include_sizes ?? true;
            const includeStock = aiConfig?.include_stock ?? true;
            const includePrice = aiConfig?.include_price ?? true;
            
            catalogProducts = result.products.map((p: any, index: number) => ({
              ...p,
              index: index + 1,
              media_url: sendVideoPriority && p.video_url ? p.video_url : p.image_url,
              media_type: sendVideoPriority && p.video_url ? 'video' : 'image',
              caption: formatProductCaption(p, { includePrice, includeSizes, includeStock }),
            }));
            
            console.log(`[ALINE-REPLY] Catálogo: ${catalogProducts.length} produtos`);
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

    // ========================================
    // PASSO 10: CALCULAR NODE FINAL (COM DADOS ADICIONAIS)
    // ========================================
    const finalProduto = newCollectedData.selected_sku as string | undefined;
    const finalEntrega = newCollectedData.delivery_method as string | undefined;
    const finalPagamento = newCollectedData.payment_method as string | undefined;

    let nodeValue: string;
    if (finalEntrega && finalPagamento) {
      nodeValue = 'finalizado';
    } else if (finalProduto) {
      nodeValue = 'coleta_dados';
    } else {
      nodeValue = nextStep; // Usar o próximo passo calculado no PASSO 4
    }

    console.log(`[ALINE-REPLY] Node final: ${nodeValue} (dados: categoria=${finalCategoria}, finalidade=${finalFinalidade}, cor=${finalCor})`);

    // ========================================
    // PASSO 11: PROTEÇÃO ANTI-LOOP
    // ========================================
    const { data: lastAlineMsg } = await supabase
      .from('aline_messages')
      .select('message')
      .eq('conversation_id', conversation.id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const cleanMessageNormalized = cleanMessage.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 100);
    const lastMessageNormalized = lastAlineMsg?.message?.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 100) || '';

    if (cleanMessageNormalized === lastMessageNormalized && lastMessageNormalized.length > 20) {
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
    // PASSO 11: ENCAMINHAR AO VENDEDOR (se finalizado)
    // ========================================
    if (actionValue === 'register_lead_crm' || nodeValue === 'finalizado') {
      console.log(`[ALINE-REPLY] Finalizando atendimento e encaminhando ao vendedor...`);
      
      // Atualizar status da conversa
      await supabase
        .from('aline_conversations')
        .update({ status: 'finished' })
        .eq('id', conversation.id);

      // Atualizar lead_status no CRM
      if (crmConversationId) {
        await supabase
          .from('conversations')
          .update({ lead_status: 'comprador' })
          .eq('id', crmConversationId);
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
