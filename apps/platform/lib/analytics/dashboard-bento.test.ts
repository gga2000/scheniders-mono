import { describe, expect, it } from "vitest";
import {
    governorateOf,
    governoratePeriods,
    hourlyWaves,
    monthlySalesSchema,
    orderLane,
    pctChange,
    revenueCardFigures,
    seasonality,
    type MonthlySales,
} from "./dashboard-bento";
import type { TrendFact } from "./dashboard-order-facts";

// 2026-10-31 15:00 Baghdad (UTC+3).
const NOW = new Date("2026-10-31T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function fact(over: Partial<TrendFact> = {}): TrendFact {
    return {
        created_at: ago(HOUR),
        status: "new",
        delivered_at: null,
        completed_at: null,
        source: "lightfunnels",
        governorate_code: null,
        validated_governorate_code: null,
        price: 25_000,
        ...over,
    };
}

describe("pctChange", () => {
    it("is null with nothing to compare against", () => {
        expect(pctChange(5, 0)).toBeNull();
    });
    it("is the change in percent", () => {
        expect(pctChange(15, 10)).toBe(50);
        expect(pctChange(5, 10)).toBe(-50);
    });
});

describe("revenueCardFigures", () => {
    it("counts orders by creation day and compares with the window before", () => {
        const facts = [
            fact({ created_at: ago(1 * DAY) }),
            fact({ created_at: ago(2 * DAY) }),
            fact({ created_at: ago(3 * DAY) }),
            fact({ created_at: ago(9 * DAY) }),
            fact({ created_at: ago(40 * DAY) }),
        ];
        const fig = revenueCardFigures(facts, 7, "orders", "en", NOW);
        expect(fig.series).toHaveLength(7);
        expect(fig.total).toBe(3);
        expect(fig.previousTotal).toBe(1);
        expect(fig.deltaPct).toBe(200);
    });

    it("counts revenue on the day it was realized, and only delivered/completed", () => {
        const facts = [
            // Created long ago, delivered yesterday: yesterday's revenue.
            fact({ created_at: ago(20 * DAY), status: "delivered", delivered_at: ago(DAY), price: 40_000 }),
            fact({ created_at: ago(2 * DAY), status: "completed", completed_at: ago(2 * DAY), price: 10_000 }),
            // Confirmed is a promise, not money.
            fact({ created_at: ago(DAY), status: "confirmed", price: 99_000 }),
        ];
        const fig = revenueCardFigures(facts, 7, "revenue", "en", NOW);
        expect(fig.total).toBe(50_000);
        expect(fig.realizedOrders).toBe(2);
        expect(fig.previousTotal).toBe(0);
        expect(fig.deltaPct).toBeNull();
    });
});

describe("orderLane", () => {
    it("splits chat-typed orders from online ones and drops courier imports", () => {
        expect(orderLane("whatsapp")).toBe("chat");
        expect(orderLane("other")).toBe("chat");
        expect(orderLane(null)).toBe("chat");
        expect(orderLane("lightfunnels")).toBe("online");
        expect(orderLane("meta")).toBe("online");
        expect(orderLane("delivery_import")).toBeNull();
    });
});

describe("hourlyWaves", () => {
    it("buckets by week and Baghdad hour, per lane", () => {
        const facts = [
            // 12:00Z yesterday = 15:00 Baghdad
            fact({ created_at: ago(DAY), source: "lightfunnels" }),
            fact({ created_at: ago(DAY), source: "whatsapp" }),
            fact({ created_at: ago(DAY + HOUR), source: "meta" }),
            fact({ created_at: ago(8 * DAY), source: "lightfunnels" }),
            fact({ created_at: ago(2 * DAY), source: "delivery_import" }),
            fact({ created_at: ago(30 * DAY), source: "lightfunnels" }),
        ];
        const w = hourlyWaves(facts, NOW);
        expect(w.online[0][15]).toBe(1);
        expect(w.online[0][14]).toBe(1);
        expect(w.chat[0][15]).toBe(1);
        expect(w.online[1][15]).toBe(1);
        expect(w.thisWeek).toBe(3);
        expect(w.lastWeek).toBe(1);
        expect(w.deltaPct).toBe(200);
        expect(w.peakHour).toBe(15);
    });

    it("has no peak with no orders", () => {
        expect(hourlyWaves([], NOW).peakHour).toBeNull();
    });
});

