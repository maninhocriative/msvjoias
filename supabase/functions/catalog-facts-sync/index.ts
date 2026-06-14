import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCatalogProductFactV2 } from "../_shared/catalog-intelligence-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildSearchableText(product: any, fact: ReturnType<typeof buildCatalogProductFactV2>): string {
  return [
    product.name,
    product.sku,
    product.description,
    product.category,
    product.color,
    product.ai_description,
    product.commercial_notes,
    product.included_items,
    product.restrictions,
    product.recommended_when,
    product.avoid_when,
    fact.normalizedCategory,
    fact.normalizedColor,
    fact.material,
    fact.finish,
    ...(fact.tags || []),
    ...(fact.synonyms || []),
  ]
    .filter(Boolean)
    .join(" ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(Number(body.limit || 200), 500);
    const productId = body.product_id ? String(body.product_id) : null;
    const sku = body.sku ? String(body.sku) : null;

    let query = supabase
      .from("products")
      .select(`
        id,
        sku,
        name,
        description,
        category,
        color,
        price,
        active,
        image_url,
        video_url,
        tags,
        ai_tags,
        search_aliases,
        agent_line,
        ai_description,
        commercial_notes,
        included_items,
        restrictions,
        recommended_when,
        avoid_when,
        product_variants (size, stock)
      `)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (productId) query = query.eq("id", productId);
    if (sku) query = query.eq("sku", sku);

    const { data: products, error } = await query;
    if (error) throw error;

    const rows = (products || []).map((product: any) => {
      const fact = buildCatalogProductFactV2(product);
      return {
        product_id: fact.productId,
        agent_line: fact.agentLine,
        normalized_category: fact.normalizedCategory,
        normalized_subcategory: fact.normalizedSubcategory,
        normalized_color: fact.normalizedColor,
        material: fact.material,
        finish: fact.finish,
        searchable_text: buildSearchableText(product, fact),
        tags: fact.tags,
        aliases: fact.synonyms,
        sizes: fact.sizes,
        stock_total: fact.stockTotal,
        auto_catalog_enabled: fact.autoCatalogEnabled,
        needs_review: fact.needsReview,
        review_reason: fact.reviewReasons.join(",") || null,
        updated_at: new Date().toISOString(),
      };
    }).filter((row: any) => !!row.product_id);

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("catalog_product_facts")
        .upsert(rows, { onConflict: "product_id" });

      if (upsertError) throw upsertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: products?.length || 0,
        upserted: rows.length,
        needs_review: rows.filter((row: any) => row.needs_review).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[CATALOG-FACTS-SYNC] erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

