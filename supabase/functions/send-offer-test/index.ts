import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// URL do vídeo do pingente
const PINGENTE_VIDEO_URL = "https://mono-canvas-pro.lovable.app/videos/pingente-fotogravado.mp4";

// Mensagem da oferta
const OFFER_MESSAGE = `🎁 *OFERTA ESPECIAL!*

Comprando o par de alianças, você *GANHA um pingente fotogravado* personalizado!

✨ Coloque a foto de quem você ama!

⏰ Essa promoção é por tempo limitado.

Quer aproveitar?`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error('ZAPI credentials not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { phones } = body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      throw new Error('phones array is required');
    }

    console.log(`[SEND-OFFER-TEST] Enviando oferta para ${phones.length} leads:`, phones);

    const results: { phone: string; success: boolean; error?: string }[] = [];

    for (const phone of phones) {
      try {
        const formattedPhone = phone.replace(/\D/g, '');
        
        // 1. Enviar vídeo com legenda
        const videoEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-video`;
        
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (ZAPI_CLIENT_TOKEN) {
          headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
        }

        const videoResponse = await fetch(videoEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: formattedPhone,
            video: PINGENTE_VIDEO_URL,
            caption: OFFER_MESSAGE,
          }),
        });

        const videoResult = await videoResponse.json();
        console.log(`[SEND-OFFER-TEST] Vídeo enviado para ${phone}:`, videoResult);

        if (!videoResponse.ok) {
          throw new Error(`Video error: ${JSON.stringify(videoResult)}`);
        }

        // 2. Aguardar um pouco e enviar botão
        await new Promise(r => setTimeout(r, 2000));

        const buttonEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-button-list`;
        
        const buttonResponse = await fetch(buttonEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: formattedPhone,
            message: "👆 Gostou? Clique abaixo para aproveitar!",
            buttonList: {
              buttons: [
                {
                  id: "retomar_atendimento",
                  label: "✅ Quero aproveitar!"
                }
              ]
            }
          }),
        });

        const buttonResult = await buttonResponse.json();
        console.log(`[SEND-OFFER-TEST] Botão enviado para ${phone}:`, buttonResult);

        // 3. Salvar no banco
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_number', formattedPhone)
          .maybeSingle();

        if (conv) {
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            content: `🎥 ${OFFER_MESSAGE}\n\n[Botão: ✅ Quero aproveitar!]`,
            message_type: 'video',
            media_url: PINGENTE_VIDEO_URL,
            is_from_me: true,
            status: 'sent',
          });

          await supabase
            .from('conversations')
            .update({
              last_message: '🎁 OFERTA ESPECIAL - Pingente grátis!',
              last_message_at: new Date().toISOString(),
            })
            .eq('id', conv.id);
        }

        results.push({ phone, success: true });
        
        // Delay entre envios
        await new Promise(r => setTimeout(r, 1500));

      } catch (err) {
        console.error(`[SEND-OFFER-TEST] Erro ao enviar para ${phone}:`, err);
        results.push({ 
          phone, 
          success: false, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[SEND-OFFER-TEST] Concluído: ${successCount}/${phones.length} enviados`);

    return new Response(JSON.stringify({
      success: true,
      total: phones.length,
      sent: successCount,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[SEND-OFFER-TEST] Erro:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
