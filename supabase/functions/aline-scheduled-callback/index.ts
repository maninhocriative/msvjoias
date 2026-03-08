import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * ALINE-SCHEDULED-CALLBACK
 * Executa diariamente via cron. Busca callbacks agendados para hoje
 * e envia mensagem de retomada via Z-API + atualiza contexto da Aline.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error('Z-API credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar callbacks pendentes para hoje
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    console.log(`[SCHEDULED-CALLBACK] Verificando callbacks para ${today}...`);

    const { data: callbacks, error } = await supabase
      .from('scheduled_callbacks')
      .select('*')
      .eq('callback_date', today)
      .eq('status', 'pending');

    if (error) throw error;

    if (!callbacks || callbacks.length === 0) {
      console.log('[SCHEDULED-CALLBACK] Nenhum callback agendado para hoje.');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[SCHEDULED-CALLBACK] ${callbacks.length} callback(s) encontrado(s)`);

    let processed = 0;
    let errors = 0;

    for (const cb of callbacks) {
      try {
        const ctx = cb.context || {};
        const contactName = ctx.contact_name || '';
        const categoria = ctx.categoria || '';
        const finalidade = ctx.finalidade || '';
        const reason = cb.reason || '';

        // Montar mensagem personalizada de retomada
        let message = '';
        if (contactName) {
          const firstName = contactName.split(' ')[0];
          message = `Oi, ${firstName}! 😊 Tudo bem?\n\n`;
        } else {
          message = `Oi! 😊 Tudo bem?\n\n`;
        }

        if (categoria === 'pingente' && finalidade === 'casamento') {
          message += `Você mencionou que ia encomendar um pingente para um pedido de casamento. Ainda quer seguir com o pedido? Posso te ajudar a escolher! 💍✨`;
        } else if (categoria === 'pingente') {
          message += `Você mencionou interesse em nossos pingentes. Ainda quer seguir com o pedido? Posso te ajudar! 💫`;
        } else if (categoria === 'aliancas') {
          message += `Você mencionou interesse em nossas alianças. Ainda quer seguir com o pedido? Estou aqui para te ajudar! 💍`;
        } else {
          message += `Você mencionou que voltaria hoje. Posso te ajudar com algo? 😊`;
        }

        // Enviar via Z-API
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN;

        const zapiResponse = await fetch(
          `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ phone: cb.phone, message }),
          }
        );

        const zapiResult = await zapiResponse.json();
        const sent = zapiResponse.ok && (zapiResult.messageId || zapiResult.zaapId);

        if (sent) {
          console.log(`[SCHEDULED-CALLBACK] ✅ Mensagem enviada para ${cb.phone}`);

          // Salvar mensagem no CRM
          const { data: conv } = await supabase
            .from('conversations')
            .select('id')
            .eq('contact_number', cb.phone)
            .maybeSingle();

          if (conv) {
            await supabase.from('messages').insert({
              conversation_id: conv.id,
              content: message,
              message_type: 'text',
              is_from_me: true,
              status: 'sent',
              zapi_message_id: zapiResult.messageId || zapiResult.zaapId,
            });

            await supabase.from('conversations').update({
              last_message: message.substring(0, 100),
              last_message_at: new Date().toISOString(),
            }).eq('id', conv.id);
          }

          // Reativar conversa da Aline para receber resposta
          const { data: alineConv } = await supabase
            .from('aline_conversations')
            .select('id, collected_data')
            .eq('phone', cb.phone)
            .maybeSingle();

          if (alineConv) {
            const existingData = alineConv.collected_data || {};
            await supabase
              .from('aline_conversations')
              .update({
                status: 'active',
                current_node: 'retomada_agendada',
                last_message_at: new Date().toISOString(),
                followup_count: 0,
                collected_data: {
                  ...existingData,
                  ...ctx,
                  callback_retomada: true,
                  callback_date: today,
                },
              })
              .eq('id', alineConv.id);
          }

          // Marcar callback como executado
          await supabase
            .from('scheduled_callbacks')
            .update({ status: 'executed', executed_at: new Date().toISOString() })
            .eq('id', cb.id);

          processed++;
        } else {
          console.error(`[SCHEDULED-CALLBACK] ❌ Falha ao enviar para ${cb.phone}:`, zapiResult);
          errors++;
        }

        // Delay entre envios
        if (callbacks.indexOf(cb) < callbacks.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (cbError) {
        console.error(`[SCHEDULED-CALLBACK] Erro processando ${cb.phone}:`, cbError);
        errors++;
      }
    }

    console.log(`[SCHEDULED-CALLBACK] Resultado: ${processed} enviados, ${errors} erros`);

    return new Response(JSON.stringify({
      success: true,
      date: today,
      total: callbacks.length,
      processed,
      errors,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[SCHEDULED-CALLBACK] ERRO:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
