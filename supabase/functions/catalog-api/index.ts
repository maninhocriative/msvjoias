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

    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    const sku = url.searchParams.get('sku');
    const productId = url.searchParams.get('product_id');
    const onlyAvailable = url.searchParams.get('only_available') === 'true';
    const search = url.searchParams.get('search');

    console.log('Catalog API request:', { category, sku, productId, onlyAvailable, search });

    // Build query
    let query = supabase
      .from('products')
      .select(`
        id,
        name,
        sku,
        description,
        price,
        category,
        image_url,
        video_url,
        images,
        active,
        created_at,
        product_variants (
          id,
          size,
          stock
        )
      `)
      .eq('active', true);

    // Apply filters
    if (category) {
      query = query.ilike('category', `%${category}%`);
    }

    if (sku) {
      query = query.eq('sku', sku);
    }

    if (productId) {
      query = query.eq('id', productId);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const { data: products, error } = await query.order('name', { ascending: true });

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
    }).filter((p: { available: boolean }) => !onlyAvailable || p.available);

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
