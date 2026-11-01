// Chrome strings for the soft cart, checkout summary and thank-you recap
// (slice 1h, `style: "soft"`). The default style keeps its own inline text
// byte for byte; only the soft renders read this table. Every entry carries
// ar, en and ku (guarded by _kurdish-coverage via _string-tables.ts), and
// «اطلب عبر واتساب» is the same words as the express page's WhatsApp tile
// (one name per action, F12).

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

export const CART_STRINGS = {
  subtotal: { en: "Subtotal", ar: "المجموع الفرعي", ku: "کۆی لاوەکی" },
  delivery: { en: "Delivery", ar: "التوصيل", ku: "گەیاندن" },
  deliveryFree: { en: "Free", ar: "مجاني", ku: "بەخۆڕایی" },
  discount: { en: "Discount", ar: "الخصم", ku: "داشکاندن" },
  total: { en: "Total", ar: "المجموع", ku: "کۆی گشتی" },
  /** The cart's per-governorate fee range, before a governorate is chosen. */
  deliveryVaries: {
    en: "Varies by governorate: {range}",
    ar: "يختلف حسب المحافظة: {range}",
    ku: "بەپێی پارێزگا دەگۆڕێت: {range}",
  },
  /** The merchant's configured delivery window. */
  deliveryWithin: { en: "Delivery in {hours}", ar: "التوصيل خلال {hours}", ku: "گەیاندن لە ماوەی {hours}" },
  /** A checkout summary line's quantity. */
  lineQuantity: { en: "Qty {count}", ar: "الكمية {count}", ku: "بڕ {count}" },
  emptyCart: { en: "Your cart is empty.", ar: "السلة فارغة.", ku: "سەبەتەکە بەتاڵە." },
  /** The way out of an empty cart or checkout: back to the catalogue. */
  browseProducts: { en: "Browse products", ar: "شوف المنتجات", ku: "بەرهەمەکان ببینە" },
  orderOnWhatsapp: { en: "Order on WhatsApp", ar: "اطلب عبر واتساب", ku: "لە ڕێگەی واتسئاپەوە داوا بکە" },
  promoLabel: { en: "Promo code", ar: "كود الخصم", ku: "کۆدی داشکاندن" },
  promoPlaceholder: { en: "Enter code", ar: "أدخل الكود", ku: "کۆدەکە بنووسە" },
  promoApply: { en: "Apply", ar: "تطبيق", ku: "جێبەجێکردن" },
  promoInvalid: { en: "Code not valid", ar: "الكود غير صالح", ku: "کۆدەکە دروست نییە" },
  promoApplied: { en: "Code applied", ar: "تم تطبيق الكود", ku: "کۆدەکە جێبەجێکرا" },
} as const;

export type CartStringKey = keyof typeof CART_STRINGS;

/** One chrome string, with `{name}` tokens filled. */
export function cs(
  key: CartStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(CART_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
