import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { fetchBatchCosts, fetchPurchaseOrderCosts } from "./purchase-costs";

beforeEach(() => rpc.mockReset());

describe("purchase cost functions", () => {
    it("maps purchase order totals by id", async () => {
        rpc.mockResolvedValue({ data: [{ id: "po1", total_cost: 90000 }, { id: "po2", total_cost: null }], error: null });
        const costs = await fetchPurchaseOrderCosts("tenant-1");
        expect(rpc).toHaveBeenCalledWith("purchase_order_costs", { p_tenant_id: "tenant-1" });
        expect(costs.get("po1")).toBe(90000);
        expect(costs.get("po2")).toBeNull();
    });

    it("returns an empty map, not zeros, for a member who may not see cost", async () => {
        rpc.mockResolvedValue({ data: [], error: null });
        const costs = await fetchBatchCosts("p1");
        expect(rpc).toHaveBeenCalledWith("product_batch_costs", { p_product_id: "p1" });
        expect(costs.size).toBe(0);
        expect(costs.get("any")).toBeUndefined();
    });

    it("throws instead of hiding a failed read", async () => {
        rpc.mockResolvedValue({ data: null, error: new Error("boom") });
        await expect(fetchPurchaseOrderCosts("tenant-1")).rejects.toThrow("boom");
    });
});
