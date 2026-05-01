function stripPhoneDigits(value: unknown): string {
  return String(value ?? "")
    .replace(/@[cg]\.us$/i, "")
    .replace(/\D/g, "");
}

export function normalizeWhatsappPhone(value: unknown): string {
  const digits = stripPhoneDigits(value);
  if (!digits) return "";

  if (digits.startsWith("55")) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

export function buildPhoneVariants(value: unknown): string[] {
  const rawDigits = stripPhoneDigits(value);
  const canonical = normalizeWhatsappPhone(value);
  const variants = new Set<string>();

  if (rawDigits) variants.add(rawDigits);
  if (canonical) variants.add(canonical);

  if (canonical.startsWith("55") && (canonical.length === 12 || canonical.length === 13)) {
    variants.add(canonical.slice(2));
  }

  if (!rawDigits.startsWith("55") && (rawDigits.length === 10 || rawDigits.length === 11)) {
    variants.add(`55${rawDigits}`);
  }

  return Array.from(variants).filter(Boolean);
}
