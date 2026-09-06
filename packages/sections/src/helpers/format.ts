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
export function formatPrice(
  amount: number,
  locale?: "ar" | "en" | "ku",
): string {
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

type CountLocale = "ar" | "en" | "ku";

/**
 * Plural forms keyed by CLDR category. `other` is mandatory (every locale has
 * it); the rest are optional so English callers pass `{ one, other }` while
 * Arabic callers can spell out `zero/one/two/few/many` ("عنصر", "عنصران",
 * "عناصر", "عنصراً"). `{count}` inside a form is replaced with the Latin-digit
 * count — the storefront never prints Arabic-Indic digits (prices don't).
 */
export type CountForms = Partial<Record<Intl.LDMLPluralRule, string>> & {
  other: string;
};

/**
 * Locale-aware count string via `Intl.PluralRules`, replacing the ad-hoc
 * `${n} item${n === 1 ? "" : "s"}` / `${n} عنصر` pairs (Arabic has six plural
 * categories, so a single form is wrong for 2 and for 3–10). Kurdish (Sorani)
 * copy is not authored yet — it resolves through `ar` rules like the rest of
 * the storefront's ku fallback chain.
 */
export function formatCount(
  count: number,
  locale: CountLocale,
  forms: CountForms,
): string {
  const rules = new Intl.PluralRules(locale === "en" ? "en" : "ar");
  const category = rules.select(count);
  const form = forms[category] ?? forms.other;
  return form.replace("{count}", String(count));
}
