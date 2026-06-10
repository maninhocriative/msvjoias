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
  kind?: "agent_rescue" | "normal" | "pendant_catalog_rescue";
  normalIndex?: number;
}

type AgentSlug = "aline" | "keila" | "kate" | "malu";

const SAFE_MIN_FIRST_INTERVAL_MINUTES = 60;
const AGENT_RESCUE_INTERVAL_MINUTES = [5, 20, 60];
const AGENT_RESCUE_ATTEMPTS = AGENT_RESCUE_INTERVAL_MINUTES.length;
const NORMAL_FOLLOWUP_ATTEMPTS = 3;
const SAFE_MAX_ATTEMPTS = AGENT_RESCUE_ATTEMPTS + NORMAL_FOLLOWUP_ATTEMPTS;
const MAX_SENDS_PER_RUN = 20;
const MAX_CANDIDATES_PER_RUN = 500;
const CATALOG_CARD_FOLLOWUP_BATCH_LIMIT = 3;
const SEND_PAUSE_MS = 1200;
const BUSINESS_HOUR_START = 9;
const BUSINESS_HOUR_END = 19;
const BUSINESS_TIMEZONE = "America/Manaus";

const SAFE_DEFAULT_MESSAGES = [
  "Oi! Passando para saber se voce quer retomar o atendimento. Se fizer sentido, eu continuo com voce por aqui.",
  "Voltei so para confirmar se ainda quer ver as opcoes com calma. Se preferir, posso retomar exatamente de onde paramos.",
  "Este e meu ultimo lembrete automatico. Quando quiser retomar, e so me chamar que eu sigo com voce.",
];

const KATE_VALENTINES_OFFER_PRICE = 139;
const KATE_VALENTINES_DAY_FALLBACK_MESSAGES = [
  "Como voce nao falou nada, vou te mandar a oferta de Dia dos Namorados e alguns modelos de pingentes fotogravaveis para voce ver com calma.",
  "Ainda da para escolher um pingente fotogravado de aco para presentear no Dia dos Namorados. Posso te ajudar a escolher entre acabamento dourado e prata e seguir com a simulacao pelo WhatsApp.",
  "Ultimo lembrete por aqui: se quiser garantir um pingente fotogravado para o Dia dos Namorados, me chama que eu retomo de onde paramos.",
];

function promisesPendantCatalog(message: string): boolean {
  const normalized = normalizeText(message || "");
  return (
    /vou te mandar.*(oferta|modelo|modelos|pingente|pingentes|video|catalogo)/.test(normalized) ||
    /mandar.*(oferta|modelo|modelos|pingente|pingentes|video|catalogo).*ver/.test(normalized)
  );
}

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

function buildPhoneVariants(phone: string): string[] {
  const raw = String(phone || "").trim();
  const digits = String(phone || "").replace(/\D/g, "");
  const variants = new Set<string>();

  if (digits) variants.add(digits);
  if (digits.startsWith("55") && digits.length > 2) variants.add(digits.slice(2));
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) variants.add(`55${digits}`);
  if (!variants.size && raw) variants.add(raw);
  if (!variants.size) variants.add("__empty_phone__");

  return Array.from(variants);
}

function formatCurrency(value: unknown): string | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return `R$ ${number.toFixed(2).replace(".", ",")}`;
}

function getOfferProduct(offer: any): any | null {
  return Array.isArray(offer?.products) ? offer.products[0] || null : offer?.products || null;
}

function isPriceCloseTo(value: unknown, target: number): boolean {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number - target) < 0.01;
}

function getProductKey(product: any): string {
  return String(product?.sku || product?.id || product?.name || "").trim().toLowerCase();
}

function isValentinesOfferPrice(product: any, offer?: any | null): boolean {
  return isPriceCloseTo(offer?.promotional_price, KATE_VALENTINES_OFFER_PRICE) ||
    isPriceCloseTo(product?.price, KATE_VALENTINES_OFFER_PRICE);
}

