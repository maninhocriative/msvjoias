export interface CustomerTools {
  getMemory(customerId: string): Promise<unknown[]>;
  saveMemory(customerId: string, fact: string): Promise<void>;
  getPurchaseHistory(customerId: string): Promise<unknown[]>;
  updatePreferences(customerId: string, preferences: Record<string, unknown>): Promise<void>;
}
