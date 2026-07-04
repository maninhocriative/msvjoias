const SENSITIVE_KEYS = new Set([
  "access_token",
  "token",
  "authorization",
  "app_secret",
  "client_secret",
  "password",
  "secret",
  "signature"
]);

export function sanitizePayload(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sanitizePayload);
  if (!input || typeof input !== "object") return input;

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(normalizedKey) || normalizedKey.includes("token")) {
        return [key, "[redacted]"];
      }
      return [key, sanitizePayload(value)];
    })
  );
}
