import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({}) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));

import { getThisMonthRange, getThisWeekRange, getTodayRange } from "./export-report-modal";

/** Audit R2 N8: the export scopes follow Baghdad days, not the browser clock. */
describe("export date scopes", () => {
    // 01:30 Baghdad on Sunday 1 Nov 2026 is 22:30 UTC on Saturday 31 Oct.
    const earlyFirst = Date.parse("2026-10-31T22:30:00Z");

    it("today is the Baghdad day", () => {
        expect(getTodayRange(earlyFirst)).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    });

    it("the week starts on Saturday", () => {
        // 01:30 Baghdad on Saturday 31 Oct is still Friday 30 Oct in UTC.
        expect(getThisWeekRange(Date.parse("2026-10-30T22:30:00Z"))).toEqual({ from: "2026-10-31", to: "2026-10-31" });
        expect(getThisWeekRange(earlyFirst)).toEqual({ from: "2026-10-31", to: "2026-11-01" });
        // Friday 6 Nov, noon Baghdad.
        expect(getThisWeekRange(Date.parse("2026-11-06T09:00:00Z"))).toEqual({ from: "2026-10-31", to: "2026-11-06" });
    });

    it("the month is the Baghdad month", () => {
        expect(getThisMonthRange(earlyFirst)).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    });
});
