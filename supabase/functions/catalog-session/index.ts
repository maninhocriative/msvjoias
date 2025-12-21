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

    if (req.method === "POST") {
      const body = await req.json();
      const { phone, line, intent, preferred_color, budget_max } = body;

      if (!phone || !line) {
        return new Response(
          JSON.stringify({ error: "phone e line são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fechar sessões anteriores do mesmo phone+line
      await supabase
        .from("catalog_sessions")
        .update({ session_status: "closed" })
        .eq("phone", phone)
        .eq("line", line)
        .eq("session_status", "active");

      // Criar nova sessão
      const { data, error } = await supabase
        .from("catalog_sessions")
        .insert({
          phone,
          line,
          intent: intent || null,
          preferred_color: preferred_color || null,
          budget_max: budget_max || null,
          session_status: "active",
        })
        .select("id")
        .single();

      if (error) {
        console.error("Erro ao criar sessão:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Sessão criada:", data.id);
      return new Response(
        JSON.stringify({ session_id: data.id }),
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
