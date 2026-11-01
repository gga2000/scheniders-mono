import { describe, expect, it } from "vitest";
import type { ReportOrder } from "./report-order-facts";
import {
    calculateAttentionFlags,
    calculateCityPerformance,
    calculateContactAttempts,
    calculateKPIs,
    calculateRejectionReasons,
    calculateStatusFlow,
    calculateTimeAnalysis,
} from "./reports-calculations";
import { calculateSourcePerformance } from "./source-metrics";

function order(over: Partial<ReportOrder> = {}): ReportOrder {
    return {
        created_at: "2026-10-15T10:00:00.000Z", status: "delivered", delivered_at: null,
        contact_count: 1, city: "Baghdad", governorate_code: "BG", validated_governorate_code: null,
        rejection_reason: null, phone: "07701234567", needs_attention: false, attention_reasons: null,
        address_status: null, source: "manual", is_return: false, notes: null, price: 10000, ...over,
    };
}

describe("calculateKPIs", () => {
    it("delivery and rejection rates share one denominator: delivered + rejected", () => {
        const k = calculateKPIs([
            order({ status: "delivered" }), order({ status: "completed" }),
            order({ status: "rejected" }), order({ status: "new" }), order({ status: "in_transit" }),
        ]);
        expect(k.deliveryRate).toBeCloseTo((2 / 3) * 100);
        expect(k.rejectionRate).toBeCloseTo((1 / 3) * 100);
        expect(k.deliveryRate + k.rejectionRate).toBeCloseTo(100);
    });

    it("an empty period is all zeros, not NaN", () => {
        const k = calculateKPIs([]);
        for (const v of Object.values(k)) expect(Number.isFinite(v)).toBe(true);
        expect(k.totalOrders).toBe(0);
    });

    it("shows no change at all when the previous period is empty", () => {
        const k = calculateKPIs([order()], []);
        expect(k.totalOrdersChange).toBe(0);
        expect(k.deliveryRateChange).toBe(0);
    });

    it("rate change is in percentage points, count change is relative", () => {
        const cur = [order(), order(), order({ status: "rejected" }), order({ status: "rejected" })];
        const prev = [order(), order(), order(), order({ status: "rejected" })];
        const k = calculateKPIs(cur, prev);
        expect(k.deliveryRateChange).toBeCloseTo(50 - 75);
        expect(k.totalOrdersChange).toBe(0);
        expect(calculateKPIs([...cur, ...cur], prev).totalOrdersChange).toBe(100);
    });

    it("averages processing time over delivered orders only", () => {
        const k = calculateKPIs([
            order({ delivered_at: "2026-10-15T22:00:00.000Z" }),
            order({ delivered_at: "2026-10-16T10:00:00.000Z" }),
            order({ status: "new" }),
        ]);
        expect(k.avgProcessingTime).toBeCloseTo(18);
    });
});

describe("calculateStatusFlow", () => {
    it("percentages are of all orders and unknown statuses are not dropped silently from the total", () => {
        const flow = calculateStatusFlow([order({ status: "new" }), order({ status: "new" }), order()]);
        expect(flow.map((f) => f.status)).toEqual(["new", "delivered"]);
        expect(flow[0]?.percentage).toBeCloseTo(200 / 3);
    });
});

describe("calculateContactAttempts", () => {
    it("buckets 3+ together and counts confirmations per bucket", () => {
        const r = calculateContactAttempts([
            order({ contact_count: 0, status: "new" }),
            order({ contact_count: 5, status: "confirmed" }),
            order({ contact_count: 3, status: "no_response" }),
        ]);
        expect(r.map((b) => b.count)).toEqual([1, 0, 0, 2]);
        expect(r[3]?.confirmationRate).toBe(50);
        expect(r[1]?.confirmationRate).toBe(0);
    });
});

