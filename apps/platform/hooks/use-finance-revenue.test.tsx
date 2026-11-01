import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order, Product } from "@/lib/supabase";
import { useFinanceRevenue } from "./use-finance-revenue";

const order = (over: Partial<Order>): Order =>
    ({ id: "o", order_id: "SCH-1", status: "completed", price: 0, items: [], source: "meta", created_at: "2026-10-10T09:00:00.000Z", updated_at: "2026-10-10T09:00:00.000Z", delivered_at: "2026-10-12T09:00:00.000Z", ...over }) as Order;

const current = { start: new Date("2026-10-01T00:00:00.000Z"), end: new Date("2026-10-31T20:59:59.000Z") };
const previous = { start: new Date("2026-09-01T00:00:00.000Z"), end: new Date("2026-09-30T20:59:59.000Z") };
const products = [{ id: "p1", name: "Shirt", cost: 4000 }] as Product[];
const item = (price = 10000) => ({ name: "Shirt", product_id: "p1", quantity: 1, price });

const run = (orders: Order[], prev = previous) =>
    renderHook(() => useFinanceRevenue(orders, products, current, prev, "day")).result.current;

describe("useFinanceRevenue decomposition", () => {
    it("splits the revenue change into volume + price + mix with nothing left over", () => {
        const orders = [
            order({ id: "c1", price: 12000 }),
            order({ id: "c2", price: 12000 }),
            order({ id: "c3", price: 12000 }),
            order({ id: "p1", price: 10000, created_at: "2026-09-10T09:00:00.000Z" }),
            order({ id: "p2", price: 10000, created_at: "2026-09-11T09:00:00.000Z" }),
        ];
        const { decomposition: d } = run(orders);
        expect(d.revCurr).toBe(36000);
        expect(d.revPrev).toBe(20000);
        expect(d.ordersCurr).toBe(3);
        expect(d.ordersPrev).toBe(2);
        expect(d.volumeEffect + d.priceEffect + d.mixResidual).toBeCloseTo(d.deltaRev);
    });

    it("counts only real sales: cancelled, rejected and refund rows are not revenue", () => {
        const orders = [
            order({ id: "ok", price: 10000 }),
            order({ id: "x1", status: "cancelled", price: 9999 }),
            order({ id: "x2", status: "rejected", price: 9999 }),
            order({ id: "r", status: "refund_delivered", is_return: true, price: -2000 }),
        ];
        const { decomposition: d } = run(orders);
        expect(d.revCurr).toBe(10000);
        expect(d.ordersCurr).toBe(1);
    });
});

describe("useFinanceRevenue channels", () => {
    it("profit is delivered revenue minus product cost: delivery fees are not a cost (courier bills are expenses)", () => {
        const orders = [
            order({ id: "a", price: 10000, delivery_fee: 5000, items: [item()] }),
            order({ id: "b", status: "in_transit", price: 8000, delivery_fee: 5000, items: [item(8000)] }),
        ];
        const [meta] = run(orders).channels;
        expect(meta.revenue).toBe(18000);
        expect(meta.orders).toBe(2);
        expect(meta.product_cost).toBe(4000);
        expect(meta.gross_profit).toBe(6000);
        expect(meta.margin_pct).toBeCloseTo(60);
    });

    it("ignores delivered return rows and sums channels to the Overview gross profit", () => {
        const orders = [
            order({ id: "a", price: 10000, items: [item()], source: "meta" }),
            order({ id: "b", price: 10000, items: [item()], source: "whatsapp" }),
            order({ id: "ret", status: "delivered", is_return: true, price: -10000, items: [item()], source: "meta" }),
        ];
        const { channels } = run(orders);
        expect(channels.reduce((s, c) => s + c.gross_profit, 0)).toBe(12000);
    });
});

describe("useFinanceRevenue refunds", () => {
    it("reports refund size as a positive amount on the day it was paid, with the rate against sales", () => {
        const orders = [
            order({ id: "s1", price: 10000 }),
            order({ id: "s2", price: 10000 }),
            order({ id: "s3", price: 10000 }),
            order({ id: "refund", status: "refund_delivered", is_return: true, price: -2500, items: [item(2500)], updated_at: "2026-10-14T21:30:00.000Z" }),
        ];
        const { refunds } = run(orders);
        expect(refunds.refund_value).toBe(2500);
        expect(refunds.refund_count).toBe(1);
        expect(refunds.refund_rate_pct).toBeCloseTo(25);
        // 21:30 UTC on 14 Oct is 00:30 Baghdad on 15 Oct.
        expect(refunds.daily).toEqual([{ date: "2026-10-15", value: 2500 }]);
        expect(refunds.top_refunded[0]).toMatchObject({ name: "Shirt", count: 1, value: 2500 });
    });
});

describe("useFinanceRevenue heatmap", () => {
    it("uses delivered revenue and the product's cost only", () => {
        const orders = [
            order({ id: "d", price: 10000, items: [item()] }),
            order({ id: "t", status: "in_transit", price: 10000, items: [item()] }),
            order({ id: "ret", status: "delivered", is_return: true, price: -10000, items: [item()] }),
        ];
        const { heatmap } = run(orders);
        expect(heatmap.products).toEqual([{ name: "Shirt", total_revenue: 10000, total_margin_pct: 60 }]);
    });
});
