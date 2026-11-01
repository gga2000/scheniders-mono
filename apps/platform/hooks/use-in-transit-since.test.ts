import { describe, expect, it } from "vitest";
import { latestInTransitEntry } from "./use-in-transit-since";

const row = (order_id: string, from_status: string | null, to_status: string, changed_at: string) => ({
    order_id, from_status, to_status, changed_at,
});

describe("latestInTransitEntry", () => {
    it("keeps the latest real move into in_transit per order", () => {
        const since = latestInTransitEntry([
            row("a", "confirmed", "in_transit", "2026-10-01T08:00:00Z"),
            row("a", "in_transit", "in_transit", "2026-10-28T08:00:00Z"), // edit audit row, not a move
            row("a", "returned", "in_transit", "2026-10-10T08:00:00Z"),   // re-shipped later
            row("b", "confirmed", "in_transit", "2026-10-20T08:00:00Z"),
        ]);
        expect(Object.fromEntries(since)).toEqual({ a: "2026-10-10T08:00:00Z", b: "2026-10-20T08:00:00Z" });
    });

    it("ignores other statuses and leaves unknown orders out", () => {
        const since = latestInTransitEntry([row("a", "new", "confirmed", "2026-10-01T08:00:00Z")]);
        expect(since.size).toBe(0);
    });
});
