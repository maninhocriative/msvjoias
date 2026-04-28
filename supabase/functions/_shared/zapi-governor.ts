const GOVERNOR_SETTINGS_KEY = "zapi_dispatch_governor";
const GOVERNOR_LOCK_KEY = "__zapi_dispatch_lock__";

const DEFAULT_MIN_GAP_MS = 8000;
const DEFAULT_BURST_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_AUTOMATIC_SENDS_PER_WINDOW = 20;
const DEFAULT_STALE_LOCK_MS = 90 * 1000;
const DEFAULT_LOCK_RETRY_MS = 300;
const DEFAULT_MAX_LOCK_ATTEMPTS = 120;

export interface ZapiGovernorSettings {
  enabled: boolean;
  minGapMs: number;
  burstWindowMs: number;
  maxAutomaticSendsPerWindow: number;
  staleLockMs: number;
}

export interface ZapiGovernorOptions {
  lane?: "manual" | "conversation" | "followup" | "campaign";
  bypassBurstLimit?: boolean;
  lockRetryMs?: number;
  maxLockAttempts?: number;
}

export interface ZapiGovernorResult<T> {
  blocked: boolean;
  reason: string | null;
  waitMs: number;
  result: T | null;
  settings: ZapiGovernorSettings;
}

export interface ZapiGovernorLease {
  supabase: any;
  settings: ZapiGovernorSettings;
  lane: "manual" | "conversation" | "followup" | "campaign";
  bypassBurstLimit: boolean;
  lastSentAt: number | null;
  hasSent: boolean;
  active: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseGovernorSettings(rawValue?: string | null): ZapiGovernorSettings {
  if (!rawValue) {
    return {
      enabled: true,
      minGapMs: DEFAULT_MIN_GAP_MS,
      burstWindowMs: DEFAULT_BURST_WINDOW_MS,
      maxAutomaticSendsPerWindow: DEFAULT_MAX_AUTOMATIC_SENDS_PER_WINDOW,
      staleLockMs: DEFAULT_STALE_LOCK_MS,
    };
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;

    return {
      enabled: parsed.enabled !== false,
      minGapMs: Math.max(
        toPositiveNumber(parsed.minGapMs ?? parsed.min_gap_ms, DEFAULT_MIN_GAP_MS),
        500,
      ),
      burstWindowMs: Math.max(
        toPositiveNumber(
          parsed.burstWindowMs ?? parsed.burst_window_ms,
          DEFAULT_BURST_WINDOW_MS,
        ),
        60 * 1000,
      ),
      maxAutomaticSendsPerWindow: Math.max(
        Math.floor(
          toPositiveNumber(
            parsed.maxAutomaticSendsPerWindow ?? parsed.max_automatic_sends_per_window,
            DEFAULT_MAX_AUTOMATIC_SENDS_PER_WINDOW,
          ),
        ),
        1,
      ),
      staleLockMs: Math.max(
        toPositiveNumber(parsed.staleLockMs ?? parsed.stale_lock_ms, DEFAULT_STALE_LOCK_MS),
        10 * 1000,
      ),
    };
  } catch {
    return {
      enabled: true,
      minGapMs: DEFAULT_MIN_GAP_MS,
      burstWindowMs: DEFAULT_BURST_WINDOW_MS,
      maxAutomaticSendsPerWindow: DEFAULT_MAX_AUTOMATIC_SENDS_PER_WINDOW,
      staleLockMs: DEFAULT_STALE_LOCK_MS,
    };
  }
}

async function loadGovernorSettings(supabase: any): Promise<ZapiGovernorSettings> {
  const { data, error } = await supabase
    .from("store_settings")
    .select("value")
    .eq("key", GOVERNOR_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    console.warn("[ZAPI-GOVERNOR] Erro ao carregar configuracoes:", error.message);
  }

  return parseGovernorSettings(data?.value || null);
}

async function releaseGovernorLock(supabase: any) {
  await supabase.from("processed_messages").delete().eq("message_id", GOVERNOR_LOCK_KEY);
}

async function cleanupStaleLock(supabase: any, staleLockMs: number) {
  const { data } = await supabase
    .from("processed_messages")
    .select("created_at")
    .eq("message_id", GOVERNOR_LOCK_KEY)
    .maybeSingle();

  if (!data?.created_at) return;

  const createdAt = new Date(data.created_at).getTime();
  if (!Number.isFinite(createdAt)) {
    await releaseGovernorLock(supabase);
    return;
  }

  if (Date.now() - createdAt > staleLockMs) {
    console.warn("[ZAPI-GOVERNOR] Limpando lock travado da Z-API");
    await releaseGovernorLock(supabase);
  }
}

async function acquireGovernorLock(
  supabase: any,
  lane: string,
  staleLockMs: number,
  retryMs: number,
  maxAttempts: number,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await cleanupStaleLock(supabase, staleLockMs);

    const { error } = await supabase.from("processed_messages").insert({
      message_id: GOVERNOR_LOCK_KEY,
      phone: lane,
    });

    if (!error) {
      return;
    }

    if (error.code !== "23505") {
      throw error;
    }

    await sleep(retryMs);
  }

