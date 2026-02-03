import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * TRANSCRIBE-AUDIO: Transcreve áudios do WhatsApp usando Gemini
 * Aceita uma URL de áudio e retorna a transcrição
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl } = await req.json();
    
    if (!audioUrl) {
      return new Response(JSON.stringify({ error: 'audioUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('[TRANSCRIBE] LOVABLE_API_KEY não configurada');
      return new Response(JSON.stringify({ 
        error: 'API key not configured',
        transcription: '[Áudio recebido - transcrição indisponível]'
      }), {
        status: 200, // Retornar 200 com fallback
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[TRANSCRIBE] Baixando áudio: ${audioUrl.substring(0, 80)}...`);

    // Baixar o áudio
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error(`[TRANSCRIBE] Erro ao baixar áudio: ${audioResponse.status}`);
      return new Response(JSON.stringify({ 
        error: 'Failed to download audio',
        transcription: '[Áudio recebido]'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
    
    // Detectar tipo MIME do áudio
    const contentType = audioResponse.headers.get('content-type') || 'audio/ogg';
    
    console.log(`[TRANSCRIBE] Áudio baixado: ${audioBuffer.byteLength} bytes, tipo: ${contentType}`);

    // Usar Gemini para transcrever (suporta áudio nativamente)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um transcritor de áudio preciso. Transcreva EXATAMENTE o que a pessoa disse no áudio, em português brasileiro.
            
REGRAS:
- Transcreva palavra por palavra, sem corrigir erros gramaticais
- Mantenha gírias e expressões coloquiais como foram faladas
- Se houver números, escreva-os como a pessoa falou (ex: "vinte e dois" ou "22")
- Se não conseguir entender alguma parte, indique com [inaudível]
- Responda APENAS com a transcrição, sem comentários adicionais
- Se o áudio estiver vazio ou silencioso, responda: [áudio sem fala]`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcreva este áudio de WhatsApp:"
              },
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: contentType.includes('ogg') ? 'ogg' : 
                          contentType.includes('mp3') ? 'mp3' : 
                          contentType.includes('m4a') ? 'm4a' : 
                          contentType.includes('wav') ? 'wav' : 'ogg'
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TRANSCRIBE] Erro Gemini: ${response.status} - ${errorText}`);
      
      // Fallback: retornar indicação de áudio
      return new Response(JSON.stringify({ 
        transcription: '[Áudio recebido]',
        error: 'Transcription failed'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    const transcription = result.choices?.[0]?.message?.content?.trim() || '[Áudio não reconhecido]';
    
    console.log(`[TRANSCRIBE] ✅ Transcrição: "${transcription.substring(0, 100)}..."`);

    return new Response(JSON.stringify({ 
      transcription,
      success: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[TRANSCRIBE] Erro:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      transcription: '[Áudio recebido]'
    }), {
      status: 200, // Retornar 200 com fallback para não quebrar o fluxo
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
