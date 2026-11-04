import { describe, expect, it } from "vitest";
import type { PrimeShipmentView } from "./chip-state";
import { primeProblemHandled, primeProblemKind, primeProblems } from "./problems";

const NOW = Date.parse("2026-11-04T20:00:00Z");

const view = (over: Partial<PrimeShipmentView> = {}): PrimeShipmentView => ({
    caseId: 52402395,
    status: "ONWAY",
    stepCode: "ONWAY",
    stepName: "مندوب التوصيل",
    sentAt: "2026-11-04T08:00:00Z",
    receiptAmountIqd: 40_000,
    shipmentCharge: 6_000,
    checkedAt: "2026-11-04T19:55:00Z",
    statusChangedAt: "2026-11-04T12:00:00Z",
    pending: false,
    pushError: null,
    cancelledAt: null,
    cancelRefusedAt: null,
    resentAt: null,
    returnReason: null,
    postponeReason: null,
    postponedTo: null,
    problemCheckedAt: null,
    problemCheckedBy: null,
    problemNote: null,
    ...over,
});

describe("primeProblemKind", () => {
    it("reads each of Prime's problem steps", () => {
        expect(primeProblemKind(view({ stepCode: "RTN_WITHAGENT" }), "in_transit", NOW)).toBe("failed");
        expect(primeProblemKind(view({ stepCode: "DLV_AGENT_REJECT" }), "in_transit", NOW)).toBe("failed");
        expect(primeProblemKind(view({ stepCode: "CHNG_AMT_CFM_REQUIRED" }), "in_transit", NOW)).toBe("confirm");
        expect(primeProblemKind(view({ stepCode: "DELIVERY_CONFIRMATION_REQUEST" }), "in_transit", NOW)).toBe("confirm");
        expect(primeProblemKind(view({ stepCode: "UNDER_REVISION" }), "in_transit", NOW)).toBe("confirm");
        expect(primeProblemKind(view({ pushError: "refused" }), "in_transit", NOW)).toBe("confirm");
        expect(primeProblemKind(view({ status: "POSTPONED", stepCode: "POSTPONED" }), "in_transit", NOW)).toBe("postponed");
        expect(primeProblemKind(view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER", stepCode: "RTN_INSTORE" }), "in_transit", NOW)).toBe("returning");
        expect(primeProblemKind(view({ stepCode: "CANCEL_DONT_DELIVER" }), "in_transit", NOW)).toBe("returning");
        expect(primeProblemKind(view({ status: "CNCL" }), "in_transit", NOW)).toBe("cancelled_by_prime");
    });

    it("counts a parcel that has not moved in 3 days as stuck", () => {
        expect(primeProblemKind(view({ statusChangedAt: "2026-11-01T10:00:00Z" }), "in_transit", NOW)).toBe("stuck");
        expect(primeProblemKind(view(), "in_transit", NOW)).toBeNull();
    });

    it("leaves out delivered, closed, deleted and resent parcels", () => {
        expect(primeProblemKind(view({ status: "DELIVERED", stepCode: "DLEIVERD" }), "delivered", NOW)).toBeNull();
        expect(primeProblemKind(view({ stepCode: "RTN_WITHAGENT" }), "rejected", NOW)).toBeNull();
        expect(primeProblemKind(view({ stepCode: "RTN_WITHAGENT", cancelledAt: "2026-11-04T13:00:00Z" }), "in_transit", NOW)).toBeNull();
        expect(primeProblemKind(view({ status: "CNCL" }), "cancelled", NOW)).toBeNull();
        expect(
            primeProblemKind(view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER", resentAt: "2026-11-04T13:00:00Z", statusChangedAt: "2026-11-04T12:00:00Z" }), "in_transit", NOW),
        ).toBeNull();
    });
});

describe("primeProblemHandled", () => {
    it("holds until Prime moves the parcel again", () => {
        expect(primeProblemHandled(view({ problemCheckedAt: "2026-11-04T13:00:00Z" }))).toBe(true);
        expect(primeProblemHandled(view({ problemCheckedAt: "2026-11-04T11:00:00Z" }))).toBe(false);
        expect(primeProblemHandled(view())).toBe(false);
    });
});

describe("primeProblems", () => {
    it("puts unhandled first, then the most urgent, then the oldest", () => {
        const list = primeProblems(
            [
                { orderId: "postponed", orderStatus: "in_transit", view: view({ status: "POSTPONED", stepCode: "POSTPONED" }) },
                { orderId: "failed-new", orderStatus: "in_transit", view: view({ stepCode: "RTN_WITHAGENT", statusChangedAt: "2026-11-04T15:00:00Z" }) },
                { orderId: "failed-old", orderStatus: "in_transit", view: view({ stepCode: "RTN_WITHAGENT", statusChangedAt: "2026-11-04T09:00:00Z" }) },
                { orderId: "handled", orderStatus: "in_transit", view: view({ stepCode: "RTN_WITHAGENT", problemCheckedAt: "2026-11-04T13:00:00Z" }) },
                { orderId: "fine", orderStatus: "in_transit", view: view() },
            ],
            NOW,
        );
        expect(list.map((p) => p.orderId)).toEqual(["failed-old", "failed-new", "postponed", "handled"]);
        expect(list[3]).toMatchObject({ kind: "failed", handled: true });
    });
});
