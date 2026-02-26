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
      description: `OBRIGATÓRIO usar para mostrar produtos ao cliente. Os produtos são enviados como CARDS VISUAIS com foto, preço e código.
      
      🚨 CRÍTICO - SEMPRE USE O PARÂMETRO "color" QUANDO O CLIENTE ESPECIFICAR UMA COR!
      
      QUANDO USAR:
      - Cliente escolheu categoria (alianças, pingentes ou anéis) E/OU cor
      - Cliente pediu para "ver", "mostrar", "quero ver" produtos
      - Cliente mencionou tipo específico (casamento, namoro, compromisso)
      - Cliente perguntou "outras cores?", "tem outras?", "mais opções?"
      
      PARÂMETROS IMPORTANTES:
      - category: "aliancas" para todas as alianças, "pingente" para pingentes, "aneis" para anéis
      - color: 🚨 OBRIGATÓRIO quando cliente especificar cor! Use exatamente: "dourada", "prata", "preta", "azul", "rose"
        → Cliente disse "azul" → color="azul"
        → Cliente disse "dourada" → color="dourada"
        → Cliente disse "prata" ou "aço" → color="prata"
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
            enum: ["dourada", "prata", "preta", "azul", "rose"],
            description: "🚨 CRÍTICO: SEMPRE USE quando cliente especificar cor! Exemplos: cliente disse 'azul' → use 'azul'. Cliente disse 'dourada' → use 'dourada'."
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

// System prompt da Aline - VERSÃO COMPACTA E DIRETA
// IMPORTANTE: Aline NUNCA responde sobre preços/produtos com texto - SEMPRE envia catálogo visual!
const ALINE_SYSTEM_PROMPT = `# ALINE — Consultora Virtual ACIUM Manaus

## IDENTIDADE
Você é **Aline**, consultora de joias da **ACIUM Manaus**.
Tom: Elegante, objetiva, acolhedora. Emojis moderados (💍✨).
MÁXIMO 2-3 linhas por resposta. SEM textos longos.

---

## 🚨 REGRAS ABSOLUTAS - NUNCA QUEBRE ESSAS REGRAS:

1. **RESPOSTAS ULTRA-CURTAS**: Máximo 2-3 linhas. NUNCA mais de 3 linhas.
2. **NUNCA LISTE PRODUTOS NO TEXTO** - os produtos são enviados automaticamente como CARDS VISUAIS com foto, preço e código.
3. **NUNCA DESCREVA PRODUTOS** - diga APENAS uma frase curta tipo "Separei opções lindas! 💍" 
4. **NUNCA DIGA PREÇOS NO TEXTO** - os preços aparecem nos CARDS automaticamente.
5. **NUNCA DIGA "aqui estão algumas opções" + lista** - isso é PROIBIDO! Use apenas frase curta.
6. **NÃO repita saudação** - Se já disse "Sou a Aline", NÃO repita.

⚠️ QUANDO BUSCAR CATÁLOGO: Diga SOMENTE: "Vou te mostrar! 💍" ou "Separei opções incríveis! ✨" (max 10 palavras)
⚠️ OS CARDS COM FOTOS, PREÇOS E CÓDIGOS SÃO ENVIADOS AUTOMATICAMENTE PELO SISTEMA!

---

## 📦 SOBRE CORRENTES:
- **Pingentes NÃO acompanham corrente** - são vendidas separadamente
- Quando cliente perguntar "acompanha corrente?" → Diga: "O pingente não acompanha corrente, mas temos lindas opções! Quer ver? 😊"
- SEMPRE oferecer correntes após vender pingente

---

## 🎨 FLUXO DE VENDAS:

**PINGENTES/MEDALHAS:**
1. Cliente menciona pingente/medalha → PERGUNTE A COR: "Qual cor você prefere? Dourada ou prata? 💛🤍"
2. Cliente escolhe cor → USE search_catalog com color="[cor escolhida]"! Diga: "Vou te mostrar! 💫"
3. Cliente escolhe → Pergunte foto para gravação
4. Ofereça corrente → Colete entrega/pagamento

**ALIANÇAS:**
1. Cliente menciona aliança → PERGUNTE FINALIDADE: "Para namoro ou casamento? 💍"
2. Cliente responde → PERGUNTE COR: "Qual cor prefere? Dourada, prata, preta ou azul?"
3. Cliente escolhe cor → USE search_catalog com color="[cor escolhida]"! Diga: "Vou te mostrar! 💍"

IMPORTANTE: SEMPRE use o parâmetro "color" na busca quando o cliente especificar uma cor!

---

## 🤔 PERGUNTAS FORA DE CONTEXTO:

Quando cliente fizer pergunta que NÃO é sobre compra:
1. RESPONDA a pergunta BREVEMENTE
2. DEPOIS pergunte: "Posso te mostrar nossas opções com valores? 😊"

---

## ❌ PRODUTOS QUE NÃO TEMOS:
- Pulseiras, brincos, relógios → "Não trabalhamos com pulseiras, mas nossos pingentes personalizados são incríveis! Quer ver? 💍"

## 📿 COLAR / CORRENTE / CORDÃO:
- Quando cliente mencionar "colar", "cordão" ou "corrente" → PERGUNTE: "Você está procurando um pingente fotogravado? Nossos pingentes são lindos e a gravação de uma foto é gratuita! 💫"
- Se cliente confirmar (sim, isso, quero, etc.) → PERGUNTE A COR: "Qual cor você prefere? Dourada ou prata? 💛🤍"
- Após escolher cor → USE search_catalog com category="pingente" e color="[cor escolhida]"
- Se cliente disser que quer APENAS corrente/colar sem pingente → Diga: "No momento trabalhamos com correntes como complemento dos pingentes. Posso te mostrar nossos pingentes com fotogravação? A gravação é gratuita! 😊"

---

## 🚫 RESTRIÇÃO DE CORES POR FINALIDADE:
- **NAMORO**: Apenas cores *dourada* e *prata*. Se cliente pedir PRETA, AZUL ou ROSE → Responda: "Não temos alianças nessa cor para namoro, apenas dourada e prata. Qual prefere? 💍"
- **CASAMENTO**: Cores disponíveis: dourada, prata, preta, azul

---

## ✅ PRODUTOS DISPONÍVEIS:
- ALIANÇAS (casamento=tungstênio nas cores dourada/prata/preta/azul, namoro=aço nas cores dourada/prata APENAS)
- PINGENTES/MEDALHAS (fotogravação grátis 1 lado, corrente vendida separada, cores dourada/prata)
- ANÉIS
- CORRENTES (vendidas separadamente)

---

## 📍 LOJA:
Shopping Sumaúma, Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM

#node: abertura | escolha_finalidade | escolha_cor | catalogo | selecao | coleta_tamanhos | coleta_entrega | coleta_pagamento | coleta_foto | coleta_corrente | finalizado`;

