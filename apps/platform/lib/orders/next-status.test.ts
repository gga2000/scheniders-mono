import { describe, expect, it } from "vitest";
import { nextOrderStatus } from "./next-status";

describe("nextOrderStatus", () => {
    it("walks an order through the usual path", () => {
        expect(nextOrderStatus("pending_checkout", false)).toBe("contacted");
        expect(nextOrderStatus("new", false)).toBe("contacted");
        expect(nextOrderStatus("contacted", false)).toBe("confirmed");
        expect(nextOrderStatus("confirmed", false)).toBe("in_transit");
        expect(nextOrderStatus("in_transit", false)).toBe("completed");
        expect(nextOrderStatus("delivered", false)).toBe("completed");
    });

    it("offers nothing once the order has ended or has no usual move", () => {
        for (const status of ["completed", "cancelled", "rejected", "no_response", "suspended"] as const) {
            expect(nextOrderStatus(status, false)).toBeNull();
        }
    });

    it("sends a return back only from its first step", () => {
        expect(nextOrderStatus("return_pending", true)).toBe("in_transit");
        // On its way back, staff split between refund and back to pending: no usual move.
        expect(nextOrderStatus("in_transit", true)).toBeNull();
        expect(nextOrderStatus("new", true)).toBeNull();
    });
});
