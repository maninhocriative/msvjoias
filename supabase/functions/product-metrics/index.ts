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

    // Get product interest count from messages (how many times this product was searched/asked about)
    const { data: messagesData, error: messagesError } = await supabase
      .from("messages")
      .select("id, created_at")
      .eq("product_interest", product_id);

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
    }

    const searchCount = messagesData?.length || 0;

    // For now, sales data would need to come from an external system or orders table
    // This is a placeholder that can be expanded when orders/sales tracking is implemented
    const metrics = {
      sales_count: 0, // Would come from orders table if available
      search_count: searchCount,
      last_sale_date: null, // Would come from orders table
      conversion_rate: 0, // Would be calculated from sales/searches
    };

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