function rankValentinesPendantProduct(product: any, preferredProduct?: any | null): number {
  const preferredKey = getProductKey(preferredProduct);
  const productKey = getProductKey(product);
  let score = 0;

  if (preferredKey && productKey && preferredKey === productKey) score -= 1000;
  if (isValentinesOfferPrice(product)) score -= 500;
  if (product?.video_url) score -= 200;
  if (product?.image_url) score -= 20;

  return score;
}
function isPendantProduct(product: any): boolean {
  const category = normalizeText(String(product?.category || ""));
  const name = normalizeText(String(product?.name || ""));
  const description = normalizeText(String(product?.description || ""));
  return category.includes("pingente") || /pingente|medalha|fotograv/.test(`${name} ${description}`);
}

function isPendantColor(product: any): boolean {
  const searchable = normalizeText(
    `${product?.color || ""} ${product?.name || ""} ${product?.description || ""} ${
      Array.isArray(product?.tags) ? product.tags.join(" ") : product?.tags || ""
    }`,
  );
  return /dourad|prata|pratead|aco|inox/.test(searchable);
}

function buildPendantFollowupCard(product: any) {
  const price = formatCurrency(product.price);
  const isValentinesOffer = isValentinesOfferPrice(product);
  const caption = [
    isValentinesOffer ? "*Oferta Dia dos Namorados*" : null,
    `*${product.name}*`,
    product.color ? `Cor: ${product.color}` : null,
    "Material: aco",
    product.sku ? `Cod: ${product.sku}` : null,
    price ? `Valor da unidade: ${price}` : null,
    "Fotogravacao de 1 lado inclusa.",
  ].filter(Boolean).join("\n");

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    price: product.price,
    color: product.color,
    image_url: product.image_url,
    video_url: product.video_url,
    caption,
    button_id: `select_${product.sku || product.id}`,
    button_label: "Quero este",
    buttons: [
      { id: `details_${product.sku || product.id}`, label: "Ver mais" },
      { id: `select_${product.sku || product.id}`, label: "Quero este" },
    ],
  };
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

function getAgentSlug(conversation: any): AgentSlug {
  const agent = normalizeText(String(conversation?.active_agent || ""));
  if (agent === "keila" || agent === "kate" || agent === "malu") return agent;
  return "aline";
}

function isAgentMessageRole(role: unknown): boolean {
  const normalized = normalizeText(String(role || ""));
  return ["assistant", "aline", "keila", "kate", "malu"].includes(normalized);
}

function hasCatalogSent(conversation: any): boolean {
  const data = conversation?.collected_data || {};
  return Boolean(
    data.catalogo_enviado ||
      data.catalogo_kate_enviado ||
      data.catalogo_keila_enviado ||
      data.catalogo_malu_enviado ||
      (Array.isArray(data.last_catalog) && data.last_catalog.length > 0) ||
      (Array.isArray(data.catalog_history) && data.catalog_history.length > 0),
  );
}

function buildAgentRescueMessage(conversation: any, rescueIndex: number): string {
  const agent = getAgentSlug(conversation);

  if (agent === "keila") {
    return [
      "Oi! Vi que voce estava vendo aliancas. Quer continuar com os modelos que te mandei ou prefere que eu filtre por cor, tamanho ou valor?",
      "Posso te ajudar a fechar mais rapido: me diga a cor ou o modelo que gostou que eu confiro disponibilidade e sigo com entrega/pagamento.",
      "Ainda tenho opcoes de aliancas em aco para voce escolher hoje. Se quiser, te mando as melhores opcoes disponiveis e ja deixo encaminhado.",
    ][Math.min(rescueIndex, 2)];
  }

  if (agent === "kate") {
    return [
      "Oi! Vi que voce estava vendo pingentes fotogravados em aco. Quer seguir com algum modelo, ver outros acabamentos ou tirar alguma duvida antes de fechar?",
      "A simulacao e opcional. Se voce ja gostou de um pingente, posso seguir sem foto. Depois do fechamento, o vendedor envia a arte original para sua aprovacao antes da gravacao.",
      "Temos pingentes de aco com acabamento dourado ou prata e fotogravacao inclusa. Quer que eu separe uma opcao para voce fechar hoje?",
    ][Math.min(rescueIndex, 2)];
  }

  if (agent === "malu") {
    return [
      "Oi! Vi que voce estava vendo oculos. Quer que eu te mande os modelos de novo ou ja escolheu algum para testar?",
      "Para agilizar, toque em \"Quero este\" no modelo que gostar. Se voce ja mandou selfie, eu tento seguir com a previa do modelo escolhido.",
      "Tenho modelos de oculos disponiveis para testar hoje. Quer ver as melhores opcoes agora?",
    ][Math.min(rescueIndex, 2)];
  }

  return [
    "Oi! Vi que voce ficou sem responder. Quer continuar de onde paramos ou prefere que eu te mostre as opcoes mais certeiras?",
    "Posso facilitar: me diga se voce quer aliancas, pingentes ou oculos que eu sigo direto no catalogo certo.",
    "Ultima chamada rapida por aqui: temos opcoes ativas hoje. Se quiser, eu separo as melhores para voce agora.",
  ][Math.min(rescueIndex, 2)];
}

