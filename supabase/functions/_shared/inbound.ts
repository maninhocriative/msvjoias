// Ingestao de mensagens (Fase 1 da refatoracao): funcoes puras de normalizacao
// de payload e deteccao de midia, extraidas do zapi-unified para separar a
// camada de ingestao da orquestracao. Sem dependencia de Supabase/env/handler.

export interface ZAPIMessage {
  phone?: string;
  contact_number?: string;
  contactNumber?: string;
  contact_name?: string;
  contactName?: string;
  nome_contato?: string;
  customer_name?: string;
  from?: string;
  remoteJid?: string;
  chatId?: string;
  isFromMe?: boolean;
  fromMe?: boolean;
  is_from_me?: boolean;
  from_me?: boolean;
  isEdit?: boolean;
  senderName?: string;
  pushName?: string;
  text?: { phone?: string; message?: string; senderName?: string } | string;
  message?: string;
  body?: string;
  content?: string;
  prompt?: string;
  messageText?: string;
  media_url?: string;
  mediaUrl?: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  documentUrl?: string;
  message_type?: string;
  messageType?: string;
  file_name?: string;
  fileName?: string;
  image?: { imageUrl?: string; url?: string; mediaUrl?: string; caption?: string };
  audio?: { audioUrl?: string; url?: string; mediaUrl?: string };
  video?: { videoUrl?: string; url?: string; mediaUrl?: string; caption?: string };
  document?: { documentUrl?: string; url?: string; mediaUrl?: string; fileName?: string };
  event?: string;
  type?: string;
  status?: string;
  ids?: string[];
  messageId?: string;
  message_id?: string;
  zaapId?: string;
  zaap_id?: string;
  buttonResponseId?: string;
  button_response_id?: string;
  buttonId?: string;
  listResponseId?: string;
  buttonResponseLabel?: string;
  button_response_label?: string;
  buttonResponse?: {
    buttonId?: string;
    message?: string;
  };
  buttonsResponseMessage?: {
    buttonId?: string;
    message?: string;
  };
}

export type InboundMediaType = "image" | "audio" | "video" | "document";

export const MAX_INBOUND_MEDIA_BYTES = 25 * 1024 * 1024;

export function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeUrlForComparison(url: string): string {
  return url.trim().split("?")[0].replace(/\/+$/, "");
}

export function isWhatsAppProfileImageUrl(value: string | null | undefined): boolean {
  const lower = String(value || "").toLowerCase();
  return (
    lower.includes("pps.whatsapp.net") ||
    lower.includes("profilepic") ||
    lower.includes("profile_pic") ||
    lower.includes("profile-picture") ||
    lower.includes("profilephoto") ||
    lower.includes("avatar")
  );
}

export function isMessageContentOnlyMediaUrl(content: string, mediaUrl: string | null): boolean {
  const trimmed = content.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false;

  if (mediaUrl && normalizeUrlForComparison(trimmed) === normalizeUrlForComparison(mediaUrl)) {
    return true;
  }

  const detected = detectMediaUrlFromText(trimmed);
  if (!detected) return false;

  if (mediaUrl && normalizeUrlForComparison(detected.url) === normalizeUrlForComparison(mediaUrl)) {
    return true;
  }

  return trimmed === detected.url || /^https?:\/\/\S+$/i.test(trimmed);
}

export function sanitizeInboundMessageContent(
  content: string,
  mediaUrl: string | null,
  messageType: string,
): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  if (isWhatsAppProfileImageUrl(trimmed)) return "";

  if (["image", "video", "audio", "document"].includes(messageType) && mediaUrl) {
    if (isMessageContentOnlyMediaUrl(trimmed, mediaUrl)) return "";
  }

  if (mediaUrl && normalizeUrlForComparison(trimmed) === normalizeUrlForComparison(mediaUrl)) {
    return "";
  }

  return trimmed;
}

export function hasExplicitInboundMedia(rawPayload: ZAPIMessage): boolean {
  const declaredType = normalizeString(rawPayload.message_type) || normalizeString(rawPayload.messageType);
  return !!(
    rawPayload.image ||
    rawPayload.audio ||
    rawPayload.video ||
    rawPayload.document ||
    ["image", "audio", "video", "document"].includes(declaredType)
  );
}

