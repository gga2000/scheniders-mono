import { describe, it, expect } from "vitest";
import { extractGovernorate } from "./address-validator";

/**
 * INT-3 guard for the Waseet XLSX governorate column.
 *
 * The signature is extractGovernorate(city?, governorateCode?, addressDetails?).
 * The exporter passed the governorate CODE into the first slot, so the
 * code-resolution branch never ran and the province came from city text alone.
 * 253 real orders have a code set but a city that names no province — those
 * exported to the courier with an empty governorate while the data sat in the
 * row.
 */
describe("extractGovernorate argument slots", () => {
    it("resolves a governorate from the code, in the code slot", () => {
        const { governorate, source } = extractGovernorate(undefined, "BGD", undefined);
        expect(governorate?.code).toBe("BGD");
        expect(governorate?.nameAr).toBe("بغداد");
        expect(source).toBe("governorate_code");
    });

    it("does NOT resolve most codes passed in the city slot — the original bug", () => {
        // 16 of the 18 canonical codes return null from the city slot. BGD and
        // KOT are the only two that happen to resolve there, which is exactly why
        // this was easy to miss: a spot-check with Baghdad looks fine.
        const failsInCitySlot = [
            "AMA", "ANB", "ARB", "BAS", "BBL", "DOH", "DWN", "DYL",
            "KRB", "KRK", "MOS", "NAS", "NJF", "SAH", "SAM", "SMH",
        ];
        for (const code of failsInCitySlot) {
            expect(
                extractGovernorate(code, undefined, undefined).governorate,
                `${code} unexpectedly resolved from the city slot`,
            ).toBeNull();
        }
        // The two that do resolve, recorded so a change to either is visible.
        expect(extractGovernorate("BGD", undefined, undefined).governorate?.code).toBe("BGD");
        expect(extractGovernorate("KOT", undefined, undefined).governorate?.code).toBe("KOT");
    });

    it("still resolves from city text when there is no code", () => {
        const { governorate } = extractGovernorate("بغداد", undefined, undefined);
        expect(governorate?.code).toBe("BGD");
    });

    it("resolves every canonical code the orders table now stores", () => {
        const codes = [
            "AMA", "ANB", "ARB", "BAS", "BBL", "BGD", "DOH", "DWN", "DYL",
            "KOT", "KRB", "KRK", "MOS", "NAS", "NJF", "SAH", "SAM", "SMH",
        ];
        for (const code of codes) {
            const { governorate } = extractGovernorate(undefined, code, undefined);
            expect(governorate?.code, `${code} did not resolve`).toBe(code);
            expect(governorate?.nameAr, `${code} has no Arabic name`).toBeTruthy();
        }
    });

    it("is case and whitespace tolerant on the code", () => {
        expect(extractGovernorate(undefined, " bgd ", undefined).governorate?.code).toBe("BGD");
    });
});
