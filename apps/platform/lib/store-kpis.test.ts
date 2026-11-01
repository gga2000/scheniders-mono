import { describe, it, expect } from "vitest";
import { summarizeSales } from "./store-kpis";
import { storeHubWindow } from "./store-hub-window";

describe("summarizeSales", () => {
    it("counts only real sales and sums their price", () => {
        const out = summarizeSales([
            { status: "delivered", is_return: false, price: 50_000 },
            { status: "confirmed", is_return: false, price: 25_000 },
            { status: "cancelled", is_return: false, price: 99_000 },
            { status: "rejected", is_return: false, price: 10_000 },
            { status: "pending_checkout", is_return: false, price: 5_000 },
            { status: "delivered", is_return: true, price: 40_000 },
        ]);
        expect(out).toEqual({ orderCount: 2, revenue: 75_000 });
    });

    it("is zero for no orders", () => {
        expect(summarizeSales([])).toEqual({ orderCount: 0, revenue: 0 });
    });
});

describe("storeHubWindow", () => {
    it("starts at 00:00 Baghdad six days before today", () => {
        // 2026-11-01 02:00 Baghdad = 2026-10-31 23:00Z
        const { from, to } = storeHubWindow(7, Date.parse("2026-10-31T23:00:00Z"));
        expect(from.toISOString()).toBe("2026-10-25T21:00:00.000Z"); // 2026-10-26 00:00 +03
        expect(to.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    });
});
