export type Env = {
  DB: D1Database;
  META_WEBHOOK_QUEUE: Queue;
  MEDIA_BUCKET: R2Bucket;
  CONVERSATION_ROOM: DurableObjectNamespace;
  META_VERIFY_TOKEN: string;
  META_WEBHOOK_SECRET?: string;
};
