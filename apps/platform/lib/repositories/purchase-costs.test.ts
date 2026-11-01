import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { fetchBatchCosts, fetchPurchaseOrderCosts } from "./purchase-costs";

beforeEach(() => rpc.mockReset());

/** rpc(...).order(...).range(from, to) resolving to each queued page. */
function pagedRpc(pages: Array<{ data: unknown; error: Error | null }>) {
    const range = vi.fn();
    pages.forEach((page) => range.mockResolvedValueOnce(page));
    rpc.mockReturnValue({ order: () => ({ range }) });
    return range;
}

describe("purchase cost functions", () => {
    it("maps purchase order totals by id", async () => {
        pagedRpc([{ data: [{ id: "po1", total_cost: 90000 }, { id: "po2", total_cost: null }], error: null }]);
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

    it("reads past the 1000-row API cap", async () => {
        const full = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}`, total_cost: 1 }));
        const range = pagedRpc([
            { data: full, error: null },
            { data: [{ id: "last", total_cost: 5 }], error: null },
        ]);
        const costs = await fetchPurchaseOrderCosts("tenant-1");
        expect(range).toHaveBeenNthCalledWith(1, 0, 999);
        expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
        expect(costs.size).toBe(1001);
        expect(costs.get("last")).toBe(5);
    });

    it("throws instead of hiding a failed read", async () => {
        pagedRpc([{ data: null, error: new Error("boom") }]);
        await expect(fetchPurchaseOrderCosts("tenant-1")).rejects.toThrow("boom");
    });
});
