import { describe, expect, it } from "vitest";
import { PLAN_KEYS, PLAN_NAMES, monthlyTotal, planName } from "./plans";

describe("plan names", () => {
    it("names every plan key in both languages", () => {
        for (const key of PLAN_KEYS) {
            expect(PLAN_NAMES[key].ar.length).toBeGreaterThan(0);
            expect(PLAN_NAMES[key].en.length).toBeGreaterThan(0);
        }
    });

    it("shows the new names for the old keys", () => {
        expect(planName("starter", "ar")).toBe("البداية");
        expect(planName("growth", "en")).toBe("Team");
        expect(planName("professional", "ar")).toBe("الأعمال");
        expect(planName("enterprise", "en")).toBe("Custom");
    });

    it("shows an unknown key as it is, and nothing for none", () => {
        expect(planName("gold", "en")).toBe("gold");
        expect(planName(null, "ar")).toBe("");
    });
});

describe("monthlyTotal", () => {
    const start = { base_price_iqd: 9000, order_price_iqd: 55 };
    const business = { base_price_iqd: 89000, order_price_iqd: 40 };

    it("is the monthly price plus the fee on each delivered order", () => {
        expect(monthlyTotal(start, 0)).toBe(9000);
        expect(monthlyTotal(start, 300)).toBe(25500);
        expect(monthlyTotal(business, 3000)).toBe(209000);
    });

    it("counts whole orders and never a negative number", () => {
        expect(monthlyTotal(start, 10.9)).toBe(9550);
        expect(monthlyTotal(start, -5)).toBe(9000);
        expect(monthlyTotal(start, Number.NaN)).toBe(9000);
    });
});
