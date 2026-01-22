import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Números de WhatsApp para receber relatórios
const ALERT_NUMBERS = [
  '5592984081434',
  '5592991148946',
  '5592984078295',
];

interface WaitingConversation {
  id: string;
  contact_name: string | null;
  contact_number: string;
  last_message: string | null;
  created_at: string;
  unread_count: number;
  waitingTime: number; // em minutos
}

// Formatar tempo de espera
function formatWaitingTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

// Formatar telefone para exibição
function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  if (cleaned.length === 12) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  }
  return phone;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const zapiToken = Deno.env.get('ZAPI_TOKEN');
    const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!zapiInstanceId || !zapiToken || !zapiClientToken) {
      throw new Error('ZAPI credentials not configured');
    }

    // Buscar conversas com mensagens não lidas (clientes aguardando)
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, contact_name, contact_number, last_message, created_at, unread_count')
      .gt('unread_count', 0)
      .order('created_at', { ascending: true });

    if (convError) throw convError;

    // Buscar última mensagem do cliente (não is_from_me) para cada conversa
    const waitingConversations: WaitingConversation[] = [];
    const now = Date.now();

    for (const conv of conversations || []) {
      const { data: lastClientMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('conversation_id', conv.id)
        .eq('is_from_me', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastClientMsg) {
        const msgTime = new Date(lastClientMsg.created_at).getTime();
        const waitingMinutes = Math.floor((now - msgTime) / (1000 * 60));
        
        waitingConversations.push({
          ...conv,
          waitingTime: waitingMinutes,
        });
      }
    }

    // Ordenar por tempo de espera (maior primeiro)
    waitingConversations.sort((a, b) => b.waitingTime - a.waitingTime);

    // Usar timezone de Manaus (America/Manaus - UTC-4)
    const nowDate = new Date();
    const timeStr = nowDate.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'America/Manaus'
    });
    const dateStr = nowDate.toLocaleDateString('pt-BR', {
      timeZone: 'America/Manaus'
    });

    let message: string;

    if (waitingConversations.length === 0) {
      message = `✅ *RELATÓRIO DE ATENDIMENTO*

📅 ${dateStr} às ${timeStr}

🎉 *Nenhum cliente aguardando atendimento!*

Todas as conversas foram respondidas. Parabéns pela agilidade! 🚀`;
    } else {
      // Estatísticas
      const totalWaiting = waitingConversations.length;
      const avgWaitTime = Math.round(
        waitingConversations.reduce((sum, c) => sum + c.waitingTime, 0) / totalWaiting
      );
      const maxWaitTime = waitingConversations[0].waitingTime;
      
      // Categorizar por urgência
      const urgent = waitingConversations.filter(c => c.waitingTime >= 30);
      const moderate = waitingConversations.filter(c => c.waitingTime >= 10 && c.waitingTime < 30);
      const recent = waitingConversations.filter(c => c.waitingTime < 10);

      // Montar lista dos primeiros 10 clientes aguardando
      const topWaiting = waitingConversations.slice(0, 10);
      const clientList = topWaiting.map((c, i) => {
        const name = c.contact_name || formatPhone(c.contact_number);
        const urgencyIcon = c.waitingTime >= 30 ? '🔴' : c.waitingTime >= 10 ? '🟡' : '🟢';
        return `${i + 1}. ${urgencyIcon} *${name}*\n    ⏱️ Aguardando há ${formatWaitingTime(c.waitingTime)}`;
      }).join('\n\n');

      message = `📊 *RELATÓRIO DE CLIENTES AGUARDANDO*

📅 ${dateStr} às ${timeStr}

━━━━━━━━━━━━━━━━━━
📈 *RESUMO*
━━━━━━━━━━━━━━━━━━
• Total aguardando: *${totalWaiting}* cliente(s)
• Tempo médio: *${formatWaitingTime(avgWaitTime)}*
• Maior espera: *${formatWaitingTime(maxWaitTime)}*

🔴 Urgente (30+ min): *${urgent.length}*
🟡 Moderado (10-30 min): *${moderate.length}*
🟢 Recente (< 10 min): *${recent.length}*

━━━━━━━━━━━━━━━━━━
👥 *CLIENTES AGUARDANDO*
━━━━━━━━━━━━━━━━━━

${clientList}${waitingConversations.length > 10 ? `\n\n... e mais ${waitingConversations.length - 10} cliente(s)` : ''}

⚠️ *Atenção:* Priorize os clientes em vermelho!`;
    }

    // Enviar para cada número de alerta
    const results = [];
    for (const phone of ALERT_NUMBERS) {
      try {
        const zapiUrl = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`;
        
        const response = await fetch(zapiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': zapiClientToken,
          },
          body: JSON.stringify({
            phone: phone,
            message: message,
          }),
        });

        const result = await response.json();
        console.log(`[WAITING-CUSTOMERS-REPORT] Enviado para ${phone}:`, result);
        results.push({ phone, success: true, result });
      } catch (err) {
        console.error(`[WAITING-CUSTOMERS-REPORT] Erro ao enviar para ${phone}:`, err);
        results.push({ phone, success: false, error: String(err) });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Relatório enviado para ${ALERT_NUMBERS.length} números`,
      waitingCount: waitingConversations.length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[WAITING-CUSTOMERS-REPORT] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
