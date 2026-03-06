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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const videoUrl = 'https://mono-canvas-pro.lovable.app/videos/campanha-dia-mulheres.mp4';
    console.log('Downloading video from:', videoUrl);

    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`);

    const videoBuffer = await response.arrayBuffer();
    const videoBytes = new Uint8Array(videoBuffer);
    console.log(`Downloaded ${videoBytes.length} bytes`);

    const { data, error } = await supabase.storage
      .from('products')
      .upload('campanha-dia-mulheres.mp4', videoBytes, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('products')
      .getPublicUrl('campanha-dia-mulheres.mp4');

    console.log('Upload complete! Public URL:', urlData.publicUrl);

    return new Response(
      JSON.stringify({ success: true, path: data.path, publicUrl: urlData.publicUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
