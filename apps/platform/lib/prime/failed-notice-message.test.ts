import { describe, expect, it } from "vitest";
import { primeFailedNoticePreview, primeFailedNoticeSendable, type PrimeFailedNoticeTarget } from "./failed-notice-message";

const row = (over: Partial<PrimeFailedNoticeTarget> = {}): PrimeFailedNoticeTarget => ({
    step_code: "RTN_WITHAGENT",
    status_changed_at: "2026-11-05T10:00:00Z",
    problem_checked_at: null,
    cancelled_at: null,
    failed_notice_sent_at: null,
    order: { status: "in_transit" },
    ...over,
});

describe("primeFailedNoticeSendable (hand send)", () => {
    it("allows an open failed attempt, however old", () => {
        expect(primeFailedNoticeSendable(row())).toBe(true);
        expect(primeFailedNoticeSendable(row({ status_changed_at: "2026-10-01T10:00:00Z" }))).toBe(true);
        expect(primeFailedNoticeSendable(row({ step_code: "DLV_AGENT_REJECT", order: { status: "confirmed" } }))).toBe(true);
    });

    it("never sends twice, nor to a handled, cancelled, closed or moving parcel", () => {
        expect(primeFailedNoticeSendable(row({ failed_notice_sent_at: "2026-11-05T10:05:00Z" }))).toBe(false);
        expect(primeFailedNoticeSendable(row({ problem_checked_at: "2026-11-05T10:30:00Z" }))).toBe(false);
        expect(primeFailedNoticeSendable(row({ problem_checked_at: "2026-11-05T09:00:00Z" }))).toBe(true);
        expect(primeFailedNoticeSendable(row({ cancelled_at: "2026-11-05T10:05:00Z" }))).toBe(false);
        expect(primeFailedNoticeSendable(row({ order: { status: "completed" } }))).toBe(false);
        expect(primeFailedNoticeSendable(row({ step_code: "ONWAY" }))).toBe(false);
    });
});

describe("primeFailedNoticePreview", () => {
    it("fills the order number and the status into the template's first line", () => {
        expect(primeFailedNoticePreview("4261105041", "رفض الطلب")[0]).toBe("نود إبلاغك بأن طلبك رقم 4261105041 حالته: رفض الطلب.");
    });
});
