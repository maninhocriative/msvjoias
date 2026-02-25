import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tipos de follow-up: 'text', 'button' ou 'video'
interface FollowupConfig {
  intervalMinutes: number;
  message: string;
  type: 'text' | 'button' | 'video';
  buttonText?: string;
  videoUrl?: string;
  minOrderValue?: number; // Valor mínimo do pedido para este follow-up
}

// URL do vídeo do pingente fotogravado (hospedado publicamente)
const PINGENTE_VIDEO_URL = "https://mono-canvas-pro.lovable.app/videos/pingente-fotogravado.mp4";

// Configuração de follow-ups com intervalos de produção
const DEFAULT_FOLLOWUP_CONFIG: FollowupConfig[] = [
  { 
    intervalMinutes: 10, // 10 minutos
    message: "Oi! Ainda está por aí? Gostou de alguma das opções que te mostrei? 😊\n\nMe conta qual chamou mais sua atenção!",
    type: 'text'
  },
  { 
    intervalMinutes: 60, // 1 hora
    message: "Ei, vi que você ainda não respondeu. Se tiver alguma dúvida sobre os modelos, tamanhos ou preços, é só me chamar! 💬\n\nEstou aqui para te ajudar!",
    type: 'text'
  },
  { 
    intervalMinutes: 120, // 2 horas - OFERTA ALIANÇAS
    message: "🎁 *OFERTA ESPECIAL!*\n\nComprando o par de alianças, você *GANHA um pingente fotogravado* personalizado!\n\n⏰ Essa promoção é por tempo limitado.\n\nQuer aproveitar?",
    type: 'video',
    buttonText: "✅ Quero aproveitar!",
    videoUrl: PINGENTE_VIDEO_URL,
    minOrderValue: 0 // Qualquer valor
  },
  { 
    intervalMinutes: 360, // 6 horas - FECHAMENTO DA VENDA
    message: "Oi! 👋\n\nVi que você gostou das nossas alianças!\n\n💍 Para finalizar seu pedido, preciso saber:\n\n💳 Qual a forma de pagamento? (Pix, cartão, boleto)\n🚚 Prefere retirar ou receber em casa?\n\n_Responda aqui que já preparo seu pedido!_",
    type: 'button',
    buttonText: "💬 Quero finalizar meu pedido!"
  },
];

// Configuração de follow-up específico para PINGENTES (compras acima de R$299)
const PINGENTE_FOLLOWUP_CONFIG: FollowupConfig = {
  intervalMinutes: 120, // 2 horas
  message: "🎁 *OFERTA ESPECIAL PARA VOCÊ!*\n\nNas compras acima de R$299, você *GANHA um pingente fotogravado* personalizado!\n\n✨ Coloque a foto de quem você ama!\n\n⏰ Promoção por tempo limitado.",
  type: 'video',
  buttonText: "✅ Quero aproveitar!",
  videoUrl: PINGENTE_VIDEO_URL,
  minOrderValue: 299
};

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

