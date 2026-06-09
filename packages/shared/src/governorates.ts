/**
 * Iraqi governorates with the codes the Scheniders Platform OMS expects.
 * `name` is the Arabic display name; `name_en` is the Latin name used in
 * older configs / English locale.
 */
export const IRAQ_GOVERNORATES = [
  { code: "BG", name: "بغداد", name_en: "Baghdad" },
  { code: "BA", name: "البصرة", name_en: "Basra" },
  { code: "ER", name: "أربيل", name_en: "Erbil" },
  { code: "SU", name: "السليمانية", name_en: "Sulaymaniyah" },
  { code: "DH", name: "دهوك", name_en: "Duhok" },
  { code: "NI", name: "نينوى", name_en: "Ninawa" },
  { code: "KI", name: "كركوك", name_en: "Kirkuk" },
  { code: "DI", name: "ديالى", name_en: "Diyala" },
  { code: "AN", name: "الأنبار", name_en: "Anbar" },
  { code: "BB", name: "بابل", name_en: "Babil" },
  { code: "KE", name: "كربلاء", name_en: "Karbala" },
  { code: "NA", name: "النجف", name_en: "Najaf" },
  { code: "QA", name: "القادسية", name_en: "Diwaniyah" },
  { code: "MU", name: "المثنى", name_en: "Muthanna" },
  { code: "DQ", name: "ذي قار", name_en: "Dhi Qar" },
  { code: "WA", name: "واسط", name_en: "Wasit" },
  { code: "MA", name: "ميسان", name_en: "Maysan" },
  { code: "SA", name: "صلاح الدين", name_en: "Saladin" },
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
 * Latin / Arabic). Falls back to the raw input when unrecognised so nothing
 * ever renders blank.
 */
export function governorateLabel(input: string, locale: string): string {
  const g = resolveGovernorate(input);
  if (!g) return input;
  return locale === "ar" ? g.name : g.name_en;
}
