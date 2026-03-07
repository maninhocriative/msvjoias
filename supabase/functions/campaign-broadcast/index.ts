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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error('Z-API credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { campaign_id, message, video_url, dry_run = false, batch_size = 10 } = await req.json();

    if (!campaign_id || !message) {
      return new Response(
        JSON.stringify({ error: 'campaign_id and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[CAMPAIGN] Starting campaign: ${campaign_id}, dry_run: ${dry_run}`);

    // 1. Get all conversation phones
    const { data: conversations } = await supabase
      .from('conversations')
      .select('contact_number')
      .eq('platform', 'whatsapp');

    if (!conversations || conversations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total: 0, message: 'No conversations found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get phones that already have orders (exclude buyers)
    const { data: orders } = await supabase
      .from('orders')
      .select('customer_phone')
      .in('status', ['completed', 'pending']);

    const buyerPhones = new Set(
      (orders || []).map(o => o.customer_phone.replace(/\D/g, ''))
    );

    // 3. Get phones already sent in this campaign (deduplication)
    const { data: alreadySent } = await supabase
      .from('campaign_sends')
      .select('phone')
      .eq('campaign_id', campaign_id);

    const sentPhones = new Set((alreadySent || []).map(s => s.phone));

    // 4. Filter eligible phones
    const eligiblePhones = conversations
      .map(c => c.contact_number.replace(/\D/g, ''))
      .filter(phone => phone.length >= 10)
      .filter(phone => !buyerPhones.has(phone))
      .filter(phone => !sentPhones.has(phone));

    // Remove duplicates
    const uniquePhones = [...new Set(eligiblePhones)];

    console.log(`[CAMPAIGN] Total conversations: ${conversations.length}, Buyers excluded: ${buyerPhones.size}, Already sent: ${sentPhones.size}, Eligible: ${uniquePhones.length}`);

    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          total_conversations: conversations.length,
          buyers_excluded: buyerPhones.size,
          already_sent: sentPhones.size,
          eligible: uniquePhones.length,
          sample_phones: uniquePhones.slice(0, 5).map(p => p.slice(0, 6) + '****')
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Send in batches with 30s intervals
    const batchLimit = Math.min(batch_size, uniquePhones.length);
    const phonesToSend = uniquePhones.slice(0, batchLimit);
    
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < phonesToSend.length; i++) {
      const phone = phonesToSend[i];

      try {
        let zapiEndpoint: string;
        let zapiBody: Record<string, unknown>;

        if (video_url) {
          zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-video`;
          zapiBody = { phone, video: video_url, caption: message };
        } else {
          zapiEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
          zapiBody = { phone, message };
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (ZAPI_CLIENT_TOKEN) {
          headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
        }

        const response = await fetch(zapiEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(zapiBody),
        });

        const result = await response.json();

        if (response.ok && (result.messageId || result.zaapId)) {
          sent++;
          await supabase.from('campaign_sends').insert({
            campaign_id,
            phone,
            status: 'sent'
          });

          // Save message to CRM so it appears in chat
          const { data: conv } = await supabase
            .from('conversations')
            .select('id')
            .eq('contact_number', phone)
            .single();

          if (conv) {
            const contentToSave = message;
            const msgType = video_url ? 'video' : 'text';
            await supabase.from('messages').insert({
              conversation_id: conv.id,
              content: contentToSave,
              is_from_me: true,
              message_type: msgType,
              media_url: video_url || null,
              status: 'sent',
              zapi_message_id: result.messageId || result.zaapId || null
            });
            await supabase.from('conversations').update({
              last_message: contentToSave,
              last_message_at: new Date().toISOString()
            }).eq('id', conv.id);
          }

          console.log(`[CAMPAIGN] ✅ Sent to ${phone.slice(0, 6)}**** (${i + 1}/${phonesToSend.length})`);
        } else {
          failed++;
          await supabase.from('campaign_sends').insert({
            campaign_id,
            phone,
            status: 'failed',
            error: JSON.stringify(result)
          });
          errors.push(`${phone.slice(0, 6)}****: ${JSON.stringify(result)}`);
        }
      } catch (error) {
        failed++;
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${phone.slice(0, 6)}****: ${errMsg}`);
      }

      // 30s delay between sends (anti-spam)
      if (i < phonesToSend.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    const remaining = uniquePhones.length - batchLimit;

    return new Response(
      JSON.stringify({
        success: true,
        campaign_id,
        sent,
        failed,
        remaining,
        total_eligible: uniquePhones.length,
        errors: errors.slice(0, 10)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CAMPAIGN] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
