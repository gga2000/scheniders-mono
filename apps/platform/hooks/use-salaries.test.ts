import { describe, it, expect } from "vitest";
import { isCompletedInPeriod, keptShare, periodBaseSalary } from "./use-salaries";

/**
 * Payroll buckets completed orders by `completed_at` (when the order was MARKED
 * completed), not by `created_at` (when it was placed). These tests lock in that
 * behaviour — the regression that silently dropped late-completed orders from
 * payroll was caused by bucketing on the order's creation date instead.
 */
describe("isCompletedInPeriod", () => {
    const periodStart = "2026-06-20";
    const periodEnd = "2026-06-30";

    it("counts an order completed inside the period", () => {
        expect(isCompletedInPeriod("2026-06-25T10:00:00Z", periodStart, periodEnd)).toBe(true);
    });

    it("THE BUG: counts an order placed BEFORE the period but completed inside it", () => {
        // Placed Jun 5 (before the window), money arrived late, marked completed Jun 25.
        // It belongs to the period it completed in — created date is irrelevant here
        // because the predicate only sees completed_at.
        expect(isCompletedInPeriod("2026-06-25T08:30:00Z", periodStart, periodEnd)).toBe(true);
    });

    it("excludes an order completed after the period ends", () => {
        expect(isCompletedInPeriod("2026-07-01T00:00:00Z", periodStart, periodEnd)).toBe(false);
    });

    it("excludes an order completed before the period starts", () => {
        expect(isCompletedInPeriod("2026-06-19T20:00:00Z", periodStart, periodEnd)).toBe(false);
    });

    it("excludes an order with no completion timestamp (historical import)", () => {
        expect(isCompletedInPeriod(null, periodStart, periodEnd)).toBe(false);
    });

    it("uses Baghdad days (UTC+3): the period runs 21:00Z the day before to 20:59:59Z", () => {
        // 00:00 and 23:59:59 Baghdad on the first and last day are inside the period.
        expect(isCompletedInPeriod("2026-06-19T21:00:00Z", periodStart, periodEnd)).toBe(true);
        expect(isCompletedInPeriod("2026-06-30T20:59:59Z", periodStart, periodEnd)).toBe(true);
        // One second either side belongs to the neighbouring period.
        expect(isCompletedInPeriod("2026-06-19T20:59:59Z", periodStart, periodEnd)).toBe(false);
        expect(isCompletedInPeriod("2026-06-30T21:00:00Z", periodStart, periodEnd)).toBe(false);
    });

    it("pays an order completed 01:00 Baghdad on the first day in that period (UTC day is the day before)", () => {
        expect(isCompletedInPeriod("2026-06-19T22:00:00Z", periodStart, periodEnd)).toBe(true);
    });

    it("accepts timestamps with an explicit offset", () => {
        expect(isCompletedInPeriod("2026-06-20T00:30:00+03:00", periodStart, periodEnd)).toBe(true);
        expect(isCompletedInPeriod("2026-06-19T23:30:00+03:00", periodStart, periodEnd)).toBe(false);
    });
});

describe("keptShare (commission on a partly refunded order)", () => {
    it("pays a whole order in full", () => {
        expect(keptShare({ refund_status: "none", refunded_amount: 0, price: 36750 })).toBe(1);
    });

    it("pays the share the customer kept when part was refunded", () => {
        // One of two 18,375 items refunded: half the order stays a sale.
        expect(keptShare({ refund_status: "partial", refunded_amount: 18375, price: 36750 })).toBe(0.5);
    });

    it("never goes below zero or above one", () => {
        expect(keptShare({ refund_status: "partial", refunded_amount: 50000, price: 36750 })).toBe(0);
        expect(keptShare({ refund_status: "partial", refunded_amount: null, price: 36750 })).toBe(1);
        expect(keptShare({ refund_status: "partial", refunded_amount: 100, price: 0 })).toBe(0);
    });
});

describe("periodBaseSalary (board P1: base follows the days paid)", () => {
    // November 2026 has 25 working days (Sundays off), October 2026 has 27.
    it("pays exactly one monthly salary for a whole month, whatever its working days", () => {
        expect(periodBaseSalary(600_000, "2026-11-01", "2026-11-30")).toBe(600_000);
        expect(periodBaseSalary(600_000, "2026-10-01", "2026-10-31")).toBe(600_000);
    });

    it("two half-month pays add up to one month", () => {
        const first = periodBaseSalary(600_000, "2026-11-01", "2026-11-15");
        const second = periodBaseSalary(600_000, "2026-11-16", "2026-11-30");
        expect(first).toBe(288_000); // 12 of 25 working days
        expect(second).toBe(312_000); // 13 of 25
        expect(first + second).toBe(600_000);
    });

    it("a period across two months takes each month's share", () => {
        // 16-31 Oct: 14 of 27 working days; 1-15 Nov: 12 of 25.
        expect(periodBaseSalary(540_000, "2026-10-16", "2026-11-15")).toBe(Math.round(540_000 * 14 / 27 + 540_000 * 12 / 25));
    });

    it("pays nothing for no salary or an empty period", () => {
        expect(periodBaseSalary(0, "2026-11-01", "2026-11-30")).toBe(0);
        expect(periodBaseSalary(600_000, "2026-11-10", "2026-11-09")).toBe(0);
    });
});
