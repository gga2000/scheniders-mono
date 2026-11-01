import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order, Product } from "@/lib/supabase";
import { useOrderProfits } from "./use-order-profits";

const order = {
    id: "o1", status: "delivered", price: 30000, created_at: "2026-10-10T09:00:00.000Z",
    items: [{ name: "Oud", product_id: "p1", quantity: 2, price: 15000 }],
} as unknown as Order;

describe("useOrderProfits product cost", () => {
    it("keeps a delivered order's goods cost frozen when the product cost is edited later", () => {
        const repriced = [{ id: "p1", name: "Oud", cost: 9000 }] as Product[];
        const frozen = new Map([["o1", [4000]]]);

        const live = renderHook(() => useOrderProfits([order], repriced)).result.current;
        const kept = renderHook(() => useOrderProfits([order], repriced, 0, frozen)).result.current;

        expect(live.orderCostBreakdowns[0].productCost).toBe(18000);
        expect(kept.orderCostBreakdowns[0].productCost).toBe(8000);
        expect(kept.productProfitAnalysis[0].cost).toBe(8000);
    });
});

describe("useOrderProfits per-order costs", () => {
    const products = [{ id: "p1", name: "Oud", cost: 9000 }] as Product[];

    it("charges a store nothing it has not set, and its own amounts when it has", () => {
        const none = renderHook(() => useOrderProfits([order], products)).result.current.orderCostBreakdowns[0];
        expect(none.deliveryCost).toBe(0);
        expect(none.totalCost).toBe(none.productCost);

        const own = renderHook(() =>
            useOrderProfits([order], products, 0, undefined, { delivery: 4000, sweets: 100, packaging_per_bag: 300, vial: 40, sample_share: 0.01 }),
        ).result.current.orderCostBreakdowns[0];
        // 2 items: 4000 delivery + 100 sweets + 600 bags + 40 vial + 90 sample (1% of 9000) on top of 18000 goods.
        expect(own.totalCost).toBe(18000 + 4000 + 100 + 600 + 40 + 90);
    });
});
