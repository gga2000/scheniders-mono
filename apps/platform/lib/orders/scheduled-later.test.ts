import { describe, expect, it } from "vitest";
import { scheduledLaterFrom } from "./scheduled-later";

// 2026-11-06 12:00 in Baghdad.
const NOW = Date.parse("2026-11-06T09:00:00.000Z");

describe("scheduledLaterFrom", () => {
    it("is null when nothing is scheduled after today", () => {
        expect(scheduledLaterFrom([], NOW)).toBeNull();
        expect(scheduledLaterFrom([{ id: "a", scheduled_date: null }, { id: "b", scheduled_date: "2026-11-06" }, { id: "c", scheduled_date: "2026-11-01" }], NOW)).toBeNull();
    });

    it("keeps only orders after today and spans tomorrow to the latest day", () => {
        const got = scheduledLaterFrom(
            [
                { id: "a", scheduled_date: "2026-11-08" },
                { id: "b", scheduled_date: "2026-11-06" },
                { id: "c", scheduled_date: "2026-11-12" },
                { id: "d", scheduled_date: "soon" },
            ],
            NOW,
        );
        expect(got).toEqual({ ids: ["a", "c"], fromDay: "2026-11-07", toDay: "2026-11-12" });
    });

    it("uses the Baghdad day, not the UTC day, just after local midnight", () => {
        // 2026-11-06 22:30 UTC is already 2026-11-07 01:30 in Baghdad.
        const late = Date.parse("2026-11-06T22:30:00.000Z");
        expect(scheduledLaterFrom([{ id: "a", scheduled_date: "2026-11-07" }], late)).toBeNull();
        expect(scheduledLaterFrom([{ id: "a", scheduled_date: "2026-11-08" }], late)?.fromDay).toBe("2026-11-08");
    });
});
