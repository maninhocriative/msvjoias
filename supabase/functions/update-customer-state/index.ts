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

    const payload = await req.json();
    console.log('Update customer state payload:', JSON.stringify(payload));

    // Extrair dados do payload
    const phone = (payload.phone || payload.telefone || '').replace(/\D/g, '');
    
    if (!phone) {
      throw new Error('phone é obrigatório');
    }

    // Campos que podem ser atualizados
    const stage = payload.stage || payload.node || payload.estagio || null;
    const categoria = payload.categoria || payload.category || null;
    const tipoAlianca = payload.tipo_alianca || null;
    const corPreferida = payload.cor_preferida || payload.cor || null;
    const selectedSku = payload.selected_sku || payload.sku || null;
    const selectedName = payload.selected_name || payload.produto_nome || null;
    const selectedPrice = payload.selected_price || payload.preco || null;
    const crmEntrega = payload.crm_entrega || payload.entrega || null;
    const crmPagamento = payload.crm_pagamento || payload.pagamento || null;
    const crmFinalizar = payload.crm_finalizar || payload.finalizar || null;
    const lastIntent = payload.last_intent || payload.intent || payload.acao_nome || null;
    const lastUserText = payload.last_user_text || payload.mensagem || null;

    console.log('Dados para atualizar:', {
      phone,
      stage,
      categoria,
      tipoAlianca,
      corPreferida,
      selectedSku,
      lastIntent,
    });

    // Usar a função upsert_conversation_state do banco
    const { data, error } = await supabase.rpc('upsert_conversation_state', {
      p_phone: phone,
      p_stage: stage,
      p_categoria: categoria,
      p_tipo_alianca: tipoAlianca,
      p_cor_preferida: corPreferida,
      p_selected_sku: selectedSku,
      p_selected_name: selectedName,
      p_selected_price: selectedPrice ? parseFloat(selectedPrice) : null,
      p_crm_entrega: crmEntrega,
      p_crm_pagamento: crmPagamento,
      p_crm_finalizar: crmFinalizar === true || crmFinalizar === 'true',
      p_last_user_text: lastUserText,
    });

    if (error) {
      console.error('Erro ao atualizar estado:', error);
      throw error;
    }

    console.log('Estado atualizado com sucesso:', data);

    // Também atualizar o lead_status na conversa se tiver intent
    if (lastIntent) {
      const leadStatusMap: Record<string, string> = {
        'abertura': 'novo',
        'escolha_tipo': 'em_atendimento',
        'escolha_cor': 'em_atendimento', 
        'catalogo': 'interessado',
        'selecao': 'interessado',
        'confirmacao': 'negociando',
        'fechamento': 'negociando',
        'finalizado': 'vendido',
        'cancelado': 'perdido',
      };

      const newLeadStatus = leadStatusMap[lastIntent.toLowerCase()] || null;

      if (newLeadStatus) {
        const { error: convError } = await supabase
          .from('conversations')
          .update({ lead_status: newLeadStatus })
          .eq('contact_number', phone);

        if (convError) {
          console.warn('Erro ao atualizar lead_status:', convError);
        } else {
          console.log('Lead status atualizado para:', newLeadStatus);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      phone,
      state: data,
      message: 'Estado do cliente atualizado com sucesso'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
