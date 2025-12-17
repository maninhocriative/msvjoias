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

    const body = await req.json();
    console.log("Sales webhook received:", JSON.stringify(body));

    // Support multiple payload formats from Fiqon
    const {
      // Direct format
      product_id,
      product_sku,
      customer_phone,
      customer_name,
      quantity = 1,
      unit_price,
      total_price,
      status = "completed",
      external_reference,
      // Alternative format (from Fiqon)
      produto_id,
      produto_sku,
      cliente_telefone,
      cliente_nome,
      quantidade,
      preco_unitario,
      preco_total,
      referencia_externa,
    } = body;

    // Normalize data
    const normalizedData = {
      product_id: product_id || produto_id,
      product_sku: product_sku || produto_sku,
      customer_phone: customer_phone || cliente_telefone,
      customer_name: customer_name || cliente_nome,
      quantity: quantity || quantidade || 1,
      unit_price: unit_price || preco_unitario,
      total_price: total_price || preco_total,
      status,
      external_reference: external_reference || referencia_externa,
    };

    console.log("Normalized data:", JSON.stringify(normalizedData));

    // Validate required fields
    if (!normalizedData.customer_phone) {
      return new Response(
        JSON.stringify({ success: false, error: "customer_phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find product by ID or SKU
    let productId = normalizedData.product_id;
    
    if (!productId && normalizedData.product_sku) {
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, price")
        .eq("sku", normalizedData.product_sku)
        .maybeSingle();

      if (productError) {
        console.error("Error finding product:", productError);
      } else if (product) {
        productId = product.id;
        // Use product price if not provided
        if (!normalizedData.unit_price) {
          normalizedData.unit_price = product.price;
        }
      }
    }

    // Calculate total if not provided
    const finalUnitPrice = normalizedData.unit_price || 0;
    const finalTotalPrice = normalizedData.total_price || (finalUnitPrice * normalizedData.quantity);

    // Insert order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        product_id: productId || null,
        customer_phone: normalizedData.customer_phone,
        customer_name: normalizedData.customer_name,
        quantity: normalizedData.quantity,
        unit_price: finalUnitPrice,
        total_price: finalTotalPrice,
        status: normalizedData.status,
        source: "fiqon",
        external_reference: normalizedData.external_reference,
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      return new Response(
        JSON.stringify({ success: false, error: orderError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Order created successfully:", order.id);

    // Update customer if exists or create new
    if (normalizedData.customer_phone) {
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("whatsapp", normalizedData.customer_phone)
        .maybeSingle();

      if (existingCustomer) {
        // Update order count
        await supabase
          .from("customers")
          .update({ total_orders: existingCustomer.id })
          .eq("id", existingCustomer.id);
        
        // Add cashback if configured
        await supabase.rpc("add_customer_cashback", {
          p_customer_id: existingCustomer.id,
          p_order_value: finalTotalPrice,
          p_order_reference: order.id,
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: order.id,
        message: "Sale registered successfully" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in sales-webhook:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
