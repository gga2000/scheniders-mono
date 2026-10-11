import { describe, it, expect } from "vitest";
import {
    windowFromDateFilter,
    belongsInWindow,
    BAGHDAD_UTC_OFFSET_HOURS,
    baghdadDayKey,
    toBaghdadDayKey,
    addDaysToDayKey,
    baghdadDayStart,
} from "./order-window";

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

describe("Baghdad day keys", () => {
    it("reads the Baghdad day, not the UTC one, in the first hours after midnight", () => {
        // 00:01 Baghdad on 12 Oct is still 21:01 on 11 Oct in UTC — the day
        // `toISOString().split("T")[0]` would have used.
        expect(baghdadDayKey(Date.parse("2026-10-11T21:01:00.000Z"))).toBe("2026-10-12");
        expect(new Date("2026-10-11T21:01:00.000Z").toISOString().split("T")[0]).toBe("2026-10-11");
    });

    it("keeps 23:59 Baghdad on the same day", () => {
        expect(baghdadDayKey(Date.parse("2026-10-12T20:59:59.999Z"))).toBe("2026-10-12");
        expect(baghdadDayKey(Date.parse("2026-10-12T21:00:00.000Z"))).toBe("2026-10-13");
    });

    it("adds calendar days across month and year ends", () => {
        expect(addDaysToDayKey("2026-09-30", 1)).toBe("2026-10-01");
        expect(addDaysToDayKey("2026-12-30", 3)).toBe("2027-01-02");
        expect(addDaysToDayKey("2026-10-12", 0)).toBe("2026-10-12");
    });

    it("takes a date-only value as-is and converts a timestamp to its Baghdad day", () => {
        expect(toBaghdadDayKey("2026-09-08")).toBe("2026-09-08");
        expect(toBaghdadDayKey("2026-09-07T22:30:00.000Z")).toBe("2026-09-08");
        expect(toBaghdadDayKey(null)).toBeNull();
        expect(toBaghdadDayKey("soon")).toBeNull();
    });

    it("starts a Baghdad day at 21:00 UTC the evening before", () => {
        expect(new Date(baghdadDayStart("2026-10-12")).toISOString()).toBe("2026-10-11T21:00:00.000Z");
    });
});

describe("belongsInWindow with a scheduled date", () => {
    const sep2 = windowFromDateFilter("2026-09-02", "2026-09-02")!;
    const sep5 = windowFromDateFilter("2026-09-05", "2026-09-05")!;
    // Arrived on 2 Sep (Baghdad), postponed to 5 Sep.
    const postponed = { created_at: "2026-09-02T10:00:00.000Z", scheduled_date: "2026-09-05", is_archived: false };

    it("carries the day bounds alongside the instants", () => {
        expect(sep2.fromDay).toBe("2026-09-02");
        expect(sep2.toDay).toBe("2026-09-02");
    });

    it("appears on the day it was scheduled for", () => {
        expect(belongsInWindow(postponed, sep5)).toBe(true);
    });

    it("stays on the day it arrived, where the status chips count it", () => {
        expect(belongsInWindow(postponed, sep2)).toBe(true);
    });

    it("is absent from a day it neither arrived on nor was scheduled for", () => {
        const sep4 = windowFromDateFilter("2026-09-04", "2026-09-04")!;
        expect(belongsInWindow(postponed, sep4)).toBe(false);
    });

    it("includes a scheduled day on either edge of a multi-day range", () => {
        const range = windowFromDateFilter("2026-09-03", "2026-09-05")!;
        expect(belongsInWindow({ ...postponed, scheduled_date: "2026-09-03" }, range)).toBe(true);
        expect(belongsInWindow({ ...postponed, scheduled_date: "2026-09-05" }, range)).toBe(true);
        expect(belongsInWindow({ ...postponed, scheduled_date: "2026-09-06" }, range)).toBe(false);
    });

    it("still excludes an archived order, whatever its schedule", () => {
        expect(belongsInWindow({ ...postponed, is_archived: true }, sep5)).toBe(false);
    });

    it("ignores a malformed scheduled value and falls back to the arrival day", () => {
        expect(belongsInWindow({ ...postponed, scheduled_date: "soon" }, sep5)).toBe(false);
        expect(belongsInWindow({ ...postponed, scheduled_date: "soon" }, sep2)).toBe(true);
    });
});
