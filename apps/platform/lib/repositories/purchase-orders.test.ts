import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>();

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args) } }));

import { createPurchaseOrder, receivePurchaseOrder, setPurchaseOrderStatus } from "./purchase-orders";

beforeEach(() => rpc.mockReset());

describe("createPurchaseOrder", () => {
    it("sends lines to the database in one call and reads back the number and total", async () => {
        rpc.mockResolvedValue({ data: [{ id: "po1", po_number: "PO-2026-007", total_cost: "5000" }], error: null });
        const created = await createPurchaseOrder({
            tenantId: "t1",
            supplierName: "Acme",
            lines: [{ productId: "p1", quantityOrdered: 10, unitCost: 500 }],
        });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith(
            "create_purchase_order",
            expect.objectContaining({
                p_tenant_id: "t1",
                p_supplier_name: "Acme",
                p_items: [{ product_id: "p1", variant_id: null, quantity_ordered: 10, unit_cost: 500 }],
            })
        );
        expect(created).toEqual({ id: "po1", poNumber: "PO-2026-007", totalCost: 5000 });
    });

    it("throws the database error instead of swallowing it", async () => {
        rpc.mockResolvedValue({ data: null, error: new Error("a line points at a product that is not in this store") });
        await expect(
            createPurchaseOrder({ tenantId: "t1", supplierName: "Acme", lines: [{ productId: "x", quantityOrdered: 1, unitCost: 1 }] })
        ).rejects.toThrow("not in this store");
    });
});

describe("setPurchaseOrderStatus / receivePurchaseOrder", () => {
    it("moves a PO to the requested status", async () => {
        rpc.mockResolvedValue({ data: "sent", error: null });
        await setPurchaseOrderStatus("po1", "sent");
        expect(rpc).toHaveBeenCalledWith("set_purchase_order_status", { p_po_id: "po1", p_status: "sent" });
    });

    it("receives quantities per line and returns the new status", async () => {
        rpc.mockResolvedValue({ data: "partial", error: null });
        const status = await receivePurchaseOrder("po1", [{ itemId: "i1", quantity: 6 }]);
        expect(rpc).toHaveBeenCalledWith("receive_purchase_order", {
            p_po_id: "po1",
            p_lines: [{ item_id: "i1", quantity: 6, unit_cost: null }],
        });
        expect(status).toBe("partial");
    });

    it("rejects a status the database should never return", async () => {
        rpc.mockResolvedValue({ data: "draft", error: null });
        await expect(receivePurchaseOrder("po1", [{ itemId: "i1", quantity: 1 }])).rejects.toThrow();
    });
});