describe("governorates", () => {
    it("prefers the validated code and folds unknown codes together", () => {
        expect(governorateOf({ governorate_code: "BGD", validated_governorate_code: "BAS" })).toBe("BAS");
        expect(governorateOf({ governorate_code: "BGD", validated_governorate_code: null })).toBe("BGD");
        expect(governorateOf({ governorate_code: "XYZ", validated_governorate_code: null })).toBe("unknown");
        expect(governorateOf({ governorate_code: null, validated_governorate_code: null })).toBe("unknown");
    });

    it("counts each period and compares today with yesterday up to the same hour", () => {
        const facts = [
            fact({ created_at: ago(HOUR), governorate_code: "BGD" }),
            fact({ created_at: ago(2 * HOUR), governorate_code: "BAS" }),
            // Yesterday, before this hour: counts toward the comparison.
            fact({ created_at: ago(DAY + HOUR), governorate_code: "BGD" }),
            // Yesterday, after this hour: does not.
            fact({ created_at: ago(DAY - 2 * HOUR), governorate_code: "BGD" }),
            fact({ created_at: ago(10 * DAY), governorate_code: null }),
        ];
        const p = governoratePeriods(facts, NOW);
        expect(p.today.total).toBe(2);
        expect(p.today.previousTotal).toBe(1);
        expect(p.today.deltaPct).toBe(100);
        expect(p["7d"].total).toBe(4);
        expect(p["7d"].counts.get("BGD")).toBe(3);
        expect(p["7d"].previousTotal).toBe(1);
        expect(p["30d"].counts.get("unknown")).toBe(1);
        expect(p["30d"].total).toBe(5);
    });
});

describe("seasonality", () => {
    const month = (i: number, orders: number, revenue: number | null = orders * 1000): MonthlySales => {
        const d = new Date(Date.UTC(2024, 10 + i, 1));
        return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, orders, revenue };
    };

    it("leaves the running month off the shape and hides an empty prior year", () => {
        const rows = [
            ...Array.from({ length: 12 }, (_, i) => month(i, 0)),
            ...Array.from({ length: 12 }, (_, i) => month(12 + i, i + 1)),
            month(24, 3),
        ];
        const s = seasonality(rows, "orders");
        expect(s.current?.orders).toBe(3);
        expect(s.years[0].months).toHaveLength(12);
        expect(s.years[0].total).toBe(78);
        expect(s.years[0].monthlyAverage).toBe(6.5);
        expect(s.years[0].best?.orders).toBe(12);
        expect(s.years[0].quietest?.orders).toBe(1);
        expect(s.years[0].deltaPct).toBeNull();
        expect(s.years[1]).toBeNull();
    });

    it("compares with the prior year when it has orders, on the chosen measure", () => {
        const rows = [
            ...Array.from({ length: 12 }, (_, i) => month(i, 1)),
            ...Array.from({ length: 12 }, (_, i) => month(12 + i, 2)),
            month(24, 0),
        ];
        const s = seasonality(rows, "revenue");
        expect(s.years[0].total).toBe(24_000);
        expect(s.years[0].deltaPct).toBe(100);
        expect(s.years[1]?.total).toBe(12_000);
    });

    it("rejects a malformed RPC payload", () => {
        expect(monthlySalesSchema.safeParse([{ month: "2026-10", orders: 3, revenue: null }]).success).toBe(true);
        expect(monthlySalesSchema.safeParse([{ month: "Oct", orders: 3, revenue: null }]).success).toBe(false);
        expect(monthlySalesSchema.safeParse([{ month: "2026-10", orders: -1, revenue: 0 }]).success).toBe(false);
    });
});
