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

    // Calculate sales metrics
    const salesCount = ordersData?.reduce((acc, order) => acc + order.quantity, 0) || 0;
    const totalRevenue = ordersData?.reduce((acc, order) => acc + Number(order.total_price), 0) || 0;
    const lastSaleDate = ordersData?.[0]?.created_at || null;

    // Get search/interest count from messages table (product_interest)
    const { data: messagesData, error: messagesError } = await supabase
      .from("messages")
      .select("id, created_at")
      .eq("product_interest", product_id);

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
    }

    const searchCount = messagesData?.length || 0;

    // Calculate conversion rate (sales / searches * 100)
    const conversionRate = searchCount > 0 ? ((salesCount / searchCount) * 100) : 0;

    // Get recent sales trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentSales = ordersData?.filter(
      order => new Date(order.created_at) >= thirtyDaysAgo
    ).length || 0;

    const metrics = {
      sales_count: salesCount,
      search_count: searchCount,
      last_sale_date: lastSaleDate,
      conversion_rate: Math.round(conversionRate * 10) / 10,
      total_revenue: totalRevenue,
      recent_sales_30d: recentSales,
      orders_count: ordersData?.length || 0,
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
