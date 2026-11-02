import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { baghdadDayKey } from "@/lib/order-window";
import { useFinancePeriod } from "./use-finance-period";

// 01:00 on 1 Nov in Baghdad, still 31 Oct in UTC and further west.
const NOW = new Date("2026-10-31T22:00:00.000Z");
const days = (r: { start: Date; end: Date } | null) => r && [baghdadDayKey(r.start), baghdadDayKey(r.end)];

describe("useFinancePeriod", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it("treats today as the Baghdad day, wherever the browser is", () => {
        const { result } = renderHook(() => useFinancePeriod("today"));
        expect(days(result.current.period)).toEqual(["2026-11-01", "2026-11-01"]);
        expect(result.current.period.start.toISOString()).toBe("2026-10-31T21:00:00.000Z");
        expect(result.current.period.end.toISOString()).toBe("2026-11-01T20:59:59.999Z");
    });

    it("builds the presets from Baghdad days", () => {
        const { result } = renderHook(() => useFinancePeriod("last30"));
        expect(days(result.current.period)).toEqual(["2026-10-03", "2026-11-01"]);
        act(() => result.current.applyPreset("yesterday"));
        expect(days(result.current.period)).toEqual(["2026-10-31", "2026-10-31"]);
        act(() => result.current.applyPreset("last7"));
        expect(days(result.current.period)).toEqual(["2026-10-26", "2026-11-01"]);
        act(() => result.current.applyPreset("mtd"));
        expect(days(result.current.period)).toEqual(["2026-11-01", "2026-11-01"]);
        act(() => result.current.applyPreset("ytd"));
        expect(days(result.current.period)).toEqual(["2026-01-01", "2026-11-01"]);
    });

    it("fetches expenses back to the start of the comparison period, so its profit can be netted too", () => {
        const { result } = renderHook(() => useFinancePeriod("last7"));
        // last7 = 26 Oct..1 Nov; the previous 7 days start 19 Oct.
        expect(result.current.dateRangeStrings).toEqual({ startDate: "2026-10-26", endDate: "2026-11-01" });
        expect(result.current.expenseFetchRange).toEqual({ startDate: "2026-10-19", endDate: "2026-11-01" });
        act(() => result.current.setCompareMode("none"));
        expect(result.current.expenseFetchRange).toEqual({ startDate: "2026-10-26", endDate: "2026-11-01" });
    });

    it("keeps a typed custom range on exactly those days", () => {
        const { result } = renderHook(() => useFinancePeriod("today"));
        // A date input hands over midnight UTC of the typed day.
        act(() => result.current.setCustom(new Date("2026-10-05"), new Date("2026-10-09")));
        expect(result.current.period.preset).toBe("custom");
        expect(days(result.current.period)).toEqual(["2026-10-05", "2026-10-09"]);
        expect(result.current.dateRangeStrings).toEqual({ startDate: "2026-10-05", endDate: "2026-10-09" });
    });

    it("compares against the same number of days directly before, or the same days last year", () => {
        const { result } = renderHook(() => useFinancePeriod("today"));
        act(() => result.current.setCustom(new Date("2026-10-05"), new Date("2026-10-09")));
        expect(days(result.current.compareRange)).toEqual(["2026-09-30", "2026-10-04"]);
        act(() => result.current.setCompareMode("yoy"));
        expect(days(result.current.compareRange)).toEqual(["2025-10-05", "2025-10-09"]);
        act(() => result.current.setCompareMode("none"));
        expect(result.current.compareRange).toBeNull();
    });

    it("maps 29 Feb to 28 Feb in a year without one", () => {
        const { result } = renderHook(() => useFinancePeriod("today"));
        act(() => {
            result.current.setCustom(new Date("2028-02-29"), new Date("2028-02-29"));
            result.current.setCompareMode("yoy");
        });
        expect(days(result.current.compareRange)).toEqual(["2027-02-28", "2027-02-28"]);
    });
});
