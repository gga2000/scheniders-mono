import { describe, it, expect } from "vitest";
import {
    calculateEnhancedLeaderboard,
    calculateAvgTimePerStage,
    parseUtcNaiveTimestamp,
    calculateDeliverySuccessRate,
    calculateWeekOverWeek,
    calculateStaffLeaderboard,
    isDashboardOrder,
} from "./dashboard-calculations";
import type { Order } from "@/lib/supabase";

/**
 * COR-D2 / COR-D5 pins. These mirror the SQL in
 * packages/supabase/migrations/…_dashboard_metrics_line_price_revenue_and_real_orders_only.sql —
 * the client engine and the server RPC must agree, so both formulas live here.
 */

const order = (o: Partial<Order>): Order => ({
    id: "o1", status: "delivered", price: 0, items: [], city: "بغداد",
    created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-01T09:00:00Z",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture, only the read fields matter
    ...(o as any),
}) as Order;

describe("COR-D2 — product revenue is attributed by line value, not split equally", () => {
    it("THE BUG: a cheap and an expensive item in one order no longer get the same credit", () => {
        const orders = [order({
            price: 45000,
            items: [
                { name: "perfume", price: 40000, quantity: 1 },
                { name: "accessory", price: 5000, quantity: 1 },
            ],
        })];
        const { topProductsEnhanced } = calculateEnhancedLeaderboard(orders);
        const perfume = topProductsEnhanced.find(p => p.label === "perfume")!;
        const accessory = topProductsEnhanced.find(p => p.label === "accessory")!;

        expect(perfume.revenue).toBeCloseTo(40000, 6);
        expect(accessory.revenue).toBeCloseTo(5000, 6);
        // The old equal split would have credited 22,500 each.
        expect(perfume.revenue).not.toBeCloseTo(22500, 6);
    });

    it("attributed revenue sums back to the order's real price, so a discount stays honest", () => {
        // Lines total 45,000 but the customer paid 36,000 after a discount.
        const orders = [order({
            price: 36000,
            items: [
                { name: "perfume", price: 40000, quantity: 1 },
                { name: "accessory", price: 5000, quantity: 1 },
            ],
        })];
        const { topProductsEnhanced } = calculateEnhancedLeaderboard(orders);
        const total = topProductsEnhanced.reduce((s, p) => s + p.revenue, 0);
        expect(total).toBeCloseTo(36000, 6);
    });

    it("weights by quantity, not just unit price", () => {
        const orders = [order({
            price: 30000,
            items: [
                { name: "cheap-many", price: 5000, quantity: 4 },  // 20,000
                { name: "dear-one", price: 10000, quantity: 1 },   // 10,000
            ],
        })];
        const { topProductsEnhanced } = calculateEnhancedLeaderboard(orders);
        expect(topProductsEnhanced.find(p => p.label === "cheap-many")!.revenue).toBeCloseTo(20000, 6);
        expect(topProductsEnhanced.find(p => p.label === "dear-one")!.revenue).toBeCloseTo(10000, 6);
    });

    it("falls back to an equal split when no line carries a usable price", () => {
        const orders = [order({
            price: 30000,
            // Items with no `price` key at all — a real shape in the items jsonb,
            // even though the TS type marks price as required.
            items: [
                { name: "a", quantity: 1 },
                { name: "b", quantity: 1 },
            ] as unknown as Order["items"],
        })];
        const { topProductsEnhanced } = calculateEnhancedLeaderboard(orders);
        expect(topProductsEnhanced.find(p => p.label === "a")!.revenue).toBeCloseTo(15000, 6);
        expect(topProductsEnhanced.find(p => p.label === "b")!.revenue).toBeCloseTo(15000, 6);
    });
});

