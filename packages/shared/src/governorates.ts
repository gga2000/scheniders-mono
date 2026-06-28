/**
 * Iraqi governorates with the codes the Scheniders Platform OMS expects.
 * `name` is the Arabic display name; `name_en` is the Latin name used in
 * older configs / English locale; `name_ku` is the Kurdish display name.
 */
export const IRAQ_GOVERNORATES = [
  { code: "BG", name: "بغداد", name_en: "Baghdad", name_ku: "بەغدا" },
  { code: "BA", name: "البصرة", name_en: "Basra", name_ku: "بەسرە" },
  { code: "ER", name: "أربيل", name_en: "Erbil", name_ku: "هەولێر" },
  { code: "SU", name: "السليمانية", name_en: "Sulaymaniyah", name_ku: "سلێمانی" },
  { code: "DH", name: "دهوك", name_en: "Duhok", name_ku: "دهۆک" },
  { code: "NI", name: "نينوى", name_en: "Ninawa", name_ku: "نەینەوا" },
  { code: "KI", name: "كركوك", name_en: "Kirkuk", name_ku: "کەرکووک" },
  { code: "DI", name: "ديالى", name_en: "Diyala", name_ku: "دیالە" },
  { code: "AN", name: "الأنبار", name_en: "Anbar", name_ku: "ئەنبار" },
  { code: "BB", name: "بابل", name_en: "Babil", name_ku: "بابل" },
  { code: "KE", name: "كربلاء", name_en: "Karbala", name_ku: "کەربەلا" },
  { code: "NA", name: "النجف", name_en: "Najaf", name_ku: "نەجەف" },
  { code: "QA", name: "القادسية", name_en: "Diwaniyah", name_ku: "دیوانیە" },
  { code: "MU", name: "المثنى", name_en: "Muthanna", name_ku: "موسەننا" },
  { code: "DQ", name: "ذي قار", name_en: "Dhi Qar", name_ku: "زیقار" },
  { code: "WA", name: "واسط", name_en: "Wasit", name_ku: "واسیت" },
  { code: "MA", name: "ميسان", name_en: "Maysan", name_ku: "مەیسان" },
  { code: "SA", name: "صلاح الدين", name_en: "Saladin", name_ku: "سەلاحەدین" },
] as const;

export type GovernorateCode = (typeof IRAQ_GOVERNORATES)[number]["code"];

type Governorate = (typeof IRAQ_GOVERNORATES)[number];

const GOVERNORATE_LOOKUP = new Map<string, Governorate>();
for (const g of IRAQ_GOVERNORATES) {
  GOVERNORATE_LOOKUP.set(g.code.toLowerCase(), g);
  GOVERNORATE_LOOKUP.set(g.name_en.toLowerCase(), g);
  GOVERNORATE_LOOKUP.set(g.name, g);
}

/**
 * Resolves a governorate from a code ("BG"), Latin name ("Baghdad"), or
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
