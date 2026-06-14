import { normalizeTextV2 } from "./inbound-normalizer-v2.ts";
import type { AgentSlugV2 } from "./agent-orchestrator-v2.ts";

export interface ProductLikeV2 {
  id?: string | null;
  sku?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  color?: string | null;
  price?: number | string | null;
  active?: boolean | null;
  image_url?: string | null;
  video_url?: string | null;
  tags?: string[] | null;
  ai_tags?: string[] | null;
  search_aliases?: string[] | null;
  agent_line?: string | null;
  material?: string | null;
  product_variants?: Array<{ size?: string | number | null; stock?: number | null }> | null;
}

export interface CatalogProductFactV2 {
  productId: string | null;
  sku: string | null;
  agentLine: AgentSlugV2 | null;
  normalizedCategory: string | null;
  normalizedSubcategory: string | null;
  normalizedColor: string | null;
  material: string | null;
  finish: string | null;
  sizes: string[];
  stockTotal: number;
  price: number | null;
  tags: string[];
  synonyms: string[];
  hasMedia: boolean;
  autoCatalogEnabled: boolean;
  needsReview: boolean;
  reviewReasons: string[];
}

const COLOR_ALIASES: Record<string, string> = {
  dourada: "dourada",
  dourado: "dourada",
  ouro: "dourada",
  gold: "dourada",
  amarela: "dourada",
  prata: "prata",
  prateada: "prata",
  prateado: "prata",
  aco: "prata",
  inox: "prata",
  silver: "prata",
  preta: "preta",
  preto: "preta",
  black: "preta",
  azul: "azul",
  blue: "azul",
  rose: "rose",
  rosa: "rose",
};

const CATEGORY_ALIASES: Record<string, string> = {
  alianca: "aliancas",
  aliancas: "aliancas",
  tungstenio: "aliancas",
  anel: "aneis",
  aneis: "aneis",
  pingente: "pingente",
  pingentes: "pingente",
  medalha: "pingente",
  medalhas: "pingente",
  oculos: "oculos",
  armacao: "oculos",
  lente: "oculos",
  personalizacao: "personalizacao",
};

function firstMatchAlias(text: string, aliases: Record<string, string>): string | null {
  const normalized = normalizeTextV2(text);
  for (const [key, value] of Object.entries(aliases)) {
    if (new RegExp(`(^|\\W)${key}(\\W|$)`).test(normalized)) return value;
  }
  return null;
}

export function normalizeCatalogColorV2(value: unknown): string | null {
  const direct = normalizeTextV2(value);
  if (!direct) return null;
  return COLOR_ALIASES[direct] || firstMatchAlias(direct, COLOR_ALIASES) || direct;
}

export function normalizeCatalogCategoryV2(product: ProductLikeV2): string | null {
  const direct = normalizeTextV2(product.category);
  if (direct && CATEGORY_ALIASES[direct]) return CATEGORY_ALIASES[direct];
  if (direct) return direct;

  const combined = [
    product.name,
    product.description,
    ...(product.tags || []),
    ...(product.ai_tags || []),
    ...(product.search_aliases || []),
  ].join(" ");

  return firstMatchAlias(combined, CATEGORY_ALIASES);
}

export function inferAgentLineV2(category: string | null, explicit?: string | null): AgentSlugV2 | null {
  const normalizedExplicit = normalizeTextV2(explicit);
  if (["aline", "keila", "kate", "malu"].includes(normalizedExplicit)) {
    return normalizedExplicit as AgentSlugV2;
  }
  if (category === "aliancas") return "keila";
  if (category === "pingente") return "kate";
  if (category === "oculos") return "malu";
  return "aline";
}

export function inferCatalogMaterialV2(product: ProductLikeV2): string | null {
  const explicit = normalizeTextV2(product.material);
  if (explicit) return explicit;

  const combined = normalizeTextV2([product.name, product.description, ...(product.tags || [])].join(" "));
  if (/tungsten/.test(combined)) return "tungstenio";
  if (/aco|inox|steel/.test(combined)) return "aco_inox";
  if (/ouro 18|ouro18|18k/.test(combined)) return "ouro_18k";
  if (/banhad|folhead/.test(combined)) return "banhado";
  return null;
}

export function inferCatalogFinishV2(product: ProductLikeV2): string | null {
  const combined = normalizeTextV2([product.name, product.description, ...(product.tags || [])].join(" "));
  if (/escovad/.test(combined)) return "escovado";
  if (/polid|brilh/.test(combined)) return "polido";
  if (/fosco/.test(combined)) return "fosco";
  if (/grafite/.test(combined)) return "grafite";
  if (/rose/.test(combined)) return "rose";
  return null;
}

export function buildCatalogProductFactV2(product: ProductLikeV2): CatalogProductFactV2 {
  const normalizedCategory = normalizeCatalogCategoryV2(product);
  const normalizedColor = normalizeCatalogColorV2(product.color) ||
    firstMatchAlias([product.name, product.description, ...(product.tags || [])].join(" "), COLOR_ALIASES);
  const material = inferCatalogMaterialV2(product);
  const finish = inferCatalogFinishV2(product);
  const variants = Array.isArray(product.product_variants) ? product.product_variants : [];
  const stockTotal = variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock || 0)), 0);
  const sizes = Array.from(new Set(variants.map((variant) => String(variant.size || "").trim()).filter(Boolean)));
  const tags = Array.from(new Set([
    ...(product.tags || []),
    ...(product.ai_tags || []),
  ].map((tag) => normalizeTextV2(tag)).filter(Boolean)));
  const synonyms = Array.from(new Set([
    ...(product.search_aliases || []),
    normalizedCategory,
    normalizedColor,
    material,
    finish,
  ].map((tag) => normalizeTextV2(tag)).filter(Boolean)));
  const price = product.price === null || product.price === undefined || product.price === ""
    ? null
    : Number(product.price);
  const hasMedia = !!(product.image_url || product.video_url);
  const reviewReasons: string[] = [];

  if (!normalizedCategory) reviewReasons.push("categoria_ausente");
  if (!normalizedColor && normalizedCategory === "aliancas") reviewReasons.push("cor_ausente");
  if (!material && ["aliancas", "pingente"].includes(normalizedCategory || "")) reviewReasons.push("material_ausente");
  if (!Number.isFinite(price || NaN)) reviewReasons.push("preco_ausente");
  if (!hasMedia) reviewReasons.push("midia_ausente");
  if (product.active === false) reviewReasons.push("produto_inativo");

  return {
    productId: product.id || null,
    sku: product.sku || null,
    agentLine: inferAgentLineV2(normalizedCategory, product.agent_line),
    normalizedCategory,
    normalizedSubcategory: null,
    normalizedColor,
    material,
    finish,
    sizes,
    stockTotal,
    price: Number.isFinite(price || NaN) ? price : null,
    tags,
    synonyms,
    hasMedia,
    autoCatalogEnabled: reviewReasons.length === 0 && product.active !== false,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

