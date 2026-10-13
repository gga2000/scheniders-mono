import { describe, it, expect } from "vitest";
import {
    formatPhoneGrouped,
    formatPhoneInput,
    normalizeIraqiPhone,
    unformatPhoneInput,
} from "./order-utils";

describe("formatPhoneGrouped", () => {
    it("groups a local Iraqi mobile 4-3-4", () => {
        expect(formatPhoneGrouped("07802301677")).toBe("0780 230 1677");
    });

    it("reads +964 / 964 / 00964 / zero-less 7xx as a local 07 number", () => {
        expect(formatPhoneGrouped("+9647802301677")).toBe("0780 230 1677");
        expect(formatPhoneGrouped("9647802301677")).toBe("0780 230 1677");
        expect(formatPhoneGrouped("009647802301677")).toBe("0780 230 1677");
        expect(formatPhoneGrouped("7802301677")).toBe("0780 230 1677");
    });

    it("ignores spaces, dashes and Arabic-Indic digits in the input", () => {
        expect(formatPhoneGrouped("0780 230 1677")).toBe("0780 230 1677");
        expect(formatPhoneGrouped("0780-230-1677")).toBe("0780 230 1677");
        expect(formatPhoneGrouped("+964 780 230 1677")).toBe("0780 230 1677");
        expect(formatPhoneGrouped("٠٧٨٠٢٣٠١٦٧٧")).toBe("0780 230 1677");
    });

    it("leaves short, overlong and foreign numbers ungrouped", () => {
        expect(formatPhoneGrouped("0780230")).toBe("0780230");
        expect(formatPhoneGrouped("078023016771")).toBe("078023016771");
        expect(formatPhoneGrouped("+15551234567")).toBe("+15551234567");
        expect(formatPhoneGrouped("0612345678")).toBe("0612345678");
    });

    it("returns empty for missing input", () => {
        expect(formatPhoneGrouped("")).toBe("");
        expect(formatPhoneGrouped(null)).toBe("");
        expect(formatPhoneGrouped(undefined)).toBe("");
    });
});

describe("phone input mask", () => {
    it("groups progressively as digits are typed", () => {
        const typed = "07802301677";
        const shown = Array.from({ length: typed.length }, (_, i) => formatPhoneInput(typed.slice(0, i + 1)));
        expect(shown).toEqual([
            "0", "07", "078", "0780",
            "0780 2", "0780 23", "0780 230",
            "0780 230 1", "0780 230 16", "0780 230 167", "0780 230 1677",
        ]);
    });

    it("shows anything that is not a local 0-prefixed run of ≤11 digits exactly as typed", () => {
        for (const v of ["+9647802301677", "9647802301677", "7802301677", "078023016771", "07a8", ""]) {
            expect(formatPhoneInput(v)).toBe(v);
        }
    });

    it("round-trips: the stored value never contains the display spaces", () => {
        for (const raw of ["0", "0780", "07802", "0780230", "07802301677", "+9647802301677", "7802301677", "٠٧٨٠٢٣٠١٦٧٧"]) {
            expect(unformatPhoneInput(formatPhoneInput(raw))).toBe(raw);
        }
    });

    it("submits the same normalized value as before the mask existed", () => {
        // Before: state held what was typed; submit ran normalizeIraqiPhone on it.
        for (const typed of ["07802301677", "0780 230 1677", "+964 780 230 1677", "7802301677"]) {
            const stateNow = unformatPhoneInput(formatPhoneInput(unformatPhoneInput(typed)));
            expect(normalizeIraqiPhone(stateNow)).toBe(normalizeIraqiPhone(typed));
            expect(normalizeIraqiPhone(stateNow)).toBe("07802301677");
        }
    });
});
