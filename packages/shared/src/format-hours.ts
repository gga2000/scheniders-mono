// =====================================================================
// Hours → "6 ساعات" / "2 days" — one formatter, correct Arabic plurals
// =====================================================================
// Three sections carried their own copy of this, and one of them rendered
// "6 ساعة" — the form Arabic uses for eleven and up. Arabic counts in
// three shapes, and a delivery promise is exactly the kind of line a
// shopper reads closely.
//
//   1        ساعة / يوم
//   2        ساعتين / يومين
//   3 – 10   ساعات / أيام
//   11+      ساعة / يوم
// =====================================================================

import type { LocaleCode } from "./types/store-config-v2";

function arabicCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** Whole hours; 24 and above are shown as days. */
export function formatHours(hours: number, locale: LocaleCode): string {
  const h = Math.max(0, Math.round(hours));
  const asDays = h >= 24;
  const n = asDays ? Math.round(h / 24) : h;

  if (locale === "en") {
    if (asDays) return `${n} ${n === 1 ? "day" : "days"}`;
    return `${n}h`;
  }
  // Arabic and Kurdish storefronts both read the Arabic form here; a
  // Kurdish-specific form is a follow-up, not a fallback to English.
  return asDays
    ? arabicCount(n, "يوم واحد", "يومين", "أيام", "يوم")
    : arabicCount(n, "ساعة واحدة", "ساعتين", "ساعات", "ساعة");
}
