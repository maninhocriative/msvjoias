import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SellerPresence {
  id: string;
  user_id: string;
  full_name: string | null;
  is_online: boolean;
  last_seen_at: string;
}

async function getOnlineSeller(supabase: any): Promise<SellerPresence | null> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('seller_presence')
    .select('*')
    .eq('is_online', true)
    .gte('last_seen_at', fiveMinutesAgo)
    .limit(1);
  
  if (error || !data || data.length === 0) {
    return null;
  }
  
  return data[0];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { phone, action, seller_id, seller_name, reason } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedPhone = phone.replace(/\D/g, '');
    console.log(`[ALINE-TAKEOVER] Action: ${action}, Phone: ${normalizedPhone}`);

    // Buscar conversa da Aline para este telefone
    let { data: alineConv, error: findError } = await supabase
      .from('aline_conversations')
      .select('*')
      .eq('phone', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    // Se não existe conversa Aline, criar uma nova para permitir o takeover
    if (!alineConv) {
      console.log(`[ALINE-TAKEOVER] Criando conversa Aline para ${normalizedPhone}`);
      
      const { data: newConv, error: createError } = await supabase
        .from('aline_conversations')
        .insert({
          phone: normalizedPhone,
          status: 'active',
          current_node: 'start',
        })
        .select()
        .single();

      if (createError) {
        console.error(`[ALINE-TAKEOVER] Erro ao criar conversa:`, createError);
        throw createError;
      }

      alineConv = newConv;
      console.log(`[ALINE-TAKEOVER] Conversa criada: ${alineConv.id}`);
    }

    let newStatus: string;
    let message: string;
    let assignedSellerId: string | null = seller_id || null;
    let assignedSellerName: string | null = seller_name || null;
    let assignmentReason: string | null = reason || null;

    switch (action) {
      case 'takeover':
        // Humano assume o atendimento
        newStatus = 'human_takeover';
        message = 'Atendimento assumido por humano. Aline pausada.';
        
        // Se não foi especificado um vendedor, buscar um online automaticamente
        if (!assignedSellerId) {
          const onlineSeller = await getOnlineSeller(supabase);
          if (onlineSeller) {
            assignedSellerId = onlineSeller.user_id;
            assignedSellerName = onlineSeller.full_name || 'Vendedor';
            console.log(`[ALINE-TAKEOVER] Vendedor online encontrado: ${assignedSellerName}`);
          }
        }
        
        if (!assignmentReason) {
          assignmentReason = 'Takeover manual';
        }
        break;
      
      case 'release':
        // Devolve para a Aline
        newStatus = 'active';
        message = 'Atendimento devolvido para Aline.';
        assignedSellerId = null;
        assignedSellerName = null;
        assignmentReason = null;
        break;
      
      case 'finish':
        // Finaliza a conversa
        newStatus = 'finished';
        message = 'Conversa finalizada.';
        break;
      
      case 'auto_forward':
        // Encaminhamento automático (cliente não respondeu ou finalizou pedido)
        newStatus = 'human_takeover';
        
        // Buscar vendedor online
        const seller = await getOnlineSeller(supabase);
        if (seller) {
          assignedSellerId = seller.user_id;
          assignedSellerName = seller.full_name || 'Vendedor';
          message = `Conversa encaminhada automaticamente para ${assignedSellerName}.`;
        } else {
          message = 'Conversa marcada para atendimento humano. Nenhum vendedor online.';
        }
        
        assignmentReason = reason || 'Encaminhamento automático';
        break;
      
      default:
        newStatus = 'human_takeover';
        message = 'Atendimento assumido por humano. Aline pausada.';
    }

    // Atualizar status da conversa Aline
    const updateData: any = {
      status: newStatus,
      last_message_at: new Date().toISOString(),
    };

    if (action === 'takeover' || action === 'auto_forward') {
      updateData.assigned_seller_id = assignedSellerId;
      updateData.assigned_seller_name = assignedSellerName;
      updateData.assigned_at = new Date().toISOString();
      updateData.assignment_reason = assignmentReason;
    } else if (action === 'release') {
      updateData.assigned_seller_id = null;
      updateData.assigned_seller_name = null;
      updateData.assigned_at = null;
      updateData.assignment_reason = null;
    }

    const { data: updatedConv, error: updateError } = await supabase
      .from('aline_conversations')
      .update(updateData)
      .eq('id', alineConv.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    console.log(`[ALINE-TAKEOVER] Conversa ${alineConv.id} atualizada para status: ${newStatus}, vendedor: ${assignedSellerName || 'nenhum'}`);

    // Registrar evento de atribuição no histórico
    if (action === 'takeover' || action === 'auto_forward' || action === 'release') {
      const eventPayload = {
        action,
        previous_status: alineConv.status,
        new_status: newStatus,
        seller_id: assignedSellerId,
        seller_name: assignedSellerName,
        reason: assignmentReason,
        timestamp: new Date().toISOString(),
      };

      await supabase
        .from('conversation_events')
        .insert({
          phone: normalizedPhone,
          thread_id: alineConv.thread_id || null,
          direction: 'out',
          type: 'assignment',
          payload: eventPayload,
        });

      console.log(`[ALINE-TAKEOVER] Evento de atribuição registrado para ${normalizedPhone}`);
    }

    return new Response(JSON.stringify({
      success: true,
      message,
      previous_status: alineConv.status,
      new_status: newStatus,
      assigned_seller_id: assignedSellerId,
      assigned_seller_name: assignedSellerName,
      assignment_reason: assignmentReason,
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
