import { IRAQ_GOVERNORATES, type GovernorateCode } from "@scheniders/shared";
import { GOVERNORATES } from "@/lib/address-validator";

/**
 * The two governorate vocabularies, and the mapping between them.
 *
 * I18N-6: the same eighteen provinces are coded twice in this monorepo.
 *   - `packages/shared` uses two letters (BG, BA, ER…). The storefront, the
 *     store builder and delivery segments speak this.
 *   - `apps/platform/lib/address-validator` uses three (BGD, BAS, ARB…), with
 *     the alias tables that let free-text Arabic addresses resolve. Every row of
 *     `orders.governorate_code` is one of these — verified against live data:
 *     exactly the canonical 18, no strays.
 *
 * Unifying them would mean migrating 23,078 live order rows to gain nothing a
 * merchant can see, so they stay as they are. What was missing is that nothing
 * connected them: either list could gain, lose or rename a province and the
 * other would not notice. This is that connection, and its test fails if the
 * two ever stop describing the same eighteen places.
 *
 * The mapping is by Arabic name, which both lists carry and both spell the same
 * way — not by code, which is exactly the assumption that produced the
 * duplicate-code mess this finding started with.
 */

/** Platform three-letter code → shared two-letter code. */
export const PLATFORM_TO_SHARED_GOVERNORATE: Record<string, GovernorateCode> = (() => {
    const byArabicName = new Map<string, GovernorateCode>();
    for (const g of IRAQ_GOVERNORATES) {
        byArabicName.set(g.name, g.code);
    }

    const mapping: Record<string, GovernorateCode> = {};
    for (const g of GOVERNORATES) {
        const shared = byArabicName.get(g.nameAr);
        if (shared) mapping[g.code] = shared;
    }
    return mapping;
})();

/** Shared two-letter code → platform three-letter code. */
export const SHARED_TO_PLATFORM_GOVERNORATE: Record<string, string> = Object.fromEntries(
    Object.entries(PLATFORM_TO_SHARED_GOVERNORATE).map(([platform, shared]) => [shared, platform]),
);

/**
 * Translate a platform governorate code for a consumer that speaks the shared
 * vocabulary. Returns undefined rather than guessing.
 */
export function toSharedGovernorateCode(platformCode: string | null | undefined): GovernorateCode | undefined {
    if (!platformCode) return undefined;
    return PLATFORM_TO_SHARED_GOVERNORATE[platformCode.toUpperCase()];
}

/** The inverse. Returns undefined rather than guessing. */
export function toPlatformGovernorateCode(sharedCode: string | null | undefined): string | undefined {
    if (!sharedCode) return undefined;
    return SHARED_TO_PLATFORM_GOVERNORATE[sharedCode.toUpperCase()];
}

/**
 * The delivery-fee settings screen keys its per-governorate map by slug, and
 * carried a THIRD hardcoded list of the same eighteen provinces to do it.
 *
 * The slugs are kept exactly as they are, because they are the keys of every
 * merchant's already-stored `delivery_fees.governorates` map and renaming them
 * would silently drop the fees behind them. What moves here is only the list
 * itself, so there is one place that knows which provinces exist, and the test
 * beside this file fails if it stops agreeing with the other two.
 */
export const DELIVERY_FEE_GOVERNORATES = [
    { id: "baghdad", nameEn: "Baghdad", nameAr: "بغداد", capital: true },
    { id: "basra", nameEn: "Basra", nameAr: "البصرة", capital: false },
    { id: "nineveh", nameEn: "Nineveh", nameAr: "نينوى", capital: false },
    { id: "erbil", nameEn: "Erbil", nameAr: "أربيل", capital: false },
    { id: "sulaymaniyah", nameEn: "Sulaymaniyah", nameAr: "السليمانية", capital: false },
    { id: "dohuk", nameEn: "Dohuk", nameAr: "دهوك", capital: false },
    { id: "kirkuk", nameEn: "Kirkuk", nameAr: "كركوك", capital: false },
    { id: "anbar", nameEn: "Anbar", nameAr: "الأنبار", capital: false },
    { id: "babel", nameEn: "Babel", nameAr: "بابل", capital: false },
    { id: "diyala", nameEn: "Diyala", nameAr: "ديالى", capital: false },
    { id: "karbala", nameEn: "Karbala", nameAr: "كربلاء", capital: false },
    { id: "maysan", nameEn: "Maysan", nameAr: "ميسان", capital: false },
    { id: "muthanna", nameEn: "Muthanna", nameAr: "المثنى", capital: false },
    { id: "najaf", nameEn: "Najaf", nameAr: "النجف", capital: false },
    { id: "qadisiyyah", nameEn: "Qadisiyyah", nameAr: "القادسية", capital: false },
    { id: "salah_al_din", nameEn: "Salah al-Din", nameAr: "صلاح الدين", capital: false },
    { id: "thi_qar", nameEn: "Thi-Qar", nameAr: "ذي قار", capital: false },
    { id: "wasit", nameEn: "Wasit", nameAr: "واسط", capital: false },
] as const;
