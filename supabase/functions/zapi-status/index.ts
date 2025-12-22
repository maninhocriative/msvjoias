import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID");
    const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN");
    const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN");

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      return new Response(
        JSON.stringify({ error: "ZAPI credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Checking ZAPI status...");
    console.log("Instance ID:", ZAPI_INSTANCE_ID);
    console.log("Token:", ZAPI_TOKEN);
    console.log("Client-Token configured:", !!ZAPI_CLIENT_TOKEN);

    // Verificar status da conexão
    const statusEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/status`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (ZAPI_CLIENT_TOKEN) {
      headers["Client-Token"] = ZAPI_CLIENT_TOKEN;
    }

    const statusResponse = await fetch(statusEndpoint, {
      method: "GET",
      headers,
    });

    const statusResult = await statusResponse.json();
    console.log("Status response:", JSON.stringify(statusResult));

    // Verificar informações da instância
    const instanceEndpoint = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/me`;
    
    const instanceResponse = await fetch(instanceEndpoint, {
      method: "GET",
      headers,
    });

    const instanceResult = await instanceResponse.json();
    console.log("Instance info:", JSON.stringify(instanceResult));

    return new Response(
      JSON.stringify({
        status: statusResult,
        instance: instanceResult,
        config: {
          instance_id: ZAPI_INSTANCE_ID,
          token: ZAPI_TOKEN,
          client_token_configured: !!ZAPI_CLIENT_TOKEN,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
