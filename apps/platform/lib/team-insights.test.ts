import { describe, it, expect } from "vitest";
import { buildTeamInsights, rollupSchema } from "./team-insights";
import { teamInsightsWindow } from "./team-time-window";

describe("buildTeamInsights", () => {
    it("zero-fills every day in the window and keeps database counts", () => {
        const rollup = rollupSchema.parse({
            by_day: [{ day: "2026-10-30", total_actions: "30", orders_created: 4, status_changes: 20, orders_printed: 6 }],
            by_hour: [{ hour: 11, n: "13" }],
            by_action: [{ action: "order.create", n: 4 }],
        });
        const out = buildTeamInsights(rollup, ["2026-10-29", "2026-10-30", "2026-10-31"]);
        expect(out.byDay.map((d) => d.totalActions)).toEqual([0, 30, 0]);
        expect(out.byDay[1]).toMatchObject({ ordersCreated: 4, statusChanges: 20, ordersPrinted: 6 });
        expect(out.byHour).toEqual([{ hour: 11, count: 13 }]);
        expect(out.byAction).toEqual([{ action: "order.create", count: 4 }]);
    });

    it("rejects an hour outside 0-23", () => {
        expect(() => rollupSchema.parse({ by_day: [], by_hour: [{ hour: 24, n: 1 }], by_action: [] })).toThrow();
    });
});

describe("teamInsightsWindow", () => {
    // 2026-10-31 21:30 UTC is 2026-11-01 00:30 in Baghdad.
    const now = Date.parse("2026-10-31T21:30:00Z");

    it("covers whole Baghdad days ending today", () => {
        const w = teamInsightsWindow("week", now);
        expect(w.dayKeys).toHaveLength(7);
        expect(w.dayKeys[6]).toBe("2026-11-01");
        expect(w.start).toBe("2026-10-25T21:00:00.000Z");
        expect(w.end).toBe("2026-11-01T21:00:00.000Z");
    });

    it("shows a week for Today and caps All at a year", () => {
        expect(teamInsightsWindow("today", now).dayKeys).toHaveLength(7);
        expect(teamInsightsWindow("month", now).dayKeys).toHaveLength(30);
        expect(teamInsightsWindow("all", now).dayKeys).toHaveLength(365);
    });
});
