import { jsonResponse } from "../http/cors";
import type { Env } from "../types";

export async function handleDashboard(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT
      COUNT(*) AS open_conversations,
      SUM(CASE WHEN human_required = 1 THEN 1 ELSE 0 END) AS waiting_human,
      SUM(CASE WHEN automation_paused = 0 AND status = 'ai_active' THEN 1 ELSE 0 END) AS ai_active,
      SUM(CASE WHEN stage = 'payment_pending' THEN 1 ELSE 0 END) AS payment_pending,
      SUM(CASE WHEN stage IN ('order_building', 'order_created') THEN 1 ELSE 0 END) AS order_pending,
      SUM(CASE WHEN next_followup_at IS NOT NULL THEN 1 ELSE 0 END) AS followup_active,
      SUM(CASE WHEN human_takeover = 1 OR human_required = 1 THEN 1 ELSE 0 END) AS handoff_total
     FROM conversations
     WHERE status IS NULL OR status NOT IN ('finished', 'lost')`
  ).first<Record<string, number | null>>();

  const open = Number(row?.open_conversations ?? 0);
  const handoffTotal = Number(row?.handoff_total ?? 0);

  return jsonResponse({
    salesTodayCents: 0,
    openConversations: open,
    waitingHuman: Number(row?.waiting_human ?? 0),
    aiActive: Number(row?.ai_active ?? 0),
    paymentPending: Number(row?.payment_pending ?? 0),
    orderPending: Number(row?.order_pending ?? 0),
    followupActive: Number(row?.followup_active ?? 0),
    handoffRate: open > 0 ? Math.round((handoffTotal / open) * 100) : 0
  });
}
