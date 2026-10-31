import { describe, expect, it } from "vitest";
import { teamPreviousWindow, teamRangeStart } from "./team-time-window";

// 2026-10-31 01:30 in Baghdad (UTC+3) is 2026-10-30 22:30 UTC: still "today" = Oct 31 in Baghdad.
const NOW = Date.parse("2026-10-30T22:30:00.000Z");

describe("teamRangeStart", () => {
    it("starts today at Baghdad midnight, not UTC midnight", () => {
        expect(teamRangeStart("today", NOW)).toBe("2026-10-30T21:00:00.000Z");
    });
    it("covers 7 whole Baghdad days for week", () => {
        expect(teamRangeStart("week", NOW)).toBe("2026-10-24T21:00:00.000Z");
    });
    it("covers 30 whole Baghdad days for month", () => {
        expect(teamRangeStart("month", NOW)).toBe("2026-10-01T21:00:00.000Z");
    });
    it("is unbounded for all", () => {
        expect(teamRangeStart("all", NOW)).toBeNull();
    });
});

describe("teamPreviousWindow", () => {
    it("is yesterday for today", () => {
        expect(teamPreviousWindow("today", NOW)).toEqual({
            start: "2026-10-29T21:00:00.000Z",
            end: "2026-10-30T21:00:00.000Z",
        });
    });
    it("is the 7 days before the current week, ending where it starts", () => {
        const prev = teamPreviousWindow("week", NOW);
        expect(prev).toEqual({ start: "2026-10-17T21:00:00.000Z", end: "2026-10-24T21:00:00.000Z" });
        expect(prev?.end).toBe(teamRangeStart("week", NOW));
    });
    it("is null for all", () => {
        expect(teamPreviousWindow("all", NOW)).toBeNull();
    });
});
