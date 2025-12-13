import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse query parameters
    const url = new URL(req.url);
    let params: Record<string, string> = {};
    
    // Support both GET query params and POST body
    if (req.method === "GET") {
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
    } else if (req.method === "POST") {
      try {
        const body = await req.json();
        params = { ...body };
      } catch {
        // Empty body, use query params
        url.searchParams.forEach((value, key) => {
          params[key] = value;
        });
      }
    }

    const {
      search,
      color,
      category,
      min_price,
      max_price,
      sku,
      product_id,
      only_available,
      tags,
      limit = "50",
    } = params;

    console.log("AI Catalog Search params:", params);

    // Build query
    let query = supabase
      .from("products")
      .select(`
        *,
        product_variants (id, size, stock)
      `)
      .eq("active", true);

    // Apply filters
    if (product_id) {
      query = query.eq("id", product_id);
    }

    if (sku) {
      query = query.ilike("sku", `%${sku}%`);
    }

    if (category) {
      query = query.ilike("category", `%${category}%`);
    }

    if (color) {
      query = query.ilike("color", `%${color}%`);
    }

    if (min_price) {
      query = query.gte("price", parseFloat(min_price));
    }

    if (max_price) {
      query = query.lte("price", parseFloat(max_price));
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (tags) {
      const tagArray = tags.split(",").map(t => t.trim());
      query = query.overlaps("tags", tagArray);
    }

    query = query.limit(parseInt(limit));

    const { data: products, error: productsError } = await query;

    if (productsError) {
      console.error("Error fetching products:", productsError);
      throw productsError;
    }

    console.log(`Found ${products?.length || 0} products`);

    // Fetch active offers
    const now = new Date().toISOString();
    const { data: offers, error: offersError } = await supabase
      .from("offers")
      .select("*")
      .eq("active", true)
      .lte("start_date", now)
      .gte("end_date", now);

    if (offersError) {
      console.error("Error fetching offers:", offersError);
    }

    const offersMap = new Map();
    offers?.forEach(offer => {
      offersMap.set(offer.product_id, offer);
    });

    // Transform products for AI consumption
    const transformedProducts = products?.map(product => {
      const variants = product.product_variants || [];
      const totalStock = variants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
      const availableSizes = variants
        .filter((v: any) => v.stock > 0)
        .map((v: any) => ({ size: v.size, stock: v.stock }));

      const offer = offersMap.get(product.id);
      const isOnSale = !!offer;
      const currentPrice = isOnSale ? offer.promotional_price : product.price;
      const discountPercentage = isOnSale
        ? Math.round(((product.price - offer.promotional_price) / product.price) * 100)
        : 0;

      // Build media object
      const media: Record<string, any> = {};
      if (product.image_url) {
        media.image_url = product.image_url;
      }
      if (product.video_url) {
        media.video_url = product.video_url;
      }
      if (product.images && product.images.length > 0) {
        media.gallery = product.images;
      }

      return {
        id: product.id,
        sku: product.sku || null,
        name: product.name,
        description: product.description,
        price_original: product.price,
        price_current: currentPrice,
        is_on_sale: isOnSale,
        discount_percentage: discountPercentage > 0 ? `${discountPercentage}%` : null,
        has_gift: isOnSale && !!offer?.gift_description,
        gift_details: offer?.gift_description || null,
        stock_available: totalStock,
        is_available: totalStock > 0,
        sizes: availableSizes,
        specs: {
          color: product.color || null,
          category: product.category || null,
          tags: product.tags || [],
        },
        media,
        low_stock_warning: product.min_stock_alert && totalStock <= product.min_stock_alert,
      };
    }) || [];

    // Filter by availability if requested
    let filteredProducts = transformedProducts;
    if (only_available === "true") {
      filteredProducts = transformedProducts.filter(p => p.is_available);
    }

    // Determine context
    let context = "catalog";
    if (search) context = "search_results";
    if (filteredProducts.some(p => p.is_on_sale)) context = "showing_offers";
    if (product_id || sku) context = "product_detail";

    // Return single product if specific ID or SKU
    if ((product_id || sku) && filteredProducts.length === 1) {
      return new Response(
        JSON.stringify({
          success: true,
          context: "product_detail",
          product: filteredProducts[0],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        context,
        total: filteredProducts.length,
        filters_applied: {
          search: search || null,
          color: color || null,
          category: category || null,
          price_range: min_price || max_price ? { min: min_price || null, max: max_price || null } : null,
          tags: tags || null,
          only_available: only_available === "true",
        },
        products: filteredProducts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("AI Catalog Search error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
