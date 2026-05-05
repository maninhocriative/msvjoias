import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWithZapiGovernor } from "../_shared/zapi-governor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FollowupConfig {
  intervalMinutes: number;
  message: string;
}

type AgentSlug = "aline" | "keila" | "kate" | "malu";

const SAFE_MIN_FIRST_INTERVAL_MINUTES = 60;
const SAFE_MAX_ATTEMPTS = 3;
const MAX_SENDS_PER_RUN = 20;
const SEND_PAUSE_MS = 1200;
const BUSINESS_HOUR_START = 9;
const BUSINESS_HOUR_END = 19;
const BUSINESS_TIMEZONE = "America/Manaus";

const SAFE_DEFAULT_MESSAGES = [
  "Oi! Passando para saber se voce quer retomar o atendimento. Se fizer sentido, eu continuo com voce por aqui.",
  "Voltei so para confirmar se ainda quer ver as opcoes com calma. Se preferir, posso retomar exatamente de onde paramos.",
  "Este e meu ultimo lembrete automatico. Quando quiser retomar, e so me chamar que eu sigo com voce.",
];

const KATE_MOTHERS_DAY_FALLBACK_MESSAGES = [
  "Oi! Passando rapidinho: os pingentes fotogravados sao uma opcao linda para o Dia das Maes. Se quiser, eu te mostro os modelos disponiveis e ja preparo a previa com a foto que voce escolher.",
  "Ainda da para escolher um pingente fotogravado de aco para presentear no Dia das Maes. Posso te ajudar a escolher entre acabamento dourado e prata e seguir com a previa pelo WhatsApp.",
  "Ultimo lembrete por aqui: se quiser garantir o pingente fotogravado para o Dia das Maes, me chama que eu retomo de onde paramos.",
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getManausHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return Number(parts.find((part) => part.type === "hour")?.value || "0");
}

function isWithinBusinessHours(date = new Date()) {
  const hour = getManausHour(date);
  return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
}

function buildSafeFollowupConfig(
  firstIntervalMinutes: number,
  customMessages: string[] | null,
): FollowupConfig[] {
  const safeFirstInterval = Math.max(
    firstIntervalMinutes || SAFE_MIN_FIRST_INTERVAL_MINUTES,
    SAFE_MIN_FIRST_INTERVAL_MINUTES,
  );
  const intervals = [safeFirstInterval, 24 * 60, 3 * 24 * 60];

  return intervals.map((intervalMinutes, index) => ({
    intervalMinutes,
    message: customMessages?.[index] || SAFE_DEFAULT_MESSAGES[index],
  }));
}

function normalizeText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formatCurrency(value: unknown): string | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return `R$ ${number.toFixed(2).replace(".", ",")}`;
}

function isPendantConversation(conversation: any): boolean {
  const data = conversation?.collected_data || {};
  const searchable = normalizeText(
    [
      conversation?.active_agent,
      conversation?.current_node,
      data.categoria,
      data.triagem_categoria,
      data.selected_name,
      data.last_intent,
      data.customer_stage,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return (
    conversation?.active_agent === "kate" ||
    data.categoria === "pingente" ||
    /kate|pingente|fotograv|medalha|colar/.test(searchable)
  );
}

async function getActivePendantOffer(supabase: any) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("offers")
    .select("id, promotional_price, gift_description, end_date, products(id, name, price, category)")
    .eq("active", true)
    .lte("start_date", now)
    .gte("end_date", now)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[ALINE-FOLLOWUP] Erro ao buscar oferta de pingente:", error);
    return null;
  }

  return (data || []).find((offer: any) => {
    const product = Array.isArray(offer.products) ? offer.products[0] : offer.products;
    const category = normalizeText(String(product?.category || ""));
    const name = normalizeText(String(product?.name || ""));
    return category.includes("pingente") || /pingente|fotograv|medalha/.test(name);
  }) || null;
}

