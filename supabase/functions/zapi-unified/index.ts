import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  acquireZapiGovernorLease,
  releaseZapiGovernorLease,
  sendWithGovernorLease,
} from "../_shared/zapi-governor.ts";
import { buildPhoneVariants, normalizeWhatsappPhone } from "../_shared/phone.ts";
import {
  type ZAPIMessage,
  type InboundMediaType,
  MAX_INBOUND_MEDIA_BYTES,
  normalizeString,
  normalizeUrlForComparison,
  isWhatsAppProfileImageUrl,
  isMessageContentOnlyMediaUrl,
  sanitizeInboundMessageContent,
  hasExplicitInboundMedia,
  shouldUseNestedMediaUrl,
  detectMediaUrlFromText,
  isLikelyMediaUrl,
  inferMediaExtension,
  defaultMediaContentType,
  findNestedString,
  normalizeInboundPayload,
} from "../_shared/inbound.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AGENT_ACCUMULATOR_DELAY_MS = Math.max(
  15000,
  Number(Deno.env.get("AGENT_ACCUMULATOR_DELAY_MS") || 15000),
);
const AGENT_ACCUMULATOR_WINDOW_MS = Math.max(
  AGENT_ACCUMULATOR_DELAY_MS + 10000,
  Number(Deno.env.get("AGENT_ACCUMULATOR_WINDOW_MS") || 45000),
);

function coerceSelectedPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^0-9,.-]/g, "").replace(".", "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSelectedPrice(value: unknown): string | null {
  const parsed = coerceSelectedPrice(value);
  if (parsed === null) return null;
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildSelectedProductNote(selectedSku: string | null, selectedName: string | null, selectedPrice: unknown): string {
  const lines = ["Modelo escolhido pelo cliente:"];
  if (selectedName) lines.push(`Produto: ${selectedName}`);
  if (selectedSku) lines.push(`SKU: ${selectedSku}`);
  const priceLabel = formatSelectedPrice(selectedPrice);
  if (priceLabel) lines.push(`Valor: ${priceLabel}`);
  return lines.join("\n");
}

function buildProductInterestNote(args: {
  selectedSku: string | null;
  selectedName: string | null;
  selectedPrice: unknown;
  customerMessage: string;
}) {
  if (args.selectedSku || args.selectedName) {
    return buildSelectedProductNote(args.selectedSku, args.selectedName, args.selectedPrice);
  }

  const lines = [
    "Cliente demonstrou interesse em um produto, mas o modelo exato nao foi identificado automaticamente.",
    "Verifique o ultimo card/catalogo enviado acima antes de finalizar.",
  ];
  const customerMessage = normalizeString(args.customerMessage).slice(0, 180);
  if (customerMessage) lines.push(`Mensagem do cliente: ${customerMessage}`);
  return lines.join("\n");
}

function hasProductInterestSignal(message: string, buttonResponseId: string | null, catalogSelectionHint: string | null) {
  const combined = normalizeString([buttonResponseId, catalogSelectionHint, message].filter(Boolean).join(" "));
  if (/^(select|choose|details)[_-]/i.test(combined)) return true;
  return /\b(quero este|quero esse|quero esta|quero essa|essa joia|esse modelo|este modelo|essa alianca|essa aliança|gostei dessa|gostei desse|vou querer|pode ser essa|pode ser esse)\b/i.test(combined);
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAccumulatorContent(message: any): string {
  const content = normalizeString(message?.content);
  if (content) return content;

  const messageType = normalizeString(message?.message_type);
  if (messageType === "image") return "[imagem recebida]";
  if (messageType === "audio") return "[audio recebido]";
  if (messageType === "video") return "[video recebido]";
  if (messageType === "document") return "[documento recebido]";

  return "";
}

async function prepareAccumulatedAgentInput(
  supabase: any,
  args: {
    conversationId: string;
    storedMessageId: string | null;
    messageForAline: string;
    messageType: string;
    mediaUrl: string;
  },
): Promise<
  | { skip: true; reason: string }
  | { skip: false; messageForAline: string; messageType: string; mediaUrl: string }
> {
  if (!args.storedMessageId || AGENT_ACCUMULATOR_DELAY_MS <= 0) {
    return {
      skip: false,
      messageForAline: args.messageForAline,
      messageType: args.messageType,
      mediaUrl: args.mediaUrl,
    };
  }

  await sleep(AGENT_ACCUMULATOR_DELAY_MS);

  const sinceIso = new Date(Date.now() - AGENT_ACCUMULATOR_WINDOW_MS).toISOString();
  const [{ data: inboundMessages }, { data: lastOutbound }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, content, message_type, media_url, created_at")
      .eq("conversation_id", args.conversationId)
      .eq("is_from_me", false)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(15),
    supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", args.conversationId)
      .eq("is_from_me", true)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const inbound = Array.isArray(inboundMessages) ? inboundMessages : [];
  const newestInbound = inbound[inbound.length - 1];

  if (newestInbound?.id && String(newestInbound.id) !== String(args.storedMessageId)) {
    return { skip: true, reason: "newer_message_pending" };
  }

  const lastOutboundTime = lastOutbound?.created_at ? new Date(lastOutbound.created_at).getTime() : 0;
  const relevantMessages = inbound.filter((item) => {
    const createdAt = item?.created_at ? new Date(item.created_at).getTime() : 0;
    return !lastOutboundTime || createdAt > lastOutboundTime;
  });

  if (relevantMessages.length <= 1) {
    return {
      skip: false,
      messageForAline: args.messageForAline,
      messageType: args.messageType,
      mediaUrl: args.mediaUrl,
    };
  }

  const lines: string[] = [];
  for (const item of relevantMessages) {
    const line = buildAccumulatorContent(item);
    if (!line) continue;
    if (lines[lines.length - 1] === line) continue;
    lines.push(line);
  }

  const latestMedia = [...relevantMessages].reverse().find((item) => normalizeString(item?.media_url));
  const combinedText = lines.join("\n").trim();

  return {
    skip: false,
    messageForAline: combinedText || args.messageForAline,
    messageType: latestMedia?.message_type || args.messageType,
    mediaUrl: latestMedia?.media_url || args.mediaUrl,
  };
}

function generateHash(phone: string, message: string): string {
  const now = new Date();
  const minuteKey = `${now.getFullYear()}${now.getMonth()}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
  const msgKey = message.toLowerCase().replace(/\s+/g, "").substring(0, 100);
  return `${phone}_${msgKey}_${minuteKey}`;
}

async function shouldSkipNearDuplicateMessage(
  supabase: any,
  conversationId: string,
  args: {
    content: string;
    messageType: string;
    mediaUrl: string | null;
  },
): Promise<{ skip: boolean; reason?: string; mergedMessageId?: string }> {
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const normalizedContent = args.content.trim();

  if (
    ["image", "video"].includes(args.messageType) &&
    args.mediaUrl &&
    normalizedContent
  ) {
    const { data: existingTextMessage } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("is_from_me", false)
      .eq("message_type", "text")
      .eq("content", normalizedContent)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingTextMessage?.id) {
      await supabase
        .from("messages")
        .update({
          message_type: args.messageType,
          media_url: args.mediaUrl,
          content: normalizedContent,
        })
        .eq("id", existingTextMessage.id);

      return {
        skip: true,
        reason: "merged_text_into_media",
        mergedMessageId: existingTextMessage.id,
      };
    }
  }

  if (normalizedContent) {
    const { data: sameContentMessages } = await supabase
      .from("messages")
      .select("id, message_type, media_url")
      .eq("conversation_id", conversationId)
      .eq("is_from_me", false)
      .eq("content", normalizedContent)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(3);

    for (const existing of sameContentMessages || []) {
      if (existing.message_type === args.messageType) {
        return { skip: true, reason: "near_duplicate_content" };
      }

      const existingType = String(existing.message_type || "");
      if (
        ["text", "button_reply"].includes(args.messageType) &&
        ["text", "button_reply"].includes(existingType)
      ) {
        return { skip: true, reason: "near_duplicate_text_or_button" };
      }

      if (
        args.messageType === "text" &&
        ["image", "video"].includes(String(existing.message_type || ""))
      ) {
        return { skip: true, reason: "text_duplicate_of_media_caption" };
      }
    }
  }

  if (
    args.messageType === "text" &&
    normalizedContent &&
    isMessageContentOnlyMediaUrl(normalizedContent, null)
  ) {
    const detected = detectMediaUrlFromText(normalizedContent);
    if (detected) {
      const { data: recentMediaMessages } = await supabase
        .from("messages")
        .select("id, media_url")
        .eq("conversation_id", conversationId)
        .eq("is_from_me", false)
        .eq("message_type", detected.type)
        .gte("created_at", windowStart)
        .not("media_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(3);

      for (const existing of recentMediaMessages || []) {
        const existingMedia = normalizeUrlForComparison(String(existing.media_url || ""));
        const incomingMedia = normalizeUrlForComparison(detected.url);
        if (existingMedia && incomingMedia && existingMedia === incomingMedia) {
          return { skip: true, reason: "url_duplicate_of_recent_media" };
        }
      }
    }
  }

  return { skip: false };
}

function detectInfluencerCode(message: string): string | null {
  const match = String(message || "").match(/#?ACIUMP[-_\s]?([A-Z0-9]{4,24})/i);
  return match?.[1]?.toUpperCase() || null;
}

function stripInfluencerCode(message: string): string {
  return String(message || "")
    .replace(/#?ACIUMP[-_\s]?[A-Z0-9]{4,24}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function recordInfluencerLead(
  supabase: any,
  code: string | null,
  args: {
    conversationId: string;
    phone: string;
    contactName: string;
    firstMessage: string;
  },
) {
  if (!code) return;

  const { data: influencer, error: influencerError } = await supabase
    .from("influencers")
    .select("id, code, active")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();

  if (influencerError || !influencer?.id) {
    console.warn("[ZAPI-UNIFIED] Codigo de influencer nao encontrado:", code, influencerError?.message || "");
    return;
  }

  const { error } = await supabase
    .from("influencer_leads")
    .upsert(
      {
        influencer_id: influencer.id,
        conversation_id: args.conversationId,
        contact_name: args.contactName,
        contact_phone: args.phone,
        first_message: args.firstMessage,
        last_seen_at: new Date().toISOString(),
        metadata: { source: "whatsapp_link", code },
      },
      { onConflict: "influencer_id,contact_phone" },
    );

  if (error) {
    console.error("[ZAPI-UNIFIED] Erro ao registrar lead de influencer:", error);
  }
}

function buildHeaders(clientToken?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (clientToken) {
    headers["Client-Token"] = clientToken;
  }

  return headers;
}

async function mirrorInboundMediaToStorage(
  supabase: any,
  mediaUrl: string | null,
  args: {
    phone: string;
    messageType: string;
    messageId: string | null;
  },
): Promise<string | null> {
  if (!mediaUrl || !["audio", "image", "video", "document"].includes(args.messageType)) return null;
  if (mediaUrl.includes("/storage/v1/object/public/chat-media/")) return mediaUrl;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const zapiClientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
    const downloadAttempts: Array<{ name: string; headers: Record<string, string> }> = [
      { name: "direct", headers: {} },
      { name: "with-client-token", headers: zapiClientToken ? { "Client-Token": zapiClientToken } : {} },
    ];

    let response: Response | null = null;

    for (const attempt of downloadAttempts) {
      if (attempt.name === "with-client-token" && !zapiClientToken) continue;

      response = await fetch(mediaUrl, {
        signal: controller.signal,
        headers: {
          Accept: args.messageType === "audio" ? "audio/*,*/*" : "*/*",
          "User-Agent": "Mozilla/5.0",
          ...attempt.headers,
        },
        redirect: "follow",
      });

      if (response.ok) break;
      console.warn(
        "[ZAPI-UNIFIED] Falha ao baixar midia recebida:",
        attempt.name,
        response.status,
        mediaUrl.substring(0, 120),
      );
    }

    if (!response?.ok) {
      console.warn("[ZAPI-UNIFIED] Nao foi possivel baixar midia recebida:", response?.status || "unknown", mediaUrl.substring(0, 120));
      return null;
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_INBOUND_MEDIA_BYTES) {
      console.warn("[ZAPI-UNIFIED] Midia recebida ignorada por tamanho:", contentLength);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer.byteLength || arrayBuffer.byteLength > MAX_INBOUND_MEDIA_BYTES) {
      console.warn("[ZAPI-UNIFIED] Midia recebida vazia ou grande demais:", arrayBuffer.byteLength);
      return null;
    }

    const rawContentType = response.headers.get("content-type") || "";
    const extension = inferMediaExtension(mediaUrl, rawContentType, args.messageType);
    const normalizedRawContentType = rawContentType.split(";")[0].trim().toLowerCase();
    const contentType = normalizedRawContentType &&
      !normalizedRawContentType.includes("text/html") &&
      normalizedRawContentType !== "application/octet-stream"
      ? normalizedRawContentType
      : defaultMediaContentType(args.messageType, extension);
    const safePhone = args.phone.replace(/\D/g, "") || "unknown";
    const safeId = (args.messageId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    const path = `inbound/${args.messageType}/${safePhone}/${Date.now()}-${safeId}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("chat-media")
      .upload(path, arrayBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.warn("[ZAPI-UNIFIED] Nao foi possivel salvar midia no Storage:", uploadError.message);
      return null;
    }

    const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (error) {
    console.warn("[ZAPI-UNIFIED] Falha ao espelhar midia recebida:", error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function runBackgroundTask(label: string, task: Promise<unknown>) {
  const wrappedTask = task.catch((error) => {
    console.error(`[ZAPI-UNIFIED] Falha em tarefa de fundo (${label}):`, error);
  });
  const edgeRuntime = (globalThis as any).EdgeRuntime;

  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(wrappedTask);
    return;
  }

  void wrappedTask;
}

function collectNestedStrings(
  value: unknown,
  maxDepth = 5,
  bucket: string[] = [],
): string[] {
  if (maxDepth < 0 || value === null || value === undefined) return bucket;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) bucket.push(trimmed);
    return bucket;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectNestedStrings(item, maxDepth - 1, bucket);
    }
    return bucket;
  }

  if (typeof value === "object") {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      collectNestedStrings(nestedValue, maxDepth - 1, bucket);
    }
  }

  return bucket;
}

function pickBestCatalogSelectionHint(payload: unknown): string {
  const uniqueCandidates = Array.from(new Set(collectNestedStrings(payload)));
  let bestCandidate = "";
  let bestScore = -1;

  for (const candidate of uniqueCandidates) {
    const normalized = candidate.trim();
    if (!normalized) continue;

    let score = 0;

    if (/\b(?:e0\d{5,}|pf[a-z0-9-]{5,}|[oó]culos[-_]?\d+)\b/i.test(normalized)) score += 100;
    if (/(culos|arma[cÃ§]ao|lente)/i.test(normalized)) score += 25;
    if (/c[oó]d[:\s]/i.test(normalized)) score += 30;
    if (/(alianca|aliança|pingente|medalha|tungsten|tungstenio|facetad|solidblack|designer|zirc[oô]nia|zirconia|black)/i.test(normalized)) {
      score += 25;
    }
    if (normalized.length >= 24) score += 10;
    if (/(^|[\s_*])quero esta($|[\s!*_])/i.test(normalized)) score -= 15;
    if (/^(azul|blue|dourada|dourado|prata|preta|preto)$/i.test(normalized)) score -= 40;

    if (score > bestScore || (score === bestScore && normalized.length > bestCandidate.length)) {
      bestScore = score;
      bestCandidate = normalized;
    }
  }

  return bestScore > 0 ? bestCandidate : "";
}

function normalizeZapiStatus(status?: string | null) {
  switch (String(status || "").toUpperCase()) {
    case "PENDING":
      return "sending";
    case "SENT":
      return "sent";
    case "RECEIVED":
      return "delivered";
    case "READ":
    case "READ_BY_ME":
    case "PLAYED":
      return "read";
    case "DELETED":
      return "deleted";
    default:
      return status ? String(status).toLowerCase() : "sent";
  }
}

function parseZapiPresenceDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    const numeric = Number(trimmed);

    if (Number.isFinite(numeric)) {
      const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
      return new Date(millis).toISOString();
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

function normalizePresenceStatus(value: unknown) {
  if (value === true) return "available";
  if (value === false) return "unavailable";

  const normalized = String(value || "unknown").trim().toLowerCase();

  if (["available", "online", "connected", "active", "true"].includes(normalized)) return "available";
  if (["unavailable", "offline", "disconnected", "inactive", "false"].includes(normalized)) return "unavailable";
  if (["composing", "typing"].includes(normalized)) return "composing";
  if (["paused"].includes(normalized)) return "paused";
  if (["recording", "audio"].includes(normalized)) return "recording";

  return normalized || "unknown";
}

function normalizeFallbackText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function loadAgentFallbackContext(supabase: any, phone: string) {
  try {
    const phoneVariants = buildPhoneVariants(phone);
    const { data } = await supabase
      .from("aline_conversations")
      .select("active_agent,current_node,status,collected_data,assigned_seller_id,assigned_seller_name,last_message_at,created_at")
      .in("phone", phoneVariants)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return data || null;
  } catch (error) {
    console.warn("[ZAPI-UNIFIED] Nao foi possivel carregar contexto de fallback:", error);
    return null;
  }
}

function inferFallbackAgent(context: any, message: string): string {
  const data = context?.collected_data || {};
  const text = normalizeFallbackText([
    message,
    context?.active_agent,
    context?.current_node,
    data.agente_atual,
    data.categoria,
    data.customer_stage,
    data.handoff_reason,
  ].filter(Boolean).join(" "));

  if (context?.assigned_seller_id || context?.assigned_seller_name || context?.status === "human_takeover") {
    return "human";
  }
  if (/\bmalu\b|oculos|oculo|armacao|catalogo_oculos|malu_/.test(text)) return "malu";
  if (/\bkate\b|pingente|pingentes|fotograv|catalogo_pingente|kate_/.test(text)) return "kate";
  if (/\bkeila\b|alianca|aliancas|aneis|anel|catalogo_alianca|keila_/.test(text)) return "keila";
  return "aline";
}

function buildSafeAlineFallback(contactName: string, context?: any, message = "") {
  const firstName = String(contactName || "")
    .trim()
    .split(/\s+/)[0]
    ?.replace(/\d+/g, "")
    .trim();
  const greetingName = firstName && firstName.length > 1 ? `, ${firstName}` : "";
  const fallbackAgent = inferFallbackAgent(context, message);

  if (fallbackAgent !== "aline") {
    const specialistLabel = fallbackAgent === "malu"
      ? "oculos"
      : fallbackAgent === "keila"
        ? "aliancas"
        : fallbackAgent === "kate"
          ? "pingentes/fotogravacao"
          : "seu atendimento";

    return {
      success: true,
      response: `Tive uma instabilidade para continuar automaticamente com ${specialistLabel}. Para nao te responder errado, vou chamar um vendedor para assumir daqui e ver o historico da conversa.`,
      mensagem_whatsapp: `Tive uma instabilidade para continuar automaticamente com ${specialistLabel}. Para nao te responder errado, vou chamar um vendedor para assumir daqui e ver o historico da conversa.`,
      produtos: [],
      media_items: [],
      tem_produtos: false,
      agent: "human",
      status: "human_takeover",
      node_tecnico: "human_takeover",
      fallback_reason: `aline-reply-unavailable-${fallbackAgent}`,
    };
  }

  return {
    success: true,
    response: `Oi${greetingName}! Sou a Aline da ACIUM Manaus. Posso te ajudar com alianças, pingentes ou algum modelo do catálogo?`,
    mensagem_whatsapp: `Oi${greetingName}! Sou a Aline da ACIUM Manaus. Posso te ajudar com alianças, pingentes ou algum modelo do catálogo?`,
    produtos: [],
    media_items: [],
    tem_produtos: false,
    node_tecnico: "abertura",
    fallback_reason: "aline-reply-unavailable",
  };
}

function isHumanControlledConversation(crmConversation: any, agentContext: any): boolean {
  const leadStatus = normalizeString(crmConversation?.lead_status);
  return (
    leadStatus === "humano" ||
    leadStatus === "venda_iniciada" ||
    leadStatus === "vendido" ||
    Boolean(crmConversation?.attending_by || crmConversation?.attending_name) ||
    agentContext?.status === "human_takeover" ||
    agentContext?.active_agent === "human" ||
    Boolean(agentContext?.assigned_seller_id || agentContext?.assigned_seller_name)
  );
}

async function sendText(
  phone: string,
  message: string,
  instanceId: string,
  token: string,
  clientToken?: string,
) {
  const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
    method: "POST",
    headers: buildHeaders(clientToken),
    body: JSON.stringify({ phone, message }),
  });

  const result = await response.json();
  return {
    success: response.ok && !!(result.messageId || result.zaapId),
    messageId: result.messageId || result.zaapId || null,
    error: response.ok ? null : result,
  };
}

