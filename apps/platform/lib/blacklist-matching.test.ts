import { describe, it, expect } from "vitest";
import { normalizePhoneForSearch, normalizeIraqiPhone } from "./order-utils";

/**
 * ARCH-4 guard for blacklist matching.
 *
 * The blacklist map was keyed on the raw phone string as stored, and looked up
 * with `normalizeIraqiPhone` (which returns the local "07…" shape) from the
 * create-order modal. The two only agreed when the stored value happened to be
 * in that same shape — there is one entry today and it happens to be, which is
 * why nothing had broken yet. Stored as "+964…", "964…" or "7…", a blacklisted
 * customer would simply not have matched, and the order would have gone through.
 *
 * Both sides now key on normalizePhoneForSearch. These cases assert that every
 * shape a phone realistically arrives in collapses to the same key.
 */
const SAME_NUMBER = [
    "07701234567",
    "+9647701234567",
    "9647701234567",
    "7701234567",
    "0770 123 4567",
    "0770-123-4567",
    "(0770) 123 4567",
    "٠٧٧٠١٢٣٤٥٦٧",
    "009647701234567",
];

describe("blacklist phone matching", () => {
    it("collapses every realistic format of one number to a single key", () => {
        const keys = new Set(SAME_NUMBER.map(normalizePhoneForSearch));
        expect(keys.size, `expected one key, got ${[...keys].join(", ")}`).toBe(1);
        expect([...keys][0]).toBe("7701234567");
    });

    it("keeps different numbers apart", () => {
        expect(normalizePhoneForSearch("07701234567")).not.toBe(
            normalizePhoneForSearch("07701234568"),
        );
    });

    it("documents why the two normalizers cannot be used interchangeably as keys", () => {
        // normalizeIraqiPhone is a display/entry formatter and keeps the leading
        // zero; normalizePhoneForSearch is the matching key and strips it. Mixing
        // them is exactly the bug this guards against.
        expect(normalizeIraqiPhone("7701234567")).toBe("07701234567");
        expect(normalizePhoneForSearch("7701234567")).toBe("7701234567");
        expect(normalizeIraqiPhone("7701234567")).not.toBe(
            normalizePhoneForSearch("7701234567"),
        );
    });

    it("treats an empty or junk phone as no key rather than a match-all", () => {
        expect(normalizePhoneForSearch("")).toBe("");
        expect(normalizePhoneForSearch("abc")).toBe("");
    });
});
