export type NormalizedMediaType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "button"
  | "list"
  | "reaction"
  | "deleted"
  | "edited"
  | "unknown";

export type SourcePlatform = "whatsapp" | "instagram" | "unknown";

export type ExternalReferenceType = "ig_reel" | "ig_post" | "ig_story" | "link" | null;

export interface NormalizedInboundV2 {
  phone: string;
  contactName: string | null;
  sourcePlatform: SourcePlatform;
  rawMessageId: string | null;
  isFromMe: boolean;
  text: string;
  normalizedText: string;
  normalizedTextForAgent: string;
  media: {
    type: NormalizedMediaType;
    url: string | null;
    caption: string | null;
    fileName: string | null;
    mimeType: string | null;
  };
  button: {
    id: string | null;
    label: string | null;
  };
  externalReferenceType: ExternalReferenceType;
  productSignals: string[];
  operationalQuestions: string[];
  commerceSignals: string[];
  safetySignals: string[];
  handoffSignals: string[];
  shouldAccumulate: boolean;
  canAutoReply: boolean;
  raw: Record<string, unknown>;
}

function valueAtPath(value: any, path: string): unknown {
  return path.split(".").reduce((acc, key) => acc && typeof acc === "object" ? acc[key] : undefined, value);
}

function firstString(raw: any, paths: string[]): string {
  for (const path of paths) {
    const value = valueAtPath(raw, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstBoolean(raw: any, paths: string[]): boolean {
  return paths.some((path) => valueAtPath(raw, path) === true);
}

export function normalizeTextV2(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(value: string): string {
  return String(value || "")
    .replace(/@c\.us|@g\.us/gi, "")
    .replace(/[^\d]/g, "");
}

function detectPlatform(raw: any, text: string): SourcePlatform {
  const explicit = normalizeTextV2(firstString(raw, ["platform", "source", "channel"]));
  const combined = normalizeTextV2([
    explicit,
    text,
    firstString(raw, ["type", "event", "messageType", "message_type"]),
  ].join(" "));

  if (/instagram|ig_|ig reel|ig post|ig story|\[ig_/.test(combined)) return "instagram";
  if (/whatsapp|zapi|z-api/.test(combined)) return "whatsapp";
  return "whatsapp";
}

function detectExternalReference(text: string, raw: any): ExternalReferenceType {
  const normalized = normalizeTextV2([
    text,
    firstString(raw, ["message", "body", "content", "type", "event", "messageType", "message_type"]),
  ].join(" "));

  if (/\[ig_reel\]|ig_reel|instagram.*reel|\/reel\//.test(normalized)) return "ig_reel";
  if (/\[ig_story\]|ig_story|instagram.*stor/.test(normalized)) return "ig_story";
  if (/\[ig_post\]|ig_post|instagram.*post|\/p\//.test(normalized)) return "ig_post";
  if (/https?:\/\//.test(String(text || ""))) return "link";
  return null;
}

function detectMedia(raw: any, text: string): NormalizedInboundV2["media"] {
  const declared = normalizeTextV2(firstString(raw, ["message_type", "messageType", "type"]));
  const imageUrl = firstString(raw, ["image.imageUrl", "image.url", "image.mediaUrl", "imageUrl", "media_url", "mediaUrl"]);
  const videoUrl = firstString(raw, ["video.videoUrl", "video.url", "video.mediaUrl", "videoUrl"]);
  const audioUrl = firstString(raw, ["audio.audioUrl", "audio.url", "audio.mediaUrl", "audioUrl"]);
  const documentUrl = firstString(raw, ["document.documentUrl", "document.url", "document.mediaUrl", "documentUrl"]);
  const stickerUrl = firstString(raw, ["sticker.stickerUrl", "sticker.url", "sticker.mediaUrl", "stickerUrl"]);
  const genericUrl = firstString(raw, ["media_url", "mediaUrl", "url"]);
  const caption = firstString(raw, ["image.caption", "video.caption", "caption"]);
  const fileName = firstString(raw, ["document.fileName", "document.filename", "fileName", "file_name"]);
  const mimeType = firstString(raw, ["mimeType", "mime_type", "document.mimeType", "image.mimeType", "video.mimeType", "audio.mimeType"]);

  if (audioUrl || declared === "audio") return { type: "audio", url: audioUrl || genericUrl || null, caption: caption || null, fileName: fileName || null, mimeType: mimeType || null };
  if (imageUrl || declared === "image") return { type: "image", url: imageUrl || genericUrl || null, caption: caption || null, fileName: fileName || null, mimeType: mimeType || null };
  if (videoUrl || declared === "video") return { type: "video", url: videoUrl || genericUrl || null, caption: caption || null, fileName: fileName || null, mimeType: mimeType || null };
  if (documentUrl || declared === "document") return { type: "document", url: documentUrl || genericUrl || null, caption: caption || null, fileName: fileName || null, mimeType: mimeType || null };
  if (stickerUrl || declared === "sticker") return { type: "sticker", url: stickerUrl || genericUrl || null, caption: caption || null, fileName: fileName || null, mimeType: mimeType || null };
  if (raw?.location || declared === "location") return { type: "location", url: null, caption: null, fileName: null, mimeType: null };
  if (raw?.contact || raw?.contacts || declared === "contact") return { type: "contact", url: null, caption: null, fileName: null, mimeType: null };
  if (raw?.reaction || declared === "reaction") return { type: "reaction", url: null, caption: null, fileName: null, mimeType: null };
  if (/deleted|revoked|apagada|deletada/.test(declared)) return { type: "deleted", url: null, caption: null, fileName: null, mimeType: null };
  if (/edited|editada/.test(declared)) return { type: "edited", url: null, caption: null, fileName: null, mimeType: null };

  const urlMatch = String(text || "").match(/https?:\/\/\S+/);
  if (urlMatch) {
    const url = urlMatch[0];
    const lower = url.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|gif)(?:$|[?#])/.test(lower)) return { type: "image", url, caption: null, fileName: null, mimeType: null };
    if (/\.(mp4|mov|webm|m4v)(?:$|[?#])/.test(lower)) return { type: "video", url, caption: null, fileName: null, mimeType: null };
    if (/\.(mp3|ogg|opus|wav|m4a|aac|amr)(?:$|[?#])/.test(lower)) return { type: "audio", url, caption: null, fileName: null, mimeType: null };
    if (/\.(pdf|doc|docx|xls|xlsx|txt|zip)(?:$|[?#])/.test(lower)) return { type: "document", url, caption: null, fileName: fileName || null, mimeType: null };
  }

  return { type: "text", url: null, caption: null, fileName: null, mimeType: null };
}

function collectSignals(normalized: string, mediaType: NormalizedMediaType) {
  const productSignals: string[] = [];
  const operationalQuestions: string[] = [];
  const commerceSignals: string[] = [];
  const safetySignals: string[] = [];
  const handoffSignals: string[] = [];

  if (/alianc|anel|aneis|tungsten/.test(normalized)) productSignals.push("aliancas");
  if (/pingente|medalh|fotograv|foto no pingente/.test(normalized)) productSignals.push("pingente");
  if (/oculos|oculo|armacao|lente/.test(normalized)) productSignals.push("oculos");
  if (/chaveiro|pulseira|brinco|colar|tornozeleira/.test(normalized)) productSignals.push("acessorio");

  if (/endere[cç]o|onde fica|localiza|shopping|sumauma|loja fica|nome da loja/.test(normalized)) operationalQuestions.push("endereco");
  if (/ouro|banhad|folhead|material|aco|inox|tungsten|escurece|desbota|garantia/.test(normalized)) operationalQuestions.push("material");
  if (/prazo|quando fica pronto|demora|entrega|delivery|retirada/.test(normalized)) operationalQuestions.push("prazo_entrega");
  if (/pix|cartao|credito|debito|crediario|bemol|parcela|pagamento/.test(normalized)) operationalQuestions.push("pagamento");
  if (/catalogo|modelo|modelos|opcoes|mostra|mostrar|tem mais/.test(normalized)) commerceSignals.push("catalogo");
  if (/valor|preco|quanto|orcamento/.test(normalized)) commerceSignals.push("preco");
  if (/quero este|quero esse|quero esta|quero essa|gostei|vou querer|comprar|fechar/.test(normalized)) commerceSignals.push("escolha_produto");

  if (/pelad|nude|sexo|buceta|piroca|assedi/.test(normalized)) safetySignals.push("assedio");
  if (mediaType === "audio" && /\[?audio recebido\]?/.test(normalized)) safetySignals.push("audio_sem_transcricao");
  if (/comprovante|paguei|fiz o pix|recibo/.test(normalized) || mediaType === "document") handoffSignals.push("comprovante_ou_documento");
  if (/humano|atendente|vendedor|vendedora|falar com alguem/.test(normalized)) handoffSignals.push("pedido_humano");

  return { productSignals, operationalQuestions, commerceSignals, safetySignals, handoffSignals };
}

export function normalizeInboundV2(rawPayload: Record<string, unknown>): NormalizedInboundV2 {
  const raw = rawPayload || {};
  const text = firstString(raw, [
    "text.message",
    "message",
    "body",
    "content",
    "prompt",
    "messageText",
    "buttonResponse.message",
    "buttonsResponseMessage.message",
  ]);
  const media = detectMedia(raw, text);
  const caption = media.caption || "";
  const textWithCaption = [text, caption].filter(Boolean).join("\n").trim();
  const normalizedText = normalizeTextV2(textWithCaption);
  const externalReferenceType = detectExternalReference(textWithCaption, raw);
  const platform = detectPlatform(raw, textWithCaption);
  const signals = collectSignals(normalizedText, media.type);
  const buttonId = firstString(raw, ["buttonResponseId", "buttonId", "listResponseId", "buttonResponse.buttonId", "buttonsResponseMessage.buttonId"]);
  const buttonLabel = firstString(raw, ["buttonResponseLabel", "button_response_label", "buttonResponse.message", "buttonsResponseMessage.message"]);
  const phone = normalizePhone(firstString(raw, ["phone", "text.phone", "contact_number", "contactNumber", "from", "remoteJid", "chatId"]));
  const contactName = firstString(raw, ["senderName", "pushName", "contact_name", "contactName", "nome_contato", "customer_name", "text.senderName"]) || null;
  const isFromMe = firstBoolean(raw, ["isFromMe", "fromMe", "is_from_me", "from_me"]);
  const rawMessageId = firstString(raw, ["messageId", "message_id", "zaapId", "zaap_id", "id"]) || null;
  const hasMeaningfulText = normalizedText.length > 0 && !/^\[(ig_reel|ig_post|ig_story|imagem|video|audio|documento).*\]$/.test(normalizedText);
  const needsClarificationForExternal = !!externalReferenceType && !hasMeaningfulText && !media.url;

  return {
    phone,
    contactName,
    sourcePlatform: platform,
    rawMessageId,
    isFromMe,
    text: textWithCaption,
    normalizedText,
    normalizedTextForAgent: needsClarificationForExternal
      ? "Recebi uma referencia externa sem conteudo legivel. Pergunte ao cliente qual produto ou peca ele quer ver."
      : textWithCaption,
    media,
    button: {
      id: buttonId || null,
      label: buttonLabel || null,
    },
    externalReferenceType,
    ...signals,
    shouldAccumulate: !isFromMe && !signals.safetySignals.includes("assedio") && media.type !== "deleted" && media.type !== "reaction",
    canAutoReply: !isFromMe && !signals.safetySignals.includes("assedio") && media.type !== "deleted" && media.type !== "reaction",
    raw,
  };
}

