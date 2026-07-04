export const API_URL = import.meta.env.VITE_API_URL ?? "https://acium-sales-ai-api.thiagotaz2005.workers.dev";

export type DashboardMetrics = {
  salesTodayCents: number;
  openConversations: number;
  waitingHuman: number;
  aiActive: number;
  paymentPending: number;
  orderPending: number;
  followupActive: number;
  handoffRate: number;
};

export type Conversation = {
  id: string;
  customer_ref: string | null;
  channel: string;
  channel_customer_id: string | null;
  customer_name: string | null;
  customer_avatar_url: string | null;
  current_agent: string | null;
  stage: string | null;
  status: string | null;
  human_takeover: number | null;
  human_required: number | null;
  automation_paused: number | null;
  assigned_queue: string | null;
  handoff_priority: string | null;
  handoff_summary: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  next_followup_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  channel: string;
  direction: "inbound" | "outbound" | string;
  sender_type: string;
  sender_id: string | null;
  agent_name: string | null;
  body: string | null;
  message_type: string;
  media_url: string | null;
  media_mime_type: string | null;
  media_storage_key: string | null;
  status: string | null;
  created_at: string;
};

export async function fetchDashboard(): Promise<DashboardMetrics> {
  const response = await fetch(`${API_URL}/dashboard`);
  if (!response.ok) throw new Error("Failed to load dashboard");
  return response.json();
}

export async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch(`${API_URL}/conversations`);
  if (!response.ok) throw new Error("Failed to load conversations");
  const data = (await response.json()) as { conversations: Conversation[] };
  return data.conversations;
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const response = await fetch(`${API_URL}/conversations/${encodeURIComponent(conversationId)}/messages`);
  if (!response.ok) throw new Error("Failed to load messages");
  const data = (await response.json()) as { messages: Message[] };
  return data.messages;
}
