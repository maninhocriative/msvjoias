export type DraftOrderInput = {
  customerId: string;
  conversationId: string;
  items: Array<{ productId: string; variantId?: string; quantity: number }>;
};

export interface OrderTools {
  createDraftOrder(input: DraftOrderInput): Promise<{ orderId: string; status: "draft" }>;
  updateDraftOrder(orderId: string, input: Partial<DraftOrderInput>): Promise<{ orderId: string }>;
  confirmOrder(orderId: string): Promise<{ orderId: string; status: "confirmed" }>;
  getOrderStatus(orderId: string): Promise<{ orderId: string; status: string }>;
}
