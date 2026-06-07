import { describe, it, expect } from "vitest";
import type { Order } from "@/types/order";
import { classifyScannedOrder } from "./classify-scan";

type ClassifyInput = Pick<Order, "status" | "refund_status"> | null;
const o = (status: Order["status"], refund_status?: Order["refund_status"]): ClassifyInput => ({ status, refund_status });

describe("classifyScannedOrder", () => {
    it("returns not_found when nothing resolved", () => {
        expect(classifyScannedOrder(null)).toBe("not_found");
    });

    it("treats a delivered order pending refund as a legitimate return (the reported bug)", () => {
        // #2970 / #2950 from the report: delivered + refund pending.
        expect(classifyScannedOrder(o("delivered", "pending"))).toBe("needs_action");
        expect(classifyScannedOrder(o("delivered", "none"))).toBe("needs_action");
        expect(classifyScannedOrder(o("delivered", "failed"))).toBe("needs_action");
    });

    it("treats in-transit / confirmed / return_pending / suspended as needs_action", () => {
        expect(classifyScannedOrder(o("in_transit"))).toBe("needs_action");
        expect(classifyScannedOrder(o("confirmed"))).toBe("needs_action");
        expect(classifyScannedOrder(o("return_pending"))).toBe("needs_action");
        expect(classifyScannedOrder(o("suspended"))).toBe("needs_action");
    });

    it("flags already-closed-out orders as anomalies", () => {
        for (const s of ["rejected", "cancelled", "refund_delivered", "refund_failed", "completed"] as Order["status"][]) {
            expect(classifyScannedOrder(o(s))).toBe("anomaly");
        }
    });

    it("flags an already-refunded order as an anomaly even if delivered", () => {
        expect(classifyScannedOrder(o("delivered", "refunded"))).toBe("anomaly");
    });

    it("flags never-shipped orders as never_shipped", () => {
        for (const s of ["new", "contacted", "pending_checkout", "no_response"] as Order["status"][]) {
            expect(classifyScannedOrder(o(s))).toBe("never_shipped");
        }
    });
});
