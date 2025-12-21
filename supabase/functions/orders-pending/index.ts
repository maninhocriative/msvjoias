import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Função para buscar número de notificação das configurações
async function getNotificationPhone(supabase: any): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("store_settings")
      .select("value")
      .eq("key", "notification_whatsapp")
      .maybeSingle();
    
    if (error || !data) {
      console.log("Número de notificação não configurado");
      return null;
    }
    return (data as { value: string }).value;
  } catch (error) {
    console.error("Erro ao buscar número de notificação:", error);
    return null;
  }
}

// Função para enviar notificação via ZAPI
async function sendNotification(message: string, notificationPhone: string) {
  try {
    const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID");
    const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN");
    const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN");

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      console.log("ZAPI credentials not configured, skipping notification");
      return;
    }

    const zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (ZAPI_CLIENT_TOKEN) {
      headers["client-token"] = ZAPI_CLIENT_TOKEN;
    }

    const response = await fetch(zapiEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: notificationPhone,
        message,
      }),
    });

    const result = await response.json();
    console.log("Notificação enviada para", notificationPhone, ":", result);
  } catch (error) {
    console.error("Erro ao enviar notificação:", error);
  }
}

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
        customer_name,
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
      let isNewOrder = false;

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
        isNewOrder = true;
        console.log("Novo pedido criado:", data?.id);
      }

      if (result.error) {
        console.error("Erro ao salvar pedido:", result.error);
        return new Response(
          JSON.stringify({ error: result.error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Enviar notificação apenas para novos pedidos
      if (isNewOrder && result.data) {
        const notificationPhone = await getNotificationPhone(supabase);
        if (notificationPhone) {
          const formattedPhone = phone.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, "+$1 ($2) $3-$4");
          const clientInfo = customer_name 
            ? `👤 Nome: ${customer_name}\n📱 Telefone: ${formattedPhone}` 
            : `📱 Cliente: ${formattedPhone}`;
          const notificationMessage = `🔔 *NOVO PEDIDO PENDENTE*\n\n${clientInfo}\n📦 Produto: ${selected_name || selected_sku || "Não informado"}\n${selected_size_1 ? `📏 Tamanho: ${selected_size_1}${selected_size_2 ? ` / ${selected_size_2}` : ""}\n` : ""}${price_total ? `💰 Valor: R$ ${Number(price_total).toFixed(2).replace(".", ",")}\n` : ""}\n📝 Resumo:\n${summary_text}\n\n🔗 Acesse o CRM para atender!`;
          
          // Enviar notificação em background para não atrasar a resposta
          sendNotification(notificationMessage, notificationPhone);
        }
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
