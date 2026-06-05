import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-type, content-length, accept-ranges",
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function inferAudioExtension(mediaUrl: string, contentType: string): string {
  const lowerUrl = mediaUrl.toLowerCase();
  const lowerType = contentType.toLowerCase();
  const fromUrl = lowerUrl.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i)?.[1];
  if (fromUrl) return fromUrl === "oga" || fromUrl === "opus" ? "ogg" : fromUrl;
  if (lowerType.includes("mpeg") || lowerType.includes("mp3")) return "mp3";
  if (lowerType.includes("mp4") || lowerType.includes("m4a")) return "m4a";
  if (lowerType.includes("webm")) return "webm";
  if (lowerType.includes("wav")) return "wav";
  if (lowerType.includes("amr")) return "amr";
  if (lowerType.includes("aac")) return "aac";
  return "ogg";
}

function defaultAudioContentType(extension: string): string {
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "m4a" || extension === "mp4") return "audio/mp4";
  if (extension === "webm") return "audio/webm";
  if (extension === "wav") return "audio/wav";
  if (extension === "amr") return "audio/amr";
  if (extension === "aac") return "audio/aac";
  return "audio/ogg";
}

async function fetchAudio(audioUrl: string): Promise<Response> {
  const zapiClientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
  const attempts: Array<{ name: string; headers: Record<string, string> }> = [
    { name: "direct", headers: {} },
    { name: "with-client-token", headers: zapiClientToken ? { "Client-Token": zapiClientToken } : {} },
  ];

  let lastStatus = 0;

  for (const attempt of attempts) {
    if (attempt.name === "with-client-token" && !zapiClientToken) continue;

    const response = await fetch(audioUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "audio/*,*/*",
        "User-Agent": "Mozilla/5.0",
        ...attempt.headers,
      },
    });

    if (response.ok) return response;
    lastStatus = response.status;
    console.warn("[CHAT-MEDIA-PROXY] Download failed:", attempt.name, response.status);
  }

  throw new Error(`Unable to download audio (${lastStatus || "unknown"})`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const messageId = url.searchParams.get("message_id")?.trim();

    if (!messageId) {
      return new Response(JSON.stringify({ error: "message_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: message, error } = await supabase
      .from("messages")
      .select("id, conversation_id, media_url, message_type, zapi_message_id")
      .eq("id", messageId)
      .maybeSingle();

    if (error || !message || message.message_type !== "audio" || !message.media_url) {
      return new Response(JSON.stringify({ error: "audio message not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentUrl = String(message.media_url);
    if (currentUrl.includes("/storage/v1/object/public/chat-media/")) {
      return Response.redirect(currentUrl, 302);
    }

    const audioResponse = await fetchAudio(currentUrl);
    const contentLength = Number(audioResponse.headers.get("content-length") || 0);
    if (contentLength > MAX_AUDIO_BYTES) {
      throw new Error(`Audio too large (${contentLength})`);
    }

    const buffer = await audioResponse.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > MAX_AUDIO_BYTES) {
      throw new Error(`Invalid audio size (${buffer.byteLength})`);
    }

    const rawContentType = audioResponse.headers.get("content-type") || "";
    const extension = inferAudioExtension(currentUrl, rawContentType);
    const contentType =
      rawContentType && !rawContentType.toLowerCase().includes("text/html")
        ? rawContentType.split(";")[0].trim()
        : defaultAudioContentType(extension);
    const safeMessageId = String(message.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    const path = `inbound/audio/proxy/${Date.now()}-${safeMessageId}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("chat-media")
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) {
      throw new Error("Unable to create public audio URL");
    }

    await supabase
      .from("messages")
      .update({ media_url: publicUrl })
      .eq("id", message.id);

    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[CHAT-MEDIA-PROXY] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
