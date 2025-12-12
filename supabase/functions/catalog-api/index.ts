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
    const productId = url.searchParams.get('product_id');
    const onlyAvailable = url.searchParams.get('only_available') === 'true';

    console.log('Catalog API request:', { category, productId, onlyAvailable });

    // If specific product requested
    if (productId) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('active', true)
        .maybeSingle();

      if (productError) {
        console.error('Error fetching product:', productError);
        throw productError;
      }

      if (!product) {
        return new Response(
          JSON.stringify({ error: 'Produto não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: variants, error: variantsError } = await supabase
        .from('product_variants')
        .select('size, stock')
        .eq('product_id', productId);

      if (variantsError) {
        console.error('Error fetching variants:', variantsError);
        throw variantsError;
      }

      const totalStock = variants?.reduce((sum, v) => sum + v.stock, 0) || 0;
      const availableSizes = variants?.filter(v => v.stock > 0).map(v => v.size) || [];

      const response = {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        image_url: product.image_url,
        total_stock: totalStock,
        available: totalStock > 0,
        sizes: variants?.map(v => ({
          size: v.size,
          stock: v.stock,
          available: v.stock > 0
        })) || [],
        available_sizes: availableSizes
      };

      console.log('Returning single product:', response.name);

      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all products
    let query = supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('name');

    if (category) {
      query = query.eq('category', category);
    }

    const { data: products, error: productsError } = await query;

    if (productsError) {
      console.error('Error fetching products:', productsError);
      throw productsError;
    }

    // Fetch all variants for these products
    const productIds = products?.map(p => p.id) || [];
    
    const { data: allVariants, error: variantsError } = await supabase
      .from('product_variants')
      .select('product_id, size, stock')
      .in('product_id', productIds);

    if (variantsError) {
      console.error('Error fetching variants:', variantsError);
      throw variantsError;
    }

    // Map variants to products
    const catalog = products?.map(product => {
      const variants = allVariants?.filter(v => v.product_id === product.id) || [];
      const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
      const availableSizes = variants.filter(v => v.stock > 0).map(v => v.size);

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        image_url: product.image_url,
        total_stock: totalStock,
        available: totalStock > 0,
        sizes: variants.map(v => ({
          size: v.size,
          stock: v.stock,
          available: v.stock > 0
        })),
        available_sizes: availableSizes
      };
    }) || [];

    // Filter only available if requested
    const result = onlyAvailable 
      ? catalog.filter(p => p.available) 
      : catalog;

    console.log(`Returning ${result.length} products`);

    return new Response(
      JSON.stringify({
        total: result.length,
        products: result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Catalog API error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
