import { describe, expect, it } from "vitest";
import type { PrimeBoard, PrimeNeedReason } from "./board";
import { primeStuckSummary } from "./stuck";

const board = (reasons: Record<string, PrimeNeedReason>): PrimeBoard => ({
    lists: { handed_today: [], at_branch: [], on_road: [], delivered_today: [], postponed: [], returning: [], needs: Object.keys(reasons) },
    cash: { handed_today: 0, on_road: 0, delivered_today: 0 },
    out: 0,
    reasons: new Map(Object.entries(reasons)),
});

describe("primeStuckSummary", () => {
    it("counts only the stuck parcels, sums their cash and names the governorate holding most", () => {
        const stuck = primeStuckSummary(
            board({ a: "stuck", b: "stuck", c: "stuck", d: "stuck", back: "returning" }),
            new Map([["a", 40_000], ["b", 30_000], ["c", 50_000], ["d", 23_000], ["back", 99_000]]),
            (id) => ({ a: "الأنبار", b: "الأنبار", c: " الأنبار ", d: "بغداد", back: "الأنبار" })[id],
        );
        expect(stuck).toEqual({ count: 4, cash: 143_000, city: { name: "الأنبار", count: 3 } });
    });

    it("names no governorate when none holds two", () => {
        const stuck = primeStuckSummary(board({ a: "stuck", b: "stuck" }), new Map(), (id) => (id === "a" ? "بغداد" : "البصرة"));
        expect(stuck).toEqual({ count: 2, cash: 0, city: null });
    });

    it("is null when nothing is stuck", () => {
        expect(primeStuckSummary(board({ back: "returning", asks: "needs_you" }), new Map(), () => null)).toBeNull();
    });
});
