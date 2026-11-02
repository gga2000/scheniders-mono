// Chrome strings for image_gallery's opt-in stack layout (the proof
// stack, spec §1.5). Generic UI text only: the heading, the source pill,
// the legend, the doubts and the quotes are merchant props. Every entry
// carries ar, en and ku (guarded by _kurdish-coverage via
// _string-tables.ts). The scope line goes through formatCount, so 1, 2,
// 3–10 and 11+ each read correctly in Arabic.

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { formatCount } from "./helpers/format";

export const GALLERY_STRINGS = {
  proofCountOne: {
    en: "{count} comment, about our perfumes in general",
    ar: "تعليق واحد، على عطورنا بشكل عام",
    ku: "{count} لێدوان، دەربارەی بۆنەکانمان بە گشتی",
  },
  proofCountTwo: {
    en: "{count} comments, about our perfumes in general",
    ar: "تعليقين، على عطورنا بشكل عام",
    ku: "{count} لێدوان، دەربارەی بۆنەکانمان بە گشتی",
  },
  proofCountFew: {
    en: "{count} comments, about our perfumes in general",
    ar: "{count} تعليقات، على عطورنا بشكل عام",
    ku: "{count} لێدوان، دەربارەی بۆنەکانمان بە گشتی",
  },
  proofCountMany: {
    en: "{count} comments, about our perfumes in general",
    ar: "{count} تعليق، على عطورنا بشكل عام",
    ku: "{count} لێدوان، دەربارەی بۆنەکانمان بە گشتی",
  },
  proofDot: { en: "Comment {n}", ar: "التعليق {n}", ku: "لێدوانی {n}" },
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

/** «9 تعليقات، على عطورنا بشكل عام» — the carousel's scope line,
 *  plural-correct. */
export function proofCountLabel(count: number, locale: LocaleCode): string {
  return formatCount(count, locale, {
    one: gs("proofCountOne", locale),
    two: gs("proofCountTwo", locale),
    few: gs("proofCountFew", locale),
    many: gs("proofCountMany", locale),
    other: gs("proofCountMany", locale),
  });
}
