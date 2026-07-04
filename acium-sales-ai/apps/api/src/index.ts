import { handleMetaWebhookGet, handleMetaWebhookPost } from "./routes/webhooks/meta";
import { processMetaWebhookBatch } from "./queues/meta-webhook";
export { ConversationRoom } from "@acium/realtime";
import type { Env } from "./types";
import { handleConversationMessages, handleConversations } from "./routes/conversations";
import { handleDashboard } from "./routes/dashboard";
import { jsonResponse, optionsResponse } from "./http/cors";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return optionsResponse();
    }

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "acium-sales-ai-api" });
    }

    if (url.pathname === "/dashboard" && request.method === "GET") {
      return handleDashboard(env);
    }

    if (url.pathname === "/conversations" && request.method === "GET") {
      return handleConversations(env);
    }

    const messageMatch = url.pathname.match(/^\/conversations\/([^/]+)\/messages$/);
    if (messageMatch && request.method === "GET") {
      return handleConversationMessages(env, decodeURIComponent(messageMatch[1]));
    }

    if (url.pathname === "/webhooks/meta" && request.method === "GET") {
      return handleMetaWebhookGet(request, env);
    }

    if (url.pathname === "/webhooks/meta" && request.method === "POST") {
      return handleMetaWebhookPost(request, env, ctx);
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  },

  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    await processMetaWebhookBatch(batch, env, ctx);
  }
};
