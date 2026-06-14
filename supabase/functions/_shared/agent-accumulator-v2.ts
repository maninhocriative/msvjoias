import type { NormalizedInboundV2 } from "./inbound-normalizer-v2.ts";

export type InboundBatchStatusV2 = "open" | "processing" | "processed" | "cancelled" | "failed";

export interface InboundBatchMessageV2 {
  messageId: string | null;
  text: string;
  normalizedText: string;
  mediaType: NormalizedInboundV2["media"]["type"];
  mediaUrl: string | null;
  externalReferenceType: NormalizedInboundV2["externalReferenceType"];
  receivedAt: string;
}

export interface InboundBatchV2 {
  id?: string;
  phone: string;
  conversationId: string | null;
  status: InboundBatchStatusV2;
  messageCount: number;
  messages: InboundBatchMessageV2[];
  combinedText: string;
  firstMessageAt: string;
  lastMessageAt: string;
  closesAt: string;
}

export interface AccumulatorConfigV2 {
  quietWindowMs: number;
  maxWindowMs: number;
  maxMessages: number;
}

export interface AccumulatorDecisionV2 {
  action: "skip" | "create" | "append" | "close_and_create" | "process_now";
  reason: string;
  shouldProcessNow: boolean;
  closesAt: string | null;
  combinedText: string;
}

export const DEFAULT_ACCUMULATOR_CONFIG_V2: AccumulatorConfigV2 = {
  quietWindowMs: 6_000,
  maxWindowMs: 25_000,
  maxMessages: 8,
};

function toTime(value: string | Date | null | undefined): number {
  if (!value) return Date.now();
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function isoFromMs(value: number): string {
  return new Date(value).toISOString();
}

function compactText(value: string): string {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function buildBatchMessageV2(input: NormalizedInboundV2, receivedAt = new Date()): InboundBatchMessageV2 {
  const text = compactText(input.normalizedTextForAgent || input.text || input.media.caption || "");

  return {
    messageId: input.rawMessageId,
    text,
    normalizedText: input.normalizedText,
    mediaType: input.media.type,
    mediaUrl: input.media.url,
    externalReferenceType: input.externalReferenceType,
    receivedAt: receivedAt.toISOString(),
  };
}

export function combineBatchMessagesV2(messages: InboundBatchMessageV2[]): string {
  return messages
    .map((message) => {
      if (message.text) return message.text;
      if (message.externalReferenceType) return `[${message.externalReferenceType}]`;
      if (message.mediaType !== "text") return `[${message.mediaType}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function shouldProcessBatchV2(
  batch: Pick<InboundBatchV2, "firstMessageAt" | "lastMessageAt" | "messageCount">,
  now = new Date(),
  config: AccumulatorConfigV2 = DEFAULT_ACCUMULATOR_CONFIG_V2,
): boolean {
  const nowMs = toTime(now);
  const firstMs = toTime(batch.firstMessageAt);
  const lastMs = toTime(batch.lastMessageAt);

  if (batch.messageCount >= config.maxMessages) return true;
  if (nowMs - firstMs >= config.maxWindowMs) return true;
  return nowMs - lastMs >= config.quietWindowMs;
}

export function decideAccumulatorV2(args: {
  input: NormalizedInboundV2;
  openBatch?: InboundBatchV2 | null;
  now?: Date;
  config?: AccumulatorConfigV2;
}): AccumulatorDecisionV2 {
  const now = args.now || new Date();
  const config = args.config || DEFAULT_ACCUMULATOR_CONFIG_V2;
  const message = buildBatchMessageV2(args.input, now);

  if (!args.input.shouldAccumulate) {
    return {
      action: "process_now",
      reason: "Mensagem nao deve entrar no acumulador.",
      shouldProcessNow: true,
      closesAt: null,
      combinedText: combineBatchMessagesV2([message]),
    };
  }

  if (!args.openBatch || args.openBatch.status !== "open") {
    return {
      action: "create",
      reason: "Novo lote aberto para aguardar mensagens proximas.",
      shouldProcessNow: false,
      closesAt: isoFromMs(now.getTime() + config.quietWindowMs),
      combinedText: combineBatchMessagesV2([message]),
    };
  }

  const alreadySeen = !!message.messageId &&
    args.openBatch.messages.some((existing) => existing.messageId === message.messageId);

  if (alreadySeen) {
    return {
      action: "skip",
      reason: "Mensagem duplicada dentro do lote aberto.",
      shouldProcessNow: false,
      closesAt: args.openBatch.closesAt,
      combinedText: args.openBatch.combinedText,
    };
  }

  const firstMs = toTime(args.openBatch.firstMessageAt);
  const wouldExceedWindow = now.getTime() - firstMs >= config.maxWindowMs;
  const wouldExceedCount = args.openBatch.messageCount + 1 > config.maxMessages;

  if (wouldExceedWindow || wouldExceedCount) {
    return {
      action: "close_and_create",
      reason: wouldExceedWindow ? "Janela maxima do lote atingida." : "Limite de mensagens do lote atingido.",
      shouldProcessNow: false,
      closesAt: isoFromMs(now.getTime() + config.quietWindowMs),
      combinedText: combineBatchMessagesV2([message]),
    };
  }

  const messages = [...args.openBatch.messages, message];
  return {
    action: "append",
    reason: "Mensagem anexada ao lote aberto.",
    shouldProcessNow: false,
    closesAt: isoFromMs(now.getTime() + config.quietWindowMs),
    combinedText: combineBatchMessagesV2(messages),
  };
}
