import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Expense } from "@/types/expense";
import type { Order } from "@/types/order";
import type { Product } from "@/types/product";
import { useFinanceOverview } from "./use-finance-overview";
import { periodBucket as bucketKey } from "@/lib/finance/buckets";

describe("bucketKey", () => {
    it("files the first Baghdad hours under the Baghdad day, not the UTC day", () => {
        // 00:30 Baghdad on 5 Oct is 21:30 UTC on 4 Oct.
        const { key } = bucketKey(new Date("2026-10-04T21:30:00.000Z"), "day");
        expect(key).toBe("2026-10-05");
    });

    it("keeps the last Baghdad minute on the same day", () => {
        const { key } = bucketKey(new Date("2026-10-05T20:59:00.000Z"), "day");
        expect(key).toBe("2026-10-05");
    });

    it("anchors weeks on the Monday of the Baghdad week", () => {
        // 2026-10-04 is a Sunday; its week starts Monday 2026-09-28.
        const { key } = bucketKey(new Date("2026-10-04T10:00:00.000Z"), "week");
        expect(key).toBe("2026-09-28");
    });
});

describe("useFinanceOverview profit", () => {
    const order = (over: Partial<Order>): Order =>
        ({ id: "o", status: "completed", price: 0, items: [], created_at: "2026-10-10T09:00:00.000Z", updated_at: "2026-10-10T09:00:00.000Z", ...over }) as Order;
    const interval = { start: new Date("2026-10-01T00:00:00.000Z"), end: new Date("2026-10-31T23:59:59.000Z") };

    it("is sales minus product cost, refunds and expenses, as Claude's profit_report defines it", () => {
        const orders = [
            order({ id: "sale", price: 10000, delivery_fee: 500, items: [{ name: "Shirt", product_id: "p1", quantity: 1, price: 10000 }] }),
            order({ id: "gone", status: "cancelled", price: 9999 }),
            order({ id: "refund", status: "refund_delivered", is_return: true, price: -2000, updated_at: "2026-10-12T09:00:00.000Z" }),
        ];
        const products = [{ id: "p1", name: "Shirt", cost: 4000 }] as Product[];
        const expenses = [{ id: "e1", category: "shipping", amount: 1000, expense_date: "2026-10-11" }] as Expense[];

        const { result } = renderHook(() => useFinanceOverview(orders, products, expenses, interval, null, "day"));

        expect(result.current.gross_revenue).toBe(10000);
        expect(result.current.refund_value).toBe(2000);
        expect(result.current.product_cost).toBe(4000);
        // The delivery fee is the courier's and courier bills are expenses, so it is not subtracted again.
        expect(result.current.net_profit).toBe(3000);
        expect(result.current.series.reduce((sum, b) => sum + b.profit, 0)).toBe(3000);
    });

    it("keeps a delivered order's cost frozen when the product cost is edited later", () => {
        const orders = [
            order({ id: "sale", price: 10000, items: [{ name: "Shirt", product_id: "p1", quantity: 1, price: 10000 }] }),
        ];
        const repriced = [{ id: "p1", name: "Shirt", cost: 9000 }] as Product[];
        const frozen = new Map([["sale", [4000]]]);

        const live = renderHook(() => useFinanceOverview(orders, repriced, [], interval, null, "day")).result.current;
        const kept = renderHook(() => useFinanceOverview(orders, repriced, [], interval, null, "day", frozen)).result.current;

        expect(live.product_cost).toBe(9000);
        expect(kept.product_cost).toBe(4000);
        expect(kept.net_profit).toBe(6000);
    });
});
