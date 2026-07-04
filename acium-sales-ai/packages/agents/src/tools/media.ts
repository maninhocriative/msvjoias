export interface MediaTools {
  transcribeAudio(storageKey: string): Promise<string>;
  describeImage(storageKey: string): Promise<string>;
  storeAttachment(input: { url: string; conversationId: string; messageId: string }): Promise<{ storageKey: string }>;
}
