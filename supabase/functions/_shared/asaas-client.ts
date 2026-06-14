import { buildPhoneVariants, normalizeWhatsappPhone } from "./phone.ts";

type SupabaseEdgeClient = any;

export type AsaasBillingType = "PIX" | "CREDIT_CARD" | "UNDEFINED";

export interface AsaasCustomerInput {
  name?: string | null;
  phone: string;
  cpfCnpj?: string | null;
  email?: string | null;
}

export interface AsaasPaymentInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  dueDate: string;
  description?: string | null;
  externalReference?: string | null;
}

export interface AsaasPaymentResult {
  id: string;
  status?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  billingType?: string;
  value?: number;
  dueDate?: string;
  raw: Record<string, unknown>;
}

export interface PixQrCodeResult {
  encodedImage?: string | null;
  payload?: string | null;
  expirationDate?: string | null;
}

const ASAAS_STATUS_TO_ORDER_STATUS: Record<string, string> = {
  PENDING: "payment_pending",
  RECEIVED: "paid",
  CONFIRMED: "payment_confirmed",
  OVERDUE: "payment_overdue",
  REFUNDED: "payment_refunded",
  RECEIVED_IN_CASH: "paid",
  REFUND_REQUESTED: "payment_refund_requested",
  CHARGEBACK_REQUESTED: "payment_chargeback_requested",
  CHARGEBACK_DISPUTE: "payment_chargeback_dispute",
  AWAITING_CHARGEBACK_REVERSAL: "payment_chargeback_reversal",
  DUNNING_REQUESTED: "payment_dunning_requested",
  DUNNING_RECEIVED: "payment_dunning_received",
  AWAITING_RISK_ANALYSIS: "payment_risk_analysis",
};

export function mapAsaasStatusToOrderStatus(status: unknown): string {
  const key = String(status || "").toUpperCase();
  return ASAAS_STATUS_TO_ORDER_STATUS[key] || "payment_pending";
}

function getAsaasBaseUrl() {
  const explicitBaseUrl = Deno.env.get("ASAAS_API_BASE_URL")?.trim();
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/$/, "");

  const env = (Deno.env.get("ASAAS_ENV") || "sandbox").trim().toLowerCase();
  return env === "production" || env === "prod"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

