import { describe, it, expect } from "vitest";
import {
    baghdadTimeOfDay,
    deliveryRate,
    formatMinutes,
    perUnit,
    pointChange,
    storeFigures,
    stripWindows,
} from "./analytics-strip";

// 2026-11-03 09:30 UTC = 12:30 in Baghdad.
const NOW = new Date("2026-11-03T09:30:15Z");

describe("stripWindows", () => {
    it("judges today against yesterday cut at the same Baghdad time", () => {
        const w = stripWindows("today", NOW);
        expect(w.current).toEqual({ from: "2026-11-03", to: "2026-11-03", untilTime: null });
        expect(w.previous).toEqual({ from: "2026-11-02", to: "2026-11-02", untilTime: "12:30:15" });
    });

    it("widens the finished-order figures to 7 days on today", () => {
        const w = stripWindows("today", NOW);
        expect(w.qualityIsWider).toBe(true);
        expect(w.quality.current).toEqual({ from: "2026-10-28", to: "2026-11-03", untilTime: null });
        expect(w.quality.previous).toEqual({ from: "2026-10-21", to: "2026-10-27", untilTime: null });
    });

    it("compares a trailing window with the same number of days before it", () => {
        const w = stripWindows("30", NOW);
        expect(w.current).toEqual({ from: "2026-10-05", to: "2026-11-03", untilTime: null });
        expect(w.previous).toEqual({ from: "2026-09-05", to: "2026-10-04", untilTime: null });
        expect(w.qualityIsWider).toBe(false);
        expect(w.quality.current).toEqual(w.current);
    });

    it("uses the Baghdad day, not the UTC day, around midnight", () => {
        // 22:30 UTC on the 2nd is already 01:30 on the 3rd in Baghdad.
        expect(stripWindows("today", new Date("2026-11-02T22:30:00Z")).current.from).toBe("2026-11-03");
        expect(baghdadTimeOfDay(new Date("2026-11-02T22:30:00Z"))).toBe("01:30:00");
    });
});

describe("rates", () => {
    it("counts only orders that finished", () => {
        expect(deliveryRate({ cohort_realized: 9, cohort_rejected: 1 })).toBe(90);
        expect(deliveryRate({ cohort_realized: 0, cohort_rejected: 0 })).toBeNull();
    });

    it("reports a change in points, null when either side is unknown", () => {
        expect(pointChange(90, 80)).toBe(10);
        expect(pointChange(null, 80)).toBeNull();
    });

    it("never divides by zero", () => {
        expect(perUnit(1000, 0)).toBeNull();
        expect(perUnit(1000, 3)).toBe(333);
    });
});

describe("formatMinutes", () => {
    it("rounds to whole minutes and splits hours", () => {
        expect(formatMinutes(0.4)).toEqual({ hours: 0, minutes: 0, underOne: true });
        expect(formatMinutes(5.4)).toEqual({ hours: 0, minutes: 5, underOne: false });
        expect(formatMinutes(135)).toEqual({ hours: 2, minutes: 15, underOne: false });
    });
});

describe("storeFigures", () => {
    const days = [
        { day: "2026-11-02", visitors: 100, orders: 5 },
        { day: "2026-11-03", visitors: 40, orders: 2 },
    ];

    it("compares today with yesterday at the same time of day", () => {
        const r = storeFigures(days, { visitors: 20, orders: 1 }, stripWindows("today", NOW));
        expect(r.current).toEqual({ visitors: 40, conversion: 5 });
        expect(r.previous).toEqual({ visitors: 20, conversion: 5 });
    });

    it("sums a trailing window and leaves conversion null without visitors", () => {
        const r = storeFigures(days, { visitors: 0, orders: 0 }, stripWindows("7", NOW));
        expect(r.current.visitors).toBe(140);
        expect(r.previous).toEqual({ visitors: 0, conversion: null });
    });
});
