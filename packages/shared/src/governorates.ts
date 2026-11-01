/**
 * Iraqi governorates with the codes the Scheniders Platform OMS expects.
 * `oms_code` is the three-letter code the order editor stores in
 * `orders.governorate_code` (apps/platform/lib/address-validator.ts), so a
 * stored order resolves to a name instead of surfacing "MOS" to a shopper.
 * `name` is the Arabic display name; `name_en` is the Latin name used in
 * older configs / English locale; `name_ku` is the Kurdish display name.
 */
export const IRAQ_GOVERNORATES = [
  { code: "BG", oms_code: "BGD", name: "بغداد", name_en: "Baghdad", name_ku: "بەغدا" },
  { code: "BA", oms_code: "BAS", name: "البصرة", name_en: "Basra", name_ku: "بەسرە" },
  { code: "ER", oms_code: "ARB", name: "أربيل", name_en: "Erbil", name_ku: "هەولێر" },
  { code: "SU", oms_code: "SMH", name: "السليمانية", name_en: "Sulaymaniyah", name_ku: "سلێمانی" },
  { code: "DH", oms_code: "DOH", name: "دهوك", name_en: "Duhok", name_ku: "دهۆک" },
  { code: "NI", oms_code: "MOS", name: "نينوى", name_en: "Ninawa", name_ku: "نەینەوا" },
  { code: "KI", oms_code: "KRK", name: "كركوك", name_en: "Kirkuk", name_ku: "کەرکووک" },
  { code: "DI", oms_code: "DYL", name: "ديالى", name_en: "Diyala", name_ku: "دیالە" },
  { code: "AN", oms_code: "ANB", name: "الأنبار", name_en: "Anbar", name_ku: "ئەنبار" },
  { code: "BB", oms_code: "BBL", name: "بابل", name_en: "Babil", name_ku: "بابل" },
  { code: "KE", oms_code: "KRB", name: "كربلاء", name_en: "Karbala", name_ku: "کەربەلا" },
  { code: "NA", oms_code: "NJF", name: "النجف", name_en: "Najaf", name_ku: "نەجەف" },
  { code: "QA", oms_code: "DWN", name: "القادسية", name_en: "Diwaniyah", name_ku: "دیوانیە" },
  { code: "MU", oms_code: "SAM", name: "المثنى", name_en: "Muthanna", name_ku: "موسەننا" },
  { code: "DQ", oms_code: "NAS", name: "ذي قار", name_en: "Dhi Qar", name_ku: "زیقار" },
  { code: "WA", oms_code: "KOT", name: "واسط", name_en: "Wasit", name_ku: "واسیت" },
  { code: "MA", oms_code: "AMA", name: "ميسان", name_en: "Maysan", name_ku: "مەیسان" },
  { code: "SA", oms_code: "SAH", name: "صلاح الدين", name_en: "Saladin", name_ku: "سەلاحەدین" },
] as const;

export type GovernorateCode = (typeof IRAQ_GOVERNORATES)[number]["code"];

type Governorate = (typeof IRAQ_GOVERNORATES)[number];

const GOVERNORATE_LOOKUP = new Map<string, Governorate>();
for (const g of IRAQ_GOVERNORATES) {
  GOVERNORATE_LOOKUP.set(g.code.toLowerCase(), g);
  GOVERNORATE_LOOKUP.set(g.oms_code.toLowerCase(), g);
  GOVERNORATE_LOOKUP.set(g.name_en.toLowerCase(), g);
  GOVERNORATE_LOOKUP.set(g.name, g);
}

/**
 * Resolves a governorate from a code ("BG"), an order's OMS code ("BGD"), Latin name ("Baghdad"), or
 * Arabic name ("بغداد") — case-insensitively. Returns undefined if unknown.
 */
export function resolveGovernorate(input: string): Governorate | undefined {
  const v = input.trim();
  return GOVERNORATE_LOOKUP.get(v.toLowerCase()) ?? GOVERNORATE_LOOKUP.get(v);
}

/**
 * Localized display label for a governorate given any of its forms (code /
 * Latin / Arabic). Returns the Arabic name for "ar", the Kurdish name
 * (`name_ku`) for "ku", and the Latin name otherwise. Falls back to the raw
 * input when unrecognised so nothing ever renders blank.
 */
export function governorateLabel(input: string, locale: string): string {
  const g = resolveGovernorate(input);
  if (!g) return input;
  if (locale === "ar") return g.name;
  if (locale === "ku") return g.name_ku;
  return g.name_en;
}
