import { describe, it, expect } from "vitest";
import {
    baghdadTimeOfDay,
    perUnit,
    pointChange,
    storeFigures,
    barWindows,
    followsStoreWideNumbers,
    isSalesView,
} from "./analytics-strip";

// 2026-11-03 09:30 UTC = 12:30 in Baghdad.
const NOW = new Date("2026-11-03T09:30:15Z");

describe("barWindows", () => {
    it("judges today against yesterday cut at the same Baghdad time", () => {
        const w = barWindows("2026-11-03", "2026-11-03", NOW);
        expect(w.current).toEqual({ from: "2026-11-03", to: "2026-11-03", untilTime: null });
        expect(w.previous).toEqual({ from: "2026-11-02", to: "2026-11-02", untilTime: "12:30:15" });
    });

    it("compares a past day with the whole day before it", () => {
        const w = barWindows("2026-10-20", "2026-10-20", NOW);
        expect(w.previous).toEqual({ from: "2026-10-19", to: "2026-10-19", untilTime: null });
    });

    it("compares a range with the same number of days before it", () => {
        const w = barWindows("2026-10-05", "2026-11-03", NOW);
        expect(w.previous).toEqual({ from: "2026-09-05", to: "2026-10-04", untilTime: null });
    });

    it("runs an open-ended range to today", () => {
        const w = barWindows("2026-10-28", undefined, NOW);
        expect(w.current).toEqual({ from: "2026-10-28", to: "2026-11-03", untilTime: null });
        expect(w.previous).toEqual({ from: "2026-10-21", to: "2026-10-27", untilTime: null });
    });

    it("reads the whole book, with nothing to compare, when there is no date filter", () => {
        const w = barWindows(undefined, undefined, NOW);
        expect(w.current).toEqual({ from: null, to: null, untilTime: null });
        expect(w.previous).toBeNull();
    });

    it("uses the Baghdad day, not the UTC day, around midnight", () => {
        expect(baghdadTimeOfDay(new Date("2026-11-02T22:30:00Z"))).toBe("01:30:00");
        // 22:30 UTC on the 2nd is already the 3rd in Baghdad, so a "today" filter on the 3rd is still today.
        expect(barWindows("2026-11-03", "2026-11-03", new Date("2026-11-02T22:30:00Z")).previous?.untilTime).toBe("01:30:00");
    });
});

describe("scope of the bar", () => {
    it("is not a sales view for refund, replacement and return views", () => {
        expect(isSalesView({})).toBe(true);
        expect(isSalesView({ isReturn: true })).toBe(false);
        expect(isSalesView({ orderType: "replacement" })).toBe(false);
        expect(isSalesView({ status: "refunds" })).toBe(false);
        expect(isSalesView({ status: "confirmed" })).toBe(true);
    });

    it("leaves store-wide numbers out once the list is narrowed", () => {
        expect(followsStoreWideNumbers({})).toBe(true);
        expect(followsStoreWideNumbers({ city: "Basra" })).toBe(false);
        expect(followsStoreWideNumbers({ paymentStatus: "paid" })).toBe(false);
    });
});

describe("rates", () => {
    it("reports a change in points, null when either side is unknown", () => {
        expect(pointChange(90, 80)).toBe(10);
        expect(pointChange(null, 80)).toBeNull();
    });

    it("never divides by zero", () => {
        expect(perUnit(1000, 0)).toBeNull();
        expect(perUnit(1000, 3)).toBe(333);
    });
});

describe("storeFigures", () => {
    const days = [
        { day: "2026-10-28", visitors: 50, orders: 1 },
        { day: "2026-11-02", visitors: 100, orders: 5 },
        { day: "2026-11-03", visitors: 40, orders: 2 },
    ];

    it("compares today with yesterday at the same time of day", () => {
        const r = storeFigures(days, { visitors: 20, orders: 1 }, barWindows("2026-11-03", "2026-11-03", NOW));
        expect(r.current).toEqual({ visitors: 40, conversion: 5 });
        expect(r.previous).toEqual({ visitors: 20, conversion: 5 });
    });

    it("sums a range and the one before it", () => {
        const r = storeFigures(days, { visitors: 0, orders: 0 }, barWindows("2026-11-02", "2026-11-03", NOW));
        expect(r.current?.visitors).toBe(140);
        expect(r.previous).toEqual({ visitors: 0, conversion: null });
    });

    it("answers nothing for a window the log does not reach back to", () => {
        expect(storeFigures(days, { visitors: 0, orders: 0 }, barWindows("2026-08-01", "2026-08-31", NOW)).current).toBeNull();
        expect(storeFigures(days, { visitors: 0, orders: 0 }, barWindows(undefined, undefined, NOW)).current).toBeNull();
    });
});
