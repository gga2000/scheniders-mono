import { describe, it, expect } from "vitest";
import { workQueueFromStatusCounts } from "./dashboard-work-queue";

describe("workQueueFromStatusCounts — the stats grid reads the server's whole-book counts", () => {
    // Shape captured from get_orders_aggregates as an authenticated employee, 2026-10-13.
    const live = {
        all: 5152, new: 0, refunds: 77, rejected: 546, cancelled: 402, completed: 2885,
        confirmed: 0, contacted: 6, delivered: 9, suspended: 128, in_transit: 246,
        no_response: 783, refund_failed: 0, return_pending: 0, pending_checkout: 70,
        refund_delivered: 77,
    };

    it("maps the live payload to the four work queues", () => {
        expect(workQueueFromStatusCounts(live)).toEqual({
            newOrders: 0, contactedOrders: 6, confirmedOrders: 0, rejectedOrders: 546,
        });
    });

    it("REJECTS a missing key instead of showing an empty queue", () => {
        const withoutRejected: Record<string, number> = { ...live };
        delete withoutRejected.rejected;
        expect(() => workQueueFromStatusCounts(withoutRejected)).toThrow();
    });
});