function buildKateMothersDayFollowupMessage(
  followupIndex: number,
  offer: any | null,
  conversation: any,
): string {
  const product = Array.isArray(offer?.products) ? offer.products[0] : offer?.products;
  const productName =
    conversation?.collected_data?.selected_name ||
    product?.name ||
    "pingente fotogravado";
  const price = formatCurrency(offer?.promotional_price || product?.price);
  const gift = offer?.gift_description ? `\n\nTem tambem: ${offer.gift_description}` : "";

  if (offer && followupIndex === 0) {
    return `Oi! Passando rapidinho porque esse presente combina muito com o Dia das Maes: o *${productName}* de aco com fotogravacao fica personalizado com uma foto especial.${price ? `\n\nOferta ativa: ${price}.` : ""}${gift}\n\nSe quiser, eu te mostro os modelos e ja preparo a previa pelo WhatsApp.`;
  }

  if (offer && followupIndex === 1) {
    return `Ainda posso te ajudar com o *${productName}* de aco para o Dia das Maes.${price ? ` A oferta esta por ${price}.` : ""}\n\nMe responde com acabamento *dourado* ou *prata* que eu sigo com as opcoes.`;
  }

  return KATE_MOTHERS_DAY_FALLBACK_MESSAGES[Math.min(followupIndex, KATE_MOTHERS_DAY_FALLBACK_MESSAGES.length - 1)];
}

function resolveFollowupMessage(args: {
  conversation: any;
  config: FollowupConfig;
  followupIndex: number;
  pendantOffer: any | null;
}) {
  if (isPendantConversation(args.conversation)) {
    return buildKateMothersDayFollowupMessage(
      args.followupIndex,
      args.pendantOffer,
      args.conversation,
    );
  }

  return args.config.message;
}

