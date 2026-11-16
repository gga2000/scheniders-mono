import { IRAQ_GOVERNORATES } from "@scheniders/shared";

/*
 * A shop's city is what the merchant typed at sign-up or in Settings:
 * "بغداد", "Baghdad", "baghdad ", "البصره". The console sorts shops by
 * governorate, on the city picker and on the map, so every way of writing
 * one place has to land in the same governorate.
 *
 * Each governorate here has the names a merchant may type: its Arabic and
 * Latin names (from the shared list), the console's own name, and its main
 * city where that has a name of its own (Mosul for Ninawa, Kut for Wasit).
 * The list is in the order the city picker shows it.
 */

type OmsCode = (typeof IRAQ_GOVERNORATES)[number]["oms_code"];

const CONSOLE_NAMES: Record<OmsCode, { name: string; also: readonly string[] }> = {
  BGD: { name: "Baghdad", also: [] },
  BAS: { name: "Basra", also: ["Basrah"] },
  ARB: { name: "Erbil", also: ["Arbil", "Hawler"] },
  SMH: { name: "Sulaymaniyah", also: ["Sulaimani", "Slemani"] },
  NJF: { name: "Najaf", also: [] },
  KRB: { name: "Karbala", also: [] },
  DOH: { name: "Duhok", also: ["Dohuk"] },
  KRK: { name: "Kirkuk", also: [] },
  MOS: { name: "Mosul", also: ["الموصل", "Nineveh"] },
  DYL: { name: "Diyala", also: ["بعقوبة", "Baqubah"] },
  KOT: { name: "Wasit", also: ["الكوت", "Kut"] },
  AMA: { name: "Maysan", also: ["العمارة", "Amarah"] },
  SAM: { name: "Muthanna", also: ["السماوة", "Samawah"] },
  NAS: { name: "Dhi Qar", also: ["الناصرية", "Nasiriyah"] },
  ANB: { name: "Anbar", also: ["الرمادي", "Ramadi"] },
  BBL: { name: "Babil", also: ["الحلة", "Hillah"] },
  SAH: { name: "Saladin", also: ["تكريت", "Tikrit"] },
  DWN: { name: "Qadisiyyah", also: ["الديوانية"] },
};

/** The forms one Arabic letter is typed in: أ إ آ ا are one alef, ة and ه one ending, ى and ي one ya. */
const LETTER_FORMS: Record<string, string> = {
  "ا": "[اأإآ]",
  "أ": "[اأإآ]",
  "إ": "[اأإآ]",
  "آ": "[اأإآ]",
  "ة": "[ةه]",
  "ه": "[ةه]",
  "ى": "[ىي]",
  "ي": "[ىي]",
};

/** A name as a pattern that takes each letter in any of its forms and any run of spaces between words. */
function loosely(spelling: string): string {
  return [...spelling].map((ch) => (ch === " " ? "\\s+" : (LETTER_FORMS[ch] ?? ch))).join("");
}

export type ShopGovernorate = {
  /** The governorate's three-letter code, as the map and orders use it. */
  code: OmsCode;
  /** The console's name for it: "Baghdad". */
  name: string;
  /** Every spelling, as one case-insensitive pattern. The database (~*) and the browser read the same one. */
  pattern: string;
  regex: RegExp;
};

export const SHOP_GOVERNORATES: readonly ShopGovernorate[] = (Object.keys(CONSOLE_NAMES) as OmsCode[]).map(
  (code) => {
    const { name, also } = CONSOLE_NAMES[code];
    const shared = IRAQ_GOVERNORATES.find((g) => g.oms_code === code);
    const spellings = [...new Set([name, ...(shared ? [shared.name, shared.name_en] : []), ...also])];
    const pattern = `^\\s*(${spellings.map(loosely).join("|")})\\s*$`;
    return { code, name, pattern, regex: new RegExp(pattern, "iu") };
  },
);

/** The governorate the city picker or the map names ("baghdad", "Dhi Qar"), or undefined. */
export function governorateNamed(name: string): ShopGovernorate | undefined {
  const asked = name.trim().toLowerCase();
  return SHOP_GOVERNORATES.find((g) => g.name.toLowerCase() === asked);
}

/**
 * The `city` a shops request asks for, as a governorate, or why it cannot be
 * read. No city asks for every shop. The list and the numbers above it both
 * read it here, so the two always count the same shops.
 */
export function readShopCity(asked: string | null): { governorate?: ShopGovernorate } | { error: string } {
  if (!asked) return {};
  const governorate = governorateNamed(asked);
  return governorate ? { governorate } : { error: "Unknown city" };
}

/** The governorate a shop's typed city is in, or undefined when the console cannot tell. */
export function shopGovernorate(city: string | null | undefined): ShopGovernorate | undefined {
  if (!city) return undefined;
  return SHOP_GOVERNORATES.find((g) => g.regex.test(city));
}
