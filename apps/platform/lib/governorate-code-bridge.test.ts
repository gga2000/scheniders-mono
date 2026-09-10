import { describe, it, expect } from "vitest";
import { IRAQ_GOVERNORATES } from "@scheniders/shared";
import { GOVERNORATES } from "./address-validator";
import {
    PLATFORM_TO_SHARED_GOVERNORATE,
    DELIVERY_FEE_GOVERNORATES,
    toSharedGovernorateCode,
    toPlatformGovernorateCode,
} from "./governorate-code-bridge";

/**
 * I18N-6 guard. The same eighteen provinces are coded twice — two letters in
 * packages/shared, three in the platform's address validator — and nothing
 * connected the two lists, so either could drift without the other noticing.
 *
 * The eighteen codes below are the ones live order rows actually carry.
 */
const CODES_IN_LIVE_ORDERS = [
    "BGD", "BAS", "ARB", "KRK", "DOH", "MOS", "BBL", "SMH", "ANB",
    "DYL", "NJF", "KRB", "NAS", "KOT", "SAH", "SAM", "AMA", "DWN",
];

describe("governorate vocabularies", () => {
    it("both describe the same eighteen provinces", () => {
        expect(IRAQ_GOVERNORATES).toHaveLength(18);
        expect(GOVERNORATES).toHaveLength(18);
    });

    it("maps every platform code to a shared one", () => {
        for (const g of GOVERNORATES) {
            expect(
                PLATFORM_TO_SHARED_GOVERNORATE[g.code],
                `${g.code} (${g.nameAr}) has no counterpart in packages/shared`,
            ).toBeDefined();
        }
        expect(Object.keys(PLATFORM_TO_SHARED_GOVERNORATE)).toHaveLength(18);
    });

    it("covers every code that appears in live order data", () => {
        for (const code of CODES_IN_LIVE_ORDERS) {
            expect(toSharedGovernorateCode(code), `${code} is unmapped`).toBeDefined();
        }
    });

    it("round-trips in both directions", () => {
        for (const g of GOVERNORATES) {
            const shared = toSharedGovernorateCode(g.code);
            expect(toPlatformGovernorateCode(shared)).toBe(g.code);
        }
    });

    it("maps no two provinces onto the same shared code", () => {
        const shared = Object.values(PLATFORM_TO_SHARED_GOVERNORATE);
        expect(new Set(shared).size).toBe(shared.length);
    });

    it("returns undefined for an unknown code rather than guessing", () => {
        expect(toSharedGovernorateCode("ZZZ")).toBeUndefined();
        expect(toSharedGovernorateCode(null)).toBeUndefined();
        expect(toPlatformGovernorateCode("ZZ")).toBeUndefined();
    });

    it("keeps the delivery-fee slugs describing the same eighteen provinces", () => {
        // The slugs themselves must not change: they key every merchant's stored
        // delivery_fees.governorates map, and renaming one drops the fee behind it.
        expect(DELIVERY_FEE_GOVERNORATES).toHaveLength(18);
        const sharedNames = new Set(IRAQ_GOVERNORATES.map((g) => g.name));
        for (const g of DELIVERY_FEE_GOVERNORATES) {
            expect(sharedNames.has(g.nameAr), `${g.id} (${g.nameAr}) is not a known province`).toBe(true);
        }
        expect(new Set(DELIVERY_FEE_GOVERNORATES.map((g) => g.id)).size).toBe(18);
        expect(DELIVERY_FEE_GOVERNORATES.filter((g) => g.capital)).toHaveLength(1);
    });

    it("spot-checks a mapping by hand", () => {
        expect(toSharedGovernorateCode("BGD")).toBe("BG");
        expect(toSharedGovernorateCode("NAS")).toBe("DQ");   // ذي قار
        expect(toSharedGovernorateCode("MOS")).toBe("NI");   // نينوى
        expect(toSharedGovernorateCode("SMH")).toBe("SU");   // السليمانية
    });
});
