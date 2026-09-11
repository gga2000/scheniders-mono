import { describe, it, expect } from "vitest";
import {
    classifyTransition,
    isUnusualTransition,
    PRE_FULFILMENT_STATUSES,
    FULFILMENT_OUTCOME_STATUSES,
} from "./order-status-machine";

/**
 * The `normal` cases below are not invented — each is a transition that occurs
 * in `order_status_history` within the last six months, with its observed count.
 * They exist so a future attempt to enforce this machine cannot quietly start
 * rejecting work that staff do every day.
 */
const OBSERVED_IN_PRODUCTION: [string, string, number][] = [
    ["confirmed", "in_transit", 10599],
    ["contacted", "confirmed", 9606],
    ["new", "contacted", 9874],
    ["in_transit", "delivered", 8766],
    ["delivered", "return_pending", 7632],
    ["delivered", "completed", 3326],
    ["confirmed", "cancelled", 1175],
    ["new", "confirmed", 1114],
    ["in_transit", "rejected", 260],
    ["in_transit", "confirmed", 214],
    ["pending_checkout", "contacted", 188],
    ["contacted", "cancelled", 148],
    ["contacted", "no_response", 110],
    ["return_pending", "in_transit", 59],
    ["confirmed", "contacted", 39],
    ["in_transit", "refund_delivered", 21],
    ["no_response", "confirmed", 14],
    ["cancelled", "confirmed", 12],
    ["completed", "delivered", 8],
    ["contacted", "new", 8],
    ["suspended", "confirmed", 4],
    ["completed", "confirmed", 3],
    ["confirmed", "delivered", 3],
    ["rejected", "confirmed", 2],
    ["cancelled", "in_transit", 2],
    ["completed", "refund_delivered", 2],
    ["rejected", "delivered", 1],
    ["rejected", "refund_delivered", 1],
];

describe("classifyTransition", () => {
    it.each(OBSERVED_IN_PRODUCTION)(
        "treats %s → %s as normal (%i occurrences in the last 6 months)",
        (from, to) => {
            const verdict = classifyTransition(
                from as Parameters<typeof classifyTransition>[0],
                to as Parameters<typeof classifyTransition>[1],
            );
            expect(verdict.kind).toBe("normal");
        },
    );

    it("flags a fulfilment outcome reached without shipping", () => {
        // These stopped occurring around 2025-12 and look like an earlier bug.
        for (const from of ["new", "contacted", "no_response", "pending_checkout", "suspended"] as const) {
            for (const to of ["delivered", "completed", "refund_delivered"] as const) {
                const verdict = classifyTransition(from, to);
                expect(verdict.kind, `${from} → ${to}`).toBe("unusual");
                if (verdict.kind === "unusual") {
                    expect(verdict.reason).toContain("never shipped");
                }
            }
        }
    });

    it("does not flag a no-op transition", () => {
        expect(classifyTransition("confirmed", "confirmed").kind).toBe("normal");
        expect(classifyTransition("new", "new").kind).toBe("normal");
    });

    it("does not flag reaching an outcome from a shipped or already-settled state", () => {
        // in_transit and return_pending have been shipped; completed/delivered
        // are corrections between outcomes, which operators do make.
        expect(isUnusualTransition("in_transit", "delivered")).toBe(false);
        expect(isUnusualTransition("return_pending", "refund_delivered")).toBe(false);
        expect(isUnusualTransition("completed", "delivered")).toBe(false);
        expect(isUnusualTransition("delivered", "completed")).toBe(false);
    });

    it("does not flag moving backwards out of a terminal state", () => {
        // Reopening a cancelled or rejected order is routine correction work.
        expect(isUnusualTransition("cancelled", "confirmed")).toBe(false);
        expect(isUnusualTransition("rejected", "in_transit")).toBe(false);
        expect(isUnusualTransition("completed", "confirmed")).toBe(false);
    });

    it("keeps the two status sets disjoint", () => {
        for (const status of PRE_FULFILMENT_STATUSES) {
            expect(FULFILMENT_OUTCOME_STATUSES).not.toContain(status);
        }
    });
});
