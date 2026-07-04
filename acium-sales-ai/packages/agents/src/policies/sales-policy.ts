export const salesPolicy = {
  requireCatalogLookupForProductClaims: true,
  productNotFoundFlow: ["offer_near_alternative", "handoff_if_customer_insists", "log_missing_product"]
} as const;
