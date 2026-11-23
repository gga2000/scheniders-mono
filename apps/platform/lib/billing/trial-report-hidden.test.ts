import { afterEach, describe, expect, it, vi } from "vitest";
import {
    hideTrialReportToday,
    isTrialReportHiddenToday,
    readTrialReportHiddenDay,
    subscribeTrialReportHidden,
} from "./trial-report-hidden";

/* The merchant closes the trial report for the rest of the Baghdad day. */

afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("hiding the trial report for the day", () => {
    it("is remembered per shop for the Baghdad day, and comes back the next one", () => {
        vi.useFakeTimers();
        // 20:30 UTC on 22 Nov is 23:30 in Baghdad: still the 22nd.
        vi.setSystemTime(new Date("2026-11-22T20:30:00Z"));
        hideTrialReportToday("shop-a");
        const day = readTrialReportHiddenDay("shop-a");
        expect(day).toBe("2026-11-22");
        expect(isTrialReportHiddenToday(day)).toBe(true);
        expect(readTrialReportHiddenDay("shop-b")).toBeNull();
        // 21:00 UTC is midnight in Baghdad: a new day, the card is back.
        expect(isTrialReportHiddenToday(day, new Date("2026-11-22T21:00:00Z"))).toBe(false);
    });

    it("tells the open card at once", () => {
        const onChange = vi.fn();
        const stop = subscribeTrialReportHidden(onChange);
        hideTrialReportToday("shop-a");
        expect(onChange).toHaveBeenCalledTimes(1);
        stop();
        hideTrialReportToday("shop-a");
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("when storage is blocked, reads nothing hidden and still tells the open card", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        const onChange = vi.fn();
        const stop = subscribeTrialReportHidden(onChange);
        expect(() => hideTrialReportToday("shop-a")).not.toThrow();
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(readTrialReportHiddenDay("shop-a")).toBeNull();
        stop();
    });
});