export function shouldUseNestedMediaUrl(
  rawPayload: ZAPIMessage,
  messageType: string,
  messageContent: string,
  nestedMediaUrl: string,
): boolean {
  if (!nestedMediaUrl) return false;
  if (isWhatsAppProfileImageUrl(nestedMediaUrl)) return false;
  if (hasExplicitInboundMedia(rawPayload)) return true;
  if (normalizeString(rawPayload.imageUrl) || normalizeString(rawPayload.media_url) || normalizeString(rawPayload.mediaUrl)) {
    return true;
  }
  if (messageContent && isMessageContentOnlyMediaUrl(messageContent, nestedMediaUrl)) return true;

  const detectedInContent = messageContent ? detectMediaUrlFromText(messageContent) : null;
  const hasRealTextContent =
    !!messageContent &&
    !detectedInContent &&
    messageContent.replace(/#?ACIUMP[-_\s]?[A-Z0-9]{4,24}/gi, "").trim().length > 0;

  if (hasRealTextContent && messageType === "text") return false;

  return messageType !== "text";
}

export function detectMediaUrlFromText(value: string): { type: InboundMediaType; url: string } | null {
  const url = value.trim();
  if (!/^https?:\/\//i.test(url)) return null;
  if (isWhatsAppProfileImageUrl(url)) return null;

  const lower = url.toLowerCase();
  if (
    /\.(jpg|jpeg|png|webp|gif)(?:$|[?#])/.test(lower) ||
    /temp-file-download\/.*(?:=\.jpg|=\.jpeg|=\.png|=\.webp)/.test(lower)
  ) {
    return { type: "image", url };
  }
  if (/\.(mp4|mov|webm|m4v)(?:$|[?#])/.test(lower)) {
    return { type: "video", url };
  }
  if (/\.(mp3|ogg|oga|opus|wav|m4a|aac|amr|webm)(?:$|[?#])/.test(lower) || /temp-file-download\/.*(?:=\.mp3|=\.ogg|=\.oga|=\.opus|=\.wav|=\.m4a|=\.aac|=\.amr|=\.webm)/.test(lower)) {
    return { type: "audio", url };
  }
  if (/\.(pdf|doc|docx|xls|xlsx|txt|zip)(?:$|[?#])/.test(lower)) {
    return { type: "document", url };
  }

  return null;
}

export function isLikelyMediaUrl(value: string, preferredType?: InboundMediaType): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  if (isWhatsAppProfileImageUrl(value)) return false;

  const detected = detectMediaUrlFromText(value);
  if (detected) return !preferredType || detected.type === preferredType;

  const lower = value.toLowerCase();
  if (preferredType === "audio") return /(audio|voice|ptt|recording|microphone|opus|ogg|m4a|mp3|amr|aac|wav)/.test(lower);
  if (preferredType === "image") return /(image|photo|picture|jpeg|jpg|png|webp|temp-file-download)/.test(lower);
  if (preferredType === "video") return /(video|mp4|mov|webm|m4v)/.test(lower);
  if (preferredType === "document") return /(document|file|pdf|doc|docx|xls|xlsx)/.test(lower);

  return /(temp-file-download|media|file|download|backblazeb2)/.test(lower);
}

export function inferMediaExtension(mediaUrl: string, contentType: string, messageType: string): string {
  const lowerUrl = mediaUrl.toLowerCase();
  const lowerType = contentType.toLowerCase();
  const fromUrl = lowerUrl.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i)?.[1];
  if (fromUrl) return fromUrl === "jpeg" ? "jpg" : fromUrl;

  if (lowerType.includes("ogg")) return "ogg";
  if (lowerType.includes("mpeg") || lowerType.includes("mp3")) return "mp3";
  if (lowerType.includes("mp4") || lowerType.includes("m4a")) return messageType === "audio" ? "m4a" : "mp4";
  if (lowerType.includes("webm")) return "webm";
  if (lowerType.includes("wav")) return "wav";
  if (lowerType.includes("amr")) return "amr";
  if (lowerType.includes("aac")) return "aac";
  if (lowerType.includes("png")) return "png";
  if (lowerType.includes("webp")) return "webp";
  if (lowerType.includes("gif")) return "gif";
  if (lowerType.includes("jpeg") || lowerType.includes("jpg")) return "jpg";
  if (lowerType.includes("pdf")) return "pdf";

  if (messageType === "audio") return "ogg";
  if (messageType === "image") return "jpg";
  if (messageType === "video") return "mp4";
  return "bin";
}

export function defaultMediaContentType(messageType: string, extension: string): string {
  if (messageType === "audio") {
    if (extension === "mp3") return "audio/mpeg";
    if (extension === "m4a") return "audio/mp4";
    if (extension === "webm") return "audio/webm";
    if (extension === "wav") return "audio/wav";
    if (extension === "amr") return "audio/amr";
    if (extension === "aac") return "audio/aac";
    return "audio/ogg";
  }
  if (messageType === "image") return extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  if (messageType === "video") return extension === "webm" ? "video/webm" : "video/mp4";
  return "application/octet-stream";
}

export function findNestedString(
  value: unknown,
  predicate: (candidate: string) => boolean,
  maxDepth = 5,
): string | null {
  if (maxDepth < 0 || value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && predicate(trimmed) ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findNestedString(item, predicate, maxDepth - 1);
      if (match) return match;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const match = findNestedString(nestedValue, predicate, maxDepth - 1);
      if (match) return match;
    }
  }

  return null;
}

export function normalizeInboundPayload(rawPayload: ZAPIMessage): ZAPIMessage {
  const payload: ZAPIMessage = { ...rawPayload };

  const directText =
    typeof rawPayload.text === "string"
      ? normalizeString(rawPayload.text)
      : normalizeString(rawPayload.text?.message);
  const messageContent =
    normalizeString(rawPayload.message) ||
    directText ||
    normalizeString(rawPayload.body) ||
    normalizeString(rawPayload.content) ||
    normalizeString(rawPayload.prompt) ||
    normalizeString(rawPayload.messageText);
  const phoneCandidate =
    normalizeString(rawPayload.phone) ||
    normalizeString(rawPayload.contact_number) ||
    normalizeString(rawPayload.contactNumber) ||
    normalizeString(rawPayload.from) ||
    normalizeString(rawPayload.remoteJid) ||
    normalizeString(rawPayload.chatId) ||
    (typeof rawPayload.text === "object" ? normalizeString(rawPayload.text?.phone) : "") ||
    (findNestedString(rawPayload, (candidate) => /^\+?\d{10,15}(?:@[cg]\.us)?$/.test(candidate)) || "");
  const senderName =
    normalizeString(rawPayload.senderName) ||
    normalizeString(rawPayload.pushName) ||
    normalizeString(rawPayload.contact_name) ||
    normalizeString(rawPayload.contactName) ||
    normalizeString(rawPayload.nome_contato) ||
    normalizeString(rawPayload.customer_name) ||
    (typeof rawPayload.text === "object" ? normalizeString(rawPayload.text?.senderName) : "");
  let messageType =
    normalizeString(rawPayload.message_type) ||
    normalizeString(rawPayload.messageType) ||
    "text";
  const preferredMediaType = ["image", "audio", "video", "document"].includes(messageType)
    ? (messageType as InboundMediaType)
    : undefined;
  const explicitMediaUrl =
    normalizeString(rawPayload.media_url) ||
    normalizeString(rawPayload.mediaUrl) ||
    normalizeString(rawPayload.imageUrl) ||
    normalizeString(rawPayload.audioUrl) ||
    normalizeString(rawPayload.videoUrl) ||
    normalizeString(rawPayload.documentUrl) ||
    normalizeString(rawPayload.image?.imageUrl) ||
    normalizeString(rawPayload.image?.url) ||
    normalizeString(rawPayload.image?.mediaUrl) ||
    normalizeString(rawPayload.audio?.audioUrl) ||
    normalizeString(rawPayload.audio?.url) ||
    normalizeString(rawPayload.audio?.mediaUrl) ||
    normalizeString(rawPayload.video?.videoUrl) ||
    normalizeString(rawPayload.video?.url) ||
    normalizeString(rawPayload.video?.mediaUrl) ||
    normalizeString(rawPayload.document?.documentUrl) ||
    normalizeString(rawPayload.document?.url) ||
    normalizeString(rawPayload.document?.mediaUrl) ||
    "";
  const nestedMediaUrl =
    findNestedString(rawPayload, (candidate) => isLikelyMediaUrl(candidate, preferredMediaType), 6) ||
    findNestedString(rawPayload, (candidate) => isLikelyMediaUrl(candidate), 6) ||
    "";
  const mediaUrl =
    (isWhatsAppProfileImageUrl(explicitMediaUrl) ? "" : explicitMediaUrl) ||
    (shouldUseNestedMediaUrl(rawPayload, messageType, messageContent, nestedMediaUrl) ? nestedMediaUrl : "");
  if (messageType === "text" && mediaUrl) {
    const inferredMediaType =
      rawPayload.audio || normalizeString(rawPayload.audioUrl) || isLikelyMediaUrl(mediaUrl, "audio")
        ? "audio"
        : rawPayload.image || normalizeString(rawPayload.imageUrl) || isLikelyMediaUrl(mediaUrl, "image")
          ? "image"
          : rawPayload.video || normalizeString(rawPayload.videoUrl) || isLikelyMediaUrl(mediaUrl, "video")
            ? "video"
            : rawPayload.document || normalizeString(rawPayload.documentUrl) || isLikelyMediaUrl(mediaUrl, "document")
              ? "document"
              : detectMediaUrlFromText(mediaUrl)?.type || "text";
    messageType = inferredMediaType;
  }
  payload.message_type = messageType;
  payload.messageType = messageType;
  const fileName =
    normalizeString(rawPayload.file_name) ||
    normalizeString(rawPayload.fileName);
  const buttonResponseId =
    normalizeString(rawPayload.buttonResponseId) ||
    normalizeString(rawPayload.button_response_id) ||
    normalizeString(rawPayload.buttonId) ||
    normalizeString(rawPayload.listResponseId);
  const buttonResponseLabel =
    normalizeString(rawPayload.buttonResponseLabel) ||
    normalizeString(rawPayload.button_response_label);

  if (!payload.phone && phoneCandidate) payload.phone = phoneCandidate;
  if (!payload.senderName && senderName) payload.senderName = senderName;
  if (!payload.pushName && senderName) payload.pushName = senderName;

  payload.text = {
    phone: payload.phone || phoneCandidate || undefined,
    message: messageContent || undefined,
    senderName: senderName || undefined,
  };

  if (!payload.message && messageContent) payload.message = messageContent;
  if (payload.fromMe === undefined && rawPayload.from_me !== undefined) payload.fromMe = !!rawPayload.from_me;
  if (payload.isFromMe === undefined && rawPayload.is_from_me !== undefined) payload.isFromMe = !!rawPayload.is_from_me;
  if (!payload.messageId) payload.messageId = normalizeString(rawPayload.message_id) || normalizeString((rawPayload as Record<string, unknown>).id);
  if (!payload.zaapId) payload.zaapId = normalizeString(rawPayload.zaap_id);
  if (!payload.buttonResponseId && buttonResponseId) payload.buttonResponseId = buttonResponseId;
  if (!payload.buttonResponse && (buttonResponseId || buttonResponseLabel)) {
    payload.buttonResponse = {
      buttonId: buttonResponseId || undefined,
      message: buttonResponseLabel || undefined,
    };
  }

  if (mediaUrl && !payload.image && !payload.audio && !payload.video && !payload.document) {
    const inferredMedia = detectMediaUrlFromText(mediaUrl);
    const effectiveMessageType = inferredMedia?.type || messageType;

    if (effectiveMessageType === "image") {
      payload.image = { imageUrl: mediaUrl, caption: messageContent || undefined };
    } else if (effectiveMessageType === "audio") {
      payload.audio = { audioUrl: mediaUrl };
    } else if (effectiveMessageType === "video") {
      payload.video = { videoUrl: mediaUrl, caption: messageContent || undefined };
    } else if (effectiveMessageType === "document") {
      payload.document = { documentUrl: mediaUrl, fileName: fileName || undefined };
    }
  }

  return payload;
}
