import { describe, expect, it } from "vitest";
import { formatIQD } from "@/lib/utils";
import { formatBaghdadShortDate, spentLabel } from "./customer-format";

describe("spentLabel", () => {
    it("shows a dash while the first delivery is pending and nothing is spent", () => {
        expect(spentLabel(0, true)).toBe("—");
    });

    // The app's own money format (round 15 critic: Customers wrote «IQD 192,000» beside «د.ع» everywhere else).
    it("shows the amount once something is delivered, or when the customer is not pending, as every page writes money", () => {
        expect(spentLabel(0, false)).toBe(formatIQD(0));
        expect(spentLabel(190000, true)).toBe(formatIQD(190000));
        expect(spentLabel(190000, false)).toBe(formatIQD(190000));
        expect(spentLabel(190000, false)).toContain("190,000 د.ع");
    });
});

describe("formatBaghdadShortDate", () => {
    const now = new Date("2026-11-01T09:00:00Z");

    it("drops the year within the current Baghdad year", () => {
        expect(formatBaghdadShortDate("2026-07-12T09:00:00Z", "en", now)).toBe("Jul 12");
    });

    it("keeps the year for an earlier year", () => {
        expect(formatBaghdadShortDate("2025-07-12T09:00:00Z", "en", now)).toBe("Jul 12, 2025");
    });

    it("uses the Baghdad day and year, not UTC", () => {
        // 22:30 UTC on Dec 31 is already Jan 1 in Baghdad (UTC+3).
        expect(formatBaghdadShortDate("2025-12-31T22:30:00Z", "en", now)).toBe("Jan 1");
    });

    it("writes Arabic month names with Western digits", () => {
        expect(formatBaghdadShortDate("2026-07-12T09:00:00Z", "ar", now)).toMatch(/^12 \S+$/);
    });
});
