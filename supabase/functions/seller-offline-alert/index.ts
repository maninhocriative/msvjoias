import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Números de WhatsApp para receber alertas
const ALERT_NUMBERS = [
  '5592984081434',
  '5592991148946',
];

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

    // Buscar vendedores com role vendedor/gerente/admin
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['vendedor', 'gerente', 'admin']);

    if (rolesError) throw rolesError;

    const userIds = userRoles?.map(r => r.user_id) || [];

    // Buscar presença dos vendedores
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: onlineSellers, error: presenceError } = await supabase
      .from('seller_presence')
      .select('user_id, full_name, is_online, last_seen_at')
      .in('user_id', userIds)
      .eq('is_online', true)
      .gte('last_seen_at', fiveMinutesAgo);

    if (presenceError) throw presenceError;

    // Buscar perfis de todos os vendedores para comparar
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);

    if (profilesError) throw profilesError;

    const onlineUserIds = new Set(onlineSellers?.map(s => s.user_id) || []);
    const offlineSellers = profiles?.filter(p => !onlineUserIds.has(p.id)) || [];

    console.log(`[SELLER-OFFLINE-ALERT] ${onlineSellers?.length || 0} online, ${offlineSellers.length} offline`);

    // Se todos estão online, não enviar alerta
    if (offlineSellers.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Todos os vendedores estão online',
        online: onlineSellers?.length || 0,
        offline: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Montar mensagem de alerta
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('pt-BR');

    const offlineNames = offlineSellers.map(s => s.full_name || 'Sem nome').join(', ');
    const onlineNames = onlineSellers?.map(s => s.full_name || 'Sem nome').join(', ') || 'Nenhum';

    const message = `🚨 *ALERTA DE VENDEDORES OFFLINE*

📅 ${dateStr} às ${timeStr}

❌ *Offline (${offlineSellers.length}):*
${offlineSellers.map(s => `• ${s.full_name || 'Sem nome'}`).join('\n')}

✅ *Online (${onlineSellers?.length || 0}):*
${onlineSellers && onlineSellers.length > 0 
  ? onlineSellers.map(s => `• ${s.full_name || 'Sem nome'}`).join('\n')
  : '• Nenhum vendedor online'}

⚠️ Por favor, solicite que os vendedores acessem o sistema!`;

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
        console.log(`[SELLER-OFFLINE-ALERT] Enviado para ${phone}:`, result);
        results.push({ phone, success: true, result });
      } catch (err) {
        console.error(`[SELLER-OFFLINE-ALERT] Erro ao enviar para ${phone}:`, err);
        results.push({ phone, success: false, error: String(err) });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Alerta enviado para ${ALERT_NUMBERS.length} números`,
      online: onlineSellers?.length || 0,
      offline: offlineSellers.length,
      offlineSellers: offlineSellers.map(s => s.full_name),
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[SELLER-OFFLINE-ALERT] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
