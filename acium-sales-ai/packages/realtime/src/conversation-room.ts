import type { RealtimeEvent } from "./events";

export class ConversationRoom implements DurableObject {
  private sessions = new Set<WebSocket>();

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method === "POST") {
      const event = (await request.json()) as RealtimeEvent;
      this.broadcast(event);
      return Response.json({ ok: true });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private handleSession(socket: WebSocket) {
    socket.accept();
    this.sessions.add(socket);

    socket.addEventListener("message", (event) => {
      const data = safeJson(event.data);
      if (data) this.broadcast(data as RealtimeEvent, socket);
    });

    socket.addEventListener("close", () => this.sessions.delete(socket));
    socket.addEventListener("error", () => this.sessions.delete(socket));
  }

  private broadcast(event: RealtimeEvent, except?: WebSocket) {
    const payload = JSON.stringify(event);
    for (const socket of this.sessions) {
      if (socket !== except) socket.send(payload);
    }
  }
}

function safeJson(data: unknown): unknown | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
