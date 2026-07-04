export interface PaymentTools {
  createCharge(orderId: string): Promise<{ chargeId: string; paymentUrl: string }>;
  getPaymentStatus(chargeId: string): Promise<{ chargeId: string; status: string }>;
  handleProof(messageId: string): Promise<{ requiresHumanReview: boolean; reason?: string }>;
}
