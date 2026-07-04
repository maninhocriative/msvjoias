export const CHANNELS = ["whatsapp", "instagram", "facebook"] as const;

export type Channel = (typeof CHANNELS)[number];
