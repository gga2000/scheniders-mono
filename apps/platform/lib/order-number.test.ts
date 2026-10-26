import { describe, it, expect } from "vitest";
import { isPastDaySystemOrderNumber, isSystemOrderNumber, merchantOrderNumberSchema } from "./order-number";

describe("isSystemOrderNumber", () => {
    it("matches what create_order_atomic generates", () => {
        expect(isSystemOrderNumber("4261020001")).toBe(true);
        expect(isSystemOrderNumber("12610201234")).toBe(true);
        expect(isSystemOrderNumber(" 3261020007 ")).toBe(true);
    });

    it("leaves every other live shape alone", () => {
        for (const v of ["7309", "RTN-41-1", "RPL-41-2", "CLN - 4261020001 -AB", "LF-SHOP-000123", "5261020001", "426102001", "261020001"]) {
            expect(isSystemOrderNumber(v)).toBe(false);
        }
    });
});

describe("merchantOrderNumberSchema", () => {
    it("trims and accepts a merchant's own number", () => {
        expect(merchantOrderNumberSchema.parse("  7310 ")).toBe("7310");
    });

    it("rejects empty, overlong and generator-format numbers", () => {
        expect(merchantOrderNumberSchema.safeParse("   ").success).toBe(false);
        expect(merchantOrderNumberSchema.safeParse("x".repeat(65)).success).toBe(false);
        expect(merchantOrderNumberSchema.safeParse("4261021001").success).toBe(false);
    });
});

describe("isPastDaySystemOrderNumber", () => {
    // 2026-10-26 00:30 in Baghdad is still 2026-10-25 in UTC, the database's current_date.
    const now = new Date("2026-10-25T21:30:00.000Z");

    it("accepts a generator number from an earlier UTC day", () => {
        expect(isPastDaySystemOrderNumber("4261024001", now)).toBe(true);
        expect(isPastDaySystemOrderNumber("1251231099", now)).toBe(true);
    });

    it("refuses today's and later days' numbers", () => {
        expect(isPastDaySystemOrderNumber("4261025001", now)).toBe(false);
        expect(isPastDaySystemOrderNumber("4261026001", now)).toBe(false);
        expect(isPastDaySystemOrderNumber("4991231001", now)).toBe(false);
    });

    it("is false for numbers outside the generator format", () => {
        expect(isPastDaySystemOrderNumber("7309", now)).toBe(false);
        expect(isPastDaySystemOrderNumber("RTN-41-1", now)).toBe(false);
    });
});
