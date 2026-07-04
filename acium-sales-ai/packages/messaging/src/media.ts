export type StoredAttachment = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
};

export function buildMediaStorageKey(conversationId: string, messageId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `conversations/${conversationId}/messages/${messageId}/${safeName}`;
}
