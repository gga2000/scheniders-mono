import { describe, it, expect } from "vitest";
import { getStatusLabel } from "./utils";

/**
 * Guards ARCH-4: `getStatusLabel` is a hardcoded parallel of the
 * `orders.status.*` keys in lib/i18n.ts, and had drifted from them. Two statuses
 * were missing entirely, so live orders rendered a raw snake_case status in an
 * otherwise-Arabic UI.
 */
const EVERY_STATUS = [
    "new",
    "contacted",
    "confirmed",
    "cancelled",
    "in_transit",
    "delivered",
    "rejected",
    "completed",
    "no_response",
    "return_pending",
    "refund_delivered",
    "refund_failed",
    "pending_checkout",
    "suspended",
] as const;

describe("getStatusLabel", () => {
    it("has a translated label for every order status", () => {
        for (const status of EVERY_STATUS) {
            const label = getStatusLabel(status);
            // A missing entry falls through to the raw status string.
            expect(label, `${status} has no label`).not.toBe(status);
            expect(label.length).toBeGreaterThan(0);
        }
    });

    it("labels the refund statuses that were missing", () => {
        // 74 live orders sat in refund_delivered with no label.
        expect(getStatusLabel("refund_delivered")).toBe("تم الاسترجاع");
        expect(getStatusLabel("refund_failed")).toBe("فشل الاسترجاع");
    });

    it("keeps the return-specific wording for a return in transit", () => {
        expect(getStatusLabel("in_transit", true)).toBe("استرجاع قيد التوصيل");
        expect(getStatusLabel("in_transit", false)).toBe("قيد التوصيل");
    });

    it("falls back to the raw value for an unknown status", () => {
        expect(getStatusLabel("not_a_status")).toBe("not_a_status");
    });
});
