import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let p = raw.replace(/\D/g, "");
  if (p.length === 0) return null;
  p = p.replace(/^0+/, "");
  if (!p.startsWith("55") && p.length <= 11) p = "55" + p;
  if (p.length < 12) return null;
  return p;
}

function normalizeName(raw: string): string {
  if (!raw || raw.trim() === "") return "Lead";
  return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function detectColumn(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const found = headers.find((h) =>
      h.toLowerCase().replace(/[\s_\-]/g, "").includes(c.toLowerCase())
    );
    if (found) return found;
  }
  return null;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitLine(lines[0]);
  return lines.slice(1)
    .filter((l) => l.trim())
    .map((l) => {
      const vals = splitLine(l);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
      return obj;
    });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let sheetUrl: string | null = null;

  if (req.method === "POST") {
    try {
      const body = await req.json();
      sheetUrl = body?.sheet_url || null;
    } catch (_) {}
  }

  if (!sheetUrl) {
    const { data } = await supabase
      .from("store_settings")
      .select("value")
      .eq("key", "facebook_leads_sheet_url")
      .single();
    sheetUrl = data?.value || null;
  }

  if (!sheetUrl) {
    return new Response(
      JSON.stringify({ error: "sheet_url não configurado em store_settings" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let csvUrl = sheetUrl;
  const sheetMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetMatch) {
    const sheetId = sheetMatch[1];
    const gidMatch = sheetUrl.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";
    csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }

  let csvText: string;
  try {
    const resp = await fetch(csvUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    csvText = await resp.text();
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: `Falha ao buscar planilha: ${e.message}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const rows = parseCSV(csvText);
  if (!rows.length) {
    return new Response(
      JSON.stringify({ error: "Planilha vazia ou formato inválido" }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const headers = Object.keys(rows[0]);
  const phoneCol    = detectColumn(headers, ["phone","telefone","whatsapp","celular","mobile","fone","numero"]);
  const nameCol     = detectColumn(headers, ["name","nome","fullname","contactname","cliente"]);
  const campaignCol = detectColumn(headers, ["campaignname","campaign","campanha","adname","anuncio"]);

  const results = {
    total: rows.length,
    imported: 0,
    skipped: 0,
    errors: 0,
    details: [] as string[],
    ran_at: new Date().toISOString(),
  };

  for (const row of rows) {
    const rawPhone = phoneCol ? row[phoneCol] : null;
    const phone    = normalizePhone(rawPhone || "");
    const name     = normalizeName(nameCol ? row[nameCol] : "");
    const campaign = campaignCol ? row[campaignCol] : "";

    if (!phone) {
      results.skipped++;
      results.details.push(`SKIP: "${name}" — telefone inválido (${rawPhone})`);
      continue;
    }

    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_number", phone)
      .maybeSingle();

    if (existing) {
      results.skipped++;
      results.details.push(`SKIP: ${name} (${phone}) — já existe no CRM`);
      continue;
    }

    const { error } = await supabase.from("conversations").insert({
      contact_number:  phone,
      contact_name:    name,
      platform:        "whatsapp",
      lead_status:     "novo",
      last_message:    campaign ? `Lead via campanha: ${campaign}` : "Lead importado do Facebook Ads",
      last_message_at: new Date().toISOString(),
      unread_count:    1,
    });

    if (error) {
      results.errors++;
      results.details.push(`ERRO: ${name} (${phone}) — ${error.message}`);
    } else {
      results.imported++;
      results.details.push(`OK: ${name} (${phone})`);
    }
  }

  await supabase.from("store_settings").upsert({
    key: "facebook_leads_last_import",
    value: JSON.stringify(results),
    description: "Último resultado da importação de leads Facebook",
  }, { onConflict: "key" });

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
