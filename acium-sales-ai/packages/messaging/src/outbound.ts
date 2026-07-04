import type { Channel, OutboxStatus } from "@acium/shared";

export type OutboundMessageInput = {
  conversationId: string;
  channel: Channel;
  toChannelCustomerId: string;
  messageType: "text" | "image" | "video" | "audio" | "document";
  body?: string;
  payload?: Record<string, unknown>;
  scheduledFor?: string;
};

export type OutboxMessage = OutboundMessageInput & {
  id: string;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};

export function createOutboxMessage(input: OutboundMessageInput, id = crypto.randomUUID()): OutboxMessage {
  const now = new Date().toISOString();
  return {
    ...input,
    id,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now
  };
}
