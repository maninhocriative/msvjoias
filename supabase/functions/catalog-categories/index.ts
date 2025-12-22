import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Catalog Categories API request');

    // Buscar categorias únicas com contagem de produtos ativos com estoque
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        category,
        product_variants (
          stock
        )
      `)
      .eq('active', true)
      .not('category', 'is', null);

    if (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }

    // Processar para obter categorias únicas com contagem de produtos com estoque
    const categoryMap = new Map<string, { total: number; with_stock: number }>();

    (products || []).forEach((product: any) => {
      const category = product.category;
      if (!category) return;

      const variants = product.product_variants || [];
      const totalStock = variants.reduce((sum: number, v: { stock: number }) => sum + v.stock, 0);
      const hasStock = totalStock > 0;

      if (!categoryMap.has(category)) {
        categoryMap.set(category, { total: 0, with_stock: 0 });
      }

      const current = categoryMap.get(category)!;
      current.total += 1;
      if (hasStock) {
        current.with_stock += 1;
      }
    });

    // Converter para array ordenado
    const categories = Array.from(categoryMap.entries())
      .map(([name, counts]) => ({
        name,
        name_lowercase: name.toLowerCase(),
        total_products: counts.total,
        products_with_stock: counts.with_stock
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Criar mapa de aliases comuns para facilitar automação
    const aliases: Record<string, string> = {};
    categories.forEach(cat => {
      // Adicionar variações comuns
      aliases[cat.name.toLowerCase()] = cat.name;
      aliases[cat.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] = cat.name;
      
      // Plural/singular comum
      if (cat.name.endsWith('s')) {
        aliases[cat.name.slice(0, -1).toLowerCase()] = cat.name;
      } else {
        aliases[(cat.name + 's').toLowerCase()] = cat.name;
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        count: categories.length,
        categories,
        aliases,
        usage: {
          description: "Use o campo 'name' exato para filtrar no endpoint /catalog-api",
          example: "?category=Pingente",
          tip: "A busca por categoria é case-insensitive, então 'pingente' também funciona"
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Catalog Categories API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