function buildNextFollowupConfig(args: {
  conversation: any;
  followupCount: number;
  forceKatePendants: boolean;
  safeFollowupConfig: FollowupConfig[];
}): FollowupConfig | null {
  const { conversation, followupCount, forceKatePendants, safeFollowupConfig } = args;

  if (followupCount < AGENT_RESCUE_ATTEMPTS) {
    const shouldSendPendantCatalog =
      followupCount === 0 &&
      isPendantConversation(conversation) &&
      (forceKatePendants || !hasCatalogSent(conversation));

    return {
      intervalMinutes: forceKatePendants ? 0 : AGENT_RESCUE_INTERVAL_MINUTES[followupCount],
      message: shouldSendPendantCatalog
        ? KATE_VALENTINES_DAY_FALLBACK_MESSAGES[0]
        : buildAgentRescueMessage(conversation, followupCount),
      kind: shouldSendPendantCatalog ? "pendant_catalog_rescue" : "agent_rescue",
    };
  }

  const normalIndex = followupCount - AGENT_RESCUE_ATTEMPTS;
  const normalConfig = safeFollowupConfig[normalIndex];
  if (!normalConfig) return null;

  return {
    ...normalConfig,
    kind: "normal",
    normalIndex,
  };
}

function isBlockedLeadStatus(status: unknown): boolean {
  const normalized = normalizeText(String(status || ""));
  return (
    ["vendido", "comprador", "perdido", "sem_interesse"].includes(normalized) ||
    /humano|acao_humana|acao humana|venda_iniciada|venda iniciada/.test(normalized)
  );
}

async function getActivePendantOffer(supabase: any) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("offers")
    .select("id, promotional_price, gift_description, end_date, created_at, products(id, name, sku, price, image_url, video_url, category, color, description, tags)")
    .eq("active", true)
    .lte("start_date", now)
    .gte("end_date", now)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[ALINE-FOLLOWUP] Erro ao buscar oferta de pingente:", error);
    return null;
  }

  const pendantOffers = (data || [])
    .map((offer: any, index: number) => ({ offer, product: getOfferProduct(offer), index }))
    .filter(({ product }: any) => product && isPendantProduct(product));

  pendantOffers.sort((a: any, b: any) => {
    const aTarget = isValentinesOfferPrice(a.product, a.offer);
    const bTarget = isValentinesOfferPrice(b.product, b.offer);
    if (aTarget !== bTarget) return aTarget ? -1 : 1;
    const aVideo = !!a.product?.video_url;
    const bVideo = !!b.product?.video_url;
    if (aVideo !== bVideo) return aVideo ? -1 : 1;
    return a.index - b.index;
  });

  const selected = pendantOffers[0] || null;
  if (selected) {
    console.log("[ALINE-FOLLOWUP] kate_valentines_offer", {
      offer_id: selected.offer?.id || null,
      product_id: selected.product?.id || null,
      product_name: selected.product?.name || null,
      promotional_price: selected.offer?.promotional_price || null,
      product_price: selected.product?.price || null,
      has_video: !!selected.product?.video_url,
      is_target_139: isValentinesOfferPrice(selected.product, selected.offer),
    });
  }

  return selected?.offer || null;
}

