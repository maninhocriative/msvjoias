import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createAsaasPayment,
  ensureAsaasCustomer,
  formatPaymentWhatsappMessage,
  getAsaasPixQrCode,
  mapAsaasStatusToOrderStatus,
  type AsaasBillingType,
} from "../_shared/asaas-client.ts";
import { normalizeWhatsappPhone } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toMoney(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

function resolveBillingType(value: unknown): AsaasBillingType | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pix") return "PIX";
  if (normalized === "cartao" || normalized === "cartao_credito" || normalized === "credit_card") {
    return "CREDIT_CARD";
  }
  return null;
}

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + Number(Deno.env.get("ASAAS_DEFAULT_DUE_DAYS") || "1"));
  return date.toISOString().slice(0, 10);
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const orderId = body.order_id || body.orderId || null;
    let order: Record<string, unknown> | null = null;

    if (orderId) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return new Response(
          JSON.stringify({ error: "Pedido nao encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      order = data;
    }

    const phone = normalizeWhatsappPhone(body.phone || order?.customer_phone);
    const customerName = body.customer_name || order?.customer_name || null;
    const amount = toMoney(body.amount || body.total_price || order?.total_price);
    const billingType = resolveBillingType(body.billing_type || body.payment_method || order?.payment_method);
    const dueDate = String(body.due_date || defaultDueDate());
    const description =
      body.description ||
      order?.summary_text ||
      order?.selected_name ||
      `Pedido ACIUM${orderId ? ` ${orderId}` : ""}`;

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "phone e obrigatorio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (amount <= 0) {
      return new Response(
        JSON.stringify({ error: "amount/total_price precisa ser maior que zero" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!billingType) {
      return new Response(
        JSON.stringify({ error: "payment_method precisa ser pix ou cartao" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const customer = await ensureAsaasCustomer(supabase, {
      name: customerName ? String(customerName) : null,
      phone,
      cpfCnpj: body.cpf_cnpj || body.cpfCnpj || null,
      email: body.email || null,
    });

    const payment = await createAsaasPayment({
      customer: customer.asaasCustomerId,
      billingType,
      value: amount,
      dueDate,
      description: String(description || "Pedido ACIUM"),
      externalReference: orderId ? `order:${orderId}` : body.external_reference || undefined,
    });

    if (!payment.id) {
      throw new Error("Asaas nao retornou o ID da cobranca.");
    }

    const pix =
      billingType === "PIX" || billingType === "UNDEFINED"
        ? await getAsaasPixQrCode(payment.id).catch((error) => {
            console.warn("[ASAAS-PAYMENT] Nao foi possivel obter QR Code Pix:", error.message);
            return null;
          })
        : null;

    const status = mapAsaasStatusToOrderStatus(payment.status || "PENDING");
    const chargePayload = {
      order_id: orderId,
      customer_id: customer.localCustomer?.id || null,
      provider: "asaas",
      provider_customer_id: customer.asaasCustomerId,
      provider_payment_id: payment.id,
      billing_type: billingType,
      status,
      amount,
      due_date: dueDate,
      invoice_url: payment.invoiceUrl || null,
      bank_slip_url: payment.bankSlipUrl || null,
      pix_payload: pix?.payload || null,
      pix_qr_code_base64: pix?.encodedImage || null,
      raw_response: {
        payment: payment.raw,
        pix,
      },
    };

    const { data: charge, error: chargeError } = await supabase
      .from("payment_charges")
      .upsert(chargePayload, { onConflict: "provider,provider_payment_id" })
      .select("id")
      .single();

    if (chargeError) throw chargeError;

    if (orderId) {
      await supabase
        .from("orders")
        .update({
          status,
          payment_method: String(billingType).toLowerCase(),
          asaas_payment_id: payment.id,
          asaas_invoice_url: payment.invoiceUrl || null,
          asaas_bank_slip_url: payment.bankSlipUrl || null,
          asaas_pix_payload: pix?.payload || null,
          asaas_pix_qr_code_base64: pix?.encodedImage || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
    }

    const whatsappMessage = formatPaymentWhatsappMessage({
      customerName: customerName ? String(customerName) : null,
      amount,
      billingType,
      invoiceUrl: payment.invoiceUrl || null,
      pixPayload: pix?.payload || null,
    });

    let whatsappSendResult: Record<string, unknown> | null = null;
    if (body.send_whatsapp === true || body.sendWhatsApp === true) {
      const sendResponse = await fetch(`${supabaseUrl}/functions/v1/automation-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          conversation_id: body.conversation_id || null,
          phone,
          platform: body.platform || "whatsapp",
          message: whatsappMessage,
          message_type: "text",
          prefer_zapi: true,
        }),
      });

      const sendText = await sendResponse.text();
      try {
        whatsappSendResult = sendText ? JSON.parse(sendText) : {};
      } catch {
        whatsappSendResult = { raw: sendText };
      }

      if (!sendResponse.ok) {
        console.warn("[ASAAS-PAYMENT] Falha ao enviar cobranca no WhatsApp:", sendText);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        charge_id: charge?.id,
        order_id: orderId,
        asaas_payment_id: payment.id,
        status,
        invoice_url: payment.invoiceUrl || null,
        bank_slip_url: payment.bankSlipUrl || null,
        pix_payload: pix?.payload || null,
        pix_qr_code_base64: pix?.encodedImage || null,
        whatsapp_message: whatsappMessage,
        whatsapp_sent: !!whatsappSendResult?.success,
        whatsapp_send_result: whatsappSendResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[ASAAS-PAYMENT] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
