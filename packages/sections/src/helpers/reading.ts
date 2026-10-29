import type { LocaleCode } from "@scheniders/shared";

/** Arabic-script locales read right-to-left inside this LTR document, so
 *  rows that carry text flip their VISUAL order with a class — never `dir`.
 *  Lives in helpers so the shared primitives can read it without pulling
 *  the express layout's string table into every bundle. */
export function readsRtl(locale: LocaleCode): boolean {
  return locale !== "en";
}

/** The reading edge as flex-column alignment classes: right for Arabic and
 *  Kurdish, left for English. Physical sides on purpose — the document is
 *  always LTR, so `start` would be the left edge in every locale. */
export function readingAlignClass(locale: LocaleCode): string {
  return readsRtl(locale) ? "items-end text-right" : "items-start text-left";
}
