import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order } from "@/types/order";
import { useFinanceCustomers, type CustomerAggregate } from "./use-finance-customers";

const range = { start: new Date("2026-09-30T21:00:00.000Z"), end: new Date("2026-10-31T20:59:59.999Z") };

const order = (over: Partial<Order> & { id: string; phone: string }): Order =>
    ({ order_id: over.id, status: "delivered", price: 10000, items: [], created_at: "2026-10-10T10:00:00.000Z", ...over }) as Order;

const aggregate = (over: Partial<CustomerAggregate> & { customer_phone: string }): CustomerAggregate => ({
    latest_name: "—", latest_city: null, total_orders: 1, total_spent: 0,
    first_order_date: "2026-10-10T10:00:00.000Z", last_order_date: "2026-10-10T10:00:00.000Z",
    cancelled_count: 0, rejected_count: 0, ...over,
});

const run = (orders: Order[], aggregates: CustomerAggregate[] = [], granularity: "day" | "week" | "month" = "month") =>
    renderHook(() => useFinanceCustomers(orders, aggregates, range, granularity)).result.current;

describe("useFinanceCustomers", () => {
    it("splits new from returning customers and their revenue", () => {
        const r = run(
            [
                order({ id: "again", phone: "0750", price: 20000 }),
                order({ id: "fresh", phone: "0771", price: 5000 }),
            ],
            [
                aggregate({ customer_phone: "750", total_orders: 2, total_spent: 30000, first_order_date: "2026-08-01T10:00:00.000Z" }),
                aggregate({ customer_phone: "771", total_spent: 5000 }),
            ],
        );
        expect(r.summary.total_customers).toBe(2);
        expect(r.summary.new_customers).toBe(1);
        expect(r.summary.returning_customers).toBe(1);
        expect(r.summary.new_revenue).toBe(5000);
        expect(r.summary.returning_revenue).toBe(20000);
        expect(r.summary.new_revenue_share_pct).toBeCloseTo(20);
    });

    it("does not count refund rows as orders or revenue", () => {
        const r = run(
            [
                order({ id: "sale", phone: "0750", price: 10000 }),
                order({ id: "refund", phone: "0750", price: -10000, status: "refund_delivered", is_return: true }),
            ],
            [aggregate({ customer_phone: "750", total_orders: 1, total_spent: 0 })],
        );
        expect(r.summary.returning_revenue + r.summary.new_revenue).toBe(10000);
        expect(r.summary.total_customers).toBe(1);
    });

    it("takes lifetime spend and first order from the customer aggregates, not the period window", () => {
        // One order in the period; the customer's other 4 orders (200K) are months old and outside it.
        const r = run(
            [order({ id: "recent", phone: "0750", price: 10000 })],
            [aggregate({ customer_phone: "750", latest_name: "Ahmed", total_orders: 5, total_spent: 210000, first_order_date: "2026-03-01T10:00:00.000Z" })],
        );
        expect(r.summary.new_customers).toBe(0);
        expect(r.summary.returning_customers).toBe(1);
        expect(r.summary.avg_ltv).toBe(210000);
        expect(r.topSpenders[0]).toMatchObject({ name: "Ahmed", orders_count: 5, revenue: 210000 });
    });

    it("lists a high-value customer who is not in the period window as dormant", () => {
        const r = run(
            [order({ id: "x", phone: "0771", price: 1000 })],
            [
                aggregate({ customer_phone: "771", total_spent: 1000 }),
                aggregate({ customer_phone: "750", latest_name: "Lapsed", total_orders: 3, total_spent: 900000, first_order_date: "2026-01-01T10:00:00.000Z", last_order_date: "2026-07-01T10:00:00.000Z" }),
            ],
        );
        expect(r.dormantHighValue.map((c) => c.name)).toContain("Lapsed");
    });

    it("matches an order stored as +964 to its aggregate row on the normalized phone", () => {
        const r = run(
            [order({ id: "intl", phone: "+964 750 123 4567", price: 8000 })],
            [aggregate({ customer_phone: "7501234567", total_orders: 3, total_spent: 50000, first_order_date: "2026-05-01T10:00:00.000Z" })],
        );
        expect(r.summary.returning_customers).toBe(1);
        expect(r.summary.new_customers).toBe(0);
    });

    it("treats a customer missing from a stale aggregate as new, from the period orders", () => {
        const r = run([order({ id: "today", phone: "0799", price: 7000 })], []);
        expect(r.summary.new_customers).toBe(1);
        expect(r.summary.new_revenue).toBe(7000);
    });

    it("files an order placed just after Baghdad midnight in the new day's bucket", () => {
        // 00:30 Baghdad on 11 Oct = 21:30 UTC on 10 Oct.
        const r = run([order({ id: "late", phone: "0750", created_at: "2026-10-10T21:30:00.000Z" })], [], "day");
        expect(r.acquisitionMix).toHaveLength(31);
        expect(r.acquisitionMix.find((b) => b.bucket === "2026-10-11")?.new_orders).toBe(1);
        expect(r.acquisitionMix.find((b) => b.bucket === "2026-10-10")?.new_orders).toBe(0);
    });
});