// Função para formatar legenda do produto para WhatsApp - SEMPRE com preço e descrição
function formatProductCaption(
  product: any,
  options: { includePrice: boolean; includeSizes: boolean; includeStock: boolean }
): string {
  const lines: string[] = [];
  
  // Nome do produto (obrigatório)
  lines.push(`*${product.name || 'Produto'}*`);
  
  // Descrição (sempre incluir se existir)
  if (product.description && product.description.trim()) {
    lines.push(`${product.description.trim()}`);
  }
  
  // Preço - SEMPRE incluir se disponível
  const price = product.price || product.preco;
  if (price && options.includePrice !== false) {
    const numPrice = typeof price === 'string' ? parseFloat(price.replace(',', '.')) : price;
    if (!isNaN(numPrice) && numPrice > 0) {
      const priceFormatted = `R$ ${numPrice.toFixed(2).replace('.', ',')}`;
      lines.push(`💰 *${priceFormatted}*`);
    }
  } else if (product.price_formatted) {
    lines.push(`💰 *${product.price_formatted}*`);
  }
  
  // Cor
  if (product.color) {
    lines.push(`🎨 Cor: ${product.color}`);
  }
  
  // Tamanhos disponíveis
  if (options.includeSizes !== false) {
    const sizes = product.sizes || product.tamanhos;
    if (Array.isArray(sizes) && sizes.length > 0) {
      lines.push(`📏 Tamanhos: ${sizes.join(', ')}`);
    } else if (typeof sizes === 'string' && sizes.trim()) {
      lines.push(`📏 Tamanhos: ${sizes.trim()}`);
    }
  }
  
  // Estoque
  if (options.includeStock !== false) {
    const stock = product.stock || 0;
    lines.push(stock > 0 ? `✅ Em estoque` : `⚠️ Sob consulta`);
  }
  
  // Código/SKU (obrigatório para identificação)
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
  console.log(`[ALINE-REPLY] ========== BUSCA CATÁLOGO ==========`);
  console.log(`[ALINE-REPLY] Parâmetros recebidos:`, JSON.stringify(params));
  console.log(`[ALINE-REPLY] Dados coletados:`, JSON.stringify(collectedData || {}));
  
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
  
  // 🚨 CRÍTICO: COR DO CLIENTE - RESPEITAR A COR SOLICITADA!
  // Prioridade: parâmetro cor > cor do collectedData
  const corSolicitada = params.color?.toLowerCase().trim() || collectedData?.cor?.toLowerCase().trim();
  console.log(`[ALINE-REPLY] 🎨 COR SOLICITADA: "${corSolicitada || 'NENHUMA'}"`);
  
  // 🚨 VALIDAÇÃO DE COR POR FINALIDADE - NAMORO SÓ TEM DOURADA E PRATA
  if (finalidade === 'namoro' && corSolicitada) {
    const corNorm = corSolicitada.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const coresNamoroPermitidas = ['dourada', 'dourado', 'prata', 'aco', 'ouro'];
    const corProibidaNoNamoro = !coresNamoroPermitidas.some(c => corNorm.includes(c));
    if (corProibidaNoNamoro) {
      console.log(`[ALINE-REPLY] ❌ COR "${corSolicitada}" NÃO DISPONÍVEL para NAMORO! Apenas dourada e prata.`);
      return {
        success: true,
        products: [],
        count: 0,
        available_colors: ['dourada', 'prata'],
        color_unavailable: true,
        message: `Não temos alianças na cor ${corSolicitada} para namoro. Nossas alianças de namoro estão disponíveis nas cores *dourada* e *prata*. Qual você prefere? 💍`
      };
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
  
  // 🚨 CRÍTICO: Filtrar por cor IMEDIATAMENTE se especificada
  // Isso DEVE acontecer na query do banco para performance e precisão
  if (corSolicitada && !params.exclude_shown_colors) {
    // Normalizar a cor para busca
    const corNormalizada = corSolicitada
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace('aco', 'prata') // aço = prata na prática
      .trim();
    
    console.log(`[ALINE-REPLY] 🔍 APLICANDO FILTRO DE COR NO BANCO: "${corNormalizada}"`);
    query = query.ilike('color', `%${corNormalizada}%`);
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
      // CRÍTICO: Buscar tungstênio na categoria OU no nome do produto!
      // Alguns produtos estão em categoria "aliancas" mas têm "tungstênio" no nome
      filteredProducts = filteredProducts.filter((p: any) => {
        const cat = (p.category || '').toLowerCase();
        const nome = (p.name || '').toLowerCase();
        const isTungstenio = cat.includes('tungstenio') || cat.includes('tungstênio') || cat.includes('tungsten') ||
                            nome.includes('tungstenio') || nome.includes('tungstênio') || nome.includes('tungsten');
        return isTungstenio;
      });
      console.log(`[ALINE-REPLY] Filtro TUNGSTÊNIO (categoria+nome): ${filteredProducts.length} produtos`);
    } else if (materialFilter === 'aco') {
      // AÇO = alianças que NÃO são tungstênio
      filteredProducts = filteredProducts.filter((p: any) => {
        const cat = (p.category || '').toLowerCase();
        const nome = (p.name || '').toLowerCase();
        const isTungstenio = cat.includes('tungstenio') || cat.includes('tungstênio') ||
                            nome.includes('tungstenio') || nome.includes('tungstênio');
        const isAlianca = cat.includes('alianca') || cat.includes('aliança') || cat === 'aliancas';
        return isAlianca && !isTungstenio;
      });
      console.log(`[ALINE-REPLY] Filtro AÇO (excluindo tungstênio): ${filteredProducts.length} produtos`);
    } else {
      // Sem filtro de material - todas as alianças
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
    // PASSO 2: OBTER ID DA CONVERSA CRM (sem duplicar inserções)
    // NOTA: A mensagem do cliente já foi salva pelo zapi-unified
    // ========================================
    let crmConversationId: string | null = null;
    
    const { data: existingCrmConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_number', phone)
      .maybeSingle();

    if (existingCrmConv) {
      crmConversationId = existingCrmConv.id;
    }
    // Se não existe, o zapi-unified já vai criar. Não duplicamos aqui.

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
    
    // CRÍTICO: Detectar TODAS as categorias com padrões ampliados
    
    // PINGENTES/MEDALHAS - Padrões ampliados
    const isPerguntandoPingente = /pingente|pingentes|colar|colares|medalha|medalhas|medalhinha|medalhão|personalizada|personalizado|com\s*foto|fotogravação|foto.*grav|grav.*foto|tem\s*(pingente|medalha)|vc\s*tem\s*(pingente|medalha)|vocês\s*tem\s*(pingente|medalha)|você\s*tem\s*(pingente|medalha)|quero\s*(ver|uma?|medalha|pingente)|mostra.*medalha|mostra.*pingente/i.test(normalizedMsg);
    
    // ALIANÇAS - Padrões ampliados incluindo casamento/namoro explícito
    const isPerguntandoAlianca = /aliança|alianca|alianças|aliancas|tem\s*aliança|vc\s*tem\s*aliança|vocês\s*tem\s*aliança|aliança.*casamento|aliança.*namoro|casamento|compromisso|noivado|casar/i.test(normalizedMsg);
    
    // ALIANÇAS CASAMENTO - Padrões específicos
    const isPerguntandoAliancaCasamento = /aliança.*casamento|casamento|casar|tungst[eê]nio|matrimônio|matrimonio|noivo|noiva|bodas|lua de mel/i.test(normalizedMsg);
    
    // ALIANÇAS NAMORO - Padrões específicos
    const isPerguntandoAliancaNamoro = /aliança.*namoro|aliança.*compromisso|namoro|compromisso|namorar|namorado|namorada|noivar|noivado|aco|aço.*aliança/i.test(normalizedMsg);
    
    // ANÉIS - Padrões
    const isPerguntandoAnel = /anel|anéis|aneis|solitário|solitario/i.test(normalizedMsg);
    
    // ========================================
    // NLU: DETECTAR PERGUNTAS SOBRE FOTOGRAVAÇÃO / PERSONALIZAÇÃO
    // Cliente perguntou sobre preço de FOTO? Responder que é GRÁTIS!
    // ========================================
    const isPerguntaFotogravacao = 
      /com\s*(a\s*)?foto.*fica|com\s*(a\s*)?foto.*quanto|quanto.*com\s*(a\s*)?foto|pre[çc]o.*foto|foto.*pre[çc]o|valor.*foto|foto.*valor|quanto.*fotograva|fotograva.*quanto|personaliza[çc][aã]o.*quanto|quanto.*personaliza|grava[çc][aã]o.*quanto|quanto.*grava[çc]|foto.*custa|custa.*foto|personalizada.*fica|fica.*personalizada/i.test(normalizedMsg);
    
    // CRÍTICO: Pergunta sobre fotogravação → Responder que é GRÁTIS! NÃO enviar catálogo!
    if (isPerguntaFotogravacao) {
      console.log(`[ALINE-REPLY] [NLU] 📸 PERGUNTA SOBRE FOTOGRAVAÇÃO/PERSONALIZAÇÃO detectada! Responder que é GRÁTIS!`);
      newCollectedData.pergunta_fotogravacao = true;
      newCollectedData.pergunta_tecnica = true; // Tratar como pergunta técnica (resposta em texto)
      // NÃO forçar catálogo - responder com texto!
    }
    
    // ========================================
    // NLU: DETECTAR PERGUNTAS SOBRE PREÇO → FORÇAR CATÁLOGO COM PREÇOS!
    // Cliente perguntou preço? NUNCA responder textualmente, enviar catálogo!
    // MAS não se for pergunta sobre fotogravação!
    // ========================================
    const isPerguntaPreco = 
      !isPerguntaFotogravacao && // 🚨 NÃO tratar pergunta de foto como preço genérico!
      /quanto\s*custa|qual\s*o?\s*valor|qual\s*o?\s*pre[çc]o|quanto\s*[eé]|quanto\s*fica|quanto\s*sai|saber?\s*(o\s*)?pre[çc]o|valores?|quant[ao]\s*sale|pre[çc]o/i.test(normalizedMsg);
    
    // CRÍTICO: Pergunta sobre preço → FORÇAR CATÁLOGO com preços nos cards!
    // MAS não se for pergunta sobre fotogravação (isso tem resposta específica)
    if (isPerguntaPreco) {
      console.log(`[ALINE-REPLY] [NLU] 💰 PERGUNTA SOBRE PREÇO detectada! FORÇAR CATÁLOGO COM PREÇOS!`);
      newCollectedData.pergunta_preco = true;
      newCollectedData.quer_ver_catalogo = true; // FORÇAR envio do catálogo!
    }
    
    // NLU: DETECTAR PERGUNTAS TÉCNICAS (responder SEM catálogo)
    // Apenas perguntas sobre material, entrega, garantia - NÃO preço!
    const isPerguntaTecnica = 
      isPerguntaFotogravacao || // Pergunta sobre foto é técnica!
      // Perguntas sobre material/durabilidade
      /fica\s*pret[oa]|escurece|mancha|oxida|enferruja|[eé]\s*resistente|dura\s*quanto|quanto\s*tempo\s*dura|[eé]\s*bom|[eé]\s*boa|\s*qualidade/i.test(normalizedMsg) ||
      // Perguntas sobre diferenças
      /qual\s*a?\s*diferen[çc]a|diferente|compara|melhor\s*qual/i.test(normalizedMsg) ||
      // Perguntas sobre entrega/prazo
      /voc[eê]s?\s*entrega|prazo\s*de\s*entrega|quanto\s*tempo.*entrega|demora\s*quanto|quando\s*chega/i.test(normalizedMsg) ||
      // Perguntas sobre garantia
      /tem\s*garantia|garantia|troca/i.test(normalizedMsg) ||
      // Perguntas genéricas sobre material
      /material|feito\s*de\s*que|de\s*que\s*[eé]|esse\s*material/i.test(normalizedMsg);
    
    // Se é pergunta técnica (NÃO preço genérico), deixar AI responder naturalmente
    if (isPerguntaTecnica && !isPerguntaPreco) {
      console.log(`[ALINE-REPLY] [NLU] 🔍 PERGUNTA TÉCNICA detectada! Deixar AI responder.`);
      newCollectedData.pergunta_tecnica = true;
    }
    
    // NOVO: Detectar intenção direta de ver/comprar (forçar catálogo) 
    // MAS não se for pergunta técnica sobre material/entrega
    const querVerProdutos = !isPerguntaTecnica && /quero\s*(ver|conhecer|comprar)|mostra|mostrar|ver\s*(as?|os?)?|manda\s*op[çc][oõ]es|quero\s*op[çc][oõ]es/i.test(normalizedMsg);
    
    // NOVO: Detectar cor na mensagem (para ir direto ao catálogo)
    const temCorNaMensagem = /dourada|dourado|ouro|gold|prata|prateada|aço|aco|preta|preto|azul|rose|rosé/i.test(normalizedMsg);
    
    // NOVO: Detectar PRODUTOS QUE NÃO TEMOS (declarar DEPOIS dos outros para evitar erro de ordem)
    const isPerguntandoPulseira = /pulseira|pulseiras|bracelete|braceletes/i.test(normalizedMsg);
    const isPerguntandoBrinco = /brinco|brincos/i.test(normalizedMsg);
    const isPerguntandoRelogio = /rel[oó]gio|rel[oó]gios/i.test(normalizedMsg);
    const isPerguntandoAmizade = /amizade|amiga|amigo|friendship|presente.*amig/i.test(normalizedMsg);
    
    // NOVO: Detectar pedido de ENDEREÇO
    const isPerguntandoEndereco = /endere[çc]o|localiza[çc][aã]o|onde\s*fica|qual\s*endere|manda\s*o?\s*endere|onde\s*[eé]\s*a\s*loja|onde\s*voc[eê]s?\s*ficam?|onde\s*est[aá]|shopping|localiza|como\s*chego/i.test(normalizedMsg);
    
    // NOVO: Detectar pergunta sobre CORRENTE (pingente acompanha corrente?)
    const isPerguntandoCorrente = /acompanha\s*corrente|vem\s*com\s*corrente|inclui\s*corrente|tem\s*corrente|corrente.*junto|junto.*corrente|s[oó]\s*o?\s*pingente|vem\s*s[oó]/i.test(normalizedMsg);
    
    if (isPerguntandoCorrente) {
      console.log(`[ALINE-REPLY] [NLU] 🔗 PERGUNTA SOBRE CORRENTE detectada!`);
      newCollectedData.pergunta_corrente = true;
    }
    
    // Flag para produto não disponível
    const produtoNaoDisponivel = isPerguntandoPulseira || isPerguntandoBrinco || isPerguntandoRelogio;
    
    // Se cliente pede produto que não temos, marcar para sugerir alternativa
    if (produtoNaoDisponivel) {
      console.log(`[ALINE-REPLY] [NLU] PRODUTO NÃO DISPONÍVEL detectado! Sugerir alternativa.`);
      newCollectedData.produto_nao_disponivel = true;
      newCollectedData.produto_pedido = isPerguntandoPulseira ? 'pulseira' : 
                                        isPerguntandoBrinco ? 'brinco' : 'relogio';
      // Forçar sugestão de pingentes como alternativa
      newCollectedData.sugerir_alternativa = 'pingente';
      newCollectedData.categoria = 'pingente'; // Já define categoria para sugestão
    }
    
    // Se cliente menciona "amizade" e não está perguntando sobre pingente/aliança específica
    if (isPerguntandoAmizade && !isPerguntandoPingente && !isPerguntandoAlianca && !produtoNaoDisponivel) {
      console.log(`[ALINE-REPLY] [NLU] Cliente busca algo sobre AMIZADE → Sugerir pingentes`);
      newCollectedData.tema_cliente = 'amizade';
      newCollectedData.sugerir_alternativa = 'pingente';
      newCollectedData.categoria = 'pingente';
      newCollectedData.quer_ver_catalogo = true;
    }
    
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
      delete newCollectedData.produto_nao_disponivel;
      delete newCollectedData.sugerir_alternativa;
      newCollectedData.mudou_categoria = true;
      // IMPORTANTE: Pingentes precisam de COR antes de catálogo
      // 🚨 FLUXO OBRIGATÓRIO: Categoria → Cor → Catálogo
      if (temCorNaMensagem) {
        // Extrair a cor específica da mensagem
        if (/dourada|dourado|ouro|gold/i.test(normalizedMsg)) {
          newCollectedData.cor = 'dourada';
        } else if (/prata|prateada|aço|aco/i.test(normalizedMsg)) {
          newCollectedData.cor = 'prata';
        }
        newCollectedData.quer_ver_catalogo = true;
        console.log(`[ALINE-REPLY] [NLU] Pingente + COR "${newCollectedData.cor}" detectada → FORÇAR CATÁLOGO!`);
      } else if (/personalizada|com\s*foto|fotogravação/i.test(normalizedMsg)) {
        // Quer foto personalizada = prata (mais comum)
        newCollectedData.cor = 'prata';
        newCollectedData.quer_ver_catalogo = true;
        console.log(`[ALINE-REPLY] [NLU] Pingente personalizado → prata + FORÇAR CATÁLOGO!`);
      } else {
        // 🚨 SEM cor - NÃO forçar catálogo! DEVE perguntar cor primeiro!
        console.log(`[ALINE-REPLY] [NLU] Pingente SEM COR → PERGUNTAR COR PRIMEIRO! NÃO enviar catálogo!`);
        // NÃO definir quer_ver_catalogo aqui - vai perguntar a cor antes
        delete newCollectedData.quer_ver_catalogo;
      }
    } else if (isPerguntandoAnel && newCollectedData.categoria !== 'aneis') {
      console.log(`[ALINE-REPLY] [NLU] DETECTADO: ANÉIS (categoria anterior: ${newCollectedData.categoria || 'nenhuma'})`);
      newCollectedData.categoria = 'aneis';
      delete newCollectedData.finalidade;
      delete newCollectedData.cor;
      delete newCollectedData.cores_mostradas;
      delete newCollectedData.selected_sku;
      delete newCollectedData.selected_name;
      delete newCollectedData.selected_product;
      delete newCollectedData.selected_price;
      delete newCollectedData.last_catalog;
      newCollectedData.mudou_categoria = true;
      // Se quer ver, forçar catálogo IMEDIATO
      if (querVerProdutos || temCorNaMensagem) {
        newCollectedData.quer_ver_catalogo = true;
        console.log(`[ALINE-REPLY] [NLU] Quer ver anéis → FORÇAR CATÁLOGO!`);
      }
    } else if (isPerguntandoAlianca && newCollectedData.categoria !== 'aliancas') {
      // CRÍTICO: Se JÁ ESTÁ em uma categoria diferente (pingente, aneis), NÃO mudar para alianças
      // a menos que o cliente EXPLICITAMENTE peça
      const categoriaAtual = newCollectedData.categoria || collectedData.categoria;
      const clienteTemCategoria = !!categoriaAtual;
      
      // Padrões que indicam PEDIDO EXPLÍCITO de mudar categoria
      const pedidoExplicitoAlianca = /quero\s*(ver\s*)?(as?\s*)?alian[çc]|ver\s*alian[çc]|mostra.*alian[çc]|me\s*mostra.*alian[çc]|pode\s*me\s*mostrar.*alian[çc]/i.test(normalizedMsg);
      
      // Se cliente já tem categoria E não pediu explicitamente aliança, IGNORAR
      if (clienteTemCategoria && !pedidoExplicitoAlianca) {
        console.log(`[ALINE-REPLY] [NLU] ⚠️ Detectou palavra "aliança" mas cliente já está em ${categoriaAtual}. IGNORANDO mudança de categoria.`);
        // NÃO muda categoria - continua no fluxo atual
      } else {
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
        
        // Detectar finalidade JÁ NA PRIMEIRA MENSAGEM
        if (isPerguntandoAliancaCasamento) {
          newCollectedData.finalidade = 'casamento';
          console.log(`[ALINE-REPLY] [NLU] Finalidade detectada: CASAMENTO (tungstênio)`);
          // IMPORTANTE: Só forçar catálogo se tiver COR também! Senão, perguntar cor primeiro.
          if (temCorNaMensagem) {
            newCollectedData.quer_ver_catalogo = true;
            console.log(`[ALINE-REPLY] [NLU] Casamento + COR → FORÇAR CATÁLOGO!`);
          } else {
            console.log(`[ALINE-REPLY] [NLU] Casamento detectado, mas SEM COR → vai perguntar cor!`);
            // NÃO forçar catálogo sem cor
          }
        } else if (isPerguntandoAliancaNamoro) {
          newCollectedData.finalidade = 'namoro';
          console.log(`[ALINE-REPLY] [NLU] Finalidade detectada: NAMORO (aço)`);
          // IMPORTANTE: Só forçar catálogo se tiver COR também! Senão, perguntar cor primeiro.
          if (temCorNaMensagem) {
            newCollectedData.quer_ver_catalogo = true;
            console.log(`[ALINE-REPLY] [NLU] Namoro + COR → FORÇAR CATÁLOGO!`);
          } else {
            console.log(`[ALINE-REPLY] [NLU] Namoro detectado, mas SEM COR → vai perguntar cor!`);
            // NÃO forçar catálogo sem cor
          }
        } else {
          // Cliente quer ver alianças mas NÃO especificou finalidade (casamento/namoro)
          // NÃO forçar catálogo - deve perguntar finalidade primeiro!
          console.log(`[ALINE-REPLY] [NLU] Alianças SEM FINALIDADE → vai perguntar finalidade!`);
          // Garantir que NÃO vai direto para catálogo
          delete newCollectedData.quer_ver_catalogo;
        }
      }
    }
    
    // 🚨 PINGENTES: Só forçar catálogo se já tem COR!
    if (isPerguntandoPingente && querVerProdutos) {
      newCollectedData.categoria = 'pingente';
      // SÓ forçar catálogo se já tem cor!
      const jaTemCorPingente = newCollectedData.cor || temCorNaMensagem;
      if (jaTemCorPingente) {
        newCollectedData.quer_ver_catalogo = true;
        console.log(`[ALINE-REPLY] [NLU] Quer ver pingentes + TEM COR → FORÇAR CATÁLOGO!`);
      } else {
        console.log(`[ALINE-REPLY] [NLU] Quer ver pingentes mas SEM COR → vai perguntar cor primeiro!`);
        delete newCollectedData.quer_ver_catalogo;
      }
    }
    
    // ANÉIS: Pode ir direto ao catálogo (sem requisito de cor)
    if (isPerguntandoAnel && querVerProdutos) {
      newCollectedData.categoria = 'aneis';
      newCollectedData.quer_ver_catalogo = true;
      console.log(`[ALINE-REPLY] [NLU] Quer ver anéis → FORÇAR CATÁLOGO!`);
    }
    
    // Detectar CATEGORIA em qualquer mensagem (se ainda não tem)
    // PROTEÇÃO: Se já tem categoria, só mudar se for pedido EXPLÍCITO
    const categoriaExistente = newCollectedData.categoria || collectedData.categoria;
    
    if (!categoriaExistente) {
      // Cliente sem categoria - pode definir normalmente
      if (isPerguntandoAlianca && !isPerguntandoPingente && !isPerguntandoAnel) {
        newCollectedData.categoria = 'aliancas';
        console.log(`[ALINE-REPLY] [NLU] Categoria: aliancas`);
        // Detectar finalidade também
        if (isPerguntandoAliancaCasamento) {
          newCollectedData.finalidade = 'casamento';
        } else if (isPerguntandoAliancaNamoro) {
          newCollectedData.finalidade = 'namoro';
        }
      } else if (isPerguntandoPingente) {
        newCollectedData.categoria = 'pingente';
        console.log(`[ALINE-REPLY] [NLU] Categoria: pingente`);
      } else if (isPerguntandoAnel) {
        newCollectedData.categoria = 'aneis';
        console.log(`[ALINE-REPLY] [NLU] Categoria: aneis`);
      }
    } else {
      // Cliente JÁ TEM categoria - manter categoria atual
      // (mudanças de categoria já foram tratadas acima com lógica de pedido explícito)
      console.log(`[ALINE-REPLY] [NLU] Cliente já está na categoria: ${categoriaExistente} - mantendo`);
      if (!newCollectedData.categoria) {
        newCollectedData.categoria = categoriaExistente;
      }
    }
    
    // Detectar FINALIDADE para alianças (pode vir na mesma mensagem ou depois)
    const detectedCategoria = newCollectedData.categoria;
    if (detectedCategoria === 'aliancas' && !hasFinalidade) {
      if (/namoro|compromisso|namorada|namorado|noivado|noivar/i.test(normalizedMsg)) {
        newCollectedData.finalidade = 'namoro';
        console.log(`[ALINE-REPLY] [NLU] Finalidade: namoro`);
        // Se já tem cor, forçar catálogo
        if (temCorNaMensagem || querVerProdutos) {
          newCollectedData.quer_ver_catalogo = true;
        }
      } else if (/casamento|casar|noiva|noivo|matrimonio|matrimônio|tungst[eê]nio/i.test(normalizedMsg)) {
        newCollectedData.finalidade = 'casamento';
        console.log(`[ALINE-REPLY] [NLU] Finalidade: casamento`);
        // Se já tem cor, forçar catálogo
        if (temCorNaMensagem || querVerProdutos) {
          newCollectedData.quer_ver_catalogo = true;
        }
      }
    }
    
    // Detectar COR em qualquer mensagem
    const detectedFinalidade = newCollectedData.finalidade;
    const canDetectColor = detectedCategoria === 'pingente' || detectedCategoria === 'aneis' || (detectedCategoria === 'aliancas' && detectedFinalidade);
    
    if (!hasCor && (canDetectColor || !detectedCategoria)) {
      if (/dourada|dourado|ouro|gold|amarela|amarelo/i.test(normalizedMsg)) {
        newCollectedData.cor = 'dourada';
        console.log(`[ALINE-REPLY] [NLU] Cor: dourada`);
        // Se já tem categoria, forçar catálogo
        if (detectedCategoria) {
          newCollectedData.quer_ver_catalogo = true;
        }
      } else if (/prata|prateada|prateado|aço|aco|silver|cinza/i.test(normalizedMsg)) {
        newCollectedData.cor = 'prata';
        console.log(`[ALINE-REPLY] [NLU] Cor: prata`);
        if (detectedCategoria) {
          newCollectedData.quer_ver_catalogo = true;
        }
      } else if (/preta|preto|black|escura|escuro/i.test(normalizedMsg)) {
        newCollectedData.cor = 'preta';
        console.log(`[ALINE-REPLY] [NLU] Cor: preta`);
        if (detectedCategoria) {
          newCollectedData.quer_ver_catalogo = true;
        }
      } else if (/azul|blue/i.test(normalizedMsg)) {
        newCollectedData.cor = 'azul';
        console.log(`[ALINE-REPLY] [NLU] Cor: azul`);
        if (detectedCategoria) {
          newCollectedData.quer_ver_catalogo = true;
        }
      } else if (/rose|rosé|rosa/i.test(normalizedMsg)) {
        newCollectedData.cor = 'rose';
        console.log(`[ALINE-REPLY] [NLU] Cor: rose`);
        if (detectedCategoria) {
          newCollectedData.quer_ver_catalogo = true;
        }
      }
    }
    
    // NOVO: Detectar pedido de "outras cores" ou "mais opções"
    const wantsOtherColors = /outra(s)?\s*cor(es)?|tem\s*outras?|mais\s*op[çc][õo]es|outras\s*op[çc][õo]es|diferentes|ver\s*outras/i.test(normalizedMsg);
    if (wantsOtherColors) {
      newCollectedData.quer_outras_cores = true;
      console.log(`[ALINE-REPLY] [NLU] Cliente quer ver OUTRAS cores (excluir já mostradas)`);
    }
    
    // Detectar resposta afirmativa ("sim", "quero", "pode ser") como intenção de ver catálogo
    const isAfirmativo = /^(sim|quero|pode|claro|ok|s|bora|show|isso|exato|perfeito|legal|boa|blz|beleza|pode ser|manda|mostra|ver|quero ver|quero saber)$/i.test(normalizedMsg.trim());
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
      
      // 0. NOVO: Detectar clique em botão interativo (formato: "select_SKU")
      const buttonClickPattern = /^select_([A-Z0-9\-]+)$/i;
      const buttonMatch = message.match(buttonClickPattern);
      if (buttonMatch) {
        const clickedSku = buttonMatch[1].toUpperCase();
        const produto = catalogoAnterior.find((p: any) => 
          p.sku?.toUpperCase() === clickedSku || 
          p.sku?.toUpperCase().includes(clickedSku)
        );
        if (produto) {
          newCollectedData.selected_product = produto;
          newCollectedData.selected_sku = produto.sku;
          newCollectedData.selected_name = produto.name;
          newCollectedData.selected_price = produto.price;
          newCollectedData.produto_selecionado_agora = true; // Flag para forçar resposta
          console.log(`[ALINE-REPLY] [NLU] ✅ Produto selecionado por BOTÃO CLICADO: ${produto.name} (${produto.sku})`);
        }
      }
      
      // 0.5 NOVO: Detectar texto que corresponde ao nome de um produto do catálogo
      // Ex: "1 Pingente Redond..." ou "Pingente Coração..." (texto truncado do botão)
      if (!newCollectedData.selected_sku) {
        // Tentar match com prefixo de nome de produto (botões truncados)
        for (let i = 0; i < catalogoAnterior.length; i++) {
          const produto = catalogoAnterior[i];
          const productName = (produto.name || '').toLowerCase();
          const msgLower = normalizedMsg.toLowerCase();
          
          // Verificar se a mensagem começa com número + parte do nome do produto
          // Ex: "1 Pingente Redond" quando o produto é "Pingente Redondo Fotogravado"
          const numPrefix = `${i + 1} `;
          if (msgLower.startsWith(numPrefix)) {
            const restOfMsg = msgLower.substring(numPrefix.length).replace(/\.+$/, '').trim();
            // Se pelo menos 8 caracteres do nome batem, considerar match
            if (restOfMsg.length >= 8 && productName.startsWith(restOfMsg)) {
              newCollectedData.selected_product = produto;
              newCollectedData.selected_sku = produto.sku;
              newCollectedData.selected_name = produto.name;
              newCollectedData.selected_price = produto.price;
              newCollectedData.produto_selecionado_agora = true;
              console.log(`[ALINE-REPLY] [NLU] ✅ Produto selecionado por TEXTO TRUNCADO: ${produto.name} (${produto.sku})`);
              break;
            }
          }
          
          // Também tentar match direto se o nome do produto aparece na mensagem
          if (msgLower.includes(productName.substring(0, 12)) && productName.length > 10) {
            newCollectedData.selected_product = produto;
            newCollectedData.selected_sku = produto.sku;
            newCollectedData.selected_name = produto.name;
            newCollectedData.selected_price = produto.price;
            newCollectedData.produto_selecionado_agora = true;
            console.log(`[ALINE-REPLY] [NLU] ✅ Produto selecionado por NOME PARCIAL: ${produto.name} (${produto.sku})`);
            break;
          }
        }
      }
      
      // 1. Detectar SKU diretamente (ex: "quero o AC-015", "PF010003-01")
      if (!newCollectedData.selected_sku) {
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
              newCollectedData.produto_selecionado_agora = true;
              console.log(`[ALINE-REPLY] [NLU] ✅ Produto selecionado por SKU: ${produto.name} (${produto.sku})`);
            }
            break;
          }
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
          newCollectedData.produto_selecionado_agora = true;
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
    // 🚨 TAMANHOS: Para alianças de casal, precisa de 2 tamanhos!
    // Considerar "tem tamanho" apenas se tem tamanho_1 E (tamanho_2 OU é unidade)
    const temTamanho1 = !!newCollectedData.tamanho_1;
    const temTamanho2 = !!newCollectedData.tamanho_2;
    const ehUnidade = newCollectedData.quantidade_tipo === 'unidade';
    // Para par de alianças, precisa de 2 tamanhos. Para unidade, só precisa de 1
    const jaTemTamanhoCompleto = temTamanho1 && (temTamanho2 || ehUnidade);
    // Compatibilidade: usar jaTemTamanhoCompleto no fluxo
    const jaTemTamanho = jaTemTamanhoCompleto;
    const jaTemEntrega = !!newCollectedData.delivery_method;
    const jaTemPagamento = !!newCollectedData.payment_method;
    const jaTemFoto = !!newCollectedData.foto_gravacao;
    const isAliancaSelecionada = jaSelecionouProduto && finalCategoria === 'aliancas';
    const isPingenteSelecionado = jaSelecionouProduto && finalCategoria === 'pingente';
    
    console.log(`[ALINE-REPLY] Estado seleção: produto=${jaSelecionouProduto}, sku=${newCollectedData.selected_sku}`);
    console.log(`[ALINE-REPLY] Tamanhos: tam1=${temTamanho1 ? newCollectedData.tamanho_1 : 'N/A'}, tam2=${temTamanho2 ? newCollectedData.tamanho_2 : 'N/A'}, unidade=${ehUnidade}, completo=${jaTemTamanhoCompleto}`);
    console.log(`[ALINE-REPLY] Entrega=${jaTemEntrega}, pagamento=${jaTemPagamento}, foto=${jaTemFoto}`);
    console.log(`[ALINE-REPLY] Categoria: ${finalCategoria}, isAlianca=${isAliancaSelecionada}, isPingente=${isPingenteSelecionado}`);
    
    // ========================================
    // PRIORIDADE MÁXIMA: RESPONDER FOTOGRAVAÇÃO (GRÁTIS!)
    // ========================================
    if (newCollectedData.pergunta_fotogravacao) {
      nextStep = conversation.current_node || 'coleta_foto';
      nextStepInstruction = `O cliente PERGUNTOU SOBRE O PREÇO DA FOTOGRAVAÇÃO! RESPONDA IMEDIATAMENTE:
      
      "A fotogravação é *GRÁTIS*! 🎁✨ Você só paga o valor do pingente. 💫
      
      Me manda a foto que você quer gravar! 📸"
      
      RESPONDA EXATAMENTE ISSO! NÃO envie catálogo! NÃO faça outras perguntas! A resposta é que fotogravação é GRÁTIS!
      #node: coleta_foto`;
    }
    // ========================================
    // PRIORIDADE MÁXIMA: RESPONDER ENDEREÇO
    // ========================================
    else if (isPerguntandoEndereco) {
      nextStep = conversation.current_node || 'endereco';
      nextStepInstruction = `O cliente PERGUNTOU O ENDEREÇO! RESPONDA IMEDIATAMENTE:
      
      "📍 Estamos no *Shopping Sumaúma*!
      Av. Noel Nutels, 1762 - Cidade Nova, Manaus - AM
      CEP: 69090-970 🛍️"
      
      RESPONDA EXATAMENTE ISSO e depois pergunte se pode ajudar em algo mais. NÃO ignore o pedido de endereço!`;
    }
    
    // ========================================
    // FLUXO DE COLETA APÓS SELEÇÃO
    // Se cliente selecionou produto, seguir para coleta de dados!
    // ========================================
    
    // ALIANÇAS: Produto → Tamanhos → Entrega → Pagamento → Finalizar
    // PINGENTES: Produto → Foto → Entrega → Pagamento → Finalizar
    
    if (!isPerguntandoEndereco && isAliancaSelecionada && jaTemTamanho && jaTemEntrega && jaTemPagamento) {
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
      // ALIANÇA: Falta TAMANHOS (1 ou 2)
      nextStep = 'coleta_tamanhos';
      const produtoRecemSelecionado = newCollectedData.produto_selecionado_agora === true;
      
      // 🚨 Verificar se já tem tamanho 1 - nesse caso, perguntar apenas o segundo
      if (temTamanho1 && !temTamanho2 && !ehUnidade) {
        // Já tem o primeiro tamanho, perguntar só o segundo
        nextStepInstruction = `🎯 PASSO ATUAL: COLETAR SEGUNDO TAMANHO
        ✅ Primeiro tamanho já coletado: ${newCollectedData.tamanho_1}
        
        Diga EXATAMENTE: "Ótimo! E o tamanho da outra aliança? 💍"
        
        NÃO repita a pergunta dos dois tamanhos. Pergunte APENAS o segundo!`;
      } else {
        // Precisa dos dois tamanhos
        nextStepInstruction = `🎯 PASSO ATUAL: COLETAR TAMANHOS DE ALIANÇA
        ✅ O cliente ESCOLHEU a aliança "${newCollectedData.selected_name}" (${newCollectedData.selected_sku})!
        
        ${produtoRecemSelecionado ? '⚠️ ACABOU DE SELECIONAR! RESPONDA IMEDIATAMENTE!' : ''}
        
        VOCÊ DEVE perguntar os TAMANHOS agora! Diga EXATAMENTE:
        "Excelente escolha! 💍 Qual o tamanho de cada um? Geralmente fica entre 14 e 28."
        
        NÃO pergunte sobre cor, categoria ou qualquer outra coisa. APENAS tamanhos!`;
      }
      
    } else if (isPingenteSelecionado && !jaTemFoto) {
      // PINGENTE: Falta FOTO - E oferecer CORRENTES!
      nextStep = 'coleta_foto';
      const produtoRecemSelecionado = newCollectedData.produto_selecionado_agora === true;
      nextStepInstruction = `🎯 PASSO ATUAL: COLETAR FOTO PARA GRAVAÇÃO + OFERECER CORRENTE
      ✅ O cliente ESCOLHEU o pingente "${newCollectedData.selected_name}" (${newCollectedData.selected_sku})!
      
      ${produtoRecemSelecionado ? '⚠️ ACABOU DE SELECIONAR! RESPONDA IMEDIATAMENTE!' : ''}
      
      IMPORTANTE: Pingentes NÃO acompanham corrente!
      
      Diga EXATAMENTE (MAX 3 linhas!):
      "Excelente escolha! 💫 A gravação de um lado é GRÁTIS!
      Só lembrando: não acompanha corrente. Quer ver nossas correntes? 🔗
      Me manda a foto que você quer gravar! 📸"
      
      NÃO pergunte sobre cor ou categoria. APENAS peça a foto!`;
      
    } else if (wantsOtherColors && coresMostradas.length > 0) {
      // Cliente pediu outras cores
      nextStep = 'catalogo_outras_cores';
      const coresExcluir = coresMostradas.join(', ');
      nextStepInstruction = `O cliente PEDIU OUTRAS CORES! Cores já mostradas: ${coresExcluir}. Use search_catalog com exclude_shown_colors=true para mostrar produtos de OUTRAS cores. NÃO mostre novamente ${coresExcluir}. Diga algo como "Claro! Deixa eu te mostrar outras opções de cores! 💍"`;
    } else if (newCollectedData.produto_nao_disponivel || newCollectedData.sugerir_alternativa) {
      // NOVO: Cliente pediu produto que não temos - sugerir alternativa
      const produtoPedido = newCollectedData.produto_pedido || 'esse produto';
      const temaCliente = newCollectedData.tema_cliente || '';
      nextStep = 'sugerir_alternativa';
      nextStepInstruction = `⚠️ PRODUTO NÃO DISPONÍVEL! Cliente pediu ${produtoPedido}${temaCliente ? ` sobre ${temaCliente}` : ''}.
      
      VOCÊ DEVE:
      1. Usar search_catalog com category="pingente" para buscar alternativas
      2. Se encontrar produtos, dizer: "Não temos ${produtoPedido} no momento, mas temos pingentes lindos${temaCliente ? ` que simbolizam ${temaCliente}` : ''}! Vou te mostrar! 💫"
      3. Se NÃO encontrar, dizer: "Infelizmente não temos ${produtoPedido}. Trabalhamos com alianças, anéis e pingentes. Posso te ajudar com algum desses?"
      
      RESPOSTA MÁXIMA: 2 linhas! SEM textão!`;
    } else if (mudouCategoria && finalCategoria === 'pingente') {
      // 🚨 PINGENTES: PERGUNTAR COR PRIMEIRO se ainda não tem!
      if (finalCor) {
        nextStep = 'catalogo_pingentes';
        nextStepInstruction = `O cliente quer PINGENTES na cor ${finalCor}! Use search_catalog com category="pingente" e color="${finalCor}". Diga: "Vou te mostrar! 💫" (MAX 10 palavras!)`;
      } else {
        nextStep = 'escolha_cor_pingente';
        nextStepInstruction = `O cliente perguntou sobre PINGENTES/MEDALHAS! PERGUNTE A COR PRIMEIRO: "Qual cor você prefere? Dourada ou prata? 💛🤍" (MAX 15 palavras!) NÃO mostre o catálogo ainda!`;
      }
    } else if (mudouCategoria && finalCategoria === 'aneis') {
      // ANÉIS - ir direto ao catálogo (sem requisito de cor)
      nextStep = 'catalogo_aneis';
      nextStepInstruction = `IMPORTANTE: O cliente PERGUNTOU sobre ANÉIS! Use search_catalog com category="aneis" IMEDIATAMENTE para mostrar os anéis disponíveis. Diga: "Vou te mostrar! 💍" (MAX 10 palavras!)`;
    } else if (mudouCategoria && finalCategoria === 'aliancas' && finalFinalidade && finalCor) {
      // ALIANÇAS: Só catálogo se tem FINALIDADE + COR!
      nextStep = 'catalogo';
      nextStepInstruction = `O cliente quer alianças de ${finalFinalidade} na cor ${finalCor}! Use search_catalog com category="aliancas" e color="${finalCor}". Diga: "Separei opções incríveis! 💍" (MAX 10 palavras!)`;
    } else if (mudouCategoria && finalCategoria === 'aliancas' && finalFinalidade) {
      // Tem finalidade mas falta COR - perguntar cor!
      nextStep = 'escolha_cor';
      if (finalFinalidade === 'namoro') {
        nextStepInstruction = `O cliente quer alianças de NAMORO! IMPORTANTE: Para namoro só temos DOURADA e PRATA. PERGUNTE: "Qual cor preferem? Dourada ou prata? 💍" (MAX 15 palavras!) NÃO ofereça preta ou azul! NÃO mostre catálogo ainda!`;
      } else {
        nextStepInstruction = `O cliente quer alianças de ${finalFinalidade}! PERGUNTE A COR: "Qual cor preferem? Dourada, prata, preta ou azul? 💍" (MAX 15 palavras!) NÃO mostre catálogo ainda!`;
      }
    } else if (mudouCategoria && finalCategoria === 'aliancas') {
      // Falta FINALIDADE - perguntar finalidade!
      nextStep = 'escolha_finalidade';
      nextStepInstruction = `O cliente perguntou sobre ALIANÇAS. PERGUNTE: "Vocês celebram namoro ou casamento? 💍" (MAX 10 palavras!) NÃO mostre catálogo ainda!`;
    } else if (querVerCatalogo && finalCategoria === 'pingente' && finalCor) {
      // PINGENTES: Só mostrar catálogo se já tem cor!
      nextStep = 'catalogo_pingentes';
      nextStepInstruction = `O cliente quer ver pingentes na cor ${finalCor}! Use search_catalog com category="pingente" e color="${finalCor}". Diga: "Vou te mostrar! 💫" (MAX 10 palavras!)`;
    } else if (querVerCatalogo && finalCategoria === 'pingente' && !finalCor) {
      // PINGENTES sem cor - perguntar cor primeiro!
      nextStep = 'escolha_cor_pingente';
      nextStepInstruction = `O cliente quer ver pingentes! PERGUNTE A COR PRIMEIRO: "Qual cor você prefere? Dourada ou prata? 💛🤍" (MAX 15 palavras!) NÃO mostre catálogo ainda!`;
    } else if (querVerCatalogo && finalCategoria === 'aneis') {
      // NOVO: ANÉIS
      nextStep = 'catalogo_aneis';
      nextStepInstruction = `O cliente quer ver anéis! Use search_catalog com category="aneis" AGORA! Diga: "Vou te mostrar! 💍" (MAX 10 palavras!)`;
    } else if (querVerCatalogo && finalCategoria === 'aliancas' && finalFinalidade && finalCor) {
      // CATÁLOGO SÓ SE TIVER: categoria + finalidade + cor!
      nextStep = 'catalogo';
      nextStepInstruction = `O cliente quer ver o catálogo! Use search_catalog com category="aliancas" e color="${finalCor}" AGORA. Diga: "Separei opções incríveis! 💍" (MAX 10 palavras!)`;
    } else if (querVerCatalogo && finalCategoria === 'aliancas' && finalFinalidade && !finalCor) {
      // Tem finalidade mas falta COR - perguntar cor!
      nextStep = 'escolha_cor';
      if (finalFinalidade === 'namoro') {
        nextStepInstruction = `O cliente quer alianças de NAMORO! IMPORTANTE: Para namoro só temos DOURADA e PRATA. Pergunte: "Qual cor preferem? Dourada ou prata? 💍" (MAX 15 palavras!) NÃO ofereça preta ou azul!`;
      } else {
        nextStepInstruction = `O cliente quer ver alianças de ${finalFinalidade}! Pergunte a cor: "Qual cor preferem? Dourada, prata, preta ou azul? 💍" (MAX 15 palavras!)`;
      }
      // Falta FINALIDADE - perguntar finalidade!
      nextStep = 'escolha_finalidade';
      nextStepInstruction = `O cliente quer ver alianças! Pergunte: "Vocês celebram namoro ou casamento? 💍" (MAX 10 palavras!)`;
    } else if (finalCategoria === 'pingente' && finalCor && !jaSelecionouProduto) {
      // PINGENTES com cor - pode mostrar catálogo
      nextStep = 'catalogo_pingentes';
      nextStepInstruction = `O cliente quer PINGENTES na cor ${finalCor}! Use search_catalog com category="pingente" e color="${finalCor}". Diga: "Vou te mostrar! 💫" (MAX 10 palavras!)`;
    } else if (finalCategoria === 'pingente' && !finalCor && !jaSelecionouProduto) {
      // 🚨 PINGENTES SEM COR - PERGUNTAR COR PRIMEIRO! NÃO enviar catálogo!
      nextStep = 'escolha_cor_pingente';
      nextStepInstruction = `O cliente quer PINGENTES mas NÃO escolheu cor! PERGUNTE: "Qual cor você prefere? Dourada ou prata? 💛🤍" (MAX 15 palavras!) NÃO use search_catalog ainda!`;
    } else if (finalCategoria === 'aneis' && finalCor && !jaSelecionouProduto) {
      // ANÉIS com cor
      nextStep = 'catalogo_aneis';
      nextStepInstruction = `O cliente quer ANÉIS na cor ${finalCor}! Use search_catalog com category="aneis" e color="${finalCor}". Diga: "Vou te mostrar! 💍" (MAX 10 palavras!)`;
    } else if (finalCategoria === 'aneis' && !jaSelecionouProduto) {
      // ANÉIS sem cor - ir direto ao catálogo
      nextStep = 'catalogo_aneis';
      nextStepInstruction = `O cliente quer ANÉIS! Use search_catalog com category="aneis" AGORA! Diga: "Vou te mostrar! 💍" (MAX 10 palavras!)`;
    } else if (finalCategoria === 'aliancas' && finalCor && finalFinalidade && !jaSelecionouProduto) {
      // ALIANÇAS: Tem categoria + finalidade + cor - pode mostrar catálogo
      nextStep = 'catalogo';
      nextStepInstruction = `O cliente quer alianças de ${finalFinalidade} ${finalCor}. Use search_catalog. Diga: "Separei opções incríveis!" (MAX 10 palavras!)`;
    } else if (finalCategoria === 'aliancas' && finalFinalidade && !finalCor && !jaSelecionouProduto) {
      // 🚨 ALIANÇAS: Tem finalidade mas SEM COR - PERGUNTAR COR! NÃO enviar catálogo!
      nextStep = 'escolha_cor';
      nextStepInstruction = `O cliente quer alianças de ${finalFinalidade}! PERGUNTE A COR: "Qual cor preferem? Dourada, prata, preta ou azul? 💍" (MAX 15 palavras!) NÃO use search_catalog ainda!`;
    } else if (finalCategoria === 'aliancas' && finalFinalidade) {
      // ALIANÇAS com finalidade - perguntar cor
      nextStep = 'escolha_cor';
      nextStepInstruction = `PERGUNTE A COR: "Qual cor preferem? Dourada, prata, preta ou azul? 💍" (MAX 15 palavras!) NÃO mostre catálogo!`;
    } else if (finalCategoria === 'aliancas' && !finalFinalidade) {
      // 🚨 ALIANÇAS SEM FINALIDADE - PERGUNTAR FINALIDADE PRIMEIRO!
      nextStep = 'escolha_finalidade';
      nextStepInstruction = `O cliente perguntou sobre ALIANÇAS mas NÃO disse a finalidade! PERGUNTE: "Vocês celebram namoro ou casamento? 💍" (MAX 10 palavras!) NÃO use search_catalog ainda!`;
    } else {
      nextStep = 'abertura';
      nextStepInstruction = `Apresente-se: "Olá! 😊 Sou a Aline da ACIUM. O que você procura? Alianças, anéis ou pingentes?" (MAX 20 palavras!)`;
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
    
    // NOVO: Regras rígidas de resposta curta
    contextInfo += `\n\n⚠️ REGRAS ABSOLUTAS DE RESPOSTA:`;
    contextInfo += `\n- MÁXIMO 2-3 linhas por mensagem`;
    contextInfo += `\n- NUNCA escreva parágrafos longos`;
    contextInfo += `\n- NUNCA liste produtos no texto (eles são enviados como imagens)`;
    contextInfo += `\n- Seja OBJETIVA e DIRETA`;
    
    if (jaSePresentou) {
      contextInfo += `\n\n🚫 VOCÊ JÁ SE APRESENTOU! NÃO diga "Olá, sou a Aline" novamente!`;
    }
    
    if (contact_name || newCollectedData.contact_name) {
      contextInfo += `\nCliente: ${contact_name || newCollectedData.contact_name}`;
    }
    
    // NOVO: Se produto não disponível, instrução clara
    if (newCollectedData.produto_nao_disponivel) {
      contextInfo += `\n\n🚫 PRODUTO NÃO DISPONÍVEL: "${newCollectedData.produto_pedido}"`;
      contextInfo += `\n→ Diga BREVEMENTE que não temos e SUGIRA pingentes como alternativa`;
    }
    
    contextInfo += `\n\n=== DADOS COLETADOS ===`;
    if (newCollectedData.categoria) contextInfo += `\n- Categoria: ${newCollectedData.categoria}`;
    if (newCollectedData.finalidade) contextInfo += `\n- Finalidade: ${newCollectedData.finalidade}`;
    if (newCollectedData.cor) contextInfo += `\n- Cor: ${newCollectedData.cor}`;
    if (coresMostradas.length > 0) contextInfo += `\n- Cores já mostradas: ${coresMostradas.join(', ')}`;
    if (newCollectedData.selected_sku) contextInfo += `\n- Produto: ${newCollectedData.selected_sku}`;
    if (newCollectedData.tamanho_1) contextInfo += `\n- Tamanho: ${newCollectedData.tamanho_1}${newCollectedData.tamanho_2 ? '/' + newCollectedData.tamanho_2 : ''}`;
    if (newCollectedData.delivery_method) contextInfo += `\n- Entrega: ${newCollectedData.delivery_method}`;
    if (newCollectedData.payment_method) contextInfo += `\n- Pagamento: ${newCollectedData.payment_method}`;
    
    // Instrução especial se produto selecionado mas sem tamanhos (forma curta)
    let additionalInstruction = '';
    if (newCollectedData.selected_sku && newCollectedData.categoria === 'aliancas' && !newCollectedData.tamanho_1) {
      additionalInstruction = `\n\n→ Pergunte tamanhos: "Qual tamanho de cada um? (14-28)"`;
    } else if (newCollectedData.selected_sku && newCollectedData.tamanho_1 && !newCollectedData.delivery_method) {
      additionalInstruction = `\n\n→ Pergunte: "Retirada na loja ou entrega? Pix ou cartão?"`;
    }
    
    contextInfo += `\n\n=== PRÓXIMO PASSO: ${nextStepInstruction}${additionalInstruction} ===`;


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
    // PASSO 5: RESPOSTA DIRETA PARA SELEÇÃO DE PRODUTO (BYPASS AI)
    // Quando o cliente ACABA de selecionar um produto, não chamar a IA!
    // Responder diretamente para seguir o fluxo sem confusão.
    // ========================================
    const produtoRecemSelecionado = newCollectedData.produto_selecionado_agora === true;
    
    if (produtoRecemSelecionado) {
      console.log(`[ALINE-REPLY] ⚡ PRODUTO RECÉM SELECIONADO - Respondendo diretamente sem chamar IA!`);
      console.log(`[ALINE-REPLY] Produto: ${newCollectedData.selected_name} (${newCollectedData.selected_sku})`);
      
      let respostaDireta = '';
      let nodeValueDirect = '';
      
      if (isPingenteSelecionado) {
        // PINGENTE → Pedir foto e oferecer corrente
        respostaDireta = `Excelente escolha! 💫 A gravação de um lado é GRÁTIS!

⚠️ Só lembrando: o pingente não acompanha corrente. Quer ver nossas correntes? 🔗

Me manda a foto que você quer gravar! 📸`;
        nodeValueDirect = 'coleta_foto';
      } else if (isAliancaSelecionada) {
        // ALIANÇA → Pedir tamanhos
        respostaDireta = `Excelente escolha! 💍

Qual o tamanho de cada um? Geralmente fica entre 14 e 28.`;
        nodeValueDirect = 'coleta_tamanhos';
      } else {
        // Categoria genérica → Pedir entrega
        respostaDireta = `Ótima escolha! 😊

Vocês preferem retirar na nossa loja no Shopping Sumaúma ou receber em casa?`;
        nodeValueDirect = 'coleta_entrega';
      }
      
      // Remover flag de recém selecionado para próximas mensagens
      delete newCollectedData.produto_selecionado_agora;
      
      // Salvar no banco
      await supabase
        .from('aline_conversations')
        .update({
          current_node: nodeValueDirect,
          last_node: conversation.current_node,
          collected_data: newCollectedData,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversation.id);

      // Salvar resposta da Aline
      await supabase.from('aline_messages').insert({
        conversation_id: conversation.id,
        role: 'assistant',
        message: respostaDireta,
        node: nodeValueDirect,
      });

      // Salvar no CRM também
      if (crmConversationId) {
        await supabase.from('messages').insert({
          conversation_id: crmConversationId,
          content: respostaDireta,
          is_from_me: true,
          message_type: 'text',
          status: 'sent'
        });

        await supabase
          .from('conversations')
          .update({ last_message: respostaDireta.substring(0, 100) })
          .eq('id', crmConversationId);
      }
      
      console.log(`[ALINE-REPLY] ✅ Resposta direta enviada: "${respostaDireta.substring(0, 50)}..."`);
      console.log(`[ALINE-REPLY] ====== FIM (BYPASS AI) ======`);
      
      return new Response(
        JSON.stringify({
          success: true,
          response: respostaDireta,
          mensagem_whatsapp: respostaDireta,
          reply_text: respostaDireta.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim(),
          node_tecnico: nodeValueDirect,
          acao_nome: null,
          tem_acao: false,
          produtos: [],
          total_produtos: 0,
          tem_produtos: false,
          produto_selecionado: newCollectedData.selected_product || null,
          tem_produto_selecionado: true,
          categoria_crm: newCollectedData.categoria || null,
          cor_crm: newCollectedData.cor || null,
          memoria: {
            phone,
            stage: nodeValueDirect,
            categoria: newCollectedData.categoria,
            produto_sku: newCollectedData.selected_sku,
            produto_nome: newCollectedData.selected_name,
            produto_preco: newCollectedData.selected_price,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // ========================================
    // PASSO 5B: DETECTAR SE DEVE FORÇAR CATÁLOGO
    // ========================================
    const lastUserMessage = message.toLowerCase();
    
    // ⚠️ CRÍTICO: Pergunta sobre PREÇO = FORÇAR CATÁLOGO!
    // Mas NÃO se já tem produto selecionado!
    const temPerguntaPreco = newCollectedData.pergunta_preco === true && !jaSelecionouProduto;
    
    // Pergunta técnica (material, entrega, garantia) = deixar AI responder
    const temPerguntaTecnica = newCollectedData.pergunta_tecnica === true;
    
    // AMPLIADO: Incluir todos os produtos
    const hasCategoryKeyword = /aliança|alianca|pingente|medalha|medalhinha|medalhas|anel|aneis|anéis/i.test(lastUserMessage);
    const hasColorKeyword = /dourada|dourado|prata|aço|aco|preta|preto|azul|rose|rosé/i.test(lastUserMessage);
    const hasActionKeyword = /quero\s*(ver|comprar)|mostrar|mostra|manda\s*op|catálogo|catalogo/i.test(lastUserMessage);
    const hasOtherColorsKeyword = /outra(s)?\s*cor(es)?|tem\s*outras?|mais\s*op[çc][õo]es|outras\s*op[çc][õo]es/i.test(lastUserMessage);
    const isAffirmativeResponse = /^(sim|quero|pode|claro|ok|s|bora|show|isso|exato|perfeito|legal|boa|blz|beleza|pode ser|manda|mostra|opções|quero ver)$/i.test(lastUserMessage.trim());
    
    // AMPLIADO: "medalha" = "pingente"
    const hasPingenteOrMedalha = /pingente|pingentes|medalha|medalhas|medalhinha|personalizada|com\s*foto|fotogravação/i.test(lastUserMessage);
    
    // NOVO: Detectar anéis
    const hasAnel = /anel|anéis|aneis|solitário|solitario/i.test(lastUserMessage);
    
    // NOVO: Detectar alianças com finalidade na mesma mensagem
    const hasAliancaCasamento = /aliança.*casamento|casamento.*aliança|alianca.*casamento|casamento|casar|tungst[eê]nio/i.test(lastUserMessage);
    const hasAliancaNamoro = /aliança.*namoro|namoro.*aliança|alianca.*namoro|compromisso|namoro|noivado/i.test(lastUserMessage);
    
    // NOVA LÓGICA: Forçar catálogo em mais cenários
    // MAS NÃO se já tem produto selecionado!
    const isPingenteFlow = newCollectedData.categoria === 'pingente';
    const isAneisFlow = newCollectedData.categoria === 'aneis';
    const isAliancasFlow = newCollectedData.categoria === 'aliancas';
    const hasColorForCategory = (isPingenteFlow || isAneisFlow || isAliancasFlow) && hasColorKeyword;
    
    // ⚠️ FORÇAR CATÁLOGO quando:
    // 1. Pergunta sobre PREÇO (mostrar produtos COM preços nos cards!)
    // 2. Quer ver catálogo
    // 3. Tem categoria + cor + ação
    // NÃO forçar se:
    // - For pergunta técnica (material, entrega, garantia)
    // - Já tem produto selecionado (precisa coletar dados, não mostrar mais catálogo!)
    const shouldForceCatalog = !temPerguntaTecnica && !jaSelecionouProduto && (
      temPerguntaPreco || // Pergunta de preço = FORÇAR catálogo!
      (hasCategoryKeyword && hasColorKeyword && hasActionKeyword) ||
      (hasActionKeyword && hasCategoryKeyword) ||
      hasOtherColorsKeyword ||
      (isAffirmativeResponse && detectedCategoria && !newCollectedData.selected_sku) ||
      mudouCategoria ||
      querVerCatalogo ||
      (isPingenteFlow && hasColorKeyword && hasActionKeyword) ||
      (isAneisFlow && hasColorKeyword && hasActionKeyword) ||
      (isAliancasFlow && finalFinalidade && finalCor && hasActionKeyword && !newCollectedData.selected_sku) ||
      (hasAliancaCasamento && hasColorKeyword && hasActionKeyword) ||
      (hasAliancaNamoro && hasColorKeyword && hasActionKeyword)
    );
    
    let toolChoice: any = "auto";
    if (shouldForceCatalog) {
      if (temPerguntaPreco) {
        console.log(`[ALINE-REPLY] 💰 PERGUNTA DE PREÇO → Forçando catálogo COM PREÇOS NOS CARDS!`);
      } else {
        console.log(`[ALINE-REPLY] Forçando busca de catálogo - cenário: pingente=${isPingenteFlow}, aneis=${isAneisFlow}, aliancas=${isAliancasFlow}, mudou=${mudouCategoria}`);
      }
      toolChoice = { type: "function", function: { name: "search_catalog" } };
    } else if (temPerguntaTecnica) {
      console.log(`[ALINE-REPLY] 🔍 PERGUNTA TÉCNICA detectada - deixando AI responder naturalmente`);
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
    // LIMPEZA ESPECIAL: Remover TUDO sobre produtos do texto
    // Quando há catálogo, o texto deve ser APENAS uma frase curta
    // Os cards com fotos, preços e detalhes são enviados pelo sistema
    // ========================================
    if (catalogProducts.length > 0) {
      console.log(`[ALINE-REPLY] 🧹 Limpando texto - produtos serão enviados como CARDS VISUAIS`);
      console.log(`[ALINE-REPLY] Texto original: "${cleanMessage.substring(0, 500)}..."`);
      
      // ESTRATÉGIA AGRESSIVA: Remover QUALQUER lista de produtos ou descrições
      // O sistema envia os CARDS automaticamente!
      
      // 1. Remover listas com bullets, números, ou descrições de produtos
      cleanMessage = cleanMessage
        // Remover linhas que começam com bullets/asteriscos/hífens/números
        .replace(/^[\-\*•]\s*.+$/gm, '')
        .replace(/^\d+[\.\)]\s*.+$/gm, '')
        // Remover qualquer linha com preço
        .replace(/.*R\$\s*[\d\.,]+.*/gi, '')
        .replace(/.*💰.*/gi, '')
        .replace(/.*preço.*/gi, '')
        .replace(/.*valor.*/gi, '')
        // Remover linhas com código/SKU
        .replace(/.*📦.*/gi, '')
        .replace(/.*Cód:.*/gi, '')
        .replace(/.*código.*/gi, '')
        .replace(/.*SKU.*/gi, '')
        // Remover linhas com tamanhos
        .replace(/.*📏.*/gi, '')
        .replace(/.*tamanho.*/gi, '')
        // Remover linhas com "aqui estão", "opções:"
        .replace(/.*aqui estão.*/gi, '')
        .replace(/.*opções:/gi, '')
        .replace(/.*seguem as.*/gi, '')
        // Remover linhas de descrição de produto
        .replace(/.*aliança.*ouro.*quilates.*/gi, '')
        .replace(/.*aliança.*tungstênio.*/gi, '')
        .replace(/.*aliança.*tungstenio.*/gi, '')
        .replace(/.*banho de ouro.*/gi, '')
        .replace(/.*friso lateral.*/gi, '')
        .replace(/.*infelizmente.*/gi, '')
        // Limpar múltiplas quebras de linha
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      // 2. Pegar apenas a PRIMEIRA linha que é uma frase válida de introdução
      const linhas = cleanMessage.split('\n').filter((l: string) => l.trim().length > 0);
      let fraseIntro = "";
      
      for (const linha of linhas) {
        const linhaLimpa = linha.trim();
        // Verificar se é uma frase introdutória válida (não é lista, não tem detalhes)
        const isValidIntro = linhaLimpa.length >= 10 && 
          linhaLimpa.length <= 100 &&
          !linhaLimpa.match(/^\d/) &&
          !linhaLimpa.startsWith('-') &&
          !linhaLimpa.startsWith('*') &&
          !linhaLimpa.includes('R$') &&
          !linhaLimpa.toLowerCase().includes('preço') &&
          !linhaLimpa.toLowerCase().includes('tamanho') &&
          !linhaLimpa.toLowerCase().includes('quilate') &&
          !linhaLimpa.toLowerCase().includes('tungst');
        
        if (isValidIntro) {
          fraseIntro = linhaLimpa;
          break;
        }
      }
      
      // 3. Se não encontrou frase válida, usar padrão baseado na categoria
      if (!fraseIntro || fraseIntro.length < 10) {
        const cat = (newCollectedData.categoria as string) || '';
        if (cat === 'aliancas') {
          fraseIntro = "Olha só essas alianças lindas! 💍✨";
        } else if (cat === 'pingente') {
          fraseIntro = "Separei esses pingentes especiais para você! ✨";
        } else {
          fraseIntro = "Separei algumas opções incríveis para você! 💍✨";
        }
      }
      
      // 4. Remover perguntas do final (serão enviadas como mensagem_pos_catalogo)
      fraseIntro = fraseIntro
        .replace(/\?.*$/, '!')
        .replace(/gostou[^.!?]*/gi, '')
        .replace(/me conta[^.!?]*/gi, '')
        .replace(/qual.*atenção[^.!?]*/gi, '')
        .trim();
      
      // 5. Garantir que termina com emoji e tem texto suficiente
      if (!fraseIntro.match(/[💍✨😊🔥💛🤍💫]/)) {
        fraseIntro = fraseIntro.replace(/[.!]?\s*$/, '') + " 💍✨";
      }
      
      // 6. Se ficou só com emojis/texto muito curto, usar fallback
      const textoSemEmojis = fraseIntro.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
      if (textoSemEmojis.length < 8) {
        fraseIntro = "Olha só essas opções que separei! 💍✨";
      }
      
      console.log(`[ALINE-REPLY] ✅ Texto limpo FINAL: "${fraseIntro}"`);
      cleanMessage = fraseIntro;
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
    // 🚨 CONTEXTO CRÍTICO: Se já selecionou produto de aliança, um número simples é TAMANHO!
    const jaSelecionouAlianca = (newCollectedData.selected_sku || collectedData.selected_sku) && 
                                 (newCollectedData.categoria === 'aliancas' || collectedData.categoria === 'aliancas');
    const jaTemTamanhoAnterior = collectedData.tamanho_1 || newCollectedData.tamanho_1;
    
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
    
    // 🚨 NOVO: Se cliente JÁ SELECIONOU ALIANÇA e enviou APENAS um número, é o TAMANHO!
    // Exemplos: "28", "22", "18"
    if (!size1 && jaSelecionouAlianca) {
      // Verificar se a mensagem é APENAS um número (ou número com texto curto)
      const singleNumberMatch = normalizedMsg.match(/^\s*(\d{1,2})\s*$/);
      if (singleNumberMatch) {
        const numValue = parseInt(singleNumberMatch[1]);
        // Validar se é tamanho válido (8-35)
        if (numValue >= 8 && numValue <= 35) {
          // Se já tem tamanho_1, este é o tamanho_2
          if (jaTemTamanhoAnterior) {
            size2 = singleNumberMatch[1];
            console.log(`[ALINE-REPLY] [NLU] 🚨 Número simples "${size2}" detectado como SEGUNDO TAMANHO (já tem ${collectedData.tamanho_1 || newCollectedData.tamanho_1})`);
          } else {
            size1 = singleNumberMatch[1];
            console.log(`[ALINE-REPLY] [NLU] 🚨 Número simples "${size1}" detectado como TAMANHO (contexto: aliança selecionada)`);
          }
        }
      }
      
      // Também tentar padrões com contexto mínimo tipo "o meu é 28", "é 22"
      if (!size1 && !size2) {
        const simplePatterns = [
          /(?:é|uso|meu|minha)\s*(?:é|:)?\s*(\d{1,2})/i,  // "é 28", "meu é 22", "uso 18"
          /^(\d{1,2})$/,  // apenas número
        ];
        for (const pattern of simplePatterns) {
          const match = normalizedMsg.match(pattern);
          if (match) {
            const numValue = parseInt(match[1]);
            if (numValue >= 8 && numValue <= 35) {
              if (jaTemTamanhoAnterior) {
                size2 = match[1];
                console.log(`[ALINE-REPLY] [NLU] 🚨 Padrão simples detectado como SEGUNDO TAMANHO: ${size2}`);
              } else {
                size1 = match[1];
                console.log(`[ALINE-REPLY] [NLU] 🚨 Padrão simples detectado como TAMANHO: ${size1}`);
              }
              break;
            }
          }
        }
      }
    }
    
    // Validar tamanhos (geralmente entre 10-30 para alianças)
    const isValidSize = (s: string | null): boolean => {
      if (!s) return false;
      const num = parseInt(s);
      return num >= 8 && num <= 35;
    };
    
    // Salvar tamanhos detectados
    if (isValidSize(size1)) {
      newCollectedData.tamanho_1 = size1;
      console.log(`[ALINE-REPLY] ✅ Tamanho 1 salvo: ${size1}`);
    }
    if (isValidSize(size2)) {
      // Se já tem tamanho_1 anterior, este é o segundo tamanho
      if (jaTemTamanhoAnterior && !newCollectedData.tamanho_1) {
        newCollectedData.tamanho_2 = size2;
        console.log(`[ALINE-REPLY] ✅ Tamanho 2 salvo: ${size2} (primeiro era ${collectedData.tamanho_1})`);
      } else if (isValidSize(size1)) {
        newCollectedData.tamanho_2 = size2;
        console.log(`[ALINE-REPLY] ✅ Tamanho 2 salvo: ${size2}`);
      }
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
    // NOTIFICAÇÃO DE COMPRADOR: Quando cliente informa pagamento OU entrega
    // Marcar como comprador e enviar resumo para Acium
    // ========================================
    const entregaAcabouDeSerColetada = !!newCollectedData.delivery_method && !collectedData.delivery_method;
    const pagamentoAcabouDeSerColetado = !!newCollectedData.payment_method && !collectedData.payment_method;
    
    if ((entregaAcabouDeSerColetada || pagamentoAcabouDeSerColetado) && newCollectedData.selected_sku && !collectedData.comprador_notificado) {
      const motivoNotificacao = pagamentoAcabouDeSerColetado ? 'pagamento informado' : 'entrega informada';
      console.log(`[ALINE-REPLY] 🔥 LEAD COMPRADOR detectado! Motivo: ${motivoNotificacao}`);
      
      // 1. Marcar como comprador no CRM
      if (crmConversationId) {
        await supabase
          .from('conversations')
          .update({ lead_status: 'comprador' })
          .eq('id', crmConversationId);
        console.log(`[ALINE-REPLY] ✅ Lead marcado como COMPRADOR`);
      }
      
      // 2. Buscar produtos enviados na sessão do catálogo
      let produtosEnviados = '';
      const lastSessionId = newCollectedData.last_catalog_session_id || collectedData.last_catalog_session_id;
      if (lastSessionId) {
        const { data: catalogItems } = await supabase
          .from('catalog_items_sent')
          .select('sku, name, price')
          .eq('session_id', lastSessionId)
          .order('position', { ascending: true });
        
        if (catalogItems && catalogItems.length > 0) {
          produtosEnviados = catalogItems.map((item: any, i: number) => {
            const preco = item.price ? `R$ ${Number(item.price).toFixed(2).replace('.', ',')}` : '';
            return `${i + 1}. ${item.name || item.sku} - ${preco}`;
          }).join('\n');
        }
      }
      
      // Fallback: usar produto selecionado
      if (!produtosEnviados && newCollectedData.selected_name) {
        const preco = newCollectedData.selected_price 
          ? `R$ ${Number(newCollectedData.selected_price).toFixed(2).replace('.', ',')}` 
          : '';
        produtosEnviados = `1. ${newCollectedData.selected_name} - ${preco}`;
      }
      
      // 3. Montar mensagem de notificação
      const nomeCliente = contact_name || newCollectedData.contact_name || 'Cliente';
      const categoriaCliente = newCollectedData.categoria || '';
      const corCliente = newCollectedData.cor || '';
      const tipoCliente = newCollectedData.finalidade || '';
      const entregaInfo = newCollectedData.delivery_method || 'não informado';
      const pagamentoInfo = newCollectedData.payment_method || 'não informado';
      
      const notificacao = `🟢 LEAD COMPRADOR - INTERESSE DE COMPRA!\n\n👤 Nome: ${nomeCliente}\n📱 Telefone: ${phone}\n📋 Categoria: ${categoriaCliente}${corCliente ? ` | Cor: ${corCliente}` : ''}${tipoCliente ? ` | Tipo: ${tipoCliente}` : ''}\n🚚 Entrega: ${entregaInfo}\n💳 Pagamento: ${pagamentoInfo}\n🛍️ Produtos enviados:\n${produtosEnviados || 'Não disponível'}`;
      
      console.log(`[ALINE-REPLY] 📨 Enviando notificação de comprador para Acium...`);
      
      // 4. Buscar números de notificação
      const { data: notifSettings } = await supabase
        .from('store_settings')
        .select('key, value')
        .or('key.eq.notification_whatsapp,key.like.notification_phone_%');
      
      const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
      const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
      const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');
      
      if (notifSettings && notifSettings.length > 0 && ZAPI_INSTANCE_ID && ZAPI_TOKEN) {
        const notifNumbers = [...new Set(notifSettings.map((s: any) => s.value.replace(/\D/g, '')))];
        
        for (const notifNumber of notifNumbers) {
          if (!notifNumber) continue;
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
            
            await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ phone: notifNumber, message: notificacao }),
            });
            console.log(`[ALINE-REPLY] ✅ Notificação comprador enviada para ${notifNumber}`);
          } catch (notifErr) {
            console.error(`[ALINE-REPLY] Erro ao enviar notificação:`, notifErr);
          }
        }
      }
      
      // Marcar que já notificou para não repetir
      newCollectedData.comprador_notificado = true;
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
    // IMPORTANTE: Usar role 'aline' para consistência com dados históricos e follow-up
    const insertResult = await supabase.from('aline_messages').insert({
      conversation_id: conversation.id,
      role: 'aline',  // Manter consistência com dados existentes
      message: cleanMessage,
      node: nodeValue,
      actions_executed: actionValue ? [{ action: actionValue }] : null,
    });
    
    if (insertResult.error) {
      console.error(`[ALINE-REPLY] ❌ ERRO ao salvar mensagem: ${insertResult.error.message}`);
    } else {
      console.log(`[ALINE-REPLY] ✅ Mensagem salva em aline_messages com role=aline`);
    }

    // NOTA: A resposta da Aline será salva no CRM pelo zapi-unified
    // após o envio bem-sucedido via Z-API. Não duplicamos aqui.

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
