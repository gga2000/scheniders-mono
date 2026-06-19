import { describe, it, expect } from "vitest";
import { isCompletedInPeriod } from "./use-salaries";

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
        expect(isCompletedInPeriod("2026-06-19T23:00:00Z", periodStart, periodEnd)).toBe(false);
    });

    it("excludes an order with no completion timestamp (historical import)", () => {
        expect(isCompletedInPeriod(null, periodStart, periodEnd)).toBe(false);
    });

    it("includes the inclusive day boundaries (start 00:00:00 / end 23:59:59 UTC)", () => {
        expect(isCompletedInPeriod("2026-06-20T00:00:00Z", periodStart, periodEnd)).toBe(true);
        expect(isCompletedInPeriod("2026-06-30T23:59:59Z", periodStart, periodEnd)).toBe(true);
    });
});
