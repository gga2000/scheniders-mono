import { describe, expect, it } from "vitest";
import type { PrimeShipmentView } from "./chip-state";
import { primeBoard, type PrimeBoardParcel } from "./board";

/** 2026-11-04 12:00 in Baghdad. */
const NOW = Date.parse("2026-11-04T09:00:00Z");

const view = (over: Partial<PrimeShipmentView> = {}): PrimeShipmentView => ({
    caseId: 1,
    status: "ONWAY",
    stepCode: "ONWAY",
    stepName: null,
    sentAt: "2026-11-03T09:00:00Z",
    receiptAmountIqd: 30_000,
    shipmentCharge: 5_000,
    checkedAt: "2026-11-04T08:55:00Z",
    statusChangedAt: "2026-11-04T07:00:00Z",
    pending: false,
    pushError: null,
    cancelledAt: null,
    cancelRefusedAt: null,
    resentAt: null,
    ...over,
});

const parcel = (orderId: string, over: Partial<PrimeShipmentView> = {}, orderStatus = "in_transit", cash = 30_000): PrimeBoardParcel => ({
    orderId,
    orderStatus,
    view: view(over),
    cash,
});

describe("primeBoard", () => {
    it("counts today's hand-off by the Baghdad day, not the UTC day", () => {
        const board = primeBoard(
            [
                // 22:30 UTC on the 3rd is 01:30 on the 4th in Baghdad.
                parcel("late-night", { sentAt: "2026-11-03T22:30:00Z", stepCode: "READYTOPICKUP" }, "confirmed", 20_000),
                parcel("yesterday", { sentAt: "2026-11-03T20:00:00Z" }),
                parcel("deleted", { sentAt: "2026-11-04T06:00:00Z", cancelledAt: "2026-11-04T06:10:00Z" }, "cancelled"),
            ],
            NOW,
        );
        expect(board.lists.handed_today).toEqual(["late-night"]);
        expect(board.cash.handed_today).toBe(20_000);
    });

    it("places open parcels along the way and sums their cash", () => {
        const board = primeBoard(
            [
                parcel("branch", { stepCode: "NEWINSTORE" }, "in_transit", 10_000),
                parcel("road", { stepCode: "NEW_ONWAY" }, "in_transit", 20_000),
                parcel("driver", { stepCode: "ONWAY" }, "in_transit", 30_000),
                parcel("later", { stepCode: "POSTPONED", status: "POSTPONED" }, "in_transit", 40_000),
                parcel("back", { status: "RETURNED", stepCode: "RTN_INSTORE" }, "in_transit", 50_000),
            ],
            NOW,
        );
        expect(board.lists.at_branch).toEqual(["branch"]);
        expect(board.lists.on_road).toEqual(["road", "driver", "later"]);
        expect(board.lists.postponed).toEqual(["later"]);
        expect(board.lists.returning).toEqual(["back"]);
        // Coming back is not cash on the road, nor a parcel still out.
        expect(board.cash.on_road).toBe(100_000);
        expect(board.out).toBe(4);
    });

    it("counts only today's deliveries", () => {
        const board = primeBoard(
            [
                parcel("today", { status: "DELIVERED", stepCode: "DLEIVERD", statusChangedAt: "2026-11-04T08:00:00Z" }, "delivered", 25_000),
                parcel("before", { status: "DELIVERED", stepCode: "DLEIVERD", statusChangedAt: "2026-11-03T08:00:00Z" }, "delivered"),
            ],
            NOW,
        );
        expect(board.lists.delivered_today).toEqual(["today"]);
        expect(board.cash.delivered_today).toBe(25_000);
        expect(board.lists.on_road).toEqual([]);
    });

    it("lists what needs a decision, oldest first, with the reason", () => {
        const board = primeBoard(
            [
                parcel("asks", { stepCode: "CHNG_AMT_CFM_REQUIRED", statusChangedAt: "2026-11-04T05:00:00Z" }),
                parcel("stuck", { stepCode: "ONWAY", statusChangedAt: "2026-10-30T05:00:00Z" }),
                parcel("back", { status: "RETURNED", stepCode: "RTN_INSTORE", statusChangedAt: "2026-11-02T05:00:00Z" }),
                parcel("prime-cancelled", { status: "CNCL", stepCode: null, statusChangedAt: "2026-11-03T05:00:00Z" }),
                parcel("closed", { status: "CNCL", stepCode: null }, "cancelled"),
                parcel("fine", { stepCode: "ONWAY" }),
            ],
            NOW,
        );
        expect(board.lists.needs).toEqual(["stuck", "back", "prime-cancelled", "asks"]);
        expect(Object.fromEntries(board.reasons)).toEqual({
            stuck: "stuck",
            back: "returning",
            "prime-cancelled": "cancelled_by_prime",
            asks: "needs_you",
        });
    });

    it("leaves out parcels whose order left Prime's hands", () => {
        const board = primeBoard([parcel("refunded", { stepCode: "ONWAY" }, "rejected")], NOW);
        expect(board.lists.on_road).toEqual([]);
        expect(board.cash.on_road).toBe(0);
    });
});