async function sendTextMessage(
  zapiInstanceId: string,
  zapiToken: string,
  zapiClientToken: string,
  phone: string,
  message: string,
): Promise<Response> {
  const zapiUrl = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`;

  return fetch(zapiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": zapiClientToken,
    },
    body: JSON.stringify({ phone, message }),
  });
}

async function notifyTeamAboutBuyer(
  supabase: any,
  zapiInstanceId: string,
  zapiToken: string,
  zapiClientToken: string,
  customerPhone: string,
  customerName: string | null,
): Promise<void> {
  try {
    const { data: settings } = await supabase
      .from("store_settings")
      .select("key, value")
      .or("key.eq.notification_whatsapp,key.like.notification_phone_%");

    const notificationNumbers: string[] = [];

    if (settings) {
      for (const setting of settings) {
        if (setting.value) {
          notificationNumbers.push(String(setting.value).replace(/\D/g, ""));
        }
      }
    }

    if (notificationNumbers.length === 0) {
      notificationNumbers.push("5592984145531");
    }

    const notificationMsg =
      `CLIENTE QUER FINALIZAR COMPRA!\n\n` +
      `Telefone: ${customerPhone}\n` +
      `Nome: ${customerName || "Nao informado"}\n\n` +
      `O cliente clicou no botao para finalizar o pedido.\n\n` +
      `Entre em contato agora para fechar a venda.`;

    for (const number of notificationNumbers) {
      await sendTextMessage(
        zapiInstanceId,
        zapiToken,
        zapiClientToken,
        number,
        notificationMsg,
      );
    }
  } catch (error) {
    console.error("[ALINE-FOLLOWUP] Erro ao notificar equipe:", error);
  }
}

async function markAsBuyer(supabase: any, phone: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("conversations")
      .update({ lead_status: "comprador" })
      .eq("contact_number", phone);

    if (error) {
      console.error("[ALINE-FOLLOWUP] Erro ao marcar como comprador:", error);
    }
  } catch (error) {
    console.error("[ALINE-FOLLOWUP] Erro ao marcar como comprador:", error);
  }
}

async function getLastConversationMessage(supabase: any, conversationId: string) {
  const { data, error } = await supabase
    .from("aline_messages")
    .select("role, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ALINE-FOLLOWUP] Erro ao buscar ultima mensagem:", error);
    return null;
  }

  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const zapiInstanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const zapiToken = Deno.env.get("ZAPI_TOKEN");
    const zapiClientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

    if (!zapiInstanceId || !zapiToken || !zapiClientToken) {
      return new Response(JSON.stringify({ error: "Z-API credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json().catch(() => ({}));

    if (body.buttonResponse && body.phone) {
      const { data: crmConversation } = await supabase
        .from("conversations")
        .select("contact_name")
        .eq("contact_number", body.phone)
        .maybeSingle();

      await markAsBuyer(supabase, body.phone);
      await notifyTeamAboutBuyer(
        supabase,
        zapiInstanceId,
        zapiToken,
        zapiClientToken,
        body.phone,
        crmConversation?.contact_name || null,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: "Cliente marcado como comprador e equipe notificada.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isWithinBusinessHours()) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          sent: 0,
          message: "Fora da janela segura de follow-up.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: aiConfig, error: aiConfigError } = await supabase
      .from("ai_agent_config")
      .select("followup_enabled, followup_interval_minutes, followup_max_attempts, followup_messages")
      .eq("name", "Aline")
      .maybeSingle();

    if (aiConfigError) {
      console.error("[ALINE-FOLLOWUP] Erro ao buscar config:", aiConfigError);
    }

    const followupEnabled = aiConfig?.followup_enabled ?? true;
    if (!followupEnabled) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          sent: 0,
          message: "Follow-up desativado nas configuracoes da Aline.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const safeMaxAttempts = Math.min(
      Math.max(Number(aiConfig?.followup_max_attempts || SAFE_MAX_ATTEMPTS), 1),
      SAFE_MAX_ATTEMPTS,
    );
    const safeFollowupConfig = buildSafeFollowupConfig(
      Number(aiConfig?.followup_interval_minutes || SAFE_MIN_FIRST_INTERVAL_MINUTES),
      (aiConfig?.followup_messages as string[] | null) || null,
    );

    const { data: activeConversations, error: fetchError } = await supabase
      .from("aline_conversations")
      .select("id, phone, status, current_node, followup_count, last_message_at, active_agent, collected_data")
      .eq("status", "active")
      .in("active_agent", ["aline", "keila", "kate", "malu"])
      .lt("followup_count", safeMaxAttempts)
      .order("last_message_at", { ascending: true, nullsFirst: true })
      .limit(200);

    if (fetchError) {
      throw fetchError;
    }

    if (!activeConversations || activeConversations.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          sent: 0,
          message: "Nenhuma conversa elegivel para follow-up.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = Date.now();
    const eligibleConversations: Array<{
      conversation: any;
      config: FollowupConfig;
      crmConversation: any;
    }> = [];

    for (const conversation of activeConversations) {
      const followupCount = Number(conversation.followup_count || 0);
      const nextConfig = safeFollowupConfig[followupCount];
      if (!nextConfig) continue;

      const lastMessage = await getLastConversationMessage(supabase, conversation.id);
      if (!lastMessage) continue;

      const isLastMessageFromBot =
        lastMessage.role === "assistant" ||
        lastMessage.role === "aline" ||
        lastMessage.role === "keila" ||
        lastMessage.role === "kate" ||
        lastMessage.role === "malu";
      if (!isLastMessageFromBot) continue;

      const lastMessageTime = new Date(
        lastMessage.created_at || conversation.last_message_at || 0,
      ).getTime();
      const elapsedMinutes = (now - lastMessageTime) / 60000;
      if (!Number.isFinite(lastMessageTime) || elapsedMinutes < nextConfig.intervalMinutes) {
        continue;
      }

      const { data: crmConversation, error: crmError } = await supabase
        .from("conversations")
        .select("id, lead_status, unread_count")
        .eq("contact_number", conversation.phone)
        .maybeSingle();

      if (crmError) {
        console.error("[ALINE-FOLLOWUP] Erro ao buscar conversa do CRM:", crmError);
      }

      if (
        crmConversation?.lead_status &&
        ["vendido", "comprador", "perdido", "sem_interesse"].includes(
          crmConversation.lead_status,
        )
      ) {
        continue;
      }

      if (Number(crmConversation?.unread_count || 0) > 0) {
        continue;
      }

      eligibleConversations.push({
        conversation,
        config: nextConfig,
        crmConversation,
      });
    }

    if (eligibleConversations.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          sent: 0,
          message: "Nenhuma conversa entrou na janela segura de disparo.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const queue = eligibleConversations.slice(0, MAX_SENDS_PER_RUN);
    const results: Array<{
      phone: string;
      success: boolean;
      followupNumber?: number;
      error?: string;
    }> = [];
    let throttled = false;
    let throttleMessage: string | null = null;
    const pendantOffer = await getActivePendantOffer(supabase);

    for (let index = 0; index < queue.length; index += 1) {
      const { conversation, config, crmConversation } = queue[index];
      const followupNumber = Number(conversation.followup_count || 0) + 1;
      const message = resolveFollowupMessage({
        conversation,
        config,
        followupIndex: followupNumber - 1,
        pendantOffer,
      });

      try {
        const governorResult = await sendWithZapiGovernor(
          supabase,
          {
            lane: "followup",
            bypassBurstLimit: false,
          },
          () =>
            sendTextMessage(
              zapiInstanceId,
              zapiToken,
              zapiClientToken,
              conversation.phone,
              message,
            ),
        );

        if (governorResult.blocked || !governorResult.result) {
          throttled = true;
          throttleMessage = "Rodada interrompida pelo controle de vazao segura da Z-API.";
          break;
        }

        const zapiResponse = governorResult.result;
        const zapiPayload = await zapiResponse.json().catch(() => null);

        if (!zapiResponse.ok) {
          throw new Error(`Z-API error: ${JSON.stringify(zapiPayload)}`);
        }

        await supabase
          .from("aline_conversations")
          .update({
            followup_count: followupNumber,
            last_message_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);

        await supabase.from("aline_messages").insert({
          conversation_id: conversation.id,
          role: (conversation.active_agent || "aline") as AgentSlug,
          message,
          node: conversation.current_node,
        });

        if (crmConversation?.id) {
          await supabase.from("messages").insert({
            conversation_id: crmConversation.id,
            content: message,
            message_type: "text",
            is_from_me: true,
            status: "sent",
          });

          await supabase
            .from("conversations")
            .update({
              last_message: message.substring(0, 80) + (message.length > 80 ? "..." : ""),
              last_message_at: new Date().toISOString(),
              lead_status:
                followupNumber === 1 && crmConversation.lead_status === "novo"
                  ? "frio"
                  : crmConversation.lead_status,
            })
            .eq("id", crmConversation.id);
        }

        results.push({
          phone: conversation.phone,
          success: true,
          followupNumber,
        });

        if (index < queue.length - 1) {
          await sleep(SEND_PAUSE_MS);
        }
      } catch (error) {
        console.error(`[ALINE-FOLLOWUP] Erro ao processar ${conversation.phone}:`, error);
        results.push({
          phone: conversation.phone,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const sentCount = results.filter((result) => result.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        sent: sentCount,
        eligible: eligibleConversations.length,
        deferred: Math.max(eligibleConversations.length - results.length, 0),
        throttled,
        throttle_message: throttleMessage,
        safeMaxAttempts,
        safeWindow: `${BUSINESS_HOUR_START}:00-${BUSINESS_HOUR_END}:00 (${BUSINESS_TIMEZONE})`,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[ALINE-FOLLOWUP] Erro:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
