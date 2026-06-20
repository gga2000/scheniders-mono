/** Locale-aware IQD suffix (EC35). Arabic + Kurdish (Iraqi Kurdish is written
 *  in Arabic script) use the Arabic glyph د.ع; an English UI reads better with
 *  the Latin "IQD" than Arabic currency mixed into English text. */
function iqdSuffix(locale?: "ar" | "en" | "ku"): string {
  return locale === "en" ? "IQD" : "د.ع";
}

/**
 * Schneiders price format: "85,000 د.ع" (ar/ku) or "85,000 IQD" (en).
 * - Latin digits with thousands separator (per design files)
 * - Locale-aware currency suffix; omitting `locale` keeps the Arabic glyph
 *   (back-compatible — the dominant storefront locale).
 */
export function formatPrice(amount: number, locale?: "ar" | "en" | "ku"): string {
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(amount)));
  return `${n} ${iqdSuffix(locale)}`;
}

export function formatSavings(
  original: number,
  current: number,
  locale?: "ar" | "en" | "ku",
): string | null {
  if (!original || original <= current) return null;
  return formatPrice(original - current, locale);
}
