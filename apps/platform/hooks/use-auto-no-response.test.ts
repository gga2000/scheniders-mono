import { describe, expect, it, vi } from "vitest";
import type { Order } from "@/types";

// The rule must never reach the database from the browser: a device copy of the
// list can be days old, and the write would be credited to whoever had the page open.
const repo = vi.hoisted(() => ({ bulkUpdateStatus: vi.fn(), updateStatus: vi.fn() }));
vi.mock("@/lib/repositories/order-repository", () => ({ orderRepository: repo }));

import { resolveStaleContacted } from "./use-auto-no-response";

const HOUR = 60 * 60 * 1000;
const order = (id: string, status: string, contactedHoursAgo: number | null) =>
    ({
        id,
        status,
        last_contacted_at: contactedHoursAgo === null ? null : new Date(Date.now() - contactedHoursAgo * HOUR).toISOString(),
    }) as unknown as Order;

describe("resolveStaleContacted", () => {
    it("shows contacted orders older than 48h as no_response and leaves the rest", () => {
        const rows = [
            order("stale", "contacted", 49),
            order("fresh", "contacted", 47),
            order("no-time", "contacted", null),
            order("cancelled", "cancelled", 100),
        ];
        const out = resolveStaleContacted(rows);
        expect(out.map((o) => o.status)).toEqual(["no_response", "contacted", "contacted", "cancelled"]);
    });

    it("never writes to the database", () => {
        resolveStaleContacted([order("stale", "contacted", 72)]);
        expect(repo.bulkUpdateStatus).not.toHaveBeenCalled();
        expect(repo.updateStatus).not.toHaveBeenCalled();
    });
});
