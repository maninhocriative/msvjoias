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
    const { phone, phones } = await req.json();
    
    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const zapiToken = Deno.env.get('ZAPI_TOKEN');
    const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!zapiInstanceId || !zapiToken || !zapiClientToken) {
      throw new Error('ZAPI credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Função para buscar foto de um único telefone
    const fetchProfilePicture = async (phoneNumber: string): Promise<{ phone: string; profilePicUrl: string | null }> => {
      try {
        // Normalizar telefone (remover caracteres especiais)
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        
        // Z-API endpoint para buscar foto de perfil
        const zapiUrl = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/profile-picture/${normalizedPhone}`;
        
        const response = await fetch(zapiUrl, {
          method: 'GET',
          headers: {
            'Client-Token': zapiClientToken,
          },
        });

        if (!response.ok) {
          console.log(`[ZAPI-PROFILE] Failed to fetch for ${phoneNumber}: ${response.status}`);
          return { phone: phoneNumber, profilePicUrl: null };
        }

        const data = await response.json();
        console.log(`[ZAPI-PROFILE] Response for ${phoneNumber}:`, JSON.stringify(data));
        
        // Z-API retorna { link: "url" } ou { imgUrl: "url" } dependendo da versão
        const profilePicUrl = data.link || data.imgUrl || data.profilePictureUrl || null;
        
        return { phone: phoneNumber, profilePicUrl };
      } catch (error) {
        console.error(`[ZAPI-PROFILE] Error fetching for ${phoneNumber}:`, error);
        return { phone: phoneNumber, profilePicUrl: null };
      }
    };

    // Processar múltiplos telefones ou único
    const phonesToProcess = phones || (phone ? [phone] : []);
    
    if (phonesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No phone numbers provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar fotos em paralelo (limitado a 5 por vez para não sobrecarregar)
    const results: Array<{ phone: string; profilePicUrl: string | null }> = [];
    const batchSize = 5;
    
    for (let i = 0; i < phonesToProcess.length; i += batchSize) {
      const batch = phonesToProcess.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(fetchProfilePicture));
      results.push(...batchResults);
    }

    // Atualizar tabela customers com as fotos encontradas
    const updates = results.filter(r => r.profilePicUrl);
    
    for (const update of updates) {
      // Atualizar customer existente com a foto
      const { error } = await supabase
        .from('customers')
        .update({ profile_pic_url: update.profilePicUrl })
        .eq('whatsapp', update.phone);

      if (error) {
        console.log(`[ZAPI-PROFILE] Could not update customer ${update.phone}:`, error.message);
        
        // Se não existe, tentar criar
        const { error: insertError } = await supabase
          .from('customers')
          .insert({
            whatsapp: update.phone,
            name: update.phone,
            profile_pic_url: update.profilePicUrl,
          });
          
        if (insertError) {
          console.log(`[ZAPI-PROFILE] Could not insert customer ${update.phone}:`, insertError.message);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        updated: updates.length,
        total: phonesToProcess.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ZAPI-PROFILE] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});