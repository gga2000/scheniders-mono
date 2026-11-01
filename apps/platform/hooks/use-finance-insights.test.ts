import { describe, expect, it } from "vitest";
import { translations } from "@/lib/i18n";
import type { FinanceOverviewResult } from "./use-finance-overview";
import { buildFinanceInsights, formatIQD, type Insight } from "./use-finance-insights";

const base = {
    gross_revenue: 1_000_000, prev_gross_revenue: 1_000_000, delivered_revenue: 800_000,
    product_cost: 300_000, refund_value: 0, expenses: 100_000, discount: 0, marketing_cost: 0,
    net_profit: 400_000, margin_pct: 50, orders_count: 10, delivery_rate: 80,
    cash_float: 0, cash_realized: 0, aov: 25_000, prev_aov: 25_000,
    by_channel: [], by_city: [], by_product: [], top_loser_product: null, top_gainer_product: null,
} as unknown as FinanceOverviewResult;

const make = (over: Partial<FinanceOverviewResult>): FinanceOverviewResult => ({ ...base, ...over }) as FinanceOverviewResult;
const ids = (list: Insight[]) => list.map((i) => i.id);

describe("buildFinanceInsights", () => {
    it("flags a sharp revenue drop as critical and puts it first", () => {
        const list = buildFinanceInsights(make({ gross_revenue: 700_000, margin_pct: 8 }));
        expect(list[0]).toMatchObject({ id: "revenue_drop", severity: "critical" });
        expect(list[0].vars.pct).toBe("30.0");
        expect(ids(list)).toContain("margin_thin");
        expect(list.map((i) => i.severity)).toEqual([...list.map((i) => i.severity)].sort(
            (a, b) => ["critical", "warning", "positive", "info"].indexOf(a) - ["critical", "warning", "positive", "info"].indexOf(b),
        ));
    });

    it("says the shop is losing money only when net profit is negative", () => {
        expect(ids(buildFinanceInsights(make({ margin_pct: 2, net_profit: -50_000 })))).toContain("margin_negative");
        expect(ids(buildFinanceInsights(make({ margin_pct: 2, net_profit: 5_000 })))).not.toContain("margin_negative");
    });

    it("does not judge the delivery rate on a tiny order count", () => {
        expect(ids(buildFinanceInsights(make({ orders_count: 5, delivery_rate: 20 })))).not.toContain("delivery_rate_low");
        expect(ids(buildFinanceInsights(make({ orders_count: 40, delivery_rate: 20 })))).toContain("delivery_rate_low");
    });

    it("flags a single channel that carries 70% or more of revenue", () => {
        const list = buildFinanceInsights(make({
            by_channel: [{ key: "meta", label: "Meta Ads", revenue: 800_000, orders: 1, profit: 1 }, { key: "x", label: "Shop", revenue: 100_000, orders: 1, profit: 1 }],
        } as unknown as Partial<FinanceOverviewResult>));
        const hit = list.find((i) => i.id === "channel_concentration");
        expect(hit?.vars).toMatchObject({ name: "Meta Ads", share: "80" });
    });

    it("falls back to a neutral note when nothing stands out", () => {
        expect(ids(buildFinanceInsights(make({ margin_pct: 15 })))).toEqual(["neutral"]);
    });

    it("says nothing for a period with no orders", () => {
        expect(buildFinanceInsights(make({ orders_count: 0, margin_pct: 15 }))).toEqual([]);
    });
});

describe("insight wording", () => {
    // Every id the hook can produce must have a title and detail in both languages.
    const allIds = [
        "revenue_drop", "revenue_up", "margin_negative", "margin_thin", "margin_strong", "cash_float_high",
        "delivery_rate_low", "delivery_rate_high", "product_loser", "product_gainer", "discount_high",
        "roas_low", "roas_high", "channel_concentration", "product_concentration", "aov_dropped", "aov_grew",
        "city_delivery_outlier", "neutral",
    ];
    for (const locale of ["en", "ar"] as const) {
        it(`has a ${locale} title and detail for every insight`, () => {
            const missing = allIds.flatMap((id) => ["title", "detail"].map((p) => `finances.insight.${id}.${p}`))
                .filter((k) => !translations[locale][k]);
            expect(missing).toEqual([]);
        });
    }
});

describe("formatIQD", () => {
    it("writes amounts in the units it is given", () => {
        const ar = { iqd: "د.ع", thousand: " ألف", million: " مليون" };
        expect(formatIQD(2_500_000, ar)).toBe("2.5 مليون د.ع");
        expect(formatIQD(-42_000, ar)).toBe("-42 ألف د.ع");
        expect(formatIQD(900, ar)).toBe("900 د.ع");
        expect(formatIQD(2_500_000)).toBe("2.5M IQD");
    });
});
