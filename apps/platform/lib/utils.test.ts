import { describe, expect, it } from "vitest";
import { formatCount, formatShare, formatSigned, parseWholeNumber } from "./utils";

describe("parseWholeNumber", () => {
    it("reads Latin, Arabic-Indic and Persian digits", () => {
        expect(parseWholeNumber("120")).toBe(120);
        expect(parseWholeNumber("١٢٠")).toBe(120);
        expect(parseWholeNumber("۱۲۰")).toBe(120);
    });

    it("ignores spaces and thousands separators", () => {
        expect(parseWholeNumber(" 25,000 ")).toBe(25000);
        expect(parseWholeNumber("٢٥٬٠٠٠")).toBe(25000);
    });

    it("rejects fractions, letters and empty input", () => {
        expect(parseWholeNumber("12.5")).toBeNull();
        expect(parseWholeNumber("12a")).toBeNull();
        expect(parseWholeNumber("")).toBeNull();
    });

    it("accepts a minus only when allowed", () => {
        expect(parseWholeNumber("-3")).toBeNull();
        expect(parseWholeNumber("-3", { allowNegative: true })).toBe(-3);
        expect(parseWholeNumber("−٣", { allowNegative: true })).toBe(-3);
    });
});

describe("formatCount and formatSigned", () => {
    it("write every count and change the same way: separators, a true minus, the sign on rises too", () => {
        expect(formatCount(5431)).toBe("5,431");
        expect(formatSigned(-96, "%")).toBe("\u221296%");
        expect(formatSigned(12)).toBe("+12");
        expect(formatSigned(-5944924)).toBe("\u22125,944,924");
        expect(formatSigned(2.5)).toBe("+2.5");
        expect(formatSigned(0, "%")).toBe("0%");
    });
});

describe("formatShare", () => {
    it("prints one decimal, none when whole, as the governorate card and map agree", () => {
        expect(formatShare(1, 3)).toBe("33.3%");
        expect(formatShare(1, 2)).toBe("50%");
        expect(formatShare(0, 0)).toBe("0%");
        expect(formatShare(2, 3)).toBe("66.7%");
    });
});
