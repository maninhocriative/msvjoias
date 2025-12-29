import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { phone, action } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedPhone = phone.replace(/\D/g, '');
    console.log(`[ALINE-TAKEOVER] Action: ${action}, Phone: ${normalizedPhone}`);

    // Buscar conversa da Aline para este telefone
    const { data: alineConv, error: findError } = await supabase
      .from('aline_conversations')
      .select('*')
      .eq('phone', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (!alineConv) {
      console.log(`[ALINE-TAKEOVER] Nenhuma conversa Aline encontrada para ${normalizedPhone}`);
      return new Response(JSON.stringify({
        success: true,
        message: 'Nenhuma conversa Aline encontrada para este número',
        aline_conversation: null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let newStatus: string;
    let message: string;

    switch (action) {
      case 'takeover':
        // Humano assume o atendimento
        newStatus = 'human_takeover';
        message = 'Atendimento assumido por humano. Aline pausada.';
        break;
      case 'release':
        // Devolve para a Aline
        newStatus = 'active';
        message = 'Atendimento devolvido para Aline.';
        break;
      case 'finish':
        // Finaliza a conversa
        newStatus = 'finished';
        message = 'Conversa finalizada.';
        break;
      default:
        newStatus = 'human_takeover';
        message = 'Atendimento assumido por humano. Aline pausada.';
    }

    // Atualizar status da conversa Aline
    const { data: updatedConv, error: updateError } = await supabase
      .from('aline_conversations')
      .update({
        status: newStatus,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', alineConv.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    console.log(`[ALINE-TAKEOVER] Conversa ${alineConv.id} atualizada para status: ${newStatus}`);

    return new Response(JSON.stringify({
      success: true,
      message,
      previous_status: alineConv.status,
      new_status: newStatus,
      aline_conversation: updatedConv,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ALINE-TAKEOVER] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