  throw new Error("Nao foi possivel reservar a fila segura da Z-API.");
}

async function getRecentSendStats(supabase: any, burstWindowMs: number) {
  const since = new Date(Date.now() - burstWindowMs).toISOString();

  const { data, error } = await supabase
    .from("messages")
    .select("created_at")
    .eq("is_from_me", true)
    .is("deleted_at", null)
    .in("status", ["sent", "sending", "delivered", "read"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    throw error;
  }

  const items = data || [];
  const latestCreatedAt = items[0]?.created_at ? new Date(items[0].created_at).getTime() : null;

  return {
    count: items.length,
    latestCreatedAt,
  };
}

export async function sendWithZapiGovernor<T>(
  supabase: any,
  options: ZapiGovernorOptions,
  sender: () => Promise<T>,
): Promise<ZapiGovernorResult<T>> {
  const leaseResult = await acquireZapiGovernorLease(supabase, options);

  if (leaseResult.blocked || !leaseResult.lease) {
    return {
      blocked: true,
      reason: leaseResult.reason,
      waitMs: 0,
      result: null,
      settings: leaseResult.settings,
    };
  }

  try {
    const result = await sendWithGovernorLease(leaseResult.lease, sender);
    return {
      blocked: false,
      reason: null,
      waitMs: result.waitMs,
      result: result.result,
      settings: leaseResult.settings,
    };
  } finally {
    await releaseZapiGovernorLease(leaseResult.lease);
  }
}

export async function acquireZapiGovernorLease(
  supabase: any,
  options: ZapiGovernorOptions,
): Promise<{
  blocked: boolean;
  reason: string | null;
  settings: ZapiGovernorSettings;
  lease: ZapiGovernorLease | null;
}> {
  const settings = await loadGovernorSettings(supabase);

  if (!settings.enabled) {
    return {
      blocked: false,
      reason: null,
      settings,
      lease: {
        supabase,
        settings,
        lane: options.lane || "conversation",
        bypassBurstLimit: options.bypassBurstLimit === true,
        lastSentAt: null,
        hasSent: false,
        active: false,
      },
    };
  }

  const lane = options.lane || "conversation";
  const retryMs = Math.max(options.lockRetryMs || DEFAULT_LOCK_RETRY_MS, 100);
  const maxAttempts = Math.max(options.maxLockAttempts || DEFAULT_MAX_LOCK_ATTEMPTS, 10);

  await acquireGovernorLock(
    supabase,
    lane,
    settings.staleLockMs,
    retryMs,
    maxAttempts,
  );

  try {
    const stats = await getRecentSendStats(supabase, settings.burstWindowMs);
    const burstLimitReached =
      options.bypassBurstLimit !== true &&
      stats.count >= settings.maxAutomaticSendsPerWindow;

    if (burstLimitReached) {
      await releaseGovernorLock(supabase);
      return {
        blocked: true,
        reason: "burst_limit",
        settings,
        lease: null,
      };
    }

    return {
      blocked: false,
      reason: null,
        settings,
        lease: {
          supabase,
          settings,
          lane,
          bypassBurstLimit: options.bypassBurstLimit === true,
          lastSentAt: stats.latestCreatedAt,
          hasSent: false,
          active: true,
        },
      };
  } catch (error) {
    await releaseGovernorLock(supabase);
    throw error;
  }
}

export { GOVERNOR_SETTINGS_KEY };

export async function sendWithGovernorLease<T>(
  lease: ZapiGovernorLease,
  sender: () => Promise<T>,
): Promise<{ waitMs: number; result: T }> {
  const settings = lease.settings;
  const shouldApplyGlobalGap = !lease.hasSent;
  const lastSentAt = shouldApplyGlobalGap ? lease.lastSentAt : null;
  const waitMs =
    settings.enabled && lastSentAt && Number.isFinite(lastSentAt)
      ? Math.max(settings.minGapMs - (Date.now() - lastSentAt), 0)
      : 0;

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  const result = await sender();
  lease.lastSentAt = Date.now();
  lease.hasSent = true;

  return {
    waitMs,
    result,
  };
}

export async function releaseZapiGovernorLease(lease: ZapiGovernorLease) {
  if (!lease.active) {
    return;
  }

  lease.active = false;
  await releaseGovernorLock(lease.supabase);
}
