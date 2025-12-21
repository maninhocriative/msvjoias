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

    if (req.method === "GET") {
      const url = new URL(req.url);
      const phone = url.searchParams.get("phone");
      const line = url.searchParams.get("line");

      if (!phone) {
        return new Response(
          JSON.stringify({ error: "phone é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar sessão mais recente ativa
      let query = supabase
        .from("catalog_sessions")
        .select("*")
        .eq("phone", phone)
        .eq("session_status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (line) {
        query = query.eq("line", line);
      }

      const { data: session, error: sessionError } = await query.maybeSingle();

      if (sessionError) {
        console.error("Erro ao buscar sessão:", sessionError);
        return new Response(
          JSON.stringify({ error: sessionError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!session) {
        return new Response(
          JSON.stringify({ session: null, items: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar itens da sessão
      const { data: items, error: itemsError } = await supabase
        .from("catalog_items_sent")
        .select("*")
        .eq("session_id", session.id)
        .order("position", { ascending: true });

      if (itemsError) {
        console.error("Erro ao buscar itens:", itemsError);
        return new Response(
          JSON.stringify({ error: itemsError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Sessão encontrada:", session.id, "- Itens:", items?.length || 0);
      return new Response(
        JSON.stringify({ session, items: items || [] }),
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
