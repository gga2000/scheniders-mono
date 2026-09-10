import { describe, it, expect } from "vitest";
import { windowFromDateFilter, belongsInWindow, BAGHDAD_UTC_OFFSET_HOURS } from "./order-window";

describe("windowFromDateFilter", () => {
    it("is null when no date filter is set (the cache holds everything)", () => {
        expect(windowFromDateFilter(undefined, undefined)).toBeNull();
    });

    it("resolves a Baghdad calendar day to the right absolute instants", () => {
        // 2026-09-02 in Baghdad runs 2026-09-01T21:00:00Z .. 2026-09-02T20:59:59.999Z
        const w = windowFromDateFilter("2026-09-02", "2026-09-02")!;
        expect(new Date(w.fromInstant).toISOString()).toBe("2026-09-01T21:00:00.000Z");
        expect(new Date(w.toInstant).toISOString()).toBe("2026-09-02T20:59:59.999Z");
    });

    it("spans multiple days inclusively", () => {
        const w = windowFromDateFilter("2026-09-01", "2026-09-03")!;
        expect(new Date(w.fromInstant).toISOString()).toBe("2026-08-31T21:00:00.000Z");
        expect(new Date(w.toInstant).toISOString()).toBe("2026-09-03T20:59:59.999Z");
    });

    it("treats a one-sided filter as a single day", () => {
        expect(windowFromDateFilter("2026-09-02", undefined))
            .toEqual(windowFromDateFilter("2026-09-02", "2026-09-02"));
        expect(windowFromDateFilter(undefined, "2026-09-02"))
            .toEqual(windowFromDateFilter("2026-09-02", "2026-09-02"));
    });

    it("uses Iraq's fixed +3 offset", () => {
        expect(BAGHDAD_UTC_OFFSET_HOURS).toBe(3);
    });
});

describe("belongsInWindow", () => {
    const day = windowFromDateFilter("2026-09-02", "2026-09-02")!;
    const order = (created_at: string, is_archived = false) => ({ created_at, is_archived });

    it("accepts everything non-archived when the cache is complete", () => {
        expect(belongsInWindow(order("2020-01-01T00:00:00.000Z"), null)).toBe(true);
    });

    it("excludes archived orders from the active list", () => {
        expect(belongsInWindow(order("2026-09-02T10:00:00.000Z", true), day)).toBe(false);
        expect(belongsInWindow(order("2026-09-02T10:00:00.000Z", true), null)).toBe(false);
    });

    it("includes an order inside the window", () => {
        expect(belongsInWindow(order("2026-09-02T10:00:00.000Z"), day)).toBe(true);
    });

    it("includes both boundary instants", () => {
        expect(belongsInWindow(order("2026-09-01T21:00:00.000Z"), day)).toBe(true);
        expect(belongsInWindow(order("2026-09-02T20:59:59.999Z"), day)).toBe(true);
    });

    it("excludes the instant just before the window opens", () => {
        // 20:59:59.999Z is still 2026-09-01 in Baghdad — the previous day.
        expect(belongsInWindow(order("2026-09-01T20:59:59.999Z"), day)).toBe(false);
    });

    it("excludes the instant just after the window closes", () => {
        // 21:00:00Z has already rolled over to 2026-09-03 in Baghdad.
        expect(belongsInWindow(order("2026-09-02T21:00:00.000Z"), day)).toBe(false);
    });

    it("keeps an order whose timestamp cannot be parsed rather than dropping it", () => {
        // Losing a real order from the merchant's list is worse than showing one
        // that might not belong.
        expect(belongsInWindow(order("not-a-date"), day)).toBe(true);
    });

    it("a late-evening Baghdad order lands on the Baghdad day, not the UTC one", () => {
        // 2026-09-02T22:00Z is 2026-09-03 01:00 in Baghdad -> NOT in the 09-02 window.
        // Under naive UTC-day logic this would have been wrongly included.
        expect(belongsInWindow(order("2026-09-02T22:00:00.000Z"), day)).toBe(false);
        const nextDay = windowFromDateFilter("2026-09-03", "2026-09-03")!;
        expect(belongsInWindow(order("2026-09-02T22:00:00.000Z"), nextDay)).toBe(true);
    });
});
