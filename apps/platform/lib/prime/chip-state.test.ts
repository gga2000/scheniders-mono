import { describe, expect, it } from "vitest";
import { primeChipState, primeSkipReason, type PrimeShipmentView } from "./chip-state";

const view = (over: Partial<PrimeShipmentView> = {}): PrimeShipmentView => ({
    caseId: 52176693,
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
    ...over,
});

describe("primeChipState", () => {
    it("on its way: blue, Prime's own step name, no button", () => {
        expect(primeChipState(view(), "in_transit")).toEqual({
            tone: "progress", stepName: "جاهز للبيك اب", deleted: false, pending: false, canResend: false, resendRequested: false,
        });
    });

    it("falls back to Prime's status code when the step name is unknown", () => {
        expect(primeChipState(view({ stepName: null }), "in_transit").stepName).toBe("ONWAY");
    });

    it("shows a queued edit as pending", () => {
        expect(primeChipState(view({ pending: true }), "in_transit").pending).toBe(true);
    });

    it("a refused edit or a refused cancel is red", () => {
        expect(primeChipState(view({ pushError: "x" }), "in_transit").tone).toBe("problem");
        expect(primeChipState(view({ cancelRefusedAt: "2026-11-03T15:00:00Z" }), "cancelled").tone).toBe("problem");
    });

    it("coming back: amber with the resend button while the order is still out", () => {
        const back = view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER", stepName: "تعذر التوصيل" });
        expect(primeChipState(back, "in_transit")).toMatchObject({ tone: "warn", canResend: true, resendRequested: false });
        // Scanned back in by the returns desk: the parcel is with the store.
        expect(primeChipState(back, "rejected").canResend).toBe(false);
    });

    it("after a resend, a note replaces the button until Prime moves the parcel", () => {
        const resent = view({ status: "FAILED_DELIVER_RETURNED_TO_SENDER", resentAt: "2026-11-03T16:40:00Z", statusChangedAt: "2026-11-03T12:00:00Z" });
        expect(primeChipState(resent, "in_transit")).toMatchObject({ canResend: false, resendRequested: true });
        // Prime moved it since and it came back again: the button returns.
        const backAgain = { ...resent, statusChangedAt: "2026-11-04T09:00:00Z" };
        expect(primeChipState(backAgain, "in_transit")).toMatchObject({ canResend: true, resendRequested: false });
    });

    it("deleted at Prime: grey, our own label, nothing pending", () => {
        expect(primeChipState(view({ cancelledAt: "2026-11-03T15:00:00Z", pending: true }), "cancelled")).toMatchObject({
            tone: "muted", stepName: null, deleted: true, pending: false, canResend: false,
        });
    });
});

describe("primeSkipReason", () => {
    it("reads our own reason, and leaves Prime's words alone", () => {
        expect(primeSkipReason("skip:bad_phone")).toBe("bad_phone");
        expect(primeSkipReason("حالة الشحنة لا تسمح بالتعديل")).toBeNull();
        expect(primeSkipReason(null)).toBeNull();
    });
});
