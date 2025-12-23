import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧹 Iniciando limpeza de mensagens processadas antigas...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar quantidade antes da limpeza
    const { count: beforeCount } = await supabase
      .from('processed_messages')
      .select('*', { count: 'exact', head: true });

    console.log(`📊 Total de registros antes da limpeza: ${beforeCount}`);

    // Calcular data limite (30 dias atrás)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const limitDate = thirtyDaysAgo.toISOString();

    console.log(`🗓️ Removendo registros anteriores a: ${limitDate}`);

    // Deletar registros antigos
    const { error, count: deletedCount } = await supabase
      .from('processed_messages')
      .delete({ count: 'exact' })
      .lt('created_at', limitDate);

    if (error) {
      console.error('❌ Erro ao limpar mensagens:', error);
      throw error;
    }

    // Buscar quantidade após a limpeza
    const { count: afterCount } = await supabase
      .from('processed_messages')
      .select('*', { count: 'exact', head: true });

    console.log(`✅ Limpeza concluída!`);
    console.log(`🗑️ Registros removidos: ${deletedCount || 0}`);
    console.log(`📊 Total de registros após limpeza: ${afterCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Limpeza concluída com sucesso',
        stats: {
          before: beforeCount,
          deleted: deletedCount || 0,
          after: afterCount,
          limit_date: limitDate
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro na limpeza:', errorMessage);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
