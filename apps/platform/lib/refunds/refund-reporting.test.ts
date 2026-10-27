import { describe, it, expect } from "vitest";
import { isRefundRow, refundPaidAt, reportDate } from "./refund-reporting";

const created = "2026-10-01T10:00:00Z";
const paid = "2026-10-09T15:00:00Z";

describe("reportDate", () => {
    it("files a sale on the day it was placed", () => {
        expect(reportDate({ is_return: false, status: "delivered", created_at: created, updated_at: paid }))
            .toEqual(new Date(created));
    });

    it("files a refund on the day the customer was paid", () => {
        expect(reportDate({ is_return: true, status: "refund_delivered", created_at: created, updated_at: paid }))
            .toEqual(new Date(paid));
    });

    it("files open and failed refunds nowhere", () => {
        for (const status of ["return_pending", "in_transit", "refund_failed", "rejected"] as const) {
            expect(reportDate({ is_return: true, status, created_at: created, updated_at: paid })).toBeNull();
        }
    });
});

describe("isRefundRow / refundPaidAt", () => {
    it("treats a refund_delivered row as refunded money even without the refund flag", () => {
        const row = { is_return: false, status: "refund_delivered" as const, created_at: created, updated_at: paid };
        expect(isRefundRow(row)).toBe(true);
        expect(refundPaidAt(row)).toEqual(new Date(paid));
    });
});
