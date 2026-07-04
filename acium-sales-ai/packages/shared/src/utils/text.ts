export function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