describe("COR-D5 — abandoned checkouts and soft-deleted rows are not orders", () => {
    it("excludes pending_checkout (an abandoned cart is not an order)", () => {
        expect(isDashboardOrder(order({ status: "pending_checkout" }))).toBe(false);
    });

    it("excludes soft-deleted rows", () => {
        expect(isDashboardOrder(
            { ...order({}), deleted_at: "2026-09-01T10:00:00Z" } as unknown as Order,
        )).toBe(false);
    });

    it("keeps suspended orders — those ARE orders", () => {
        expect(isDashboardOrder(order({ status: "suspended" }))).toBe(true);
    });

    it("keeps ordinary orders", () => {
        expect(isDashboardOrder(order({ status: "delivered" }))).toBe(true);
        expect(isDashboardOrder(order({ status: "new" }))).toBe(true);
    });
});

describe("COR-D7 — a rate with nothing behind it is not 0%", () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

    it("THE BUG: a quiet week reports no data, not a catastrophic 0%", () => {
        // A long delivery history, but nothing terminal inside the 7-day window.
        const orders = [order({ status: "delivered", updated_at: daysAgo(60), created_at: daysAgo(60) })];
        const { currentRate, trend } = calculateDeliverySuccessRate(orders);
        expect(currentRate).toBeNull();
        expect(trend).toBeNull();
    });

    it("still reports a real rate when the window has terminal orders", () => {
        const orders = [
            order({ status: "delivered", updated_at: daysAgo(1), created_at: daysAgo(2) }),
            order({ id: "o2", status: "rejected", updated_at: daysAgo(1), created_at: daysAgo(2) }),
        ];
        expect(calculateDeliverySuccessRate(orders).currentRate).toBe(50);
    });

    it("week-over-week delivery rate is null rather than 0 when nothing is terminal", () => {
        const orders = [order({ status: "new", created_at: daysAgo(1), updated_at: daysAgo(1) })];
        const rate = calculateWeekOverWeek(orders).find(m => m.label === "Delivery Rate")!;
        expect(rate.current).toBeNull();
        expect(rate.delta).toBeNull();
    });
});

describe("COR-D6 — the fallback engine does not guess at staff performance", () => {
    it("returns nothing rather than ranking people by last-toucher (bots included)", () => {
        const orders = [
            order({ last_status_changed_by_name: "WhatsApp Bot", updated_at: new Date().toISOString() }),
            order({ id: "o2", last_status_changed_by_name: "System", updated_at: new Date().toISOString() }),
        ];
        expect(calculateStaffLeaderboard(orders)).toEqual([]);
    });
});

describe("COR-D3 — delivered_at is UTC-naive, so cycle times were 3 hours short", () => {
    it("THE BUG: a zoneless timestamp is read as UTC, not as browser-local", () => {
        // Postgrest serialises `timestamp WITHOUT time zone` with no designator.
        // new Date() would treat this as local; it is really 22:00 UTC.
        expect(parseUtcNaiveTimestamp("2026-09-01 22:00:00.344756").toISOString())
            .toBe("2026-09-01T22:00:00.344Z");
    });

    it("leaves a value that already carries a zone alone", () => {
        expect(parseUtcNaiveTimestamp("2026-09-01T22:00:00.000Z").toISOString())
            .toBe("2026-09-01T22:00:00.000Z");
        expect(parseUtcNaiveTimestamp("2026-09-01T22:00:00.000+00:00").toISOString())
            .toBe("2026-09-01T22:00:00.000Z");
    });

    it("measures a 5-hour cycle as 5 hours, not 2", () => {
        const [cycle] = calculateAvgTimePerStage([order({
            status: "delivered",
            created_at: "2026-09-01T09:00:00.000Z",
            delivered_at: "2026-09-01 14:00:00.000000",   // zoneless = 14:00 UTC
        })]);
        expect(cycle.avgHours).toBeCloseTo(5, 6);
        expect(cycle.sampleSize).toBe(1);
    });

    it("counts a sub-3-hour delivery instead of discarding it", () => {
        // Under the old arithmetic this computed as -2h and the `h > 0` guard
        // deleted it, so the fastest deliveries never reached the average.
        const [cycle] = calculateAvgTimePerStage([order({
            status: "delivered",
            created_at: "2026-09-01T09:00:00.000Z",
            delivered_at: "2026-09-01 10:00:00.000000",
        })]);
        expect(cycle.sampleSize).toBe(1);
        expect(cycle.avgHours).toBeCloseTo(1, 6);
    });
});
