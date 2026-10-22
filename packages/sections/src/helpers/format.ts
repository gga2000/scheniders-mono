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

/** `formatPrice` split into its number and currency, for layouts that set
 *  the currency smaller than the amount. Same digits, same suffix. */
export function formatPriceParts(
  amount: number,
  locale?: "ar" | "en" | "ku",
): { amount: string; currency: string } {
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(amount)));
  return { amount: n, currency: iqdSuffix(locale) };
}

/**
 * Locale-aware percent, mirroring `formatPrice`: the number carries its
 * sign as one unit ("36٪" / "36% off" in English), Latin digits either
 * way. Keeping the sign glued to the number is what lets a caller wrap
 * the pair in a single `<bdi>` — split them and the bidi algorithm drags
 * the sign to the far side of the phrase on this LTR page.
 */
export function formatPercent(
  value: number,
  locale?: "ar" | "en" | "ku",
): string {
  const n = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
  return locale === "en" ? `${n}%` : `${n}٪`;
}

/**
 * Whole-percent discount, or null when there is no REAL discount to show.
 *
 * One place decides what "on sale" means, so a badge can never claim a
 * saving the cart will not honour. `price` here is the shopper-facing
 * price (queries.ts already resolves `website_price ?? price`), and a
 * zero/negative price is treated as no discount rather than 100% off.
 */
export function discountPercent(
  price: number,
  compareAt?: number | null,
): number | null {
  if (compareAt == null) return null;
  if (!(price > 0)) return null;
  if (!(compareAt > price)) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
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
