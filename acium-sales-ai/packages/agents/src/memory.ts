export type MemoryLayer = "short_term" | "operational" | "persistent" | "semantic";

export type MemoryFact = {
  layer: MemoryLayer;
  key: string;
  value: unknown;
  confidence: number;
};