async function sendMedia(
  phone: string,
  type: "image" | "video",
  url: string,
  caption: string,
  instanceId: string,
  token: string,
  clientToken?: string,
) {
  const endpoint =
    type === "video"
      ? `https://api.z-api.io/instances/${instanceId}/token/${token}/send-video`
      : `https://api.z-api.io/instances/${instanceId}/token/${token}/send-image`;

  const body =
    type === "video"
      ? { phone, video: url, caption }
      : { phone, image: url, caption };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders(clientToken),
    body: JSON.stringify(body),
  });

  const result = await response.json();
  return {
    success: response.ok && !!(result.messageId || result.zaapId),
    messageId: result.messageId || result.zaapId || null,
    error: response.ok ? null : result,
  };
}

async function sendInteractiveProductCard(
  phone: string,
  product: any,
  instanceId: string,
  token: string,
  clientToken?: string,
) {
  const buttonId = product.button_id || `select_${product.sku || product.id}`;
  const buttonLabel = product.button_label || "Quero esta";
  const message = product.caption || product.name || "Produto";
  const buttons = Array.isArray(product.buttons) && product.buttons.length > 0
    ? product.buttons
    : [
        {
          id: buttonId,
          label: buttonLabel,
        },
        {
          id: "more_options",
          label: "Quero mais",
        },
      ];
  const buttonList: Record<string, unknown> = {
    buttons,
  };

  if (product.video_url) {
    buttonList.video = product.video_url;
  } else if (product.image_url) {
    buttonList.image = product.image_url;
  }

  const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-button-list`, {
    method: "POST",
    headers: buildHeaders(clientToken),
    body: JSON.stringify({
      phone,
      message,
      buttonList,
    }),
  });

  const result = await response.json();
  return {
    success: response.ok && !!(result.messageId || result.zaapId),
    messageId: result.messageId || result.zaapId || null,
    error: response.ok ? null : result,
  };
}

async function sendProductChoiceButtons(
  phone: string,
  product: any,
  instanceId: string,
  token: string,
  clientToken?: string,
) {
  const buttonId = product.button_id || `select_${product.sku || product.id}`;
  const buttonLabel = product.button_label || "Quero esta";
  const productName = product.name || "este modelo";
  const buttons = Array.isArray(product.buttons) && product.buttons.length > 0
    ? product.buttons
    : [
        {
          id: buttonId,
          label: buttonLabel,
        },
        {
          id: "more_options",
          label: "Quero mais",
        },
      ];

  const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-button-list`, {
    method: "POST",
    headers: buildHeaders(clientToken),
    body: JSON.stringify({
      phone,
      message: `Escolha uma opção para ${productName}:`,
      buttonList: {
        buttons,
      },
    }),
  });

  const result = await response.json();
  return {
    success: response.ok && !!(result.messageId || result.zaapId),
    messageId: result.messageId || result.zaapId || null,
    error: response.ok ? null : result,
  };
}

