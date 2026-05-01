export const proxyCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function forwardToZapiUnified(args: {
  body: unknown;
  logPrefix: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}) {
  const { body, logPrefix, supabaseUrl, supabaseServiceKey } = args;

  console.log(`[${logPrefix}] Encaminhando payload para zapi-unified`);

  const response = await fetch(`${supabaseUrl}/functions/v1/zapi-unified`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();

  console.log(`[${logPrefix}] Resposta do zapi-unified (${response.status})`);

  return new Response(responseText, {
    status: response.status,
    headers: { ...proxyCorsHeaders, "Content-Type": "application/json" },
  });
}
