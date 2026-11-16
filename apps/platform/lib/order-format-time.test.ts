import { describe, expect, it } from "vitest";
import { formatShortDate, formatTime } from "./order-format-utils";

/* Card and table times are Baghdad clock times, in the reader's language. */

describe("formatTime", () => {
    it("reads Baghdad time in English by default", () => {
        // 04:01 UTC is 07:01 in Baghdad.
        expect(formatTime("2026-11-14T04:01:00Z")).toBe("07:01am");
        expect(formatTime("2026-11-14T20:01:00Z")).toBe("11:01pm");
    });

    it("writes ص / م with Latin digits in Arabic", () => {
        expect(formatTime("2026-11-14T04:01:00Z", "ar")).toBe("07:01 ص");
        expect(formatTime("2026-11-14T20:01:00Z", "ar")).toBe("11:01 م");
    });

    it("shows midnight as 12, not 00", () => {
        expect(formatTime("2026-11-13T21:30:00Z", "ar")).toBe("12:30 ص");
    });

    it("returns nothing for a missing or broken date", () => {
        expect(formatTime(null, "ar")).toBe("");
        expect(formatTime("not a date")).toBe("");
        expect(formatShortDate(undefined)).toBe("");
    });
});
