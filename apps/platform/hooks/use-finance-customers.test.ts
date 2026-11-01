import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order } from "@/types/order";
import { useFinanceCustomers } from "./use-finance-customers";

const range = { start: new Date("2026-09-30T21:00:00.000Z"), end: new Date("2026-10-31T20:59:59.999Z") };

const order = (over: Partial<Order> & { id: string; phone: string }): Order =>
    ({ order_id: over.id, status: "delivered", price: 10000, items: [], created_at: "2026-10-10T10:00:00.000Z", ...over }) as Order;

const run = (orders: Order[], granularity: "day" | "week" | "month" = "month") =>
    renderHook(() => useFinanceCustomers(orders, range, granularity)).result.current;

describe("useFinanceCustomers", () => {
    it("splits new from returning customers and their revenue", () => {
        const r = run([
            order({ id: "old", phone: "0750", created_at: "2026-08-01T10:00:00.000Z" }),
            order({ id: "again", phone: "0750", price: 20000 }),
            order({ id: "fresh", phone: "0771", price: 5000 }),
        ]);
        expect(r.summary.total_customers).toBe(2);
        expect(r.summary.new_customers).toBe(1);
        expect(r.summary.returning_customers).toBe(1);
        expect(r.summary.new_revenue).toBe(5000);
        expect(r.summary.returning_revenue).toBe(20000);
        expect(r.summary.new_revenue_share_pct).toBeCloseTo(20);
    });

    it("does not count refund rows as orders or revenue", () => {
        const r = run([
            order({ id: "sale", phone: "0750", price: 10000 }),
            order({ id: "refund", phone: "0750", price: -10000, status: "refund_delivered", is_return: true }),
        ]);
        const c = r.topSpenders[0];
        expect(c.orders_count).toBe(1);
        expect(c.revenue).toBe(10000);
        expect(c.rejection_count).toBe(0);
    });

    it("files an order placed just after Baghdad midnight in the new day's bucket", () => {
        // 00:30 Baghdad on 11 Oct = 21:30 UTC on 10 Oct.
        const r = run([order({ id: "late", phone: "0750", created_at: "2026-10-10T21:30:00.000Z" })], "day");
        expect(r.acquisitionMix).toHaveLength(31);
        expect(r.acquisitionMix.find((b) => b.bucket === "2026-10-11")?.new_orders).toBe(1);
        expect(r.acquisitionMix.find((b) => b.bucket === "2026-10-10")?.new_orders).toBe(0);
    });
});
