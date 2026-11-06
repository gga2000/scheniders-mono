import { describe, expect, it } from "vitest";
import type { PrimeShipmentView } from "./chip-state";
import {
    primeBandAction,
    primeBucket,
    primeHistoryTime,
    primeIsStuck,
    primeLastChecked,
    primeReasonNote,
    primeTrack,
    PRIME_STUCK_MS,
} from "./track";

const view = (over: Partial<PrimeShipmentView> = {}): PrimeShipmentView => ({
    caseId: 52176701,
    status: "ONWAY",
    stepCode: "READYTOPICKUP",
    stepName: "جاهز للبيك اب",
    sentAt: "2026-11-03T12:00:00Z",
    receiptAmountIqd: 36_750,
    shipmentCharge: 5_000,
    checkedAt: "2026-11-03T14:05:00Z",
    statusChangedAt: "2026-11-03T13:00:00Z",
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
    warnedAt: null,
    warnedBy: null,
    ...over,
});

describe("primeTrack", () => {
    it("keeps a delivery Prime closed after it failed as waiting on us, with the driver", () => {
        expect(primeTrack(view({ status: "CNCL", stepCode: "RTN_WITHAGENT" }))).toEqual({ stop: 3, state: "needs_you" });
        expect(primeTrack(view({ status: "CNCL", stepCode: null }))).toEqual({ stop: 0, state: "cancelled" });
    });

    it.each([
        ["READYTOPICKUP", 0],
        ["NEWINSTORE", 1],
        ["PRINTMANIFEST", 1],
        ["NEW_ONWAY", 2],
        ["LIAISONAGT_NEWONWAY", 2],
        ["ONWAY", 3],
        ["TRY_AGAIN", 3],
    ] as const)("step %s sits at stop %i, moving", (stepCode, stop) => {
        expect(primeTrack(view({ stepCode }))).toEqual({ stop, state: "moving" });
    });

    it("a step Prime added later counts as on the way; no step read yet is the first stop", () => {
        expect(primeTrack(view({ stepCode: "SOMETHING_NEW" }))).toEqual({ stop: 2, state: "moving" });
        expect(primeTrack(view({ stepCode: null }))).toEqual({ stop: 0, state: "moving" });
    });

    it("delivered by status or by step", () => {
        expect(primeTrack(view({ status: "DELIVERED", stepCode: "ONWAY" }))).toEqual({ stop: 4, state: "delivered" });
        expect(primeTrack(view({ status: "ONWAY", stepCode: "SUCCARCHV" }))).toEqual({ stop: 4, state: "delivered" });
        expect(primeTrack(view({ status: "PART_DELIVERED", stepCode: "PART_SUCC" })).state).toBe("delivered");
    });

    it("coming back by status or by a return step, whatever else the row says", () => {
        expect(primeTrack(view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER", stepCode: "ONWAY" }))).toEqual({ stop: 4, state: "returning" });
        expect(primeTrack(view({ status: "ONWAY", stepCode: "RTN_INSTORE" })).state).toBe("returning");
        expect(primeTrack(view({ status: "ONWAY", stepCode: "RTN_WITH_PICKUPAGENT", pushError: "x" })).state).toBe("returning");
    });

    it("postponed at the driver", () => {
        expect(primeTrack(view({ status: "POSTPONED", stepCode: "POSTPONED" }))).toEqual({ stop: 3, state: "postponed" });
        expect(primeTrack(view({ status: "POSTPONED", stepCode: null }))).toEqual({ stop: 3, state: "postponed" });
    });

    it("needs the store: a failed attempt, a new amount to confirm, a refused change or cancellation", () => {
        expect(primeTrack(view({ stepCode: "RTN_WITHAGENT" }))).toEqual({ stop: 3, state: "needs_you" });
        expect(primeTrack(view({ stepCode: "CHNG_AMT_CFM_REQUIRED" })).state).toBe("needs_you");
        expect(primeTrack(view({ stepCode: "PICKUP_REJECT" }))).toEqual({ stop: 0, state: "needs_you" });
        expect(primeTrack(view({ pushError: "skip:bad_phone" })).state).toBe("needs_you");
        expect(primeTrack(view({ cancelRefusedAt: "2026-11-03T15:00:00Z" })).state).toBe("needs_you");
        // A postponed parcel whose edit Prime refused: the refusal is what needs a person.
        expect(primeTrack(view({ status: "POSTPONED", stepCode: "POSTPONED", pushError: "x" })).state).toBe("needs_you");
    });

    it("cancelled: deleted at Prime by us, or cancelled by Prime", () => {
        expect(primeTrack(view({ cancelledAt: "2026-11-03T15:00:00Z", stepCode: "NEWINSTORE" }))).toEqual({ stop: 1, state: "cancelled" });
        expect(primeTrack(view({ status: "CNCL", stepCode: null }))).toEqual({ stop: 0, state: "cancelled" });
    });
});

describe("primeBucket", () => {
    it("puts each open parcel in exactly one bucket", () => {
        expect(primeBucket(view())).toBe("on_way");
        expect(primeBucket(view({ status: "POSTPONED", stepCode: "POSTPONED" }))).toBe("postponed");
        expect(primeBucket(view({ stepCode: "RTN_WITHAGENT" }))).toBe("needs_you");
        expect(primeBucket(view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER" }))).toBe("returning");
    });

    it("a parcel Prime cancelled is the store's to sort out; one we deleted is closed", () => {
        expect(primeBucket(view({ status: "CNCL" }))).toBe("needs_you");
        expect(primeBucket(view({ cancelledAt: "2026-11-03T15:00:00Z" }))).toBeNull();
    });

    it("delivered parcels are in no bucket", () => {
        expect(primeBucket(view({ status: "DELIVERED", stepCode: "DLEIVERD" }))).toBeNull();
    });
});

describe("primeIsStuck", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");

    it("open with no move at Prime for three days", () => {
        expect(primeIsStuck(view({ statusChangedAt: new Date(now - PRIME_STUCK_MS - 60_000).toISOString() }), now)).toBe(true);
        expect(primeIsStuck(view({ statusChangedAt: new Date(now - PRIME_STUCK_MS + 60_000).toISOString() }), now)).toBe(false);
    });

    it("counts from the send when Prime never moved the parcel", () => {
        expect(primeIsStuck(view({ statusChangedAt: null, sentAt: "2026-11-03T12:00:00Z" }), now)).toBe(true);
        expect(primeIsStuck(view({ statusChangedAt: null, sentAt: "2026-11-09T12:00:00Z" }), now)).toBe(false);
    });

    it("never for a delivered or deleted parcel", () => {
        expect(primeIsStuck(view({ status: "DELIVERED", statusChangedAt: null }), now)).toBe(false);
        expect(primeIsStuck(view({ cancelledAt: "2026-11-03T15:00:00Z", statusChangedAt: null }), now)).toBe(false);
    });
});

describe("primeBandAction", () => {
    it("resend for a parcel coming back that can still be resent", () => {
        expect(primeBandAction(view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER" }), "in_transit")).toBe("resend");
    });

    it("the journey once a resend is waiting on Prime, or when the order is closed", () => {
        const back = view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER", statusChangedAt: "2026-11-03T13:00:00Z", resentAt: "2026-11-03T14:00:00Z" });
        expect(primeBandAction(back, "in_transit")).toBe("journey");
        expect(primeBandAction(view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER" }), "returned")).toBe("journey");
    });

    it("remind for a postponed parcel, the journey otherwise", () => {
        expect(primeBandAction(view({ status: "POSTPONED", stepCode: "POSTPONED" }), "in_transit")).toBe("remind");
        expect(primeBandAction(view(), "in_transit")).toBe("journey");
    });
});

describe("primeLastChecked", () => {
    it("the newest read across the parcels", () => {
        const newest = primeLastChecked([view({ checkedAt: "2026-11-03T14:05:00Z" }), view({ checkedAt: "2026-11-03T14:10:00Z" }), view({ checkedAt: null })]);
        expect(newest).toBe(Date.parse("2026-11-03T14:10:00Z"));
    });

    it("null before Prime was read", () => {
        expect(primeLastChecked([view({ checkedAt: null })])).toBeNull();
        expect(primeLastChecked([])).toBeNull();
    });
});

describe("primeHistoryTime", () => {
    it("reads Prime's Baghdad wall clock as UTC+3", () => {
        expect(primeHistoryTime("2026-11-04 00:02:24")).toBe("2026-11-03T21:02:24.000Z");
        expect(primeHistoryTime("2026-11-04T09:15")).toBe("2026-11-04T06:15:00.000Z");
    });

    it("reads the ticket form: unpadded date, 12-hour clock", () => {
        expect(primeHistoryTime("2026-1-14 10:22:31 AM")).toBe("2026-01-14T07:22:31.000Z");
        expect(primeHistoryTime("2026-1-14 12:05:00 AM")).toBe("2026-01-13T21:05:00.000Z");
        expect(primeHistoryTime("2026-1-14 12:05:00 PM")).toBe("2026-01-14T09:05:00.000Z");
        expect(primeHistoryTime("2026-1-14 1:05:00 pm")).toBe("2026-01-14T10:05:00.000Z");
        expect(primeHistoryTime("2026-1-14 13:05:00 PM")).toBeNull();
    });

    it("null for anything else", () => {
        expect(primeHistoryTime("")).toBeNull();
        expect(primeHistoryTime("yesterday")).toBeNull();
    });
});

describe("primeReasonNote", () => {
    it("gives Prime's reason for a parcel coming back", () => {
        expect(primeReasonNote(view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER", returnReason: "الزبون لا يرد" }))).toEqual({ reason: "الزبون لا يرد", until: null });
    });

    it("gives the reason and the day for a postponed parcel", () => {
        expect(primeReasonNote(view({ status: "POSTPONED", postponeReason: "مسافر", postponedTo: "2026-11-06T00:00:00" }))).toEqual({ reason: "مسافر", until: "2026-11-06" });
        expect(primeReasonNote(view({ status: "POSTPONED", postponedTo: "الخميس" }))).toEqual({ reason: null, until: "الخميس" });
    });

    it("turns Prime's reason codes into the words Prime's app shows", () => {
        expect(primeReasonNote(view({ status: "CNCL", stepCode: "RTN_WITHAGENT", returnReason: "WILL_RCV_LATERFROMSNDR" }))?.reason).toBe("سيستلم الطلب لاحقًا");
        expect(primeReasonNote(view({ status: "POSTPONED", postponeReason: "CLS", postponedTo: "2026-11-06 22:55:00" }))).toEqual({ reason: "الهاتف مغلق", until: "2026-11-06" });
    });

    it("says nothing for a parcel on its way, or when Prime gave no reason", () => {
        expect(primeReasonNote(view({ returnReason: "قديم" }))).toBeNull();
        expect(primeReasonNote(view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER" }))).toBeNull();
    });
});
