import { describe, expect, it } from "vitest";
import { splitReportOrders, previousPeriod, reportWindow, type ReportOrder } from "./report-order-facts";
import { orderInDateWindow, windowFromDateFilter } from "@/lib/order-window";
import { calculateReturnAnalytics, calculateKPIs } from "./reports-calculations";
import { calculatePeriodComparison } from "./source-metrics";

function order(over: Partial<ReportOrder>): ReportOrder {
    return {
        created_at: "2026-10-15T10:00:00.000Z", scheduled_date: null, status: "delivered", delivered_at: null,
        contact_count: 1, city: "Baghdad", governorate_code: "BG", validated_governorate_code: null,
        rejection_reason: null, phone: "0770", needs_attention: false, attention_reasons: null,
        source: "manual", is_return: false, notes: null, price: 10000,
        refund_status: null, is_replacement: null, order_id: null, ...over,
    };
}

const range = { from: new Date("2026-10-11T00:00:00Z"), to: new Date("2026-10-20T23:59:59Z") };

describe("splitReportOrders", () => {
    it("splits current, previous and return orders by range", () => {
        const prior = previousPeriod(range);
        const rows = [
            order({}),
            order({ created_at: new Date(prior.from.getTime() + 1000).toISOString() }),
            order({ is_return: true, price: -5000 }),
            order({ created_at: "2025-01-01T00:00:00Z" }),
        ];
        const s = splitReportOrders(rows, range);
        expect(s.current).toHaveLength(1);
        expect(s.previous).toHaveLength(1);
        expect(s.returns).toHaveLength(1);
    });

    it("counts the orders Orders lists for the same days: arrived in them or scheduled for one (round 14)", () => {
        // «آخر 7 أيام» on 16 Nov: 10-16 Nov, Baghdad days.
        const week = { from: new Date("2026-11-09T21:00:00.000Z"), to: new Date("2026-11-16T20:59:59.999Z") };
        const orders = windowFromDateFilter("2026-11-10", "2026-11-16");
        if (!orders) throw new Error("no window");
        expect(reportWindow(week)).toEqual(orders);

        const rows = [
            order({ created_at: "2026-11-14T09:00:00.000Z" }),                               // arrived this week
            order({ created_at: "2026-11-02T09:00:00.000Z", scheduled_date: "2026-11-12" }), // arrived earlier, scheduled into the week
            order({ created_at: "2026-11-09T09:00:00.000Z", scheduled_date: "2026-11-12" }), // the same, and arrived in the week before
            order({ created_at: "2026-11-05T09:00:00.000Z", scheduled_date: "2026-11-20" }), // scheduled after the week
        ];
        const s = splitReportOrders(rows, week);
        expect(s.current).toEqual(rows.filter((o) => orderInDateWindow(o, orders)));
        expect(s.current).toHaveLength(3);
        // The week before holds the orders that arrived in it, whatever their schedule.
        expect(s.previous).toEqual([rows[2], rows[3]]);
    });
});

describe("range-scoped calculators", () => {
    it("return rate uses only the range's delivered sales", () => {
        const a = calculateReturnAnalytics(
            [order({ is_return: true, price: -5000 })],
            [order({}), order({ status: "rejected" })]
        );
        expect(a.totalReturns).toBe(1);
        expect(a.returnRate).toBe(100);
        expect(a.totalReturnValue).toBe(5000);
    });
    it("KPIs and comparison agree on order counts", () => {
        const cur = [order({}), order({ status: "rejected" })];
        const prev = [order({})];
        expect(calculateKPIs(cur, prev).totalOrders).toBe(2);
        expect(calculatePeriodComparison(cur, prev).current.totalOrders).toBe(2);
    });
});

describe("period comparison while nothing has finished", () => {
    it("has no delivery rate and no processing time, not 0% and 0 hours, and no change for either", () => {
        const cur = [order({ status: "pending" }), order({ status: "in_transit" })];
        const prev = [order({ delivered_at: "2026-10-17T10:00:00.000Z" })];
        const c = calculatePeriodComparison(cur, prev);
        expect(c.current.deliveryRate).toBeNull();
        expect(c.current.avgProcessingTime).toBeNull();
        expect(c.previous.deliveryRate).toBe(100);
        expect(c.previous.avgProcessingTime).toBeCloseTo(48);
        expect(c.changes.deliveryRate).toBeNull();
        expect(c.changes.avgProcessingTime).toBeNull();
    });
});

describe("csvCell", () => {
    it("escapes quotes and neutralises formulas", async () => {
        const { csvCell } = await import("@/lib/reports-export");
        expect(csvCell('a"b')).toBe('"a""b"');
        expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
        expect(csvCell("-5.2%")).toBe('"-5.2%"');
        expect(csvCell("-cmd")).toBe(`"'-cmd"`);
    });
});

describe("KPI change", () => {
    it("rates change in points and an empty baseline shows no trend", () => {
        const cur = [order({}), order({ status: "rejected" })]; // 50% delivery
        const prev = [order({}), order({}), order({ status: "rejected" }), order({})]; // 75%
        const k = calculateKPIs(cur, prev);
        expect(k.deliveryRateChange).toBeCloseTo(-25);
        const none = calculateKPIs(cur, []);
        expect(none.totalOrdersChange).toBe(0);
        expect(none.deliveryRateChange).toBe(0);
    });
});

describe("Baghdad buckets", () => {
    it("puts 22:30 UTC on the next Baghdad day, hour 1", async () => {
        const { calculateTimeAnalysis } = await import("./reports-calculations");
        const t = calculateTimeAnalysis([order({ created_at: "2026-10-31T22:30:00Z" })]); // Sat UTC -> Sun 01:30 Baghdad
        expect(t.hourlyDistribution.find(h => h.hour === 1)?.count).toBe(1);
        expect(t.dailyDistribution.find(d => d.day === "Sun")?.count).toBe(1);
    });
});

describe("formatReportDate", () => {
    it("uses the Baghdad calendar, not the device's", async () => {
        const { formatReportDate } = await import("@/lib/reports-export");
        expect(formatReportDate(new Date("2026-10-31T22:30:00Z"))).toBe("01/11/2026");
    });
});
