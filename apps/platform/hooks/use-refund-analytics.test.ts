import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order } from "@/types/order";
import { UNSPECIFIED_REASON, useRefundAnalytics } from "./use-refund-analytics";

// October 2026 in Baghdad (UTC+3): 1 Oct 00:00 .. 31 Oct 23:59:59.
const period = { start: new Date("2026-09-30T21:00:00.000Z"), end: new Date("2026-10-31T20:59:59.999Z") };

const refund = (over: Partial<Order> & { id: string }): Order =>
    ({
        order_id: over.id,
        status: "refund_delivered",
        is_return: true,
        price: -10000,
        items: [{ name: "Shirt", quantity: 1, price: 10000 }],
        created_at: "2026-10-05T10:00:00.000Z",
        updated_at: "2026-10-10T10:00:00.000Z",
        ...over,
    }) as Order;

const run = (orders: Order[]) => renderHook(() => useRefundAnalytics(orders, period, null)).result.current;

describe("useRefundAnalytics", () => {
    it("counts only paid refunds in totals and keeps open ones out of the breakdowns", () => {
        const r = run([
            refund({ id: "paid", rejection_reason: "Damaged" }),
            refund({ id: "open", status: "return_pending", price: -7000, rejection_reason: "Wrong size" }),
            refund({ id: "failed", status: "refund_failed", price: -3000, rejection_reason: "Wrong size" }),
        ]);
        expect(r.totalValue).toBe(10000);
        expect(r.totalCount).toBe(1);
        expect(r.pendingReturns).toBe(1);
        expect(r.pendingReturnsValue).toBe(7000);
        expect(r.failedReturns).toBe(1);
        // Shares must add up to the paid total.
        expect(r.reasons).toEqual([{ reason: "Damaged", count: 1, value: 10000 }]);
        expect(r.products).toEqual([{ name: "Shirt", units: 1, value: 10000, orders: 1 }]);
        // The table still lists every refund row.
        expect(r.orders).toHaveLength(3);
    });

    it("files a refund on the Baghdad day it was paid and spans every day of the period", () => {
        // 00:30 Baghdad on 11 Oct = 21:30 UTC on 10 Oct.
        const r = run([refund({ id: "late", updated_at: "2026-10-10T21:30:00.000Z" })]);
        expect(r.daily).toHaveLength(31);
        expect(r.daily[0].date).toBe("2026-10-01");
        expect(r.daily.at(-1)?.date).toBe("2026-10-31");
        expect(r.daily.find((d) => d.date === "2026-10-11")?.value).toBe(10000);
        expect(r.daily.find((d) => d.date === "2026-10-10")?.value).toBe(0);
    });

    it("marks refunds with no reason as unspecified for the UI to word", () => {
        const r = run([refund({ id: "x", rejection_reason: undefined, notes: "" })]);
        expect(r.reasons[0].reason).toBe(UNSPECIFIED_REASON);
    });

    it("ignores refunds paid outside the period", () => {
        const r = run([refund({ id: "old", updated_at: "2026-09-20T10:00:00.000Z" })]);
        expect(r.totalCount).toBe(0);
        expect(r.orders).toEqual([]);
    });
});
