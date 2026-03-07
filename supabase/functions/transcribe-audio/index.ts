import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DOWNLOAD_TIMEOUT_MS = 20000;
const TRANSCRIBE_TIMEOUT_MS = 45000;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15MB

/**
 * TRANSCRIBE-AUDIO: Transcreve áudios do WhatsApp usando Gemini
 * Aceita uma URL de áudio e retorna a transcrição
 */

function getAudioFormat(contentType: string, audioUrl: string): 'ogg' | 'mp3' | 'm4a' | 'wav' {
  const type = contentType.toLowerCase();
  const url = audioUrl.toLowerCase();

  if (type.includes('mpeg') || type.includes('mp3') || url.endsWith('.mp3')) return 'mp3';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac') || url.endsWith('.m4a')) return 'm4a';
  if (type.includes('wav') || type.includes('wave') || url.endsWith('.wav')) return 'wav';
  return 'ogg';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadAudio(audioUrl: string): Promise<Response> {
  const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

  const attempts: Array<{ name: string; headers: Record<string, string> }> = [
    {
      name: 'direct',
      headers: {},
    },
    {
      name: 'with-client-token',
      headers: zapiClientToken ? { 'Client-Token': zapiClientToken } : {},
    },
  ];

  let lastStatus = 0;

  for (const attempt of attempts) {
    if (attempt.name === 'with-client-token' && !zapiClientToken) continue;

    const response = await fetchWithTimeout(
      audioUrl,
      {
        method: 'GET',
        headers: {
          'Accept': 'audio/*,*/*',
          ...attempt.headers,
        },
      },
      DOWNLOAD_TIMEOUT_MS,
    );

    if (response.ok) {
      console.log(`[TRANSCRIBE] Download OK (${attempt.name})`);
      return response;
    }

    lastStatus = response.status;
    console.error(`[TRANSCRIBE] Falha download (${attempt.name}): ${response.status}`);
  }

  throw new Error(`Failed to download audio (status: ${lastStatus || 'unknown'})`);
}

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
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[TRANSCRIBE] Baixando áudio: ${audioUrl.substring(0, 120)}...`);

    const audioResponse = await downloadAudio(audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();

    if (audioBuffer.byteLength === 0) {
      throw new Error('Audio file is empty');
    }

    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
      console.error(`[TRANSCRIBE] Áudio muito grande: ${audioBuffer.byteLength} bytes`);
      return new Response(JSON.stringify({
        transcription: '[Áudio muito longo para transcrição automática]',
        error: 'Audio too large'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = audioResponse.headers.get('content-type') || 'audio/ogg';
    const format = getAudioFormat(contentType, audioUrl);
    const audioBase64 = arrayBufferToBase64(audioBuffer);

    console.log(`[TRANSCRIBE] Áudio baixado: ${audioBuffer.byteLength} bytes, tipo: ${contentType}, formato: ${format}`);

    const response = await fetchWithTimeout(
      'https://ai.gateway.lovable.dev/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `Você é um transcritor de áudio preciso. Transcreva EXATAMENTE o que a pessoa disse no áudio, em português brasileiro.

REGRAS:
- Transcreva palavra por palavra, sem corrigir erros gramaticais
- Mantenha gírias e expressões coloquiais como foram faladas
- Se houver números, escreva-os como a pessoa falou (ex: "vinte e dois" ou "22")
- Se não conseguir entender alguma parte, indique com [inaudível]
- Responda APENAS com a transcrição, sem comentários adicionais
- Se o áudio estiver vazio ou silencioso, responda: [áudio sem fala]`,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Transcreva este áudio de WhatsApp:',
                },
                {
                  type: 'input_audio',
                  input_audio: {
                    data: audioBase64,
                    format,
                  },
                },
              ],
            },
          ],
          max_tokens: 1000,
        }),
      },
      TRANSCRIBE_TIMEOUT_MS,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TRANSCRIBE] Erro Gemini: ${response.status} - ${errorText}`);

      return new Response(JSON.stringify({
        transcription: '[Áudio recebido]',
        error: 'Transcription failed',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    const rawContent = result.choices?.[0]?.message?.content;

    const transcription = typeof rawContent === 'string'
      ? rawContent.trim()
      : Array.isArray(rawContent)
        ? rawContent.map((part: any) => (typeof part === 'string' ? part : part?.text || '')).join(' ').trim()
        : '';

    const safeTranscription = transcription || '[Áudio não reconhecido]';

    console.log(`[TRANSCRIBE] ✅ Transcrição: "${safeTranscription.substring(0, 100)}..."`);

    return new Response(JSON.stringify({
      transcription: safeTranscription,
      success: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[TRANSCRIBE] Erro:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      transcription: '[Áudio recebido]'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
