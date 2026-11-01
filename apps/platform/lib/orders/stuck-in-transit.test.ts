import { describe, expect, it } from "vitest";
import { daysInTransit, inTransitSince, stuckOrderIds, STUCK_TRANSIT_DAYS } from "./stuck-in-transit";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("stuck in transit", () => {
    it("counts whole days and never goes negative", () => {
        expect(daysInTransit(daysAgo(7.9), NOW)).toBe(7);
        expect(daysInTransit(daysAgo(-1), NOW)).toBe(0);
        expect(daysInTransit("not a date", NOW)).toBe(0);
    });

    it("uses the latest move to in_transit, falling back to updated_at", () => {
        const since = inTransitSince(
            [
                { id: "a", updated_at: daysAgo(1) },
                { id: "b", updated_at: daysAgo(2) },
            ],
            [
                { order_id: "a", changed_at: daysAgo(20) },
                { order_id: "a", changed_at: daysAgo(10) },
            ],
        );
        expect(since.get("a")).toBe(daysAgo(10));
        expect(since.get("b")).toBe(daysAgo(2));
    });

    it(`lists orders ${STUCK_TRANSIT_DAYS}+ days in transit, oldest first`, () => {
        const since = new Map([
            ["new", daysAgo(2)],
            ["edge", daysAgo(STUCK_TRANSIT_DAYS)],
            ["old", daysAgo(25)],
        ]);
        expect(stuckOrderIds(since, NOW)).toEqual(["old", "edge"]);
    });
});
