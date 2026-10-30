// Chrome strings for faq_contact_split's product FAQ and its one contact
// row (spec §1.7, concept g4 A). Generic UI text only: the questions, the
// row's title and sub line, and every merchant answer are props. Every
// entry carries ar, en and ku (guarded by _kurdish-coverage via
// _string-tables.ts).

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

export const FAQ_STRINGS = {
  call: { en: "Call us", ar: "اتصل بينا", ku: "پەیوەندیمان پێوە بکە" },
  whatsapp: { en: "WhatsApp us", ar: "راسلنا واتساب", ku: "لە واتسئاپ نامەمان بۆ بنێرە" },
  askAbout: {
    en: "I have a question about {product}",
    ar: "عندي سؤال عن {product}",
    ku: "پرسیارێکم هەیە دەربارەی {product}",
  },
  orderAndTry: { en: "Order it, try it", ar: "اطلبه وجرّبه", ku: "داوای بکە و تاقی بکەرەوە" },
  sizeAnswer: { en: "The bottle is {value} ml", ar: "القنينة {value} مل", ku: "بوتڵەکە {value} مل" },
} as const;

export type FaqStringKey = keyof typeof FAQ_STRINGS;

/** One chrome string, with `{name}` tokens filled. */
export function fs(
  key: FaqStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(FAQ_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
