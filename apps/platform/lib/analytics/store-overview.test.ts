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
