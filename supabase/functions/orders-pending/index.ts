import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const orderId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // POST /orders-pending - Criar/atualizar pedido pendente
    if (req.method === "POST") {
      const body = await req.json();
      const {
        phone,
        session_id,
        selected_sku,
        selected_name,
        selected_size_1,
        selected_size_2,
        unit_or_pair,
        payment_method,
        delivery_method,
        delivery_address,
        notes,
        summary_text,
        quantity,
        price_total,
      } = body;

      if (!phone || !summary_text) {
        return new Response(
          JSON.stringify({ error: "phone e summary_text são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar se existe pedido pendente nas últimas 6 horas
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      
      const { data: existingOrder, error: searchError } = await supabase
        .from("orders")
        .select("id")
        .eq("customer_phone", phone)
        .eq("status", "pending_human")
        .gte("created_at", sixHoursAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (searchError) {
        console.error("Erro ao buscar pedido existente:", searchError);
      }

      const orderData = {
        customer_phone: phone,
        session_id: session_id || null,
        status: "pending_human",
        selected_sku: selected_sku || null,
        selected_name: selected_name || null,
        selected_size_1: selected_size_1 || null,
        selected_size_2: selected_size_2 || null,
        unit_or_pair: unit_or_pair || null,
        payment_method: payment_method || null,
        delivery_method: delivery_method || null,
        delivery_address: delivery_address || null,
        notes: notes || null,
        summary_text,
        quantity: quantity || 1,
        total_price: price_total || 0,
        unit_price: price_total || 0,
      };

      let result;
      if (existingOrder) {
        // Atualizar pedido existente
        const { data, error } = await supabase
          .from("orders")
          .update({ ...orderData, updated_at: new Date().toISOString() })
          .eq("id", existingOrder.id)
          .select("id, status")
          .single();
        
        result = { data, error };
        console.log("Pedido atualizado:", existingOrder.id);
      } else {
        // Criar novo pedido
        const { data, error } = await supabase
          .from("orders")
          .insert(orderData)
          .select("id, status")
          .single();
        
        result = { data, error };
        console.log("Novo pedido criado:", data?.id);
      }

      if (result.error) {
        console.error("Erro ao salvar pedido:", result.error);
        return new Response(
          JSON.stringify({ error: result.error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ order_id: result.data?.id, status: result.data?.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /orders-pending - Listar pedidos
    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      const phone = url.searchParams.get("phone");
      const sku = url.searchParams.get("sku");
      const period = url.searchParams.get("period"); // today, 7days, 30days

      let query = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }
      if (phone) {
        query = query.ilike("customer_phone", `%${phone}%`);
      }
      if (sku) {
        query = query.ilike("selected_sku", `%${sku}%`);
      }
      if (period) {
        const now = new Date();
        let startDate: Date;
        if (period === "today") {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (period === "7days") {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (period === "30days") {
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        } else {
          startDate = new Date(0);
        }
        query = query.gte("created_at", startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erro ao listar pedidos:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ items: data || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PATCH /orders-pending/:id/status - Atualizar status
    if (req.method === "PATCH" && orderId) {
      const body = await req.json();
      const { status, assigned_to } = body;

      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (status) updateData.status = status;
      if (assigned_to !== undefined) updateData.assigned_to = assigned_to;

      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId);

      if (error) {
        console.error("Erro ao atualizar pedido:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Status atualizado - pedido:", orderId, "status:", status);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Método não suportado" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