function getAsaasApiKey() {
  const key = Deno.env.get("ASAAS_API_KEY")?.trim();
  if (!key) {
    throw new Error("ASAAS_API_KEY nao configurada.");
  }
  return key;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function asaasRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const response = await fetch(`${getAsaasBaseUrl()}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      access_token: getAsaasApiKey(),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await readJson(response);
  if (!response.ok) {
    const errors = Array.isArray((data as any)?.errors)
      ? (data as any).errors.map((item: any) => item.description || item.message).filter(Boolean).join("; ")
      : null;
    throw new Error(errors || (data as any)?.message || `Erro Asaas ${response.status}`);
  }

  return data as T;
}

function normalizeDocument(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

async function findLocalCustomer(supabase: SupabaseEdgeClient, phone: string) {
  const variants = buildPhoneVariants(phone);
  if (variants.length === 0) return null;

  const { data } = await supabase
    .from("customers")
    .select("id, name, whatsapp, cpf, asaas_customer_id")
    .in("whatsapp", variants)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}

export async function ensureAsaasCustomer(
  supabase: SupabaseEdgeClient,
  input: AsaasCustomerInput,
) {
  const phone = normalizeWhatsappPhone(input.phone);
  const localCustomer = await findLocalCustomer(supabase, phone);

  if (localCustomer?.asaas_customer_id) {
    return {
      localCustomer,
      asaasCustomerId: String(localCustomer.asaas_customer_id),
      created: false,
    };
  }

  const cpfCnpj = normalizeDocument(input.cpfCnpj || localCustomer?.cpf);
  if (!cpfCnpj) {
    throw new Error("CPF/CNPJ do cliente e necessario para criar o pagador no Asaas.");
  }

  const name = String(input.name || localCustomer?.name || `Cliente ${phone}`).trim();
  const createdCustomer = await asaasRequest<Record<string, unknown>>("/customers", {
    method: "POST",
    body: {
      name,
      cpfCnpj,
      email: input.email || undefined,
      mobilePhone: phone,
      externalReference: localCustomer?.id || phone,
      notificationDisabled: true,
    },
  });

  const asaasCustomerId = String(createdCustomer.id || "");
  if (!asaasCustomerId) {
    throw new Error("Asaas nao retornou o ID do cliente.");
  }

  let finalLocalCustomer = localCustomer;
  if (localCustomer?.id) {
    await supabase
      .from("customers")
      .update({
        asaas_customer_id: asaasCustomerId,
        cpf: cpfCnpj,
        updated_at: new Date().toISOString(),
      })
      .eq("id", localCustomer.id);
  } else {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name,
        whatsapp: phone,
        cpf: cpfCnpj,
        asaas_customer_id: asaasCustomerId,
      })
      .select("id, name, whatsapp, cpf, asaas_customer_id")
      .single();

    if (error) {
      throw new Error(`Cliente criado no Asaas, mas falhou no CRM: ${error.message}`);
    }
    finalLocalCustomer = data;
  }

  return {
    localCustomer: finalLocalCustomer,
    asaasCustomerId,
    created: true,
  };
}

export async function createAsaasPayment(input: AsaasPaymentInput): Promise<AsaasPaymentResult> {
  const payment = await asaasRequest<Record<string, unknown>>("/payments", {
    method: "POST",
    body: {
      customer: input.customer,
      billingType: input.billingType,
      value: input.value,
      dueDate: input.dueDate,
      description: input.description || undefined,
      externalReference: input.externalReference || undefined,
    },
  });

  return {
    id: String(payment.id || ""),
    status: payment.status ? String(payment.status) : undefined,
    invoiceUrl: payment.invoiceUrl ? String(payment.invoiceUrl) : undefined,
    bankSlipUrl: payment.bankSlipUrl ? String(payment.bankSlipUrl) : undefined,
    billingType: payment.billingType ? String(payment.billingType) : undefined,
    value: typeof payment.value === "number" ? payment.value : Number(payment.value || input.value),
    dueDate: payment.dueDate ? String(payment.dueDate) : input.dueDate,
    raw: payment,
  };
}

export async function getAsaasPixQrCode(paymentId: string): Promise<PixQrCodeResult | null> {
  if (!paymentId) return null;

  const pix = await asaasRequest<Record<string, unknown>>(`/payments/${paymentId}/pixQrCode`);
  return {
    encodedImage: pix.encodedImage ? String(pix.encodedImage) : null,
    payload: pix.payload ? String(pix.payload) : null,
    expirationDate: pix.expirationDate ? String(pix.expirationDate) : null,
  };
}

export function formatPaymentWhatsappMessage(args: {
  customerName?: string | null;
  amount: number;
  billingType: string;
  invoiceUrl?: string | null;
  pixPayload?: string | null;
}) {
  const amount = args.amount.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const paymentLabel =
    args.billingType === "PIX"
      ? "Pix"
      : args.billingType === "CREDIT_CARD"
        ? "cartao de credito"
        : "pagamento";

  const lines = [
    `Perfeito${args.customerName ? `, ${args.customerName}` : ""}! Gerei sua cobranca de ${amount} via ${paymentLabel}.`,
  ];

  if (args.invoiceUrl) {
    lines.push(`Link seguro para pagamento: ${args.invoiceUrl}`);
  }

  if (args.pixPayload) {
    lines.push("", "Pix copia e cola:", args.pixPayload);
  }

  lines.push("", "Assim que o pagamento compensar, o sistema atualiza o pedido automaticamente.");
  return lines.join("\n");
}
