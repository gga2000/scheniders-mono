// =====================================================================
// Chrome strings — header / footer / grid UI labels per locale (P3-6)
// =====================================================================
// The global chrome used to gate every label on `locale !== "en"`, which
// handed Kurdish visitors Arabic and left the `aria-label`s English-only.
// This is the single table for those strings. Every key carries Arabic and
// English; Kurdish (Sorani) is filled where the wording is unambiguous and
// otherwise falls back to Arabic — never to English for a `ku` visitor.
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";

interface ChromeEntry {
  ar: string;
  en: string;
  ku?: string;
}

const CHROME_STRINGS = {
  // ---- header ---------------------------------------------------------
  menu: { ar: "القائمة", en: "Menu", ku: "مێنیو" },
  close: { ar: "إغلاق", en: "Close", ku: "داخستن" },
  back: { ar: "رجوع", en: "Back", ku: "گەڕانەوە" },
  search: { ar: "بحث", en: "Search", ku: "گەڕان" },
  cart: { ar: "سلة التسوّق", en: "Cart", ku: "سەبەتە" },
  language: { ar: "اللغة", en: "Language", ku: "زمان" },
  // ---- navigation -----------------------------------------------------
  home: { ar: "الرئيسية", en: "Home", ku: "سەرەکی" },
  see_all: { ar: "شوفهم كلهم", en: "See all", ku: "هەمووی ببینە" },
  /** Prefix for the money a sale actually saves: "وفّر ١١,٧٥٠ د.ع". */
  save_prefix: { ar: "وفّر", en: "Save", ku: "پاشەکەوت" },
  // ---- footer ---------------------------------------------------------
  phone_label: { ar: "رقم الهاتف:", en: "Phone:", ku: "ژمارەی تەلەفۆن:" },
  address_label: { ar: "العنوان:", en: "Address:", ku: "ناونیشان:" },
  company_legal_name_label: {
    ar: "الاسم القانوني للشركة:",
    en: "Company legal name:",
  },
  business_license_label: {
    ar: "رقم الإجازة التجارية:",
    en: "Business license:",
  },
  cash_on_delivery: {
    ar: "الدفع عند الاستلام",
    en: "Cash on delivery",
    ku: "پارەدان لە کاتی وەرگرتن",
  },
  made_in_iraq: {
    ar: "صُنع بحب في العراق 🇮🇶",
    en: "Made with love in Iraq 🇮🇶",
  },
  // ---- newsletter -----------------------------------------------------
  newsletter_placeholder: {
    ar: "بريدك الإلكتروني",
    en: "you@email.com",
    ku: "ئیمەیڵەکەت",
  },
  newsletter_button: { ar: "اشترك", en: "Subscribe", ku: "بەشداری بکە" },
  newsletter_success: {
    ar: "تم! تحقق من بريدك.",
    en: "You're in — check your inbox.",
  },
  newsletter_error: {
    ar: "حدث خطأ. حاول مرة أخرى.",
    en: "Something went wrong. Try again.",
    ku: "هەڵەیەک ڕوویدا. دووبارە هەوڵ بدە.",
  },
} as const satisfies Record<string, ChromeEntry>;

export type ChromeStringKey = keyof typeof CHROME_STRINGS;

/** Locale fallback chain for chrome strings: ku → ar → en; ar → en; en → ar. */
const CHROME_FALLBACKS: Record<LocaleCode, readonly LocaleCode[]> = {
  ku: ["ku", "ar", "en"],
  ar: ["ar", "en"],
  en: ["en", "ar"],
};

/** Resolve one chrome label for the visitor's locale. */
export function chromeString(key: ChromeStringKey, locale: LocaleCode): string {
  const entry: ChromeEntry = CHROME_STRINGS[key];
  for (const loc of CHROME_FALLBACKS[locale]) {
    const value = entry[loc];
    if (value) return value;
  }
  return entry.en;
}