describe("calculateCityPerformance", () => {
    it("ranks by volume and computes delivery days only from delivered orders with a date", () => {
        const r = calculateCityPerformance([
            order({ city: "Basra", delivered_at: "2026-10-17T10:00:00.000Z" }),
            order({ city: "Basra", status: "rejected" }),
            order({ city: "Erbil" }),
            order({ city: "Erbil" }),
            order({ city: "Erbil", status: "no_response" }),
        ]);
        expect(r[0]?.city).toBe("Erbil");
        const basra = r.find((c) => c.city === "Basra");
        expect(basra?.deliveryRate).toBe(50);
        expect(basra?.avgDeliveryDays).toBeCloseTo(2);
        expect(r.find((c) => c.city === "Erbil")?.noResponse).toBe(1);
    });

    it("falls back to the governorate code, then Unknown", () => {
        const r = calculateCityPerformance([
            order({ city: "", governorate_code: "NI" }),
            order({ city: "", governorate_code: "" }),
        ]);
        expect(r.map((c) => c.city).sort()).toEqual(["NI", "Unknown"]);
    });
});

describe("calculateRejectionReasons", () => {
    it("ignores non-rejected orders and groups blank reasons as Unknown", () => {
        const r = calculateRejectionReasons([
            order({ status: "rejected", rejection_reason: "Price", city: "A" }),
            order({ status: "rejected", rejection_reason: "Price", city: "B" }),
            order({ status: "rejected", rejection_reason: "Price", city: "B" }),
            order({ status: "rejected" }),
            order({ status: "delivered", rejection_reason: "Price" }),
        ]);
        expect(r.map((x) => [x.reason, x.count])).toEqual([["Price", 3], ["Unknown", 1]]);
        expect(r[0]?.topCity).toBe("B");
        expect(r[0]?.percentage).toBe(75);
    });
});

describe("calculateTimeAnalysis", () => {
    it("buckets by the Baghdad clock, not the runner's", () => {
        // 22:30 UTC on a Saturday is 01:30 Sunday in Baghdad (UTC+3).
        const t = calculateTimeAnalysis([order({ created_at: "2026-10-17T22:30:00.000Z" })]);
        expect(t.hourlyDistribution[1]?.count).toBe(1);
        expect(t.dailyDistribution.find((d) => d.day === "Sun")?.count).toBe(1);
        expect(t.dailyDistribution.find((d) => d.day === "Sat")?.count).toBe(0);
    });

    it("places delivery times in the right processing bucket", () => {
        const base = "2026-10-15T10:00:00.000Z";
        const at = (hours: number) => new Date(new Date(base).getTime() + hours * 3_600_000).toISOString();
        const t = calculateTimeAnalysis([
            order({ delivered_at: at(23) }), order({ delivered_at: at(24) }), order({ delivered_at: at(200) }),
            order({ status: "new" }),
        ]);
        const get = (b: string) => t.processingTimeDistribution.find((x) => x.bucket === b)?.count;
        expect(get("< 24h")).toBe(1);
        expect(get("1-2 days")).toBe(1);
        expect(get("7+ days")).toBe(1);
    });
});

describe("calculateAttentionFlags", () => {
    it("only returns flags that occurred", () => {
        const f = calculateAttentionFlags([
            order({ phone: " " }),
            order({ needs_attention: true, attention_reasons: ["missing_product", "price_changed"] }),
            order({ address_status: "incomplete" }),
            order(),
        ]);
        expect(f.map((x) => [x.flagType, x.count])).toEqual([
            ["missing_phone", 1], ["missing_product", 1], ["invalid_address", 1], ["price_issues", 1],
        ]);
    });
});

describe("calculateSourcePerformance", () => {
    it("delivery rate is delivered / (delivered + rejected) per source", () => {
        const r = calculateSourcePerformance([
            order({ source: "prime" }), order({ source: "prime", status: "rejected" }),
            order({ source: "prime", status: "new" }),
        ]);
        const prime = r.find((s) => s.sourceKey === "prime");
        expect(prime?.ordersProcessed).toBe(3);
        expect(prime?.deliveryRate).toBe(50);
    });
});
