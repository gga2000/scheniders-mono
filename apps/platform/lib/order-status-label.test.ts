import { describe, it, expect } from "vitest";
import { getStatusLabel } from "./utils";
import { translations } from "./i18n";
import {
    ORDER_STATUSES,
    ORDER_STATUS_LABELS,
    getOrderStatusLabel,
} from "./order-status-labels";

/**
 * Guards ARCH-4: the status label table used to exist three times —
 * `getStatusLabel` in lib/utils, and the `orders.status.*` keys in lib/i18n once
 * camelCased and once snake_cased. They had drifted: two statuses were missing
 * from `getStatusLabel` entirely, so live orders rendered a raw snake_case
 * status in an otherwise-Arabic UI, and four others were worded differently on
 * an order card than on the filter chip above it.
 *
 * There is now one table, and the i18n keys are generated from it. These tests
 * pin that they cannot come apart again.
 */
const LOCALES = ["en", "ar"] as const;

const camelCase = (status: string) => status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

describe("order status labels", () => {
    it("has a non-empty label for every status in every locale", () => {
        for (const locale of LOCALES) {
            for (const status of ORDER_STATUSES) {
                const label = ORDER_STATUS_LABELS[locale][status];
                // A missing entry would fall through to the raw status string.
                expect(label, `${locale}/${status} has no label`).not.toBe(status);
                expect(label.length).toBeGreaterThan(0);
            }
        }
    });

    it("resolves the i18n keys to the same string as getOrderStatusLabel", () => {
        for (const locale of LOCALES) {
            for (const status of ORDER_STATUSES) {
                const expected = getOrderStatusLabel(status, locale);
                expect(translations[locale][`orders.status.${status}`], `${locale}/${status}`).toBe(expected);
                expect(translations[locale][`orders.status.${camelCase(status)}`], `${locale}/${status} camel`).toBe(expected);
            }
        }
    });

    it("labels the refund statuses that were missing", () => {
        // 74 live orders sat in refund_delivered with no label at all.
        expect(getStatusLabel("refund_delivered")).toBe("تم الاسترجاع");
        expect(getStatusLabel("refund_failed")).toBe("فشل الاسترجاع");
    });

    it("reads a refund order's statuses as a refund", () => {
        expect(getStatusLabel("in_transit", true)).toBe("مع المندوب");
        expect(getStatusLabel("in_transit", false)).toBe("قيد التوصيل");
        expect(getOrderStatusLabel("in_transit", "en", true)).toBe("Courier collecting");
        expect(getOrderStatusLabel("return_pending", "en", true)).toBe("Pickup pending");
        expect(getOrderStatusLabel("refund_delivered", "en", true)).toBe("Refunded to customer");
        // Older refund orders the courier could not complete were marked rejected.
        expect(getOrderStatusLabel("rejected", "en", true)).toBe("Refund failed");
        expect(getOrderStatusLabel("rejected", "en", false)).toBe("Rejected");
        // Statuses a refund order never takes keep their normal label.
        expect(getOrderStatusLabel("new", "en", true)).toBe("New");
    });

    it("returns the requested locale rather than always Arabic", () => {
        expect(getStatusLabel("delivered", false, "en")).toBe("Delivered");
        expect(getStatusLabel("delivered", false, "ar")).toBe("تم التوصيل");
        // The default stays Arabic so the non-component call sites are unchanged.
        expect(getStatusLabel("delivered")).toBe("تم التوصيل");
    });

    it("falls back to the raw value for an unknown status", () => {
        // Never to another status: an earlier version of the colour lookup
        // defaulted to "new", which silently mislabelled cancelled orders.
        expect(getStatusLabel("not_a_status")).toBe("not_a_status");
        expect(getOrderStatusLabel("not_a_status", "en")).toBe("not_a_status");
    });
});
