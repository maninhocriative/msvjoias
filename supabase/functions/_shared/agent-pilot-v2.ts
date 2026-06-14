import type { AgentSlugV2 } from "./agent-orchestrator-v2.ts";

export interface PilotConfigV2 {
  enabled: boolean;
  mode: "shadow" | "pilot" | "off";
  phones: string[];
  agents: AgentSlugV2[];
  percent: number;
}

export interface PilotDecisionV2 {
  mode: "off" | "shadow" | "pilot";
  eligible: boolean;
  reason: string;
  config: PilotConfigV2;
}

function parseList(value: string | null | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePhone(value: string): string {
  return String(value || "").replace(/[^\d]/g, "");
}

function hashPhonePercent(phone: string): number {
  const normalized = normalizePhone(phone);
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) % 10000;
  }
  return hash % 100;
}

export function readPilotConfigV2(env: Pick<typeof Deno.env, "get"> = Deno.env): PilotConfigV2 {
  const rawMode = String(env.get("AGENT_V2_MODE") || "shadow").toLowerCase();
  const mode = rawMode === "pilot" ? "pilot" : rawMode === "off" ? "off" : "shadow";
  const enabled = mode !== "off";
  const phones = parseList(env.get("AGENT_V2_PILOT_PHONES")).map(normalizePhone);
  const agents = parseList(env.get("AGENT_V2_PILOT_AGENTS"))
    .filter((agent) => ["aline", "keila", "kate", "malu"].includes(agent)) as AgentSlugV2[];
  const percent = Math.max(0, Math.min(100, Number(env.get("AGENT_V2_PILOT_PERCENT") || "0")));

  return {
    enabled,
    mode,
    phones,
    agents,
    percent,
  };
}

export function decidePilotV2(args: {
  phone: string;
  agent: AgentSlugV2;
  humanActive: boolean;
  config?: PilotConfigV2;
}): PilotDecisionV2 {
  const config = args.config || readPilotConfigV2();
  const phone = normalizePhone(args.phone);

  if (!config.enabled || config.mode === "off") {
    return { mode: "off", eligible: false, reason: "agent_v2_off", config };
  }

  if (args.humanActive) {
    return { mode: "shadow", eligible: false, reason: "human_active", config };
  }

  if (config.mode === "shadow") {
    return { mode: "shadow", eligible: false, reason: "shadow_only", config };
  }

  if (config.phones.length > 0 && config.phones.includes(phone)) {
    return { mode: "pilot", eligible: true, reason: "phone_allowlist", config };
  }

  if (config.agents.length > 0 && !config.agents.includes(args.agent)) {
    return { mode: "pilot", eligible: false, reason: "agent_not_allowed", config };
  }

  if (config.percent > 0 && hashPhonePercent(phone) < config.percent) {
    return { mode: "pilot", eligible: true, reason: "percent_bucket", config };
  }

  return { mode: "pilot", eligible: false, reason: "not_in_pilot", config };
}

