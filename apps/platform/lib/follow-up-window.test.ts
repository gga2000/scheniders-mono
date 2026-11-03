import { describe, it, expect } from "vitest";
import { DEFAULT_FOLLOW_UP_WINDOW as W, nextSendTime, isInsideWindow, parseFollowUpWindow } from "./follow-up-window";

// Baghdad = UTC+3. Helper: Baghdad wall clock -> Date.
const baghdad = (iso: string) => new Date(`${iso}+03:00`);

describe("nextSendTime", () => {
    it("keeps a time inside the window", () => {
        const t = baghdad("2026-11-03T16:00:00");
        expect(nextSendTime(t, W, "a")).toBe(t);
    });
    it("sends 10:00 order + 6h = 16:00 as is", () => {
        const t = new Date(baghdad("2026-11-03T10:00:00").getTime() + 6 * 3_600_000);
        expect(nextSendTime(t, W, "a")).toBe(t);
    });
    it("waits until 10:00 next morning for an order at 00:00 plus 4h (04:00 same day -> 10:00 same day)", () => {
        const out = nextSendTime(baghdad("2026-11-03T04:00:00"), W, "a");
        expect(out.getTime()).toBeGreaterThanOrEqual(baghdad("2026-11-03T10:00:00").getTime());
        expect(out.getTime()).toBeLessThan(baghdad("2026-11-03T10:30:00").getTime());
    });
    it("rolls an evening time to 10:00 the next day", () => {
        const out = nextSendTime(baghdad("2026-11-03T22:15:00"), W, "a");
        expect(out.getTime()).toBeGreaterThanOrEqual(baghdad("2026-11-04T10:00:00").getTime());
        expect(out.getTime()).toBeLessThan(baghdad("2026-11-04T10:30:00").getTime());
    });
    it("treats 20:00 exactly as closed and 10:00 exactly as open", () => {
        expect(isInsideWindow(baghdad("2026-11-03T20:00:00"), W)).toBe(false);
        expect(isInsideWindow(baghdad("2026-11-03T10:00:00"), W)).toBe(true);
    });
    it("handles the UTC/Baghdad day boundary (21:30 UTC is 00:30 next day in Baghdad)", () => {
        const out = nextSendTime(new Date("2026-11-03T21:30:00Z"), W, "a");
        expect(out.getTime()).toBeGreaterThanOrEqual(baghdad("2026-11-04T10:00:00").getTime());
        expect(out.getTime()).toBeLessThan(baghdad("2026-11-04T10:30:00").getTime());
    });
    it("spreads by order id but stays deterministic", () => {
        const t = baghdad("2026-11-03T03:00:00");
        expect(nextSendTime(t, W, "x").getTime()).toBe(nextSendTime(t, W, "x").getTime());
    });
});

describe("parseFollowUpWindow", () => {
    it("falls back to the default for junk", () => {
        expect(parseFollowUpWindow({ start_hour: 20, end_hour: 10 })).toEqual(W);
        expect(parseFollowUpWindow(undefined)).toEqual(W);
    });
    it("accepts a valid custom window", () => {
        expect(parseFollowUpWindow({ start_hour: 9, end_hour: 22 })).toEqual({ start_hour: 9, end_hour: 22 });
    });
});
