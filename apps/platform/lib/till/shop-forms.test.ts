import { describe, expect, it } from "vitest";
import { DEFAULT_TILL_RULES, shopFormSchema, tillPinSchema, tillRulesSchema } from "./shop-forms";

describe("shopFormSchema", () => {
    it("trims, blanks become null, phone is normalised", () => {
        const out = shopFormSchema.parse({ name: "  Mansour ", address: " ", phone: "+964 770 214 8890", receipt_footer: "" });
        expect(out).toEqual({ name: "Mansour", address: null, phone: "07702148890", receipt_footer: null });
    });

    it("rejects an empty name, a long name and a bad phone", () => {
        expect(shopFormSchema.safeParse({ name: "  ", address: "", phone: "", receipt_footer: "" }).success).toBe(false);
        expect(shopFormSchema.safeParse({ name: "x".repeat(41), address: "", phone: "", receipt_footer: "" }).success).toBe(false);
        expect(shopFormSchema.safeParse({ name: "Karrada", address: "", phone: "12345", receipt_footer: "" }).success).toBe(false);
    });
});

describe("tillRulesSchema", () => {
    it("accepts the defaults and a null discount limit", () => {
        expect(tillRulesSchema.parse(DEFAULT_TILL_RULES)).toEqual(DEFAULT_TILL_RULES);
    });

    it("rejects out-of-range values and fractions of a dinar", () => {
        expect(tillRulesSchema.safeParse({ ...DEFAULT_TILL_RULES, cashier_discount_pct: 101 }).success).toBe(false);
        expect(tillRulesSchema.safeParse({ ...DEFAULT_TILL_RULES, pay_later_default_limit: 2500.5 }).success).toBe(false);
        expect(tillRulesSchema.safeParse({ ...DEFAULT_TILL_RULES, lock_after_minutes: 0 }).success).toBe(false);
    });
});

describe("tillPinSchema", () => {
    it("takes exactly 4 digits", () => {
        expect(tillPinSchema.safeParse("0420").success).toBe(true);
        expect(tillPinSchema.safeParse("042").success).toBe(false);
        expect(tillPinSchema.safeParse("04a0").success).toBe(false);
    });
});
