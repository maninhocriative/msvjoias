import { handleMetaWebhookGet, handleMetaWebhookPost } from "./routes/webhooks/meta";
import { processMetaWebhookBatch } from "./queues/meta-webhook";
export { ConversationRoom } from "@acium/realtime";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "acium-sales-ai-api" });
    }

    if (url.pathname === "/webhooks/meta" && request.method === "GET") {
      return handleMetaWebhookGet(request, env);
    }

    if (url.pathname === "/webhooks/meta" && request.method === "POST") {
      return handleMetaWebhookPost(request, env, ctx);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },

  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    await processMetaWebhookBatch(batch, env, ctx);
  }
};
