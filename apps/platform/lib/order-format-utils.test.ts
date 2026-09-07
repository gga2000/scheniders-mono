import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getOrderAge,
    getAgeUrgency,
    getScheduledState,
    formatScheduledDate,
} from "@/lib/order-format-utils";

// Local 2:00 PM on 7 Sep 2026. Built from local parts so the assertions hold
// in any timezone the test runner happens to use.
const NOW = new Date(2026, 8, 7, 14, 0, 0);

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();
const daysFromNow = (d: number) => {
    const date = new Date(NOW);
    date.setDate(date.getDate() + d);
    return date.toLocaleDateString("en-CA");
};

describe("order age formatting", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it("renders a past timestamp as an elapsed span", () => {
        expect(getOrderAge(hoursAgo(3))).toBe("3h ago");
        expect(getOrderAge(hoursAgo(0.5))).toBe("30m ago");
        expect(getOrderAge(hoursAgo(48))).toBe("2d ago");
    });

    // The reported bug: an order dated ahead of the clock rendered "-1507m ago".
    it("never renders a negative span for a timestamp ahead of the clock", () => {
        const age = getOrderAge(new Date(NOW.getTime() + 3 * 3600000).toISOString());
        expect(age).toBe("in 3h");
        expect(age).not.toContain("-");
    });

    it("returns an empty string for missing or unparseable input", () => {
        expect(getOrderAge(null)).toBe("");
        expect(getOrderAge("not a date")).toBe("");
    });
});

describe("scheduled state", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it("classifies a later day as future and today or earlier as due", () => {
        expect(getScheduledState(daysFromNow(1))).toBe("future");
        expect(getScheduledState(daysFromNow(0))).toBe("due");
        expect(getScheduledState(daysFromNow(-4))).toBe("due");
    });

    it("returns null when nothing is scheduled or the value is malformed", () => {
        expect(getScheduledState(null)).toBeNull();
        expect(getScheduledState("")).toBeNull();
        expect(getScheduledState("soon")).toBeNull();
    });

    it("labels the scheduled day", () => {
        // ICU renders the short month as "Sep" or "Sept" depending on the CLDR build.
        expect(formatScheduledDate("2026-09-08")).toMatch(/^8 Sept?$/);
        expect(formatScheduledDate(null)).toBe("");
    });
});

describe("age urgency", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it("bands an unscheduled order by how long it has waited", () => {
        expect(getAgeUrgency("new", hoursAgo(1))).toBe("fresh");
        expect(getAgeUrgency("new", hoursAgo(3))).toBe("normal");
        expect(getAgeUrgency("new", hoursAgo(6))).toBe("attention");
        expect(getAgeUrgency("new", hoursAgo(12))).toBe("urgent");
        expect(getAgeUrgency("new", hoursAgo(72))).toBe("stale");
    });

    it("treats an order parked for a later day as scheduled, not overdue", () => {
        expect(getAgeUrgency("confirmed", hoursAgo(72), daysFromNow(2))).toBe("scheduled");
    });

    it("restarts the clock on the scheduled day so a postponed order is not instantly stale", () => {
        // Placed five days ago, scheduled for today: measured from local midnight,
        // which is 14 hours before NOW.
        expect(getAgeUrgency("confirmed", hoursAgo(120), daysFromNow(0))).toBe("urgent");
    });

    it("keeps measuring from placement when the scheduled day is older than the order", () => {
        expect(getAgeUrgency("confirmed", hoursAgo(2), daysFromNow(-10))).toBe("normal");
    });

    it("stops tracking urgency once the order is finished", () => {
        expect(getAgeUrgency("delivered", hoursAgo(200))).toBe("none");
        expect(getAgeUrgency("rejected", hoursAgo(200))).toBe("none");
    });
});