function buildKateValentinesDayFollowupMessage(
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
    return `Oi! Passando rapidinho com uma oferta para o Dia dos Namorados: o *${productName}* de aco com fotogravacao fica personalizado com uma foto especial.${price ? `\n\nOferta ativa: ${price}.` : ""}${gift}\n\nVou te mandar o video/modelo para voce ver melhor. Se gostar, eu sigo com voce pelo WhatsApp.`;
  }

  if (offer && followupIndex === 1) {
    return `Ainda posso te ajudar com o *${productName}* de aco para o Dia dos Namorados.${price ? ` A oferta esta por ${price}.` : ""}\n\nMe responde com acabamento *dourado* ou *prata* que eu sigo com as opcoes.`;
  }

  return KATE_VALENTINES_DAY_FALLBACK_MESSAGES[Math.min(followupIndex, KATE_VALENTINES_DAY_FALLBACK_MESSAGES.length - 1)];
}

function resolveFollowupMessage(args: {
  conversation: any;
  config: FollowupConfig;
  followupIndex: number;
  pendantOffer: any | null;
}) {
  if (args.config.kind === "agent_rescue") {
    return args.config.message;
  }

  if (args.config.kind === "pendant_catalog_rescue") {
    return buildKateValentinesDayFollowupMessage(0, args.pendantOffer, args.conversation);
  }

  if (isPendantConversation(args.conversation)) {
    const normalIndex = args.config.normalIndex ?? args.followupIndex;
    // Sem oferta ativa, o texto base (indice 0) e identico ao rescue inicial de
    // pingente ("Como voce nao falou nada, vou te mandar a oferta...") e ainda
    // dispara o reenvio do catalogo via promisesPendantCatalog(). No estagio
    // normal, escalar para lembretes distintos (indice 1+) que nao prometem
    // catalogo, evitando reenviar verbatim o card e a pergunta de abertura.
    if (!args.pendantOffer) {
      return KATE_VALENTINES_DAY_FALLBACK_MESSAGES[
        Math.min(normalIndex + 1, KATE_VALENTINES_DAY_FALLBACK_MESSAGES.length - 1)
      ];
    }
    return buildKateValentinesDayFollowupMessage(
      normalIndex,
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

async function sendInteractiveProductCard(
  zapiInstanceId: string,
  zapiToken: string,
  zapiClientToken: string,
  phone: string,
  product: any,
): Promise<Response> {
  return fetch(`https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-button-list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": zapiClientToken,
    },
    body: JSON.stringify({
      phone,
      message: product.caption || product.name || "Produto",
      buttonList: {
        buttons: product.buttons,
        ...(product.video_url ? { video: product.video_url } : {}),
        ...(!product.video_url && product.image_url ? { image: product.image_url } : {}),
      },
    }),
  });
}

async function getKatePendantCatalog(supabase: any, preferredProduct: any | null = null) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, price, image_url, video_url, category, color, description, tags, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error("[ALINE-FOLLOWUP] Erro ao buscar catalogo de pingentes:", error);
    return [];
  }

  const productMap = new Map<string, any>();
  for (const product of data || []) {
    if (isPendantProduct(product) && isPendantColor(product)) {
      productMap.set(getProductKey(product), product);
    }
  }

  if (preferredProduct && isPendantProduct(preferredProduct) && isPendantColor(preferredProduct)) {
    productMap.set(getProductKey(preferredProduct), preferredProduct);
  }

  const products = Array.from(productMap.values()).sort((a: any, b: any) => {
    const rankDiff = rankValentinesPendantProduct(a, preferredProduct) - rankValentinesPendantProduct(b, preferredProduct);
    if (rankDiff !== 0) return rankDiff;
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return bTime - aTime;
  });

  console.log("[ALINE-FOLLOWUP] kate_valentines_catalog_selection", {
    total_pingentes: products.length,
    total_offer_139: products.filter((product: any) => isValentinesOfferPrice(product)).length,
    total_with_video: products.filter((product: any) => !!product.video_url).length,
    first_product_id: products[0]?.id || null,
    first_product_name: products[0]?.name || null,
    first_product_price: products[0]?.price || null,
    first_has_video: !!products[0]?.video_url,
  });

  if (products[0] && isValentinesOfferPrice(products[0]) && !products[0].video_url) {
    console.warn("[ALINE-FOLLOWUP] Produto da oferta de R$139 sem video_url cadastrado", {
      product_id: products[0].id || null,
      product_name: products[0].name || null,
      sku: products[0].sku || null,
    });
  }

  return products.slice(0, 4).map(buildPendantFollowupCard);
}

async function sendKatePendantCatalogFollowup(args: {
  supabase: any;
  zapiInstanceId: string;
  zapiToken: string;
  zapiClientToken: string;
  conversation: any;
  crmConversation: any;
  message: string;
  pendantOffer?: any | null;
}) {
  const { supabase, zapiInstanceId, zapiToken, zapiClientToken, conversation, crmConversation, message, pendantOffer } = args;
  const products = await getKatePendantCatalog(supabase, getOfferProduct(pendantOffer));
  let sentProducts = 0;

  await sendWithZapiGovernor(
    supabase,
    { lane: "followup", bypassBurstLimit: false },
    () => sendTextMessage(zapiInstanceId, zapiToken, zapiClientToken, conversation.phone, message),
  );

  for (const product of products) {
    const result = await sendWithZapiGovernor(
      supabase,
      { lane: "followup", bypassBurstLimit: false },
      () => sendInteractiveProductCard(zapiInstanceId, zapiToken, zapiClientToken, conversation.phone, product),
    );

    if (!result.blocked && result.result?.ok) {
      sentProducts += 1;
      if (crmConversation?.id) {
        await supabase.from("messages").insert({
          conversation_id: crmConversation.id,
          content: product.caption || product.name || "Produto",
          message_type: product.video_url ? "video" : product.image_url ? "image" : "text",
          media_url: product.video_url || product.image_url || null,
          is_from_me: true,
          status: "sent",
        });
      }
    }

    await sleep(SEND_PAUSE_MS);
  }

  const finalQuestion = "Gostou da oferta ou de algum modelo? Se sim, toque em *Quero este* no pingente escolhido que eu sigo com voce.";
  await sendWithZapiGovernor(
    supabase,
    { lane: "followup", bypassBurstLimit: false },
    () => sendTextMessage(zapiInstanceId, zapiToken, zapiClientToken, conversation.phone, finalQuestion),
  );

  const collectedData = {
    ...(conversation.collected_data || {}),
    catalogo_kate_enviado: true,
    last_catalog: products.map((product: any) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      color: product.color,
      image_url: product.image_url,
      video_url: product.video_url,
    })),
    catalog_history: products.map((product: any) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      color: product.color,
      image_url: product.image_url,
      video_url: product.video_url,
    })),
  };

  await supabase.from("aline_messages").insert([
    {
      conversation_id: conversation.id,
      role: "kate",
      message,
      node: conversation.current_node,
    },
    {
      conversation_id: conversation.id,
      role: "kate",
      message: finalQuestion,
      node: "catalogo_pingente_followup",
    },
  ]);

  if (crmConversation?.id) {
    await supabase.from("messages").insert([
      {
        conversation_id: crmConversation.id,
        content: message,
        message_type: "text",
        is_from_me: true,
        status: "sent",
      },
      {
        conversation_id: crmConversation.id,
        content: finalQuestion,
        message_type: "text",
        is_from_me: true,
        status: "sent",
      },
    ]);
  }

  return { products, sentProducts, collectedData, finalQuestion };
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
      .in("contact_number", buildPhoneVariants(phone));

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

async function getLastCrmActivitySnapshot(supabase: any, crmConversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("is_from_me, created_at, message_type")
    .eq("conversation_id", crmConversationId)
    .is("deleted_at", null)
    .or("message_type.is.null,message_type.neq.internal_note")
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    console.error("[ALINE-FOLLOWUP] Erro ao buscar atividade recente do CRM:", error);
    return null;
  }

  const messages = data || [];
  const lastAny = messages[0] || null;
  const lastCustomer = messages.find((message: any) => message.is_from_me === false) || null;
  const lastOutbound = messages.find((message: any) => message.is_from_me === true) || null;

  return {
    lastAny,
    lastCustomer,
    lastOutbound,
  };
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
    const forceKatePendants =
      body.force === true &&
      (body.agent === "kate" || body.only_pendants === true || body.category === "pingente");

    if (body.buttonResponse && body.phone) {
      const { data: crmConversation } = await supabase
        .from("conversations")
        .select("contact_name")
        .in("contact_number", buildPhoneVariants(body.phone))
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
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

    if (!forceKatePendants && !isWithinBusinessHours()) {
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

    const configuredNormalAttempts = Math.min(
      Math.max(Number(aiConfig?.followup_max_attempts || NORMAL_FOLLOWUP_ATTEMPTS), 1),
      NORMAL_FOLLOWUP_ATTEMPTS,
    );
    const safeMaxAttempts = Math.min(
      AGENT_RESCUE_ATTEMPTS + configuredNormalAttempts,
      SAFE_MAX_ATTEMPTS,
    );
    const safeFollowupConfig = buildSafeFollowupConfig(
      Number(aiConfig?.followup_interval_minutes || SAFE_MIN_FIRST_INTERVAL_MINUTES),
      (aiConfig?.followup_messages as string[] | null) || null,
    );

    let conversationsQuery = supabase
      .from("aline_conversations")
      .select("id, phone, status, current_node, followup_count, last_message_at, active_agent, collected_data")
      .eq("status", "active")
      .limit(forceKatePendants ? 200 : MAX_CANDIDATES_PER_RUN);

    conversationsQuery = forceKatePendants
      ? conversationsQuery.eq("active_agent", "kate").eq("followup_count", 0).order("last_message_at", { ascending: false, nullsFirst: false })
      : conversationsQuery.in("active_agent", ["aline", "keila", "kate", "malu"]).lt("followup_count", safeMaxAttempts).order("last_message_at", { ascending: true, nullsFirst: false });

    const { data: activeConversations, error: fetchError } = await conversationsQuery;

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
    const debugSkips: Record<string, number> = {};
    const addDebugSkip = (reason: string) => {
      debugSkips[reason] = (debugSkips[reason] || 0) + 1;
    };

    for (const conversation of activeConversations) {
      if (forceKatePendants && !isPendantConversation(conversation)) {
        addDebugSkip("not_pendant");
        continue;
      }

      const followupCount = Number(conversation.followup_count || 0);
      const nextConfig = buildNextFollowupConfig({
        conversation,
        followupCount,
        forceKatePendants,
        safeFollowupConfig,
      });
      if (!nextConfig) {
        addDebugSkip("no_config");
        continue;
      }

      const { data: crmConversation, error: crmError } = await supabase
        .from("conversations")
        .select("id, lead_status")
        .in("contact_number", buildPhoneVariants(conversation.phone))
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (crmError) {
        console.error("[ALINE-FOLLOWUP] Erro ao buscar conversa do CRM:", crmError);
      }

      if (crmConversation?.lead_status && isBlockedLeadStatus(crmConversation.lead_status)) {
        addDebugSkip(`status_${crmConversation.lead_status}`);
        continue;
      }

      const crmActivity = crmConversation?.id
        ? await getLastCrmActivitySnapshot(supabase, crmConversation.id)
        : null;
      const lastAgentMessage = await getLastConversationMessage(supabase, conversation.id);

      let lastAgentTime = 0;
      let activitySource = "none";
      const lastCustomerTime = crmActivity?.lastCustomer?.created_at
        ? new Date(crmActivity.lastCustomer.created_at).getTime()
        : 0;

      if (crmActivity?.lastOutbound?.created_at) {
        const lastOutboundTime = crmActivity.lastOutbound.created_at
          ? new Date(crmActivity.lastOutbound.created_at).getTime()
          : 0;

        if (Number.isFinite(lastOutboundTime) && lastOutboundTime > 0) {
          lastAgentTime = lastOutboundTime;
          activitySource = "crm";
        }
      }

      if (lastAgentMessage) {
        if (!isAgentMessageRole(lastAgentMessage.role)) {
          if (!lastAgentTime) {
            addDebugSkip(`last_role_${lastAgentMessage.role || "unknown"}`);
            continue;
          }
        } else {
          const lastAgentMessageTime = new Date(
            lastAgentMessage.created_at || conversation.last_message_at || 0,
          ).getTime();
          if (Number.isFinite(lastAgentMessageTime) && lastAgentMessageTime > lastAgentTime) {
            lastAgentTime = lastAgentMessageTime;
            activitySource = activitySource === "crm" ? "crm_agent_messages" : "agent_messages";
          }
        }
      }

      if (Number.isFinite(lastCustomerTime) && lastCustomerTime > 0 && (!lastAgentTime || lastCustomerTime > lastAgentTime + 1000)) {
        addDebugSkip("customer_replied_after_agent");
        continue;
      }

      if (!Number.isFinite(lastAgentTime) || lastAgentTime <= 0) {
        addDebugSkip("no_last_agent_message");
        continue;
      }

      const elapsedMinutes = (now - lastAgentTime) / 60000;
      if (!forceKatePendants && elapsedMinutes < nextConfig.intervalMinutes) {
        addDebugSkip(`too_early_${activitySource}`);
        continue;
      }

      eligibleConversations.push({
        conversation,
        config: nextConfig,
        crmConversation,
      });
    }

    if (body.debug === true) {
      return new Response(
        JSON.stringify({
          success: true,
          debug: true,
          forceKatePendants,
          activeCount: activeConversations.length,
          eligibleCount: eligibleConversations.length,
          skips: debugSkips,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    const hasCatalogCardFollowup = eligibleConversations.some(({ config }) => {
      return config.kind === "pendant_catalog_rescue";
    });
    const manualBatchLimit = forceKatePendants
      ? Math.min(Math.max(Number(body.limit || 10), 1), 10)
      : hasCatalogCardFollowup
        ? CATALOG_CARD_FOLLOWUP_BATCH_LIMIT
        : MAX_SENDS_PER_RUN;
    const queue = eligibleConversations.slice(0, manualBatchLimit);
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
        if (
          config.kind === "pendant_catalog_rescue" ||
          (isPendantConversation(conversation) && promisesPendantCatalog(message))
        ) {
          const catalogResult = await sendKatePendantCatalogFollowup({
            supabase,
            zapiInstanceId,
            zapiToken,
            zapiClientToken,
            conversation,
            crmConversation,
            message,
            pendantOffer,
          });

          await supabase
            .from("aline_conversations")
            .update({
              followup_count: followupNumber,
              last_message_at: new Date().toISOString(),
              current_node: "catalogo_pingente_followup",
              collected_data: catalogResult.collectedData,
            })
            .eq("id", conversation.id);

          if (crmConversation?.id) {
            await supabase
              .from("conversations")
              .update({
                last_message: catalogResult.finalQuestion.substring(0, 80),
                last_message_at: new Date().toISOString(),
                lead_status: crmConversation.lead_status === "novo" ? "frio" : crmConversation.lead_status,
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

          continue;
        }

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

        const agentSlug = getAgentSlug(conversation);
        const followupData = {
          ...(conversation.collected_data || {}),
          agente_atual: agentSlug,
          last_followup_kind: config.kind || "normal",
          last_followup_message: message,
          last_followup_at: new Date().toISOString(),
          ...(isPendantConversation(conversation)
            ? {
                categoria: "pingente",
                last_followup_product_context: "pingente_fotogravado",
              }
            : {}),
        };

        await supabase
          .from("aline_conversations")
          .update({
            followup_count: followupNumber,
            last_message_at: new Date().toISOString(),
            current_node: conversation.current_node || `${agentSlug}_followup_resgate`,
            collected_data: followupData,
          })
          .eq("id", conversation.id);

        await supabase.from("aline_messages").insert({
          conversation_id: conversation.id,
          role: agentSlug,
          message,
          node: conversation.current_node || `${agentSlug}_followup_resgate`,
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
