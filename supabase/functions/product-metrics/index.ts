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

    const { product_id } = await req.json();

    if (!product_id) {
      return new Response(
        JSON.stringify({ error: "product_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching metrics for product:", product_id);

    // First, get the product SKU to search catalog_items_sent
    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("sku")
      .eq("id", product_id)
      .maybeSingle();

    if (productError) {
      console.error("Error fetching product:", productError);
    }

    const productSku = productData?.sku;
    console.log("Product SKU:", productSku);

    // Get sales data from orders table
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("id, quantity, total_price, created_at")
      .eq("product_id", product_id)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("Error fetching orders:", ordersError);
    }

    // Also count orders by SKU
    let ordersBySku: any[] = [];
    if (productSku) {
      const { data: skuOrdersData, error: skuOrdersError } = await supabase
        .from("orders")
        .select("id, quantity, total_price, created_at")
        .eq("selected_sku", productSku)
        .eq("status", "completed");

      if (!skuOrdersError && skuOrdersData) {
        ordersBySku = skuOrdersData;
      }
    }

    // Combine orders (by product_id and by sku, avoiding duplicates)
    const orderIds = new Set(ordersData?.map(o => o.id) || []);
    const allOrders = [
      ...(ordersData || []),
      ...ordersBySku.filter(o => !orderIds.has(o.id))
    ];

    // Calculate sales metrics
    const salesCount = allOrders.reduce((acc, order) => acc + order.quantity, 0);
    const totalRevenue = allOrders.reduce((acc, order) => acc + Number(order.total_price), 0);
    const lastSaleDate = allOrders.length > 0 
      ? allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at 
      : null;

    // Get search/interest count from messages table (product_interest)
    const { data: messagesData, error: messagesError } = await supabase
      .from("messages")
      .select("id, created_at")
      .eq("product_interest", product_id);

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
    }

    // Count catalog sends (how many times this product was shown in catalog)
    let catalogSendCount = 0;
    if (productSku) {
      const { count, error: catalogError } = await supabase
        .from("catalog_items_sent")
        .select("id", { count: "exact", head: true })
        .eq("sku", productSku);

      if (!catalogError && count !== null) {
        catalogSendCount = count;
      }
    }

    const searchCount = (messagesData?.length || 0) + catalogSendCount;
    console.log("Search count:", searchCount, "(messages:", messagesData?.length || 0, ", catalog:", catalogSendCount, ")");

    // Calculate conversion rate (sales / searches * 100)
    const conversionRate = searchCount > 0 ? ((salesCount / searchCount) * 100) : 0;

    // Get recent sales trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentSales = allOrders.filter(
      order => new Date(order.created_at) >= thirtyDaysAgo
    ).length;

    const metrics = {
      sales_count: salesCount,
      search_count: searchCount,
      last_sale_date: lastSaleDate,
      conversion_rate: Math.round(conversionRate * 10) / 10,
      total_revenue: totalRevenue,
      recent_sales_30d: recentSales,
      orders_count: allOrders.length,
    };

    console.log("Metrics calculated:", JSON.stringify(metrics));

    return new Response(
      JSON.stringify(metrics),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in product-metrics:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
