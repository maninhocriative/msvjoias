import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapAsaasStatusToOrderStatus } from "../_shared/asaas-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

function isPaidStatus(status: string) {
  return ["RECEIVED", "RECEIVED_IN_CASH"].includes(status.toUpperCase());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Metodo nao suportado" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN")?.trim();
    if (webhookToken) {
      const receivedToken = req.headers.get("asaas-access-token")?.trim();
      if (receivedToken !== webhookToken) {
        return new Response(
          JSON.stringify({ error: "Webhook nao autorizado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    const eventType = String(payload.event || "UNKNOWN");
    const payment = payload.payment || {};
    const providerPaymentId = payment.id ? String(payment.id) : null;
    const asaasStatus = payment.status ? String(payment.status) : "";
    const orderStatus = mapAsaasStatusToOrderStatus(asaasStatus || eventType);
    const now = new Date().toISOString();

    const { error: eventError } = await supabase
      .from("payment_webhook_events")
      .upsert(
        {
          provider: "asaas",
          event_type: eventType,
          provider_payment_id: providerPaymentId,
          payload,
          processed_at: now,
        },
        { onConflict: "provider,event_type,provider_payment_id" },
      );

    if (eventError) {
      console.error("[ASAAS-WEBHOOK] Erro ao salvar evento:", eventError);
    }

    if (providerPaymentId) {
      const chargeUpdate: Record<string, unknown> = {
        status: orderStatus,
        raw_response: payload,
        updated_at: now,
      };

      if (payment.invoiceUrl) chargeUpdate.invoice_url = payment.invoiceUrl;
      if (payment.bankSlipUrl) chargeUpdate.bank_slip_url = payment.bankSlipUrl;

      const { data: charge } = await supabase
        .from("payment_charges")
        .update(chargeUpdate)
        .eq("provider", "asaas")
        .eq("provider_payment_id", providerPaymentId)
        .select("order_id")
        .maybeSingle();

      if (charge?.order_id) {
        const orderUpdate: Record<string, unknown> = {
          status: orderStatus,
          updated_at: now,
        };

        if (payment.invoiceUrl) orderUpdate.asaas_invoice_url = payment.invoiceUrl;
        if (payment.bankSlipUrl) orderUpdate.asaas_bank_slip_url = payment.bankSlipUrl;
        if (isPaidStatus(asaasStatus)) orderUpdate.paid_at = payment.paymentDate || now;

        await supabase.from("orders").update(orderUpdate).eq("id", charge.order_id);
      } else {
        const orderUpdate: Record<string, unknown> = {
          status: orderStatus,
          updated_at: now,
        };
        if (isPaidStatus(asaasStatus)) orderUpdate.paid_at = payment.paymentDate || now;

        await supabase
          .from("orders")
          .update(orderUpdate)
          .eq("asaas_payment_id", providerPaymentId);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[ASAAS-WEBHOOK] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
