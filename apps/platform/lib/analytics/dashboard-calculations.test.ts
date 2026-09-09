import { describe, it, expect } from "vitest";
import {
    calculateTodayStrip,
    realizedRevenueBetween,
    formatChartWeekday,
    formatChartDayMonth,
    baghdadDayStart,
    baghdadHour,
    baghdadDayOfWeek,
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
        const total = topProductsEnhanced.reduce((s, p) => s + (p.revenue ?? 0), 0);
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

describe("COR-D3 (corrected) — delivered_at arrives WITH an offset; the parser must not shift it", () => {
    it("a zoneless timestamp is read as UTC, not as browser-local", () => {
        // Defensive only: the live column is timestamptz and never arrives in
        // this form. Kept because a zoneless value would otherwise be read as
        // browser-local, which in Baghdad (UTC+3) shifts the instant.
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

describe("TMP-D1 — boundaries resolve in Baghdad, not the browser's timezone", () => {
    it("THE BUG: an order at 01:00 Baghdad belongs to that Baghdad day", () => {
        // 2026-09-05 22:05Z is 2026-09-06 01:05 in Baghdad (UTC+3), so the Baghdad
        // day containing it starts at 2026-09-05T21:00Z. A browser in UTC would
        // have put it in the previous day.
        const instant = new Date("2026-09-05T22:05:00.000Z");
        expect(baghdadDayStart(instant).toISOString()).toBe("2026-09-05T21:00:00.000Z");
    });

    it("day start is the same instant regardless of where the browser is", () => {
        // Two instants inside the same Baghdad day resolve to one boundary.
        const morning = new Date("2026-09-06T05:00:00.000Z");   // 08:00 Baghdad
        const evening = new Date("2026-09-06T20:00:00.000Z");   // 23:00 Baghdad
        expect(baghdadDayStart(morning).toISOString())
            .toBe(baghdadDayStart(evening).toISOString());
    });

    it("buckets the hour and weekday in Baghdad, which can be the NEXT day", () => {
        // 22:05Z on Saturday the 5th is already 01:05 on Sunday the 6th in Baghdad.
        // Bucketing on the browser's UTC weekday put this order on the wrong day of
        // the peak-hours heatmap entirely.
        const instant = new Date("2026-09-05T22:05:00.000Z");
        expect(baghdadHour(instant)).toBe(1);
        expect(baghdadDayOfWeek(instant)).toBe(0);              // Sunday
        expect(instant.getUTCDay()).toBe(6);                    // ...but Saturday in UTC
    });
});

describe("I18N-D3 — chart axis labels follow the locale and Baghdad's day", () => {
    it("THE BUG: labels were en-US, so an Arabic UI showed English weekdays", () => {
        const d = new Date("2026-09-06T09:00:00.000Z");
        expect(formatChartWeekday(d, "en")).toBe("Sun");
        expect(formatChartWeekday(d, "ar")).not.toBe("Sun");   // renders in Arabic
    });

    it("orders the day before the month — en-US put the month first, wrong for Iraq", () => {
        const label = formatChartDayMonth(new Date("2026-09-06T09:00:00.000Z"), "en");
        expect(label).toMatch(/^6\s/);        // "6 Sep", not "Sep 6"
    });

    it("names the Baghdad day, not the viewer's", () => {
        // 22:05Z Saturday is already Sunday in Baghdad; the label must say Sunday
        // whatever timezone the browser is in.
        expect(formatChartWeekday(new Date("2026-09-05T22:05:00.000Z"), "en")).toBe("Sun");
    });
});

describe("COR-D1 — revenue is what was collected, not what was promised", () => {
    const iso = (d: string) => new Date(d).toISOString();

    it("THE BUG: a confirmed-but-undelivered order is not revenue", () => {
        const orders = [order({
            status: "confirmed", price: 34750,
            created_at: iso("2026-09-08T09:00:00Z"),
        })];
        expect(realizedRevenueBetween(orders, new Date("2026-09-01T00:00:00Z"))).toBe(0);
    });

    it("counts a delivered order, dated by when it was DELIVERED", () => {
        // Ordered in August, delivered in September: the money belongs to September.
        const orders = [order({
            status: "delivered", price: 50000,
            created_at: iso("2026-08-20T09:00:00Z"),
            delivered_at: "2026-09-05 10:00:00.000000",
        })];
        expect(realizedRevenueBetween(orders, new Date("2026-09-01T00:00:00Z"))).toBe(50000);
        // ...and not to August.
        expect(realizedRevenueBetween(
            orders, new Date("2026-08-01T00:00:00Z"), new Date("2026-09-01T00:00:00Z"),
        )).toBe(0);
    });

    it("falls back to completed_at when there is no delivered_at", () => {
        // `completed_at` is not part of the client Order type (the list view does not
        // select it) — the server RPC is the authoritative path for this fallback.
        const orders = [{
            ...order({ status: "completed", price: 12000, created_at: iso("2026-08-20T09:00:00Z") }),
            completed_at: iso("2026-09-05T10:00:00Z"),
        } as unknown as Order];
        expect(realizedRevenueBetween(orders, new Date("2026-09-01T00:00:00Z"))).toBe(12000);
    });

    it("excludes a realized order that carries no timestamp at all (legacy imports)", () => {
        const orders = [order({ status: "delivered", price: 9999, created_at: iso("2025-06-01T09:00:00Z") })];
        expect(realizedRevenueBetween(orders, new Date("2025-01-01T00:00:00Z"))).toBe(0);
    });

    it("today's strip reports collected money, not booked money", () => {
        const today = new Date();
        const orders = [
            order({ status: "confirmed", price: 100000, created_at: today.toISOString() }),
            order({ id: "o2", status: "delivered", price: 25000,
                    created_at: today.toISOString(),
                    delivered_at: today.toISOString().replace("T", " ").replace("Z", "") }),
        ];
        const strip = calculateTodayStrip(orders);
        expect(strip.ordersToday).toBe(2);        // both are orders
        expect(strip.revenueToday).toBe(25000);   // only one is revenue
    });
});
