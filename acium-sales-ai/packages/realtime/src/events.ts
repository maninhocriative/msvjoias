export type RealtimeEvent =
  | { type: "message.created"; conversationId: string; payload: unknown }
  | { type: "message.status"; conversationId: string; payload: unknown }
  | { type: "typing.updated"; conversationId: string; payload: unknown }
  | { type: "presence.updated"; conversationId: string; payload: unknown }
  | { type: "handoff.updated"; conversationId: string; payload: unknown }
  | { type: "followup.scheduled"; conversationId: string; payload: unknown };
