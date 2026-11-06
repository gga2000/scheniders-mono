import { describe, expect, it } from "vitest";
import {
    primeFailedNoticeDue,
    primeFailedNoticeOpen,
    primeFailedNoticeSetting,
    primeFailedStatus,
    type PrimeFailedCandidate,
} from "./failed-notice";

const NOW = Date.parse("2026-11-05T12:00:00Z"); // 15:00 Baghdad

const row = (over: Partial<PrimeFailedCandidate> = {}): PrimeFailedCandidate => ({
    id: "s1",
    step_code: "RTN_WITHAGENT",
    status_changed_at: "2026-11-05T10:00:00Z",
    problem_checked_at: null,
    cancelled_at: null,
    failed_notice_sent_at: null,
    order: { status: "in_transit" },
    ...over,
});

describe("primeFailedNoticeOpen", () => {
    it("sends from 10:00 until before 20:00 Baghdad", () => {
        expect(primeFailedNoticeOpen(Date.parse("2026-11-05T06:59:00Z"))).toBe(false);
        expect(primeFailedNoticeOpen(Date.parse("2026-11-05T07:00:00Z"))).toBe(true);
        expect(primeFailedNoticeOpen(Date.parse("2026-11-05T16:59:00Z"))).toBe(true);
        expect(primeFailedNoticeOpen(Date.parse("2026-11-05T17:00:00Z"))).toBe(false);
    });
});

describe("primeFailedNoticeDue", () => {
    it("messages a fresh failure nobody handled", () => {
        expect(primeFailedNoticeDue(row(), NOW)).toBe(true);
        expect(primeFailedNoticeDue(row({ step_code: "DLV_AGENT_REJECT", order: { status: "confirmed" } }), NOW)).toBe(true);
    });

    it("never messages twice, a cancelled parcel, or another step", () => {
        expect(primeFailedNoticeDue(row({ failed_notice_sent_at: "2026-11-05T10:05:00Z" }), NOW)).toBe(false);
        expect(primeFailedNoticeDue(row({ cancelled_at: "2026-11-05T10:05:00Z" }), NOW)).toBe(false);
        expect(primeFailedNoticeDue(row({ step_code: "ONWAY" }), NOW)).toBe(false);
        expect(primeFailedNoticeDue(row({ step_code: "PICKUP_REJECT" }), NOW)).toBe(false);
    });

    it("leaves a failure the team handled, an old one, or a closed order", () => {
        expect(primeFailedNoticeDue(row({ problem_checked_at: "2026-11-05T10:30:00Z" }), NOW)).toBe(false);
        expect(primeFailedNoticeDue(row({ problem_checked_at: "2026-11-05T09:00:00Z" }), NOW)).toBe(true);
        expect(primeFailedNoticeDue(row({ status_changed_at: "2026-11-04T11:00:00Z" }), NOW)).toBe(false);
        expect(primeFailedNoticeDue(row({ order: { status: "rejected" } }), NOW)).toBe(false);
    });
});

describe("message values", () => {
    it("uses the driver's report, else says it could not be delivered", () => {
        expect(primeFailedStatus({ return_reason: " المستلم حاظر المندوب ", postpone_reason: null })).toBe("المستلم حاظر المندوب");
        expect(primeFailedStatus({ return_reason: null, postpone_reason: "الهاتف مغلق" })).toBe("الهاتف مغلق");
        expect(primeFailedStatus({ return_reason: "", postpone_reason: null })).toBe("تعذر التوصيل");
    });

    it("is off unless switched on", () => {
        expect(primeFailedNoticeSetting(null).enabled).toBe(false);
        expect(primeFailedNoticeSetting({ enabled: "yes" }).enabled).toBe(false);
        expect(primeFailedNoticeSetting({ enabled: true }).enabled).toBe(true);
    });
});
