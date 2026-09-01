// =====================================================================
// Visitor locale resolution (EC13)
// =====================================================================
// The storefront used to render `default_locale ?? 'ar'` unconditionally, so a
// store's enabled `en`/`ku` content was unreachable and an English-speaking
// visitor still got Arabic. This resolves the locale to actually render for a
// visitor — always constrained to the locales the store enabled, so we never
// render a language the merchant didn't author.
// =====================================================================

import type { LocaleCode } from "./types/store-config-v2";

const LOCALE_CODES: readonly LocaleCode[] = ["ar", "en", "ku"];

/** Name of the cookie that records a visitor's explicit locale choice. */
export const LOCALE_COOKIE = "sb_locale";

function isLocaleCode(v: string): v is LocaleCode {
  return (LOCALE_CODES as readonly string[]).includes(v);
}

/**
 * Parse an `Accept-Language` header into base language codes, highest quality
 * first (`en-US;q=0.9, ar;q=0.8` → `["en", "ar"]`).
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.split("=")[1]) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.tag.length > 0)
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag.split("-")[0]); // base language: en-US → en
}

/**
 * Resolve the locale to render for a visitor, constrained to the store's
 * enabled locales. Priority:
 *   1. explicit cookie choice (the switcher)
 *   2. store default_locale — the merchant's configured default wins over
 *      the browser heuristic: an Iraqi store set to Arabic must open in
 *      Arabic for everyone, including en-configured browsers. Visitors who
 *      want another enabled locale pick it once via the switcher (cookie).
 *   3. Accept-Language preference (first enabled match) — only reached
 *      when the store has no usable default_locale
 *   4. first enabled locale (else "ar")
 */
export function resolveVisitorLocale(opts: {
  enabledLocales: readonly LocaleCode[] | undefined;
  defaultLocale: LocaleCode | undefined;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): LocaleCode {
  const enabled: readonly LocaleCode[] =
    opts.enabledLocales && opts.enabledLocales.length > 0
      ? opts.enabledLocales
      : ["ar"];
  const isEnabled = (l: string): l is LocaleCode =>
    isLocaleCode(l) && enabled.includes(l);

  // 1. explicit cookie choice
  if (opts.cookieLocale && isEnabled(opts.cookieLocale)) return opts.cookieLocale;

  // 2. store default — the merchant's choice outranks the browser heuristic
  if (opts.defaultLocale && isEnabled(opts.defaultLocale)) {
    return opts.defaultLocale;
  }

  // 3. Accept-Language (stores without a configured default only)
  for (const lang of parseAcceptLanguage(opts.acceptLanguage)) {
    if (isEnabled(lang)) return lang;
  }

  // 4. first enabled, else Arabic (the Iraq-market default)
  return enabled[0] ?? "ar";
}
