import { describe, expect, it } from "vitest";
import { DEFAULT_TILL_RULES, shopFormSchema, tillPinSchema, tillRulesSchema } from "./shop-forms";

describe("shopFormSchema", () => {
    it("trims, blanks become null, phone is normalised", () => {
        const out = shopFormSchema.parse({ name: "  Mansour ", address: " ", phone: "+964 770 214 8890", receipt_footer: "", daily_goal: "", fib_qr_url: null, zaincash_qr_url: "https://x.supabase.co/qr.png" });
        expect(out).toEqual({ name: "Mansour", address: null, phone: "07702148890", receipt_footer: null, daily_goal: null, fib_qr_url: null, zaincash_qr_url: "https://x.supabase.co/qr.png" });
    });

    it("reads the daily goal with or without commas", () => {
        const base = { name: "Karrada", address: "", phone: "", receipt_footer: "", fib_qr_url: null, zaincash_qr_url: null };
        expect(shopFormSchema.parse({ ...base, daily_goal: "500,000" }).daily_goal).toBe(500000);
        expect(shopFormSchema.safeParse({ ...base, daily_goal: "0" }).success).toBe(false);
        expect(shopFormSchema.safeParse({ ...base, daily_goal: "5k" }).success).toBe(false);
    });

    it("rejects an empty name, a long name and a bad phone", () => {
        expect(shopFormSchema.safeParse({ name: "  ", address: "", phone: "", receipt_footer: "", daily_goal: "", fib_qr_url: null, zaincash_qr_url: null }).success).toBe(false);
        expect(shopFormSchema.safeParse({ name: "x".repeat(41), address: "", phone: "", receipt_footer: "", daily_goal: "", fib_qr_url: null, zaincash_qr_url: null }).success).toBe(false);
        expect(shopFormSchema.safeParse({ name: "Karrada", address: "", phone: "12345", receipt_footer: "", daily_goal: "", fib_qr_url: null, zaincash_qr_url: null }).success).toBe(false);
        expect(shopFormSchema.safeParse({ name: "Karrada", address: "", phone: "", receipt_footer: "", daily_goal: "", fib_qr_url: "http://x.com/q.png", zaincash_qr_url: null }).success).toBe(false);
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
