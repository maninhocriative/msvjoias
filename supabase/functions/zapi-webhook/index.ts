import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { forwardToZapiUnified, proxyCorsHeaders } from "../_shared/forward-to-zapi-unified.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: proxyCorsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const body = await req.json();
    return await forwardToZapiUnified({
      body,
      logPrefix: "ZAPI-WEBHOOK",
      supabaseUrl,
      supabaseServiceKey,
    });
  } catch (error) {
    console.error('[ZAPI-WEBHOOK] Erro:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...proxyCorsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
