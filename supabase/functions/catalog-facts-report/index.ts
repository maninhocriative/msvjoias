import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseBooleanParam(value: string | null): boolean | null {
  if (value === null || value === "") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "sim"].includes(normalized)) return true;
  if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
  return null;
}

function incrementCounter(map: Record<string, number>, key: string | null | undefined): void {
  const safeKey = key && key.trim() ? key.trim() : "sem_valor";
  map[safeKey] = (map[safeKey] || 0) + 1;
}

function splitReviewReasons(value: string | null | undefined): string[] {
  if (!value) return ["sem_motivo"];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const rawLimit = body.limit ?? url.searchParams.get("limit") ?? 100;
    const limit = Math.min(Math.max(Number(rawLimit) || 100, 1), 500);
    const needsReview = parseBooleanParam(String(body.needs_review ?? url.searchParams.get("needs_review") ?? ""));
    const agentLine = body.agent_line ?? url.searchParams.get("agent_line");
    const category = body.category ?? url.searchParams.get("category");
    const color = body.color ?? url.searchParams.get("color");

    let query = supabase
      .from("catalog_product_facts")
      .select(`
        id,
        product_id,
        agent_line,
        normalized_category,
        normalized_subcategory,
        normalized_color,
        material,
        finish,
        stock_total,
        auto_catalog_enabled,
        needs_review,
        review_reason,
        updated_at,
        products (
          id,
          sku,
          name,
          price,
          image_url,
          video_url,
          active
        )
      `)
      .order("needs_review", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (needsReview !== null) query = query.eq("needs_review", needsReview);
    if (agentLine) query = query.eq("agent_line", String(agentLine).toLowerCase());
    if (category) query = query.eq("normalized_category", String(category).toLowerCase());
    if (color) query = query.eq("normalized_color", String(color).toLowerCase());

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const byReason: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byAgentLine: Record<string, number> = {};
    const byColor: Record<string, number> = {};

    const items = rows.map((row: any) => {
      for (const reason of splitReviewReasons(row.review_reason)) {
        incrementCounter(byReason, reason);
      }
      incrementCounter(byCategory, row.normalized_category);
      incrementCounter(byAgentLine, row.agent_line);
      incrementCounter(byColor, row.normalized_color);

      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      return {
        fact_id: row.id,
        product_id: row.product_id,
        sku: product?.sku ?? null,
        name: product?.name ?? null,
        price: product?.price ?? null,
        active: product?.active ?? null,
        has_image: Boolean(product?.image_url),
        has_video: Boolean(product?.video_url),
        agent_line: row.agent_line,
        category: row.normalized_category,
        subcategory: row.normalized_subcategory,
        color: row.normalized_color,
        material: row.material,
        finish: row.finish,
        stock_total: row.stock_total,
        auto_catalog_enabled: row.auto_catalog_enabled,
        needs_review: row.needs_review,
        review_reason: row.review_reason,
        updated_at: row.updated_at,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        filters: {
          limit,
          needs_review: needsReview,
          agent_line: agentLine || null,
          category: category || null,
          color: color || null,
        },
        summary: {
          total: rows.length,
          needs_review: rows.filter((row: any) => row.needs_review).length,
          auto_catalog_enabled: rows.filter((row: any) => row.auto_catalog_enabled).length,
          by_reason: byReason,
          by_category: byCategory,
          by_agent_line: byAgentLine,
          by_color: byColor,
        },
        items,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[CATALOG-FACTS-REPORT] erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
