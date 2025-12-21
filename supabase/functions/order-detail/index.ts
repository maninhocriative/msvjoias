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
    const orderId = url.searchParams.get("id");

    if (req.method === "GET") {
      if (!orderId) {
        return new Response(
          JSON.stringify({ error: "id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar pedido
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (orderError) {
        console.error("Erro ao buscar pedido:", orderError);
        return new Response(
          JSON.stringify({ error: orderError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!order) {
        return new Response(
          JSON.stringify({ error: "Pedido não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let session = null;
      let catalogItems: unknown[] = [];

      // Se tiver session_id, buscar sessão e itens do catálogo
      if (order.session_id) {
        const { data: sessionData } = await supabase
          .from("catalog_sessions")
          .select("*")
          .eq("id", order.session_id)
          .maybeSingle();
        
        session = sessionData;

        if (session) {
          const { data: items } = await supabase
            .from("catalog_items_sent")
            .select("*")
            .eq("session_id", session.id)
            .order("position", { ascending: true });
          
          catalogItems = items || [];
        }
      }

      console.log("Detalhe do pedido:", orderId);
      return new Response(
        JSON.stringify({ order, session, catalog_items: catalogItems }),
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
