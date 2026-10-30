// Chrome strings for image_gallery's opt-in stack layout (the proof
// stack, spec §1.5). Generic UI text only: the heading, the source pill,
// the legend, the doubts and the quotes are merchant props. Every entry
// carries ar, en and ku (guarded by _kurdish-coverage via
// _string-tables.ts). The expand label goes through formatCount, so 1, 2,
// 3–10 and 11+ each read correctly in Arabic.

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { formatCount } from "./helpers/format";

export const GALLERY_STRINGS = {
  proofScope: {
    en: "{shown} of {total}, about our perfumes in general",
    ar: "{shown} من أصل {total}، على عطورنا بشكل عام",
    ku: "{shown} لە {total}، دەربارەی بۆنەکانمان بە گشتی",
  },
  proofMoreOne: { en: "See {count} more comment", ar: "شوف تعليق ثاني", ku: "لێدوانێکی تر ببینە" },
  proofMoreTwo: { en: "See {count} more comments", ar: "شوف تعليقين ثانيين", ku: "{count} لێدوانی تر ببینە" },
  proofMoreFew: { en: "See {count} more comments", ar: "شوف {count} تعليقات ثانية", ku: "{count} لێدوانی تر ببینە" },
  proofMoreMany: { en: "See {count} more comments", ar: "شوف {count} تعليق ثاني", ku: "{count} لێدوانی تر ببینە" },
  proofLess: { en: "Hide the comments", ar: "سدّ التعليقات", ku: "لێدوانەکان دابخە" },
  business: { en: "Business account", ar: "حساب شركة", ku: "هەژماری کۆمپانیا" },
} as const;

export type GalleryStringKey = keyof typeof GALLERY_STRINGS;

/** One chrome string, with `{name}` tokens filled. */
export function gs(
  key: GalleryStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(GALLERY_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

/** «شوف 6 تعليقات ثانية» — the stack's expand label, plural-correct. */
export function proofMoreLabel(count: number, locale: LocaleCode): string {
  return formatCount(count, locale, {
    one: gs("proofMoreOne", locale),
    two: gs("proofMoreTwo", locale),
    few: gs("proofMoreFew", locale),
    many: gs("proofMoreMany", locale),
    other: gs("proofMoreMany", locale),
  });
}
