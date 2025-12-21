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
      const {
        session_id,
        position,
        sku,
        name,
        price,
        price_formatted,
        sizes,
        image_url,
        video_url,
        media_type,
        media_url,
        stock_total,
      } = body;

      // Validações
      if (!session_id || !position || !sku || !name || !media_type || !media_url) {
        return new Response(
          JSON.stringify({ 
            error: "session_id, position, sku, name, media_type e media_url são obrigatórios" 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar se sessão existe
      const { data: session, error: sessionError } = await supabase
        .from("catalog_sessions")
        .select("id")
        .eq("id", session_id)
        .maybeSingle();

      if (sessionError || !session) {
        return new Response(
          JSON.stringify({ error: "Sessão não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Inserir item
      const { error } = await supabase
        .from("catalog_items_sent")
        .insert({
          session_id,
          position,
          sku,
          name,
          price: price || null,
          price_formatted: price_formatted || null,
          sizes: sizes || null,
          image_url: image_url || null,
          video_url: video_url || null,
          media_type,
          media_url,
          stock_total: stock_total || null,
        });

      if (error) {
        console.error("Erro ao inserir item:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Item inserido - session:", session_id, "position:", position, "sku:", sku);
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
