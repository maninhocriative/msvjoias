import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mensagens de follow-up
const FOLLOWUP_MESSAGES = [
  "Oi! Ainda está por aí? Posso te ajudar com algo mais? 😊",
  "Ei, vi que você ainda não respondeu. Se tiver alguma dúvida, é só me chamar! 💬",
  "Olá! Só passando para ver se está tudo bem. Posso te ajudar em algo? 🙋‍♀️",
];

// Intervalo entre follow-ups (em minutos)
const FOLLOWUP_INTERVAL_MINUTES = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const zapiToken = Deno.env.get('ZAPI_TOKEN');
    const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!zapiInstanceId || !zapiToken || !zapiClientToken) {
      console.error('[ALINE-FOLLOWUP] Z-API credentials not configured');
      return new Response(JSON.stringify({ error: 'Z-API credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calcular threshold (10 minutos atrás)
    const thresholdTime = new Date(Date.now() - FOLLOWUP_INTERVAL_MINUTES * 60 * 1000).toISOString();
    
    console.log(`[ALINE-FOLLOWUP] Buscando conversas inativas antes de ${thresholdTime}`);

    // Buscar conversas ativas onde:
    // - status é 'active'
    // - last_message_at é anterior ao threshold
    // - followup_count < 3 (máximo de 3 tentativas)
    const { data: inactiveConversations, error: fetchError } = await supabase
      .from('aline_conversations')
      .select('*')
      .eq('status', 'active')
      .lt('last_message_at', thresholdTime)
      .lt('followup_count', 3);

    if (fetchError) {
      console.error('[ALINE-FOLLOWUP] Erro ao buscar conversas:', fetchError);
      throw fetchError;
    }

    console.log(`[ALINE-FOLLOWUP] Encontradas ${inactiveConversations?.length || 0} conversas inativas`);

    if (!inactiveConversations || inactiveConversations.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Nenhuma conversa para follow-up',
        processed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: { phone: string; success: boolean; error?: string }[] = [];

    for (const conversation of inactiveConversations) {
      try {
        // Verificar se a última mensagem foi da Aline (bot)
        const { data: lastMessage, error: msgError } = await supabase
          .from('aline_messages')
          .select('role, created_at')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (msgError) {
          console.error(`[ALINE-FOLLOWUP] Erro ao buscar última mensagem para ${conversation.phone}:`, msgError);
          continue;
        }

        // Se a última mensagem foi do usuário, pular (ele respondeu depois do threshold mas ainda não processamos)
        if (lastMessage?.role === 'user') {
          console.log(`[ALINE-FOLLOWUP] Última mensagem de ${conversation.phone} é do usuário, pulando`);
          continue;
        }

        // Verificar se a última mensagem é mais recente que 10 min
        const lastMsgTime = new Date(lastMessage?.created_at || conversation.last_message_at).getTime();
        const tenMinutesAgo = Date.now() - FOLLOWUP_INTERVAL_MINUTES * 60 * 1000;
        
        if (lastMsgTime > tenMinutesAgo) {
          console.log(`[ALINE-FOLLOWUP] Mensagem recente para ${conversation.phone}, pulando`);
          continue;
        }

        // Determinar qual mensagem de follow-up enviar
        const followupCount = conversation.followup_count || 0;
        const followupMessage = FOLLOWUP_MESSAGES[followupCount] || FOLLOWUP_MESSAGES[0];

        console.log(`[ALINE-FOLLOWUP] Enviando follow-up #${followupCount + 1} para ${conversation.phone}`);

        // Enviar mensagem via Z-API
        const zapiUrl = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`;
        const zapiResponse = await fetch(zapiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': zapiClientToken,
          },
          body: JSON.stringify({
            phone: conversation.phone,
            message: followupMessage,
          }),
        });

        const zapiResult = await zapiResponse.json();
        console.log(`[ALINE-FOLLOWUP] Z-API response para ${conversation.phone}:`, zapiResult);

        if (!zapiResponse.ok) {
          throw new Error(`Z-API error: ${JSON.stringify(zapiResult)}`);
        }

        // Atualizar conversa: incrementar followup_count e atualizar last_message_at
        const { error: updateError } = await supabase
          .from('aline_conversations')
          .update({
            followup_count: followupCount + 1,
            last_message_at: new Date().toISOString(),
          })
          .eq('id', conversation.id);

        if (updateError) {
          console.error(`[ALINE-FOLLOWUP] Erro ao atualizar conversa ${conversation.id}:`, updateError);
        }

        // Salvar mensagem de follow-up no histórico
        await supabase.from('aline_messages').insert({
          conversation_id: conversation.id,
          role: 'assistant',
          message: followupMessage,
          node: conversation.current_node,
        });

        results.push({ phone: conversation.phone, success: true });

      } catch (error) {
        console.error(`[ALINE-FOLLOWUP] Erro ao processar ${conversation.phone}:`, error);
        results.push({ 
          phone: conversation.phone, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[ALINE-FOLLOWUP] Processamento concluído: ${successCount}/${results.length} enviados`);

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      sent: successCount,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ALINE-FOLLOWUP] Erro geral:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
