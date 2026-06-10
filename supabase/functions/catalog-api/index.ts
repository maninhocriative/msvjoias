import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to normalize text (remove accents and lowercase)
function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Category normalization map
function normalizeCategory(category: string): string {
  const normalized = normalizeText(category);
  const categoryMap: Record<string, string> = {
    'aliancas': 'aliancas',
    'alianca': 'aliancas',
    'alianças': 'aliancas',
    'aliancas de tungstenio': 'aliancas',
    'aliancas de aco': 'aliancas',
    'alianças de tungstênio': 'aliancas',
    'alianças de aço': 'aliancas',
    'pingente': 'pingente',
    'pingentes': 'pingente',
    'aneis': 'aneis',
    'anel': 'aneis',
    'anéis': 'aneis',
    'personalizacao': 'personalizacao',
    'personalizacoes': 'personalizacao',
    'personalização': 'personalizacao',
  };
  return categoryMap[normalized] || normalized;
}

// Color normalization
function normalizeColor(color: string): string {
  const normalized = normalizeText(color);
  const colorMap: Record<string, string> = {
    'dourada': 'dourada',
    'dourado': 'dourada',
    'prata': 'prata',
    'aco': 'aco',
    'aço': 'aco',
    'preta': 'preta',
    'preto': 'preta',
    'azul': 'azul',
    'rose': 'rose',
    'rosé': 'rose',
    'ouro': 'ouro',
  };
  return colorMap[normalized] || normalized;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    
    // Helper to clean nil values from FiqOn/external integrations
    const cleanParam = (value: string | null): string | null => {
      if (!value) return null;
      // FiqOn sends "<nil>" or "null" as string when value is empty
      if (value === '<nil>' || value === 'null' || value === 'undefined' || value.trim() === '') {
        return null;
      }
      return value;
    };
    
    const category = cleanParam(url.searchParams.get('category'));
    const sku = cleanParam(url.searchParams.get('sku'));
    const productId = cleanParam(url.searchParams.get('product_id'));
    const onlyAvailable = url.searchParams.get('only_available') === 'true';
    const search = cleanParam(url.searchParams.get('search'));
    const cor = cleanParam(url.searchParams.get('cor'));
    const exactCategory = url.searchParams.get('exact_category') !== 'false'; // Default: busca exata

    // Normalize filters
    const normalizedCategory = category ? normalizeCategory(category) : null;
    const normalizedColor = cor ? normalizeColor(cor) : null;

    console.log('Catalog API request:', { category, sku, productId, onlyAvailable, search, cor, exactCategory });
    console.log('Normalized filters:', { normalizedCategory, normalizedColor });

    // Colunas "agent intelligence" (migration 20260607162000). Caso a migration
    // ainda nao tenha sido aplicada em producao, caimos para o conjunto basico.
    const EXTENDED_COLUMNS = `
        id, name, sku, description, price, category, color,
        agent_line, ai_description, ai_tags, search_aliases, commercial_notes,
        included_items, restrictions, recommended_when, avoid_when,
        image_url, video_url, images, active, created_at,
        product_variants ( id, size, stock )
      `;
    const CORE_COLUMNS = `
        id, name, sku, description, price, category, color,
        image_url, video_url, images, active, created_at,
        product_variants ( id, size, stock )
      `;
    const EXTENDED_SEARCH = (s: string) =>
      `name.ilike.%${s}%,description.ilike.%${s}%,sku.ilike.%${s}%,ai_description.ilike.%${s}%,commercial_notes.ilike.%${s}%,included_items.ilike.%${s}%,restrictions.ilike.%${s}%,recommended_when.ilike.%${s}%`;
    const CORE_SEARCH = (s: string) =>
      `name.ilike.%${s}%,description.ilike.%${s}%,sku.ilike.%${s}%`;

    const buildQuery = (columns: string, searchClause: (s: string) => string) => {
      let q = supabase.from('products').select(columns).eq('active', true);
      if (normalizedCategory) q = q.eq('category', normalizedCategory);
      if (sku) q = q.eq('sku', sku);
      if (productId) q = q.eq('id', productId);
      if (search) q = q.or(searchClause(search));
      if (normalizedColor) q = q.eq('color', normalizedColor);
      return q.order('name', { ascending: true });
    };

    let { data: products, error } = await buildQuery(EXTENDED_COLUMNS, EXTENDED_SEARCH);

    if (error) {
      console.warn('catalog-api extended query failed, falling back to core columns:', error.message || error);
      ({ data: products, error } = await buildQuery(CORE_COLUMNS, CORE_SEARCH));
    }

    if (error) {
      console.error('Error fetching products:', error);
      throw error;
    }

    // Transform data for automation consumption
    const catalog = (products || []).map((product: any) => {
      const variants = product.product_variants || [];
      const totalStock = variants.reduce((sum: number, v: { stock: number }) => sum + v.stock, 0);
      const availableSizes = variants
        .filter((v: { stock: number }) => v.stock > 0)
        .map((v: { size: string; stock: number }) => ({
          size: v.size,
          stock: v.stock
        }));

      return {
        id: product.id,
        sku: product.sku || `PROD-${product.id.substring(0, 8).toUpperCase()}`,
        name: product.name,
        description: product.description,
        price: product.price,
        price_formatted: product.price ? `R$ ${Number(product.price).toFixed(2).replace('.', ',')}` : null,
        category: product.category,
        agent_line: product.agent_line || null,
        ai_description: product.ai_description || null,
        ai_tags: product.ai_tags || [],
        search_aliases: product.search_aliases || [],
        commercial_notes: product.commercial_notes || null,
        included_items: product.included_items || null,
        restrictions: product.restrictions || null,
        recommended_when: product.recommended_when || null,
        avoid_when: product.avoid_when || null,
        image_url: product.image_url,
        video_url: product.video_url,
        images: product.images || [],
        all_media: [
          ...(product.image_url ? [{ type: 'image', url: product.image_url, is_main: true }] : []),
          ...(product.images || []).map((imgUrl: string) => ({ type: 'image', url: imgUrl, is_main: false })),
          ...(product.video_url ? [{ type: 'video', url: product.video_url }] : [])
        ],
        total_stock: totalStock,
        available: totalStock > 0,
        sizes: availableSizes,
        all_sizes: variants.map((v: { size: string; stock: number }) => ({
          size: v.size,
          stock: v.stock,
          available: v.stock > 0
        }))
      };
    })
    // Sempre filtrar produtos sem estoque (stock > 0)
    .filter((p: { available: boolean; total_stock: number }) => p.total_stock > 0)
    // Filtro adicional por only_available (mantém compatibilidade)
    .filter((p: { available: boolean }) => !onlyAvailable || p.available);

    // If searching by SKU or product_id, return single object
    if ((sku || productId) && catalog.length === 1) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          product: catalog[0]
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: catalog.length,
        products: catalog
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Catalog API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
