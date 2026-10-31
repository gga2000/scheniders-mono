import { describe, expect, it } from "vitest";
import { summarizeProfit, type CostedProduct, type CostedVariant, type ProfitOrder } from "./profit";

const SERUM = "11111111-1111-4111-8111-111111111111";
const CREAM = "22222222-2222-4222-8222-222222222222";

const products: CostedProduct[] = [
    { id: SERUM, name: "Serum", sku: "SR-1", cost: 10000 },
    { id: CREAM, name: "Cream", sku: null, cost: null },
];
const variants: CostedVariant[] = [{ id: "v-big", product_id: SERUM, cost: 15000 }];

const sale = (price: number, items: ProfitOrder["items"], status: ProfitOrder["status"] = "delivered"): ProfitOrder => ({
    status,
    is_return: false,
    price,
    items,
});

describe("summarizeProfit", () => {
    it("revenue minus product cost, refunds and expenses", () => {
        const orders: ProfitOrder[] = [
            sale(50000, [{ name: "Serum", quantity: 2, price: 25000, product_id: SERUM }]),
            sale(25000, [{ name: "Serum big", quantity: 1, price: 25000, product_id: SERUM, variant_id: "v-big" }], "completed"),
            { status: "refund_delivered", is_return: true, price: -25000, items: [] },
        ];
        const s = summarizeProfit(orders, products, variants, [{ category: "marketing", amount: 5000 }]);
        expect(s.orders).toBe(2);
        expect(s.units).toBe(3);
        expect(s.revenue).toBe(75000);
        expect(s.productCost).toBe(2 * 10000 + 15000);
        expect(s.grossProfit).toBe(75000 - 35000);
        expect(s.refunds).toBe(25000);
        expect(s.refundCount).toBe(1);
        expect(s.netProfit).toBe(75000 - 35000 - 25000 - 5000);
        expect(s.missingCost).toEqual([]);
    });

    it("flags sold products with no cost instead of showing their profit", () => {
        const s = summarizeProfit([sale(30000, [{ name: "Cream", quantity: 3, price: 10000, product_id: CREAM }])], products, variants, []);
        expect(s.productCost).toBe(0);
        expect(s.missingCost).toEqual([{ name: "Cream", units: 3 }]);
        expect(s.products[0]).toMatchObject({ name: "Cream", units: 3, profit: null });
    });

    it("finds old lines by sku or name, and ignores orders that are not sold", () => {
        const s = summarizeProfit(
            [
                sale(10000, [{ name: "whatever", sku: "sr-1", quantity: 1, price: 10000 }]),
                sale(10000, [{ name: "Serum", quantity: 1, price: 10000 }]),
                sale(10000, [{ name: "Serum", quantity: 1, price: 10000, product_id: SERUM }], "in_transit"),
                { status: "refund_delivered", is_return: false, price: 0, items: [] },
            ],
            products,
            variants,
            [],
        );
        expect(s.orders).toBe(2);
        expect(s.productCost).toBe(20000);
        expect(s.refundCount).toBe(1);
    });

    it("has no margin without revenue", () => {
        expect(summarizeProfit([], products, variants, []).marginPct).toBeNull();
    });
});
