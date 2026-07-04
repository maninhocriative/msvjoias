export type CatalogSearchParams = {
  query?: string;
  category?: string;
  color?: string;
  onlyAvailable?: boolean;
  limit?: number;
};

export type CatalogToolResult = {
  products: Array<{
    id: string;
    name: string;
    priceCents: number | null;
    available: boolean;
    category: string | null;
    color: string | null;
  }>;
  notFound: boolean;
};

export interface CatalogTools {
  searchProducts(params: CatalogSearchParams): Promise<CatalogToolResult>;
  getProductById(id: string): Promise<CatalogToolResult["products"][number] | null>;
  getAvailableProducts(params?: CatalogSearchParams): Promise<CatalogToolResult>;
}
