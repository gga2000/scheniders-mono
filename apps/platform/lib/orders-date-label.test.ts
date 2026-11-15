import { describe, it, expect } from "vitest";
import { ordersDateLabel } from "./orders-date-label";

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