async function sendActionButtons(
  phone: string,
  message: string,
  buttons: Array<{ id: string; label: string }>,
  instanceId: string,
  token: string,
  clientToken?: string,
) {
  const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-button-list`, {
    method: "POST",
    headers: buildHeaders(clientToken),
    body: JSON.stringify({
      phone,
      message,
      buttonList: {
        buttons,
      },
    }),
  });

  const result = await response.json();
  return {
    success: response.ok && !!(result.messageId || result.zaapId),
    messageId: result.messageId || result.zaapId || null,
    error: response.ok ? null : result,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID");
    const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN");
    const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error("Z-API credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const rawPayload: ZAPIMessage = await req.json();
    const payload = normalizeInboundPayload(rawPayload);

    console.log("[ZAPI-UNIFIED] ====== NOVA REQUISIÇÃO ======");
    console.log("[ZAPI-UNIFIED] Payload:", JSON.stringify(payload).substring(0, 1000));

    const eventType = payload.type || payload.event || "";
    const normalizedEventType = String(eventType || "").trim().toLowerCase();
    const hasError = !!(payload as any).error;
    const isPresenceCallback =
      eventType === "PresenceChatCallback" ||
      eventType === "PresenceCallback" ||
      ["presence-chat", "presence_update", "presence-update", "presence"].includes(normalizedEventType);
    const isStatusCallback =
      eventType === "DeliveryCallback" ||
      eventType === "ReadCallback" ||
      eventType === "SentCallback" ||
      eventType === "MessageStatusCallback" ||
      eventType === "message-status-update" ||
      hasError;

    if (isPresenceCallback) {
      const rawPresencePhone =
        payload.phone ||
        (payload as any).chatId ||
        (payload as any).participantPhone ||
        (payload as any).participant ||
        (payload as any).remoteJid ||
        (payload as any).fromMePhone ||
        (payload as any).connectedPhone ||
        (payload as any).from ||
        findNestedString(payload, (candidate) => /^\+?\d{10,15}(?:@[cg]\.us)?$/.test(candidate), 4) ||
        "";
      const presencePhone = normalizeWhatsappPhone(rawPresencePhone);
      const presenceVariants = buildPhoneVariants(presencePhone || rawPresencePhone);
      const presence = normalizePresenceStatus(
        (payload as any).status ||
          (payload as any).presence ||
          (payload as any).presenceStatus ||
          (payload as any).state ||
          (payload as any).isOnline ||
          (payload as any).online,
      );
      const nowIso = new Date().toISOString();
      const lastSeenAt =
        parseZapiPresenceDate((payload as any).lastSeen) ||
        parseZapiPresenceDate((payload as any).lastSeenAt) ||
        parseZapiPresenceDate((payload as any).last_seen_at) ||
        parseZapiPresenceDate((payload as any).timestamp) ||
          (presence === "unavailable" ? nowIso : null);
      const isOnline = ["available", "composing", "recording"].includes(presence);

      if (presenceVariants.length > 0) {
        const { error: presenceError } = await supabase
          .from("conversations")
          .update({
            contact_presence: presence,
            contact_is_online: isOnline,
            contact_last_seen_at: lastSeenAt,
            contact_presence_updated_at: nowIso,
          })
          .in("contact_number", presenceVariants);

        if (presenceError) {
          console.warn("[ZAPI-UNIFIED] Presenca recebida, mas as colunas ainda nao estao aplicadas:", presenceError.message);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          type: "presence_update",
          phone: presencePhone,
          presence,
          is_online: isOnline,
          last_seen_at: lastSeenAt,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const statusMessageIds = [
      ...(Array.isArray(payload.ids) ? payload.ids : []),
      payload.messageId || "",
      payload.zaapId || "",
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (isStatusCallback && statusMessageIds.length > 0) {
      await supabase
        .from("messages")
        .update({ status: normalizeZapiStatus(payload.status) })
        .in("zapi_message_id", statusMessageIds);

      return new Response(
        JSON.stringify({ success: true, type: "status_update", ids: statusMessageIds }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (isStatusCallback) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "status_callback_without_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawPhone = payload.phone || payload.text?.phone || "";
    const phone = normalizeWhatsappPhone(rawPhone);
    const phoneVariants = buildPhoneVariants(rawPhone);
    const isFromMe = payload.isFromMe === true || payload.fromMe === true;
    const contactName = payload.senderName || payload.pushName || payload.text?.senderName || phone;

    const buttonResponseId =
      payload.buttonResponseId ||
      payload.buttonId ||
      payload.listResponseId ||
      payload.buttonResponse?.buttonId ||
      payload.buttonsResponseMessage?.buttonId ||
      findNestedString(payload, (candidate) => /^(select|choose|details)[_-][a-z0-9-]+$/i.test(candidate) || candidate === "retomar_atendimento") ||
      "";

    const buttonResponseLabel =
      payload.buttonResponse?.message ||
      payload.buttonsResponseMessage?.message ||
      "";

    let catalogSelectionHint =
      findNestedString(
        payload,
        (candidate) =>
          /^(?:e0\d{5,}|pf[a-z0-9-]{5,}|[oó]culos[-_]?\d+)$/i.test(candidate) ||
          /alianca|aliança|tungsten|casamento|facetad|solidblack|designer|dourad|pret|azul|blue/i.test(candidate),
      ) || "";
    catalogSelectionHint = pickBestCatalogSelectionHint(payload) || catalogSelectionHint;

    let messageContent = "";
    let messageType = "text";
    let mediaUrl: string | null = null;

    if (payload.image) {
      messageType = "image";
      mediaUrl = payload.image.imageUrl || payload.image.url || payload.image.mediaUrl || null;
      messageContent = payload.image.caption || payload.text?.message || "";
    } else if (payload.audio) {
      messageType = "audio";
      mediaUrl = payload.audio.audioUrl || payload.audio.url || payload.audio.mediaUrl || null;
      messageContent = "[Audio recebido]";
    } else if (payload.video) {
      messageType = "video";
      mediaUrl = payload.video.videoUrl || payload.video.url || payload.video.mediaUrl || null;
      messageContent = payload.video.caption || payload.text?.message || "";
    } else if (payload.document) {
      messageType = "document";
      mediaUrl = payload.document.documentUrl || payload.document.url || payload.document.mediaUrl || null;
      messageContent = payload.document.fileName || payload.text?.message || "";
    } else if (payload.text?.message) {
      messageContent = payload.text.message;
    } else if (typeof payload.message === "string" && payload.message) {
      messageContent = payload.message;
    }

    if (!messageContent && buttonResponseLabel) {
      messageContent = buttonResponseLabel;
      messageType = "button_reply";
    }

    if (!messageContent && buttonResponseId) {
      messageContent = buttonResponseId;
      messageType = "button_reply";
    }

    const influencerCode = detectInfluencerCode(messageContent);
    if (influencerCode && messageType === "text") {
      messageContent = stripInfluencerCode(messageContent) || "Oi! Vim pelo link de divulgacao.";
    }

    if (!mediaUrl && messageContent) {
      const detectedMedia = detectMediaUrlFromText(messageContent);
      if (detectedMedia) {
        messageType = detectedMedia.type;
        mediaUrl = detectedMedia.url;
        messageContent = detectedMedia.type === "image"
          ? ""
          : detectedMedia.type === "audio"
            ? "[Áudio recebido]"
            : detectedMedia.type === "video"
              ? ""
              : detectedMedia.url.split("/").pop() || "Arquivo recebido";
      }
    }

    messageContent = sanitizeInboundMessageContent(messageContent, mediaUrl, messageType);

    if (!phone) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_phone" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isFinalizarButton = buttonResponseId === "retomar_atendimento";

    if (isFinalizarButton) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/aline-followup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            buttonResponse: true,
            phone,
          }),
        });
      } catch (error) {
        console.error("[ZAPI-UNIFIED] Erro ao notificar equipe:", error);
      }
    }

    if (isFromMe) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "from_me" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!messageContent && !mediaUrl && !buttonResponseId) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "empty_content" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dedupeKey =
      payload.messageId ||
      payload.zaapId ||
      generateHash(phone, `${messageType}:${messageContent || mediaUrl || "no-content"}`);
    const { error: dedupeInsertError } = await supabase
      .from("processed_messages")
      .insert({ message_id: dedupeKey, phone });

    if (dedupeInsertError?.code === "23505") {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "duplicate" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (dedupeInsertError) {
      const { data: existing } = await supabase
        .from("processed_messages")
        .select("id")
        .eq("message_id", dedupeKey)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "duplicate" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    let conversationId: string;
    let existingConversationUnread = 0;
    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id, unread_count, contact_number, last_message_at, created_at, lead_status, attending_by, attending_name")
      .in("contact_number", phoneVariants)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingConversation?.id) {
      conversationId = existingConversation.id;
      existingConversationUnread = Number(existingConversation.unread_count || 0);
    } else {
      const { data: createdConversation, error: createConversationError } = await supabase
        .from("conversations")
        .insert({
          contact_number: phone,
          contact_name: contactName,
          platform: "whatsapp",
          last_message: messageContent || `[${messageType}]`,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
        })
        .select()
        .single();

      if (createConversationError || !createdConversation) {
        throw createConversationError || new Error("Unable to create conversation");
      }

      conversationId = createdConversation.id;
    }

    const zapiMessageId = payload.messageId || payload.zaapId || null;

    const nearDuplicate = await shouldSkipNearDuplicateMessage(supabase, conversationId, {
      content: messageContent,
      messageType,
      mediaUrl,
    });

    if (nearDuplicate.skip) {
      const mergedIntoExisting = nearDuplicate.reason === "merged_text_into_media";

      if (mergedIntoExisting) {
        await supabase
          .from("conversations")
          .update({
            contact_number: phone,
            contact_name: contactName,
            last_message: messageContent || `[${messageType}]`,
            unread_count: existingConversation?.id ? existingConversationUnread + 1 : 1,
            last_message_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: nearDuplicate.reason,
          message_saved: mergedIntoExisting,
          merged_message_id: nearDuplicate.mergedMessageId || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (existingConversation?.id) {
      await supabase
        .from("conversations")
        .update({
          contact_number: phone,
          contact_name: contactName,
          last_message: messageContent || `[${messageType}]`,
          unread_count: existingConversationUnread + 1,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    } else {
      await supabase
        .from("conversations")
        .update({
          contact_name: contactName,
          last_message: messageContent || `[${messageType}]`,
          unread_count: 1,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }

    await recordInfluencerLead(supabase, influencerCode, {
      conversationId,
      phone,
      contactName,
      firstMessage: messageContent,
    });

    const { data: storedInboundMessage, error: storeInboundMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        content: messageContent,
        message_type: messageType,
        media_url: mediaUrl,
        is_from_me: false,
        status: "received",
        zapi_message_id: zapiMessageId,
      })
      .select("id, created_at")
      .single();

    if (storeInboundMessageError) {
      throw storeInboundMessageError;
    }

    if (mediaUrl && ["audio", "image", "video", "document"].includes(messageType)) {
      runBackgroundTask(
        "mirror_inbound_media",
        (async () => {
          const storedMediaUrl = await mirrorInboundMediaToStorage(supabase, mediaUrl, {
            phone,
            messageType,
            messageId: zapiMessageId,
          });

          if (storedMediaUrl && storedMediaUrl !== mediaUrl) {
            await supabase
              .from("messages")
              .update({ media_url: storedMediaUrl })
              .eq("id", storedInboundMessage.id);
          }
        })(),
      );
    }

    const agentContextAfterStore = await loadAgentFallbackContext(supabase, phone);
    if (isHumanControlledConversation(existingConversation, agentContextAfterStore)) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "human_takeover_active",
          message_saved: true,
          message_id: storedInboundMessage.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let messageForAline = messageContent;
    if (!messageForAline && messageType === "image" && mediaUrl) {
      messageForAline = "[imagem recebida]";
    } else if (!messageForAline && messageType === "video" && mediaUrl) {
      messageForAline = "[video recebido]";
    }

    if (messageType === "audio" && mediaUrl) {
      try {
        const transcriptionResponse = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            audioUrl: mediaUrl,
            zapiMessageId,
          }),
        });

        const transcriptionData = await transcriptionResponse.json().catch(() => null);
        const transcription = transcriptionData?.transcription?.trim();
        const normalizedTranscription = normalizeFallbackText(transcription || "");
        const isUsableTranscription =
          transcriptionResponse.ok &&
          transcription &&
          !transcriptionData?.error &&
          !/audio recebido|audio nao reconhecido|audio sem fala|transcricao indisponivel|nao consegui|inaudivel/.test(normalizedTranscription);

        if (isUsableTranscription) {
          messageForAline = transcription;

          await supabase
            .from("messages")
            .update({ content: `[Audio transcrito]\n${transcription}` })
            .eq("id", storedInboundMessage.id);

          await supabase
            .from("conversations")
            .update({ last_message: `[Audio transcrito] ${transcription}`.substring(0, 100) })
            .eq("id", conversationId);
        } else {
          messageForAline = "[audio recebido]";
        }
      } catch (error) {
        console.error("[ZAPI-UNIFIED] Erro ao transcrever áudio:", error);
        messageForAline = "[audio recebido]";
      }
    }

    const accumulatedInput = await prepareAccumulatedAgentInput(supabase, {
      conversationId,
      storedMessageId: storedInboundMessage?.id || null,
      messageForAline,
      messageType,
      mediaUrl: mediaUrl || "",
    });

    if (accumulatedInput.skip) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: accumulatedInput.reason,
          message_saved: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    messageForAline = accumulatedInput.messageForAline;
    messageType = accumulatedInput.messageType;
    mediaUrl = accumulatedInput.mediaUrl || null;

    let alineResponse: any;

    try {
      const alineResponseRequest = await fetch(`${supabaseUrl}/functions/v1/aline-reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          phone,
          message: messageForAline,
          contact_name: contactName,
          media_type: messageType,
          media_url: mediaUrl,
          button_response_id: buttonResponseId || null,
          catalog_selection_hint: catalogSelectionHint || null,
        }),
      });

      if (!alineResponseRequest.ok) {
        const errorText = await alineResponseRequest.text();
        throw new Error(`aline-reply failed: ${alineResponseRequest.status} - ${errorText}`);
      }

      alineResponse = await alineResponseRequest.json();
    } catch (error) {
      console.error("[ZAPI-UNIFIED] Falha no aline-reply, usando resposta segura:", error);
      const fallbackContext = await loadAgentFallbackContext(supabase, phone);
      alineResponse = buildSafeAlineFallback(contactName, fallbackContext, messageForAline);
    }

    if (alineResponse.skipped) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: alineResponse.reason,
          message_saved: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const humanMarker = [
      alineResponse.agent,
      alineResponse.node,
      alineResponse.node_tecnico,
      alineResponse.current_node,
      alineResponse.status,
    ].filter(Boolean).join(" ");

    if (/\bhuman\b|human_takeover|human_handoff|acao_humana|ação_humana/i.test(humanMarker)) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/aline-takeover`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            phone,
            action: "auto_forward",
            reason: alineResponse.node_tecnico || alineResponse.node || "Agente solicitou atendimento humano",
            send_intro: false,
          }),
        });
      } catch (takeoverError) {
        console.error("[ZAPI-UNIFIED] Falha ao atribuir vendedor online:", takeoverError);
      }
    }

    const textMessage = alineResponse.mensagem_whatsapp || alineResponse.response || "";
    const products = Array.isArray(alineResponse.produtos) ? alineResponse.produtos : [];
    const mediaItems = Array.isArray(alineResponse.media_items) ? alineResponse.media_items : [];
    const useProductButtons = alineResponse.use_product_buttons === true;
    const postCatalogMessage = alineResponse.mensagem_pos_catalogo || null;
    const actionButtons = Array.isArray(alineResponse.action_buttons) ? alineResponse.action_buttons : [];
    const selectedProduct = alineResponse.produto_selecionado || null;
    const selectedMemory = alineResponse.memoria || {};
    const selectedSku = selectedProduct?.sku || selectedMemory?.produto_sku || null;
    const selectedName = selectedProduct?.name || selectedProduct?.nome || selectedMemory?.produto_nome || null;
    const selectedPrice = selectedProduct?.price ?? selectedProduct?.preco ?? selectedMemory?.produto_preco ?? null;
    const selectedNode = String(alineResponse.node_tecnico || "");
    const selectedProductShouldBeLogged = Boolean(
      selectedSku || selectedName,
    ) && !/^catalogo_/i.test(selectedNode) && !/sem_catalogo|catalogo_sem_produtos/i.test(selectedNode);
    const productInterestShouldBeLogged =
      selectedProductShouldBeLogged ||
      hasProductInterestSignal(messageContent, buttonResponseId || null, catalogSelectionHint || null);

    let textSent = false;
    let productsSent = 0;
    let mediaItemsSent = 0;
    let actionButtonsSent = false;
    let postCatalogSent = false;
    const sequenceLeaseResult = await acquireZapiGovernorLease(supabase, {
      lane: "conversation",
      bypassBurstLimit: true,
    });

    if (!sequenceLeaseResult.lease) {
      throw new Error("Nao foi possivel reservar a fila segura da Z-API.");
    }

    try {
    if (textMessage) {
      const textResult = (
        await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
          sendText(phone, textMessage, ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN),
        )
      ).result;

      if (textResult?.success) {
        textSent = true;

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: textMessage,
          message_type: "text",
          is_from_me: true,
          status: "sent",
          zapi_message_id: textResult?.messageId || null,
        });

        await supabase
          .from("conversations")
          .update({
            last_message: textMessage.substring(0, 100),
            unread_count: 0,
          })
          .eq("id", conversationId);
      } else {
        console.error(
          "[ZAPI-UNIFIED] Falha ao enviar texto:",
          textResult?.error,
        );
      }
    }

    if (products.length > 0) {
      await sleep(500);

      for (let index = 0; index < products.length; index++) {
        const product = products[index];
        const mediaType = product.video_url ? "video" : "image";
        const mediaUrlToSend = product.video_url || product.image_url || null;

        let result:
          | { success: boolean; messageId: string | null; error: unknown }
          | null = null;

        if (useProductButtons && product.force_separate_buttons) {
          if (mediaUrlToSend) {
            result = (
              await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
                sendMedia(
                  phone,
                  mediaType,
                  mediaUrlToSend,
                  product.caption || product.name || "Produto",
                  ZAPI_INSTANCE_ID,
                  ZAPI_TOKEN,
                  ZAPI_CLIENT_TOKEN,
                ),
              )
            ).result;
          } else {
            result = (
              await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
                sendText(
                  phone,
                  product.caption || product.name || "Produto",
                  ZAPI_INSTANCE_ID,
                  ZAPI_TOKEN,
                  ZAPI_CLIENT_TOKEN,
                ),
              )
            ).result;
          }

          if (result?.success) {
            await sleep(350);
            const separateButtons = (
              await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
                sendProductChoiceButtons(
                  phone,
                  product,
                  ZAPI_INSTANCE_ID,
                  ZAPI_TOKEN,
                  ZAPI_CLIENT_TOKEN,
                ),
              )
            ).result;

            if (!separateButtons?.success) {
              console.warn("[ZAPI-UNIFIED] Falha ao enviar botoes separados do produto:", separateButtons?.error);
            }
          }
        } else if (useProductButtons) {
          result = (
            await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
              sendInteractiveProductCard(
                phone,
                product,
                ZAPI_INSTANCE_ID,
                ZAPI_TOKEN,
                ZAPI_CLIENT_TOKEN,
              ),
            )
          ).result;

          if (result?.success && product.force_separate_buttons) {
            await sleep(350);
            const separateButtons = (
              await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
                sendProductChoiceButtons(
                  phone,
                  product,
                  ZAPI_INSTANCE_ID,
                  ZAPI_TOKEN,
                  ZAPI_CLIENT_TOKEN,
                ),
              )
            ).result;

            if (!separateButtons?.success) {
              console.warn("[ZAPI-UNIFIED] Falha ao enviar botoes separados do produto:", separateButtons?.error);
            }
          }

          if (!result?.success && mediaUrlToSend) {
            console.warn("[ZAPI-UNIFIED] Botão falhou, fallback para mídia simples:", result?.error);
            result = (
              await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
                sendMedia(
                  phone,
                  mediaType,
                  mediaUrlToSend,
                  product.caption || product.name || "Produto",
                  ZAPI_INSTANCE_ID,
                  ZAPI_TOKEN,
                  ZAPI_CLIENT_TOKEN,
                ),
              )
            ).result;

            if (result?.success) {
              await sleep(350);
              const buttonFallback = (
                await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
                  sendProductChoiceButtons(
                    phone,
                    product,
                    ZAPI_INSTANCE_ID,
                    ZAPI_TOKEN,
                    ZAPI_CLIENT_TOKEN,
                  ),
                )
              ).result;

              if (!buttonFallback?.success) {
                console.warn("[ZAPI-UNIFIED] Fallback de botões também falhou:", buttonFallback?.error);
              }
            }
          }
        } else if (mediaUrlToSend) {
          result = (
            await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
              sendMedia(
                phone,
                mediaType,
                mediaUrlToSend,
                product.caption || product.name || "Produto",
                ZAPI_INSTANCE_ID,
                ZAPI_TOKEN,
                ZAPI_CLIENT_TOKEN,
              ),
            )
          ).result;
        } else {
          result = (
            await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
              sendText(
                phone,
                product.caption || product.name || "Produto",
                ZAPI_INSTANCE_ID,
                ZAPI_TOKEN,
                ZAPI_CLIENT_TOKEN,
              ),
            )
          ).result;
        }

        if (result?.success) {
          productsSent += 1;

          await supabase.from("messages").insert({
            conversation_id: conversationId,
            content: product.caption || product.name || "Produto",
            message_type: mediaUrlToSend ? mediaType : "text",
            media_url: mediaUrlToSend,
            is_from_me: true,
            status: "sent",
            zapi_message_id: result?.messageId || null,
          });
        } else {
          console.error(`[ZAPI-UNIFIED] Falha ao enviar produto ${index + 1}:`, result?.error);
        }

        if (index < products.length - 1) {
          await sleep(450);
        }
      }
    }

    if (mediaItems.length > 0) {
      await sleep(500);

      for (let index = 0; index < mediaItems.length; index++) {
        const item = mediaItems[index];
        let result:
          | { success: boolean; messageId: string | null; error: unknown }
          | null = null;

        if (item?.url && (item.type === "image" || item.type === "video")) {
          result = (
            await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
              sendMedia(
                phone,
                item.type,
                item.url,
                item.caption || "",
                ZAPI_INSTANCE_ID,
                ZAPI_TOKEN,
                ZAPI_CLIENT_TOKEN,
              ),
            )
          ).result;
        } else if (item?.caption) {
          result = (
            await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
              sendText(
                phone,
                item.caption,
                ZAPI_INSTANCE_ID,
                ZAPI_TOKEN,
                ZAPI_CLIENT_TOKEN,
              ),
            )
          ).result;
        }

        if (result?.success) {
          mediaItemsSent += 1;

          await supabase.from("messages").insert({
            conversation_id: conversationId,
            content: item.caption || `[${item.type || "media"}]`,
            message_type: item.type || "image",
            media_url: item.url || null,
            is_from_me: true,
            status: "sent",
            zapi_message_id: result?.messageId || null,
          });
        } else {
          console.error(`[ZAPI-UNIFIED] Falha ao enviar mídia ${index + 1}:`, result?.error);
        }

        if (index < mediaItems.length - 1) {
          await sleep(450);
        }
      }
    }

    if (actionButtons.length > 0) {
      await sleep(350);

      const buttonResult = (
        await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
          sendActionButtons(
            phone,
            "Escolha uma opção:",
            actionButtons,
            ZAPI_INSTANCE_ID,
            ZAPI_TOKEN,
            ZAPI_CLIENT_TOKEN,
          ),
        )
      ).result;

      if (buttonResult?.success) {
        actionButtonsSent = true;

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: "Escolha uma opção:",
          message_type: "button_list",
          is_from_me: true,
          status: "sent",
          zapi_message_id: buttonResult?.messageId || null,
        });
      } else {
        console.warn("[ZAPI-UNIFIED] Falha ao enviar botões de ação:", buttonResult?.error);
      }
    }

    if ((productsSent > 0 || mediaItemsSent > 0) && postCatalogMessage) {
      await sleep(500);

      const postResult = (
        await sendWithGovernorLease(sequenceLeaseResult.lease, () =>
          sendText(
            phone,
            postCatalogMessage,
            ZAPI_INSTANCE_ID,
            ZAPI_TOKEN,
            ZAPI_CLIENT_TOKEN,
          ),
        )
      ).result;

      if (postResult?.success) {
        postCatalogSent = true;

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: postCatalogMessage,
          message_type: "text",
          is_from_me: true,
          status: "sent",
          zapi_message_id: postResult?.messageId || null,
        });

        await supabase
          .from("conversations")
          .update({
            last_message: postCatalogMessage.substring(0, 100),
            unread_count: 0,
          })
          .eq("id", conversationId);
      }
    }
    } finally {
      await releaseZapiGovernorLease(sequenceLeaseResult.lease);
    }

    if (productInterestShouldBeLogged) {
      try {
        if (selectedProductShouldBeLogged) {
          await supabase.from("conversation_state").upsert(
            {
              phone,
              selected_sku: selectedSku,
              selected_name: selectedName,
              selected_price: coerceSelectedPrice(selectedPrice),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "phone" },
          );
        }

        const note = buildProductInterestNote({
          selectedSku,
          selectedName,
          selectedPrice,
          customerMessage: messageContent || buttonResponseLabel || buttonResponseId || catalogSelectionHint || "",
        });
        const { data: lastNote } = await supabase
          .from("messages")
          .select("id, content")
          .eq("conversation_id", conversationId)
          .eq("message_type", "internal_note")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastNote?.content !== note) {
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            content: note,
            message_type: "internal_note",
            is_from_me: false,
            status: "internal",
          });
        }
      } catch (error) {
        console.warn("[ZAPI-UNIFIED] Aviso ao salvar produto escolhido para o vendedor:", error);
      }
    }
    if (productsSent > 0) {
      try {
        const { data: sessionId } = await supabase.rpc("create_catalog_session", {
          p_phone: phone,
          p_thread_id: alineResponse.thread_id || null,
          p_categoria: alineResponse.categoria_crm || null,
          p_tipo_alianca: alineResponse.memoria?.finalidade || null,
          p_cor_preferida: alineResponse.cor_crm || null,
        });

        if (sessionId) {
          for (const product of products.slice(0, productsSent)) {
            await supabase.rpc("add_catalog_item", {
              p_session_id: sessionId,
              p_sku: product.sku || null,
              p_name: product.name || null,
              p_price: product.price || null,
              p_image_url: product.image_url || null,
              p_video_url: product.video_url || null,
            });
          }

          await supabase.from("conversation_state").upsert(
            {
              phone,
              last_catalog_session_id: sessionId,
              selected_sku: null,
              selected_name: null,
              selected_price: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "phone" },
          );
        }
      } catch (error) {
        console.warn("[ZAPI-UNIFIED] Aviso ao salvar sessão de catálogo:", error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        conversation_id: conversationId,
        text_sent: textSent,
        products_sent: productsSent,
        media_items_sent: mediaItemsSent,
        action_buttons_sent: actionButtonsSent,
        post_catalog_sent: postCatalogSent,
        aline_node: alineResponse.node_tecnico,
        use_product_buttons: useProductButtons,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[ZAPI-UNIFIED] ERRO:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
