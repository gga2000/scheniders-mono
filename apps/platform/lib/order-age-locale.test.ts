import { describe, it, expect } from "vitest";
import { getOrderAge, formatOrderDateTime, formatOrderNamedDate } from "./order-format-utils";

/**
 * I18N-5 guards.
 *
 * The relative-time strings were hardcoded English — "5m ago" on an
 * otherwise-Arabic card, for every merchant, since Arabic is the default
 * locale. And the order detail modal rendered timestamps as en-US MM/DD/YYYY
 * with no time zone, so 3 September read as 09/03, which in Iraq is 9 March.
 */
const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("getOrderAge", () => {
    it("produces exactly the English text it always did", () => {
        expect(getOrderAge(ago(5 * 60_000), "en")).toBe("5m ago");
        expect(getOrderAge(ago(3 * 3_600_000), "en")).toBe("3h ago");
        expect(getOrderAge(ago(24 * 3_600_000), "en")).toBe("1d ago");
        expect(getOrderAge(ago(12 * 86_400_000), "en")).toBe("12d ago");
    });

    it("reads Arabic for an Arabic reader", () => {
        const label = getOrderAge(ago(5 * 60_000), "ar");
        expect(label).toContain("قبل");
        // Latin digits, to match formatIQD and the order numbers beside it.
        expect(label).toContain("5");
    });

    it("defaults to Arabic, which is the app's default locale", () => {
        expect(getOrderAge(ago(5 * 60_000))).toBe(getOrderAge(ago(5 * 60_000), "ar"));
    });

    it("returns empty for a missing or unparseable date rather than NaN", () => {
        expect(getOrderAge(null)).toBe("");
        expect(getOrderAge("not a date")).toBe("");
    });
});

describe("order timestamps", () => {
    it("writes the day before the month, and in Baghdad", () => {
        // 21:30 UTC on the 3rd is 00:30 on the 4th in Baghdad (UTC+3, no DST).
        expect(formatOrderDateTime("2026-09-03T21:30:00Z")).toBe("04/09/2026, 12:30 am");
        expect(formatOrderNamedDate("2026-09-03T21:30:00Z")).toBe("4 Sept 2026");
    });

    it("does not shift a mid-day timestamp", () => {
        expect(formatOrderDateTime("2026-09-03T09:00:00Z")).toBe("03/09/2026, 12:00 pm");
    });

    it("renders midnight and noon as 12, on every runtime", () => {
        // `hour12: true` lets ICU choose the cycle and it chooses h11 on some
        // versions, where midnight is hour 0 — so this read "00:30 am" on the
        // CI runner (Node 20 / ICU 78) while passing on the machine it was
        // written on. Pinning `hourCycle: "h12"` makes it the same everywhere.
        expect(formatOrderDateTime("2026-09-03T21:00:00Z")).toContain("12:00 am");
        expect(formatOrderDateTime("2026-09-03T09:00:00Z")).toContain("12:00 pm");
        expect(formatOrderDateTime("2026-09-03T21:00:00Z")).not.toContain("00:");
    });

    it("returns empty rather than 'Invalid Date'", () => {
        expect(formatOrderDateTime(null)).toBe("");
        expect(formatOrderNamedDate("nonsense")).toBe("");
    });
});
