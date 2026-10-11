import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getAgeUrgency,
    getScheduledState,
    isScheduledToday,
    isScheduleDue,
    scheduleDayFromToday,
    formatScheduledDate,
} from "@/lib/order-format-utils";

/**
 * Scheduling compares Baghdad calendar days. Every instant here is written in
 * UTC so the assertions hold whatever zone the test runner is in; Baghdad is
 * UTC+3 with no daylight saving.
 */

// 14:00 Baghdad on 7 Sep 2026.
const NOW = Date.parse("2026-09-07T11:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("scheduleDayFromToday — the quick buttons", () => {
    it("tomorrow and in-3-days count from the Baghdad day", () => {
        expect(scheduleDayFromToday(1, NOW)).toBe("2026-09-08");
        expect(scheduleDayFromToday(3, NOW)).toBe("2026-09-10");
    });

    it("at 00:01 Baghdad, tomorrow is the day after the new day — not today", () => {
        // 00:01 Baghdad on 8 Sep is 21:01 UTC on 7 Sep. The old
        // toISOString().split("T")[0] arithmetic produced "2026-09-08" here,
        // i.e. "tomorrow" landed on today.
        const justAfterMidnight = Date.parse("2026-09-07T21:01:00.000Z");
        expect(scheduleDayFromToday(1, justAfterMidnight)).toBe("2026-09-09");
        expect(scheduleDayFromToday(3, justAfterMidnight)).toBe("2026-09-11");
    });

    it("at 23:59 Baghdad, tomorrow is still the next day", () => {
        const justBeforeMidnight = Date.parse("2026-09-07T20:59:00.000Z");
        expect(scheduleDayFromToday(1, justBeforeMidnight)).toBe("2026-09-08");
    });

    it("rolls over month ends", () => {
        expect(scheduleDayFromToday(1, Date.parse("2026-09-30T12:00:00.000Z"))).toBe("2026-10-01");
    });
});

describe("scheduled state", () => {
    it("classifies a later day as future and today or earlier as due", () => {
        expect(getScheduledState("2026-09-08", NOW)).toBe("future");
        expect(getScheduledState("2026-09-07", NOW)).toBe("due");
        expect(getScheduledState("2026-09-03", NOW)).toBe("due");
    });

    it("flips to due at Baghdad midnight, not UTC midnight", () => {
        // 23:59 Baghdad on 7 Sep: the 8th is still tomorrow.
        expect(getScheduledState("2026-09-08", Date.parse("2026-09-07T20:59:00.000Z"))).toBe("future");
        // 00:01 Baghdad on 8 Sep (still the 7th in UTC): the 8th is today.
        expect(getScheduledState("2026-09-08", Date.parse("2026-09-07T21:01:00.000Z"))).toBe("due");
        expect(isScheduledToday("2026-09-08", Date.parse("2026-09-07T21:01:00.000Z"))).toBe(true);
    });

    it("returns null when nothing is scheduled or the value is malformed", () => {
        expect(getScheduledState(null, NOW)).toBeNull();
        expect(getScheduledState("", NOW)).toBeNull();
        expect(getScheduledState("soon", NOW)).toBeNull();
    });

    it("labels the scheduled day without shifting it", () => {
        // ICU renders the short month as "Sep" or "Sept" depending on the CLDR build.
        expect(formatScheduledDate("2026-09-08")).toMatch(/^8 Sept?$/);
        expect(formatScheduledDate(null)).toBe("");
    });
});

describe("due-today queue", () => {
    it("includes an order whose scheduled day has arrived and still needs work", () => {
        expect(isScheduleDue("confirmed", "2026-09-07", NOW)).toBe(true);
        expect(isScheduleDue("new", "2026-09-05", NOW)).toBe(true);
    });

    it("excludes orders parked for a later day, settled, or never scheduled", () => {
        expect(isScheduleDue("confirmed", "2026-09-08", NOW)).toBe(false);
        expect(isScheduleDue("completed", "2026-09-07", NOW)).toBe(false);
        expect(isScheduleDue("cancelled", "2026-09-06", NOW)).toBe(false);
        expect(isScheduleDue("confirmed", null, NOW)).toBe(false);
    });
});

describe("age urgency with a schedule", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it("bands an unscheduled order by how long it has waited", () => {
        expect(getAgeUrgency("new", hoursAgo(1))).toBe("fresh");
        expect(getAgeUrgency("new", hoursAgo(72))).toBe("stale");
    });

    it("treats an order parked for a later day as scheduled, not overdue", () => {
        expect(getAgeUrgency("confirmed", hoursAgo(72), "2026-09-09")).toBe("scheduled");
    });

    it("restarts the clock at Baghdad midnight on the scheduled day", () => {
        // Placed five days ago, scheduled for today: measured from 00:00 Baghdad,
        // 14 hours before NOW.
        expect(getAgeUrgency("confirmed", hoursAgo(120), "2026-09-07")).toBe("urgent");
    });

    it("keeps measuring from placement when the scheduled day is older than the order", () => {
        expect(getAgeUrgency("confirmed", hoursAgo(2.5), "2026-08-28")).toBe("normal");
    });
});
