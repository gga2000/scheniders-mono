import { IRAQ_GOVERNORATES, type GovernorateCode } from "@scheniders/shared";

const ALIAS_MAP: Record<string, GovernorateCode> = {
    // Canonical codes
    BG: "BG", BA: "BA", ER: "ER", SU: "SU", DH: "DH", NI: "NI",
    KI: "KI", DI: "DI", AN: "AN", BB: "BB", KE: "KE", NA: "NA",
    QA: "QA", MU: "MU", DQ: "DQ", WA: "WA", MA: "MA", SA: "SA",

    // 3-letter abbreviations seen in legacy data and courier feeds
    BGD: "BG", BAG: "BG",
    BAS: "BA", BSR: "BA",
    ERB: "ER", ARB: "ER",
    SUL: "SU",
    DHK: "DH", DHU: "DH",
    NIN: "NI", MOS: "NI",
    KIR: "KI", KRK: "KI",
    DYL: "DI",
    ANB: "AN",
    BBL: "BB", BAB: "BB",
    KRB: "KE", KAR: "KE",
    NJF: "NA",
    QAD: "QA", DIW: "QA",
    MUT: "MU",
    NAS: "DQ", DHQ: "DQ", THI: "DQ",
    WST: "WA", WAS: "WA",
    MAY: "MA", AMR: "MA",
    SAL: "SA", SLD: "SA",

    // English names / common transliterations
    BAGHDAD: "BG",
    BASRA: "BA", BASRAH: "BA",
    ERBIL: "ER", IRBIL: "ER", HEWLER: "ER",
    SULAYMANIYAH: "SU", SULAIMANIYAH: "SU", SULAYMANIYA: "SU",
    DUHOK: "DH", DOHUK: "DH", DAHUK: "DH",
    NINEVEH: "NI", MOSUL: "NI", NINAWA: "NI",
    KIRKUK: "KI",
    DIYALA: "DI", BAQUBA: "DI",
    ANBAR: "AN", RAMADI: "AN",
    BABIL: "BB", BABYLON: "BB", HILLA: "BB",
    KARBALA: "KE",
    NAJAF: "NA",
    QADISIYAH: "QA", DIWANIYAH: "QA",
    MUTHANNA: "MU", SAMAWAH: "MU",
    DHIQAR: "DQ", NASIRIYAH: "DQ", NASIRIYA: "DQ",
    WASIT: "WA", KUT: "WA",
    MAYSAN: "MA", AMARA: "MA",
    SALAHADDIN: "SA", SALAHALDIN: "SA", TIKRIT: "SA",
};

const ARABIC_TO_CODE: Record<string, GovernorateCode> = (() => {
    const map: Record<string, GovernorateCode> = {};
    for (const g of IRAQ_GOVERNORATES) {
        map[g.name] = g.code;
    }
    // Common alt spellings without the leading "ال"
    map["بغداد"] = "BG";
    map["البصره"] = "BA"; map["بصره"] = "BA"; map["بصرة"] = "BA";
    map["اربيل"] = "ER"; map["هولير"] = "ER";
    map["السليمانيه"] = "SU"; map["سليمانية"] = "SU";
    map["دهوك"] = "DH";
    map["نينوى"] = "NI"; map["الموصل"] = "NI"; map["موصل"] = "NI";
    map["كركوك"] = "KI";
    map["ديالى"] = "DI"; map["ديالي"] = "DI"; map["بعقوبة"] = "DI";
    map["الانبار"] = "AN"; map["انبار"] = "AN"; map["الرمادي"] = "AN";
    map["بابل"] = "BB"; map["الحلة"] = "BB";
    map["كربلاء"] = "KE";
    map["النجف"] = "NA"; map["نجف"] = "NA";
    map["القادسية"] = "QA"; map["الديوانية"] = "QA"; map["الديوانيه"] = "QA";
    map["المثنى"] = "MU"; map["السماوة"] = "MU";
    map["ذي قار"] = "DQ"; map["ذيقار"] = "DQ"; map["الناصرية"] = "DQ"; map["ناصرية"] = "DQ";
    map["واسط"] = "WA"; map["الكوت"] = "WA";
    map["ميسان"] = "MA"; map["العمارة"] = "MA";
    map["صلاح الدين"] = "SA"; map["صلاحالدين"] = "SA"; map["تكريت"] = "SA";
    return map;
})();

const CODE_TO_NAME: Record<GovernorateCode, string> = (() => {
    const map = {} as Record<GovernorateCode, string>;
    for (const g of IRAQ_GOVERNORATES) map[g.code] = g.name;
    return map;
})();

/**
 * Normalize a free-form governorate/city string (Arabic name, English name,
 * 2- or 3-letter code) into the canonical 2-letter governorate code.
 * Returns the original input (uppercased) when no match is found so callers
 * can still group rows under a stable key.
 */
export function normalizeGovernorate(raw: string | null | undefined): string {
    if (!raw) return "Unknown";
    const trimmed = raw.trim();
    if (!trimmed) return "Unknown";

    // Arabic match first — preserves diacritics-free comparison
    const stripped = trimmed.replace(/[ً-ْ]/g, "");
    if (ARABIC_TO_CODE[stripped]) return ARABIC_TO_CODE[stripped];
    if (ARABIC_TO_CODE[trimmed]) return ARABIC_TO_CODE[trimmed];

    // Latin / code match (case-insensitive)
    const upper = stripped.toUpperCase();
    if (ALIAS_MAP[upper]) return ALIAS_MAP[upper];

    return upper;
}

/** Display the canonical Arabic name for a governorate code, or the raw key. */
export function governorateLabel(key: string): string {
    return CODE_TO_NAME[key as GovernorateCode] || key;
}
