import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { EXPRESS_STRINGS, type ExpressStringKey } from "./strings";

/** Resolve an express chrome string and fill its `{token}` slots. */
export function xs(
  key: ExpressStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(EXPRESS_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

/** First word of a typed name — the greeting never uses more than that. */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

/** Arabic-script locales read right-to-left inside this LTR document, so
 *  rows that carry text flip their VISUAL order with a class — never `dir`. */
export function readsRtl(locale: LocaleCode): boolean {
  return locale !== "en";
}
