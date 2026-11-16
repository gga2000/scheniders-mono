import { describe, it, expect } from "vitest";
import { drillDays, ordersDateLabel } from "./orders-date-label";

const t = (k: string) => k.replace("orders.dateLabel.", "");
// Wednesday 15 Oct 2026, local time.
const now = new Date(2026, 9, 15, 12, 0);

describe("ordersDateLabel", () => {
    it("says all orders when there is no range", () => {
        expect(ordersDateLabel(null, null, null, t, "en", now)).toBe("all");
    });

    it("names the picked preset when the range still matches it", () => {
        expect(ordersDateLabel("2026-10-09", "2026-10-15", "last7", t, "en", now)).toBe("last7");
        expect(ordersDateLabel("2026-10-15", "2026-10-15", "today", t, "en", now)).toBe("today");
    });

    it("recognises ranges without a preset", () => {
        expect(ordersDateLabel("2026-10-14", "2026-10-14", null, t, "en", now)).toBe("yesterday");
        expect(ordersDateLabel("2026-10-11", "2026-10-15", null, t, "en", now)).toBe("thisWeek");
        expect(ordersDateLabel("2026-10-01", "2026-10-15", null, t, "en", now)).toBe("thisMonth");
        expect(ordersDateLabel("2026-10-08", "2026-10-15", null, t, "en", now)).toBe("last7");
        expect(ordersDateLabel("2025-10-15", "2026-10-15", null, t, "en", now)).toBe("pastYear");
    });

    it("shows the dates for anything else", () => {
        expect(ordersDateLabel("2026-10-03", null, null, t, "en", now)).toBe("Oct 3");
        expect(ordersDateLabel("2026-10-03", "2026-10-05", null, t, "en", now)).toBe("Oct 3 — Oct 5");
    });

    it("shows the dates in Arabic on an Arabic page", () => {
        // Intl joins the month's two words with a no-break space.
        expect(ordersDateLabel("2026-10-03", null, null, t, "ar", now)).toBe("3 تشرين\u00a0الأول");
    });
});

describe("drillDays: the days a dashboard link opens Orders on", () => {
    it("takes the period's Baghdad days and its picker preset", () => {
        expect(drillDays(new URLSearchParams("status=completed&from=2026-10-18&to=2026-11-16&preset=last30")))
            .toEqual({ from: "2026-10-18", to: "2026-11-16", preset: "last30" });
    });

    it("opens every day for dates=all", () => {
        expect(drillDays(new URLSearchParams("status=completed&dates=all")))
            .toEqual({ from: undefined, to: undefined, preset: null });
    });

    it("leaves Orders' own dates alone when the link names none or names them badly", () => {
        expect(drillDays(new URLSearchParams("status=rejected"))).toBeNull();
        expect(drillDays(new URLSearchParams("from=2026-11-16&to=2026-10-18"))).toBeNull();
        expect(drillDays(new URLSearchParams("from=yesterday&to=2026-10-18"))).toBeNull();
        expect(drillDays(new URLSearchParams("from=2026-10-18&to=2026-10-18&preset=thisYear"))?.preset).toBeNull();
    });
});
