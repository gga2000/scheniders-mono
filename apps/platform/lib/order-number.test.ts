import { describe, it, expect } from "vitest";
import { isSystemOrderNumber, merchantOrderNumberSchema } from "./order-number";

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