// Função para enviar vídeo com legenda
async function sendVideoMessage(
  zapiInstanceId: string,
  zapiToken: string,
  zapiClientToken: string,
  phone: string,
  videoUrl: string,
  caption: string
): Promise<Response> {
  const zapiUrl = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-video`;
  return fetch(zapiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': zapiClientToken,
    },
    body: JSON.stringify({ 
      phone, 
      video: videoUrl,
      caption 
    }),
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

// Função para notificar múltiplos números sobre cliente querendo finalizar
async function notifyTeamAboutBuyer(
  supabase: any,
  zapiInstanceId: string,
  zapiToken: string,
  zapiClientToken: string,
  customerPhone: string,
  customerName: string | null
): Promise<void> {
  try {
    // Buscar todos os números de notificação
    const { data: settings } = await supabase
      .from('store_settings')
      .select('key, value')
      .or('key.eq.notification_whatsapp,key.like.notification_phone_%');

    const notificationNumbers: string[] = [];
    
    if (settings) {
      for (const setting of settings) {
        if (setting.value) {
          notificationNumbers.push(setting.value.replace(/\D/g, ''));
        }
      }
    }

    // Se não houver números configurados, usar o padrão
    if (notificationNumbers.length === 0) {
      notificationNumbers.push('5592984145531');
    }

    const notificationMsg = `🔥 *CLIENTE QUER FINALIZAR COMPRA!*\n\n` +
      `📱 *Telefone:* ${customerPhone}\n` +
      `👤 *Nome:* ${customerName || 'Não informado'}\n\n` +
      `⚡ O cliente clicou no botão "Quero finalizar meu pedido"!\n\n` +
      `_Entre em contato AGORA para fechar a venda!_`;

    // Enviar para todos os números
    for (const number of notificationNumbers) {
      await sendTextMessage(
        zapiInstanceId,
        zapiToken,
        zapiClientToken,
        number,
        notificationMsg
      );
      console.log(`[ALINE-FOLLOWUP] Notificação enviada para ${number}`);
    }
  } catch (error) {
    console.error('[ALINE-FOLLOWUP] Erro ao notificar equipe:', error);
  }
}

// Função para marcar cliente como comprador
async function markAsBuyer(
  supabase: any,
  phone: string
): Promise<void> {
  try {
    // Atualizar lead_status na conversa
    const { error } = await supabase
      .from('conversations')
      .update({ lead_status: 'comprador' })
      .eq('contact_number', phone);

    if (error) {
      console.error('[ALINE-FOLLOWUP] Erro ao marcar como comprador:', error);
    } else {
      console.log(`[ALINE-FOLLOWUP] Cliente ${phone} marcado como COMPRADOR`);
    }
  } catch (error) {
    console.error('[ALINE-FOLLOWUP] Erro ao marcar como comprador:', error);
  }
}

// Função para verificar se cliente tem interesse em pingentes ou valor alto
async function getCustomerContext(
  supabase: any,
  phone: string
): Promise<{ categoria: string | null; valorTotal: number }> {
  try {
    // Buscar última sessão de catálogo
    const { data: session } = await supabase
      .from('catalog_sessions')
      .select('categoria')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Buscar valor do pedido pendente
    const { data: order } = await supabase
      .from('orders')
      .select('total_price')
      .eq('customer_phone', phone)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      categoria: session?.categoria || null,
      valorTotal: order?.total_price || 0
    };
  } catch (error) {
    console.error('[ALINE-FOLLOWUP] Erro ao buscar contexto:', error);
    return { categoria: null, valorTotal: 0 };
  }
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

    // Verificar se é uma requisição de callback de botão
    const body = await req.json().catch(() => ({}));
    
    if (body.buttonResponse && body.phone) {
      // Cliente clicou no botão "Quero finalizar meu pedido"
      console.log(`[ALINE-FOLLOWUP] Cliente ${body.phone} clicou no botão de finalizar`);
      
      // Buscar nome do cliente
      const { data: conv } = await supabase
        .from('conversations')
        .select('contact_name')
        .eq('contact_number', body.phone)
        .maybeSingle();

      // Marcar como comprador
      await markAsBuyer(supabase, body.phone);

      // Notificar equipe
      await notifyTeamAboutBuyer(
        supabase,
        zapiInstanceId,
        zapiToken,
        zapiClientToken,
        body.phone,
        conv?.contact_name || null
      );

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Cliente marcado como comprador e equipe notificada' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
        
        // Buscar contexto do cliente para decidir qual oferta enviar
        const customerContext = await getCustomerContext(supabase, conversation.phone);
        
        // Determinar qual configuração de follow-up usar
        let nextFollowupConfig = followupConfig[followupCount];
        
        // Se for o follow-up de oferta (índice 2) e cliente tem contexto de pingente ou valor alto
        if (followupCount === 2) {
          const isPingente = customerContext.categoria?.toLowerCase().includes('pingente');
          const isHighValue = customerContext.valorTotal >= 299;
          
          if (isPingente || isHighValue) {
            nextFollowupConfig = { ...PINGENTE_FOLLOWUP_CONFIG };
          }
        }
        
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
        const isFromBot = lastMessage?.role === 'assistant' || lastMessage?.role === 'aline';
        if (!isFromBot) {
          console.log(`[ALINE-FOLLOWUP] Última mensagem de ${conversation.phone} é do usuário (role: ${lastMessage?.role}), pulando`);
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

        // Enviar mensagem via Z-API
        let zapiResponse: Response;
        
        if (messageType === 'video' && nextFollowupConfig.videoUrl) {
          // Enviar vídeo com legenda
          zapiResponse = await sendVideoMessage(
            zapiInstanceId,
            zapiToken,
            zapiClientToken,
            conversation.phone,
            nextFollowupConfig.videoUrl,
            followupMessage
          );
          
          // Se tiver botão, enviar botão após o vídeo
          if (nextFollowupConfig.buttonText) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar 2s
            await sendButtonMessage(
              zapiInstanceId,
              zapiToken,
              zapiClientToken,
              conversation.phone,
              "👆 Gostou? Clique abaixo para aproveitar!",
              nextFollowupConfig.buttonText
            );
          }
        } else if (messageType === 'button' && nextFollowupConfig.buttonText) {
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

        // Preparar mensagem para salvar (SEM o prefixo Follow-up X)
        let savedMessage = followupMessage;
        if (messageType === 'video') {
          savedMessage = `🎥 ${followupMessage}`;
          if (nextFollowupConfig.buttonText) {
            savedMessage += `\n\n[Botão: ${nextFollowupConfig.buttonText}]`;
          }
        } else if (messageType === 'button' && nextFollowupConfig.buttonText) {
          savedMessage = `${followupMessage}\n\n[Botão: ${nextFollowupConfig.buttonText}]`;
        }
          
        // Salvar mensagem de follow-up no histórico da Aline
        await supabase.from('aline_messages').insert({
          conversation_id: conversation.id,
          role: 'assistant',
          message: savedMessage,
          node: conversation.current_node,
        });

        // ========== SALVAR TAMBÉM NA TABELA MESSAGES (PARA O CRM) ==========
        const { data: crmConversation } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_number', conversation.phone)
          .maybeSingle();

        if (crmConversation) {
          // Inserir mensagem de follow-up na tabela messages (SEM prefixo Follow-up X)
          await supabase.from('messages').insert({
            conversation_id: crmConversation.id,
            content: savedMessage,
            message_type: messageType === 'video' ? 'video' : 'text',
            media_url: messageType === 'video' ? nextFollowupConfig.videoUrl : null,
            is_from_me: true,
            status: 'sent',
          });

          // Atualizar last_message da conversa (sem prefixo)
          await supabase
            .from('conversations')
            .update({
              last_message: followupMessage.substring(0, 80) + (followupMessage.length > 80 ? '...' : ''),
              last_message_at: new Date().toISOString(),
            })
            .eq('id', crmConversation.id);

          console.log(`[ALINE-FOLLOWUP] ✅ Follow-up salvo no CRM para ${conversation.phone}`);
        } else {
          console.log(`[ALINE-FOLLOWUP] ⚠️ Conversa CRM não encontrada para ${conversation.phone}`);
        }

        // ========== 10 MIN SEM RESPOSTA AO CATÁLOGO: LEAD FRIO + TAKEOVER + NOTIFICAÇÃO ==========
        if (followupCount === 0) {
          try {
            // Buscar nome do cliente no CRM
            const { data: crmConvForNotif } = await supabase
              .from('conversations')
              .select('id, contact_name, contact_number')
              .eq('contact_number', conversation.phone)
              .maybeSingle();

            const customerName = crmConvForNotif?.contact_name || 'Não informado';

            // 1) Marcar lead como FRIO
            if (crmConvForNotif) {
              await supabase
                .from('conversations')
                .update({ lead_status: 'frio' })
                .eq('id', crmConvForNotif.id);
              console.log(`[ALINE-FOLLOWUP] Lead ${conversation.phone} marcado como FRIO`);
            }

            // 2) Encaminhar para atendimento humano (takeover)
            await supabase
              .from('aline_conversations')
              .update({
                status: 'human_takeover',
                assignment_reason: 'Lead frio - 10min sem resposta após catálogo',
                last_message_at: new Date().toISOString(),
              })
              .eq('id', conversation.id);
            console.log(`[ALINE-FOLLOWUP] Conversa ${conversation.phone} encaminhada para atendimento humano`);

            // 3) Buscar detalhes do catálogo enviado e produtos de interesse
            const { data: catalogSession } = await supabase
              .from('catalog_sessions')
              .select('id, categoria, cor_preferida, tipo_alianca')
              .eq('phone', conversation.phone)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            let produtosInteresse = '';
            if (catalogSession?.id) {
              const { data: items } = await supabase
                .from('catalog_items_sent')
                .select('name, sku, price')
                .eq('session_id', catalogSession.id)
                .order('position', { ascending: true })
                .limit(5);

              if (items && items.length > 0) {
                produtosInteresse = items
                  .map((item: any, i: number) => `  ${i + 1}. ${item.name || item.sku}${item.price ? ` - R$${item.price}` : ''}`)
                  .join('\n');
              }
            }

            const catalogInfo = catalogSession 
              ? `📋 *Interesse:*\n• Categoria: ${catalogSession.categoria || 'N/A'}\n• Cor: ${catalogSession.cor_preferida || 'N/A'}\n• Tipo: ${catalogSession.tipo_alianca || 'N/A'}`
              : '📋 Sem dados de catálogo';

            const produtosInfo = produtosInteresse 
              ? `\n\n🛍️ *Produtos enviados:*\n${produtosInteresse}`
              : '';

            // 4) Notificar Acium com resumo completo
            const { data: notifConfig } = await supabase
              .from('store_settings')
              .select('value')
              .eq('key', 'notification_whatsapp')
              .maybeSingle();

            const aciumPhone = (notifConfig?.value || '5592984145531').replace(/\D/g, '');

            const notificationMsg = `🧊 *LEAD FRIO - SEM RESPOSTA*\n\n` +
              `👤 *Nome:* ${customerName}\n` +
              `📱 *Telefone:* ${conversation.phone}\n` +
              `⏰ *Tempo sem resposta:* 10 minutos após catálogo\n\n` +
              `${catalogInfo}${produtosInfo}\n\n` +
              `⚠️ Lead marcado como *FRIO* e encaminhado para atendimento humano.`;

            await sendTextMessage(
              zapiInstanceId,
              zapiToken,
              zapiClientToken,
              aciumPhone,
              notificationMsg
            );

            console.log(`[ALINE-FOLLOWUP] Notificação de lead frio enviada para Acium sobre ${conversation.phone}`);
          } catch (notifError) {
            console.error(`[ALINE-FOLLOWUP] Erro ao processar lead frio:`, notifError);
          }
        }

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
