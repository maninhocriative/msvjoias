import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * DEPRECATED: Este webhook foi substituído pelo zapi-unified
 * Este arquivo redireciona todas as requisições para zapi-unified
 * para garantir compatibilidade com webhooks já configurados
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Redirecionar para zapi-unified
    const body = await req.json();
    console.log('[ZAPI-WEBHOOK] Redirecionando para zapi-unified:', JSON.stringify(body).substring(0, 200));
    
    const response = await fetch(`${supabaseUrl}/functions/v1/zapi-unified`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    console.log('[ZAPI-WEBHOOK] Resposta do zapi-unified:', JSON.stringify(result).substring(0, 200));

    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ZAPI-WEBHOOK] Erro:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
