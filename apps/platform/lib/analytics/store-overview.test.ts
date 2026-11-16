import { describe, expect, it } from "vitest";
import { storeOverviewMetrics, storeOverviewSchema } from "./store-overview";

const raw = storeOverviewSchema.parse({
    days: [
        { day: "2026-11-01", visitors: 1000, orders: 10, sales: 400000 },
        { day: "2026-11-02", visitors: 200, orders: 4, sales: 180000 },
    ],
    yesterday_same_time: { visitors: 400, orders: 5, sales: 200000 },
});
const by = (k: string) => storeOverviewMetrics(raw).find((m) => m.key === k)!;

describe("storeOverviewMetrics", () => {
    it("reads today as the last day", () => {
        expect(by("visitors").value).toBe(200);
        expect(by("orders").value).toBe(4);
        expect(by("sales").value).toBe(180000);
    });
    it("derives conversion, AOV and EPC", () => {
        expect(by("conversion").value).toBe(2);
        expect(by("aov").value).toBe(45000);
        expect(by("epc").value).toBe(900);
    });
    it("compares with yesterday at the same time", () => {
        expect(by("visitors").deltaPct).toBe(-50);
        expect(by("orders").deltaPct).toBe(-20);
        expect(by("conversion").deltaPct).toBeCloseTo(60);
    });
    it("gives one sparkline point per day", () => {
        expect(by("aov").series).toEqual([40000, 45000]);
    });
    it("has no comparison when yesterday was empty", () => {
        const empty = storeOverviewSchema.parse({ days: [{ day: "d", visitors: 5, orders: 1, sales: 9 }], yesterday_same_time: {} });
        expect(storeOverviewMetrics(empty).every((m) => m.deltaPct === null)).toBe(true);
    });
    it("survives an empty payload", () => {
        const m = storeOverviewMetrics(storeOverviewSchema.parse({}));
        expect(m.every((x) => x.value === 0 && x.deltaPct === null)).toBe(true);
    });
});

// Round 15 (board D2): the row follows the dashboard's period.
describe("storeOverviewMetrics for a period", () => {
    // 60 Baghdad days, oldest first: day i has i+1 visitors, 1 order and 1,000 IQD of sales.
    const sixty = storeOverviewSchema.parse({
        days: Array.from({ length: 60 }, (_, i) => ({ day: `d${i}`, visitors: i + 1, orders: 1, sales: 1000 })),
        yesterday_same_time: { visitors: 1, orders: 1, sales: 1 },
    });
    const pick = (range: "today" | "7d" | "30d" | "all", k: string) => storeOverviewMetrics(sixty, range).find((m) => m.key === k)!;

    it("sums the last 7 days, today included, against the 7 before", () => {
        // Days 54..60 have 54..60 visitors (sum 399); days 47..53 have 47..53 (sum 350).
        expect(pick("7d", "visitors").value).toBe(399);
        expect(pick("7d", "orders").value).toBe(7);
        expect(pick("7d", "sales").value).toBe(7000);
        expect(pick("7d", "visitors").deltaPct).toBeCloseTo(14);
        expect(pick("7d", "orders").deltaPct).toBe(0);
    });

    it("derives the ratios from the period's sums, not an average of days", () => {
        expect(pick("7d", "aov").value).toBe(1000);
        expect(pick("7d", "conversion").value).toBeCloseTo((7 / 399) * 100);
    });

    it("compares 30 days with the 30 before when the log has them", () => {
        expect(pick("30d", "orders").value).toBe(30);
        expect(pick("30d", "orders").deltaPct).toBe(0);
        expect(pick("30d", "orders").series).toHaveLength(30);
    });

    it("gives no comparison when the earlier run of days is not complete", () => {
        const short = storeOverviewSchema.parse({ days: sixty.days.slice(-40), yesterday_same_time: {} });
        expect(storeOverviewMetrics(short, "30d").every((m) => m.deltaPct === null)).toBe(true);
    });

    it("reads every day the log returns for «all», with no comparison", () => {
        expect(pick("all", "orders").value).toBe(60);
        expect(pick("all", "orders").deltaPct).toBeNull();
    });

    it("keeps Today as today against yesterday at the same time, with 14 days of line", () => {
        expect(pick("today", "visitors").value).toBe(60);
        expect(pick("today", "visitors").deltaPct).toBe(5900);
        expect(pick("today", "visitors").series).toHaveLength(14);
    });
});
