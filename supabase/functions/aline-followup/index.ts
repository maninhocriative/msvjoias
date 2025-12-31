import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tipos de follow-up: 'text' ou 'button'
interface FollowupConfig {
  intervalMinutes: number;
  message: string;
  type: 'text' | 'button';
  buttonText?: string;
}

// Configuração de follow-ups com intervalos diferentes
const DEFAULT_FOLLOWUP_CONFIG: FollowupConfig[] = [
  { 
    intervalMinutes: 5, 
    message: "Oi! Ainda está por aí? Posso te ajudar com algo mais? 😊",
    type: 'text'
  },
  { 
    intervalMinutes: 15, 
    message: "Ei, vi que você ainda não respondeu. Se tiver alguma dúvida, é só me chamar! 💬",
    type: 'text'
  },
  { 
    intervalMinutes: 360, // 6 horas
    message: "Olá! Só passando para ver se está tudo bem. Posso te ajudar em algo? 🙋‍♀️",
    type: 'text'
  },
  { 
    intervalMinutes: 1440, // 24 horas
    message: "🎁 *OFERTA ESPECIAL!*\n\nComprando o par de alianças, você *GANHA um pingente fotogravado* personalizado!\n\n⏰ Essa promoção é por tempo limitado.\n\nQuer aproveitar?",
    type: 'button',
    buttonText: "✅ Quero aproveitar!"
  },
  { 
    intervalMinutes: 2880, // 48 horas
    message: "Oi! 👋\n\nVi que você ainda não finalizou sua compra.\n\nPosso te ajudar a escolher o modelo perfeito de alianças ou pingentes?\n\n💍 Estou aqui para te atender!",
    type: 'button',
    buttonText: "💬 Retomar atendimento"
  },
];

// Função para enviar mensagem de texto simples
async function sendTextMessage(
  zapiInstanceId: string,
  zapiToken: string,
  zapiClientToken: string,
  phone: string,
  message: string
): Promise<Response> {
  const zapiUrl = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`;
  return fetch(zapiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': zapiClientToken,
    },
    body: JSON.stringify({ phone, message }),
  });
}

// Função para enviar mensagem com botão interativo
async function sendButtonMessage(
  zapiInstanceId: string,
  zapiToken: string,
  zapiClientToken: string,
  phone: string,
  message: string,
  buttonText: string
): Promise<Response> {
  const zapiUrl = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-button-list`;
  return fetch(zapiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': zapiClientToken,
    },
    body: JSON.stringify({
      phone,
      message,
      buttonList: {
        buttons: [
          {
            id: "retomar_atendimento",
            label: buttonText
          }
        ]
      }
    }),
  });
}

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

    // Buscar configurações de follow-up do banco
    const { data: aiConfig, error: configError } = await supabase
      .from('ai_agent_config')
      .select('followup_enabled, followup_max_attempts, followup_messages')
      .limit(1)
      .maybeSingle();

    if (configError) {
      console.error('[ALINE-FOLLOWUP] Erro ao buscar config:', configError);
    }

    // Usar configurações do banco ou valores padrão
    const followupEnabled = aiConfig?.followup_enabled ?? true;
    const followupMaxAttempts = aiConfig?.followup_max_attempts ?? 5;
    
    // Mensagens personalizadas (se existirem no banco, usa elas, senão usa default)
    const customMessages = aiConfig?.followup_messages as string[] | null;
    const followupConfig = DEFAULT_FOLLOWUP_CONFIG.map((config, index) => ({
      ...config,
      message: customMessages?.[index] || config.message,
    }));

    console.log(`[ALINE-FOLLOWUP] Config: enabled=${followupEnabled}, max=${followupMaxAttempts}`);

    // Se follow-up desativado, retornar
    if (!followupEnabled) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Follow-up desativado nas configurações',
        processed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar TODAS as conversas ativas que ainda não atingiram o máximo de follow-ups
    const { data: activeConversations, error: fetchError } = await supabase
      .from('aline_conversations')
      .select('*')
      .eq('status', 'active')
      .lt('followup_count', followupMaxAttempts);

    if (fetchError) {
      console.error('[ALINE-FOLLOWUP] Erro ao buscar conversas:', fetchError);
      throw fetchError;
    }

    console.log(`[ALINE-FOLLOWUP] Encontradas ${activeConversations?.length || 0} conversas ativas`);

    if (!activeConversations || activeConversations.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Nenhuma conversa para follow-up',
        processed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: { phone: string; success: boolean; followupNumber?: number; type?: string; error?: string }[] = [];
    const now = Date.now();

    for (const conversation of activeConversations) {
      try {
        const followupCount = conversation.followup_count || 0;
        
        // Obter configuração do próximo follow-up (baseado no count atual)
        const nextFollowupConfig = followupConfig[followupCount];
        if (!nextFollowupConfig) {
          console.log(`[ALINE-FOLLOWUP] Sem config para follow-up #${followupCount + 1} de ${conversation.phone}`);
          continue;
        }

        const intervalMs = nextFollowupConfig.intervalMinutes * 60 * 1000;

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

        // Se a última mensagem foi do usuário, pular
        if (lastMessage?.role === 'user') {
          console.log(`[ALINE-FOLLOWUP] Última mensagem de ${conversation.phone} é do usuário, pulando`);
          continue;
        }

        // Verificar se já passou o intervalo necessário desde a última mensagem
        const lastMsgTime = new Date(lastMessage?.created_at || conversation.last_message_at).getTime();
        const timeSinceLastMsg = now - lastMsgTime;
        
        if (timeSinceLastMsg < intervalMs) {
          const remainingMinutes = Math.ceil((intervalMs - timeSinceLastMsg) / 60000);
          console.log(`[ALINE-FOLLOWUP] ${conversation.phone}: aguardando ${remainingMinutes}min para follow-up #${followupCount + 1}`);
          continue;
        }

        const followupMessage = nextFollowupConfig.message;
        const messageType = nextFollowupConfig.type;

        console.log(`[ALINE-FOLLOWUP] Enviando follow-up #${followupCount + 1} (${messageType}) para ${conversation.phone} (intervalo: ${nextFollowupConfig.intervalMinutes}min)`);

        // Enviar mensagem via Z-API (texto simples ou com botão)
        let zapiResponse: Response;
        
        if (messageType === 'button' && nextFollowupConfig.buttonText) {
          zapiResponse = await sendButtonMessage(
            zapiInstanceId,
            zapiToken,
            zapiClientToken,
            conversation.phone,
            followupMessage,
            nextFollowupConfig.buttonText
          );
        } else {
          zapiResponse = await sendTextMessage(
            zapiInstanceId,
            zapiToken,
            zapiClientToken,
            conversation.phone,
            followupMessage
          );
        }

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
        const savedMessage = messageType === 'button' 
          ? `${followupMessage}\n\n[Botão: ${nextFollowupConfig.buttonText}]`
          : followupMessage;
          
        await supabase.from('aline_messages').insert({
          conversation_id: conversation.id,
          role: 'assistant',
          message: savedMessage,
          node: conversation.current_node,
        });

        results.push({ 
          phone: conversation.phone, 
          success: true, 
          followupNumber: followupCount + 1,
          type: messageType
        });

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
