import { describe, expect, it } from "vitest";
import { hoursByPerson } from "./hours";

describe("hoursByPerson", () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    it("adds closed and open shifts, counts Baghdad days and missed clock-outs", () => {
        const rows = [
            { user_id: "a", clock_in: "2026-11-05T09:00:00Z", clock_out: null, auto_closed: false },
            { user_id: "a", clock_in: "2026-11-04T06:00:00Z", clock_out: "2026-11-04T14:30:00Z", auto_closed: false },
            // 22:30 UTC is 01:30 next day in Baghdad: a different day from the 4th's shift.
            { user_id: "b", clock_in: "2026-11-03T22:30:00Z", clock_out: "2026-11-04T10:30:00Z", auto_closed: true },
        ];
        expect(hoursByPerson(rows, now)).toEqual([
            { userId: "b", minutes: 720, days: 1, onNow: false, forgot: 1 },
            { userId: "a", minutes: 180 + 510, days: 2, onNow: true, forgot: 0 },
        ]);
    });
});
