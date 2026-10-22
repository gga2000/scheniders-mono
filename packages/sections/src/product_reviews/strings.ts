// Chrome strings for the product_reviews quiet layout: generic UI text,
// never merchant claims (the heading comes from props). Every entry
// carries ar, en and ku, guarded by _kurdish-coverage.

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

export const REVIEW_STRINGS = {
  countOne: { en: "1 review", ar: "تقييم واحد", ku: "1 هەڵسەنگاندن" },
  countMany: {
    en: "{count} reviews",
    ar: "{count} تقييم",
    ku: "{count} هەڵسەنگاندن",
  },
  averageLabel: {
    en: "Rated {avg} out of 5",
    ar: "التقييم {avg} من 5",
    ku: "هەڵسەنگاندن {avg} لە 5",
  },
  ratingLabel: { en: "{rating} out of 5", ar: "{rating} من 5", ku: "{rating} لە 5" },
  distributionLabel: {
    en: "Reviews by star rating",
    ar: "التقييمات حسب النجوم",
    ku: "هەڵسەنگاندنەکان بەپێی ئەستێرە",
  },
  starRow: {
    en: "{star} of 5: {count} reviews",
    ar: "{star} من 5: {count} تقييم",
    ku: "{star} لە 5: {count} هەڵسەنگاندن",
  },
  anonymous: { en: "Customer", ar: "زبون", ku: "کڕیار" },
  empty: {
    en: "No reviews yet. Be the first to write one",
    ar: "بعد ماكو تقييمات، كون أول واحد يقيّم",
    ku: "هێشتا هیچ هەڵسەنگاندنێک نییە، یەکەم کەس بە",
  },
  writeEntry: { en: "Write your review", ar: "اكتب تقييمك", ku: "هەڵسەنگاندنەکەت بنووسە" },
  enlargePhoto: { en: "Enlarge photo", ar: "تكبير الصورة", ku: "گەورەکردنی وێنە" },
  reviewPhoto: { en: "Review photo {n}", ar: "صورة التقييم {n}", ku: "وێنەی هەڵسەنگاندن {n}" },
} as const;

export type ReviewStringKey = keyof typeof REVIEW_STRINGS;

/** Resolve a quiet-layout chrome string and fill its `{token}` slots. */
export function rs(
  key: ReviewStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(REVIEW_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

/** «N تقييم», the store's own wording (the rating chip already reads
 *  «{count} تقييم من زبائننا»); one review reads «تقييم واحد». */
export function reviewCount(count: number, locale: LocaleCode): string {
  return count === 1 ? rs("countOne", locale) : rs("countMany", locale, { count });
}
