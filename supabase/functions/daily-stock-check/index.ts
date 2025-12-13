import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;
    const assistantId = Deno.env.get('OPENAI_ASSISTANT_ID')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Iniciando verificação de estoque baixo...');

    // Buscar produtos com estoque baixo
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        id,
        name,
        sku,
        min_stock_alert,
        product_variants (
          size,
          stock
        )
      `)
      .eq('active', true);

    if (productsError) {
      console.error('Erro ao buscar produtos:', productsError);
      throw productsError;
    }

    // Filtrar produtos com estoque abaixo do mínimo
    const lowStockProducts = products?.filter(product => {
      const totalStock = product.product_variants?.reduce(
        (sum: number, v: any) => sum + (v.stock || 0), 
        0
      ) || 0;
      const minAlert = product.min_stock_alert || 5;
      return totalStock < minAlert;
    }) || [];

    console.log(`Encontrados ${lowStockProducts.length} produtos com estoque baixo`);

    if (lowStockProducts.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Nenhum produto com estoque baixo encontrado',
        checked_at: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Formatar mensagem para o agente
    const alertMessage = lowStockProducts.map(p => {
      const totalStock = p.product_variants?.reduce(
        (sum: number, v: any) => sum + (v.stock || 0), 
        0
      ) || 0;
      const variants = p.product_variants?.map((v: any) => `${v.size}: ${v.stock}`).join(', ') || 'Sem variantes';
      return `- ${p.name} (SKU: ${p.sku || 'N/A'}): ${totalStock} unidades (${variants})`;
    }).join('\n');

    const userMessage = `🚨 ALERTA DE ESTOQUE BAIXO!\n\nOs seguintes produtos estão com estoque crítico:\n\n${alertMessage}\n\nPor favor, analise e sugira ações: repor estoque, criar promoção para girar, ou notificar o proprietário.`;

    console.log('Enviando alerta para OpenAI Assistant...');
    console.log('Mensagem:', userMessage);

    // Criar thread no OpenAI Assistants API
    const threadResponse = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({})
    });

    if (!threadResponse.ok) {
      const errorText = await threadResponse.text();
      console.error('Erro ao criar thread:', errorText);
      throw new Error(`Erro ao criar thread: ${errorText}`);
    }

    const thread = await threadResponse.json();
    console.log('Thread criada:', thread.id);

    // Adicionar mensagem à thread
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        role: 'user',
        content: userMessage
      })
    });

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      console.error('Erro ao adicionar mensagem:', errorText);
      throw new Error(`Erro ao adicionar mensagem: ${errorText}`);
    }

    console.log('Mensagem adicionada à thread');

    // Executar o assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        assistant_id: assistantId
      })
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('Erro ao executar assistant:', errorText);
      throw new Error(`Erro ao executar assistant: ${errorText}`);
    }

    const run = await runResponse.json();
    console.log('Run iniciado:', run.id, 'Status:', run.status);

    return new Response(JSON.stringify({
      success: true,
      low_stock_count: lowStockProducts.length,
      products: lowStockProducts.map(p => ({
        name: p.name,
        sku: p.sku,
        total_stock: p.product_variants?.reduce((sum: number, v: any) => sum + (v.stock || 0), 0) || 0
      })),
      thread_id: thread.id,
      run_id: run.id,
      checked_at: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro na verificação de estoque:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
