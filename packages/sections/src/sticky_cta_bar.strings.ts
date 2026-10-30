// Chrome strings for sticky_cta_bar (spec §1.8). Generic UI text only: the
// start label («اطلب الآن») and the submit label («ثبّت طلبي») are merchant
// props, and the icon's accessible names reuse the FAQ contact row's
// «راسلنا واتساب» / «اتصل بينا» (one name per action, F12). Every entry
// carries ar, en and ku (guarded by _kurdish-coverage via _string-tables.ts).

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

export const STICKY_STRINGS = {
  /** The bar's landmark name (moved here unchanged from the component). */
  region: { en: "Quick actions", ar: "إجراءات سريعة", ku: "کردارە خێراکان" },
  /** form_aware, some required fields filled: the big line. */
  continueOrder: { en: "Finish your order", ar: "كمّل طلبك", ku: "داواکارییەکەت تەواو بکە" },
  /** …and the small line under it, naming the first missing field. */
  stillMissing: { en: "{field} still to fill", ar: "باقي {field}", ku: "{field} ماوە" },
  /** form_aware, every required field filled: the small line under «ثبّت طلبي». */
  ready: { en: "Your details are ready", ar: "معلوماتك جاهزة", ku: "زانیارییەکانت ئامادەن" },
  /** The WhatsApp icon's message when the merchant sets none. */
  waPrefill: {
    en: "Hi, I'd like to order {product}",
    ar: "هلا، أريد أطلب {product}",
    ku: "سڵاو، دەمەوێت {product} داوا بکەم",
  },
} as const;

export type StickyStringKey = keyof typeof STICKY_STRINGS;

/** One chrome string, with `{name}` tokens filled. */
export function ss(
  key: StickyStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(STICKY_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
