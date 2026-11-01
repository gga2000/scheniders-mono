import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * Regression test for the LightFunnels SKU-matching bug.
 *
 * `productRepository.create`/`update` used to destructure `sku` out of the
 * payload alongside genuinely-computed fields (times_sold, profit_margin, …),
 * so a merchant-entered SKU was silently dropped and never written to the
 * `products.sku` column. With no SKU stored, the LightFunnels webhook
 * (findProductBySku) fell back to fuzzy Arabic name-matching and bound orders
 * to the wrong product — surfacing as the wrong item in customer/staff WhatsApp
 * messages. `sku` is a real, writable column and MUST survive the write.
 */

// The real withRetry: successful writes resolve on the first attempt, and the
// denial test checks that a refusal is not retried.

// Capture exactly what gets handed to supabase insert()/update().
const insertSpy = vi.fn<(rows: Record<string, unknown>[]) => void>();
const updateSpy = vi.fn<(patch: Record<string, unknown>) => void>();
// Rows the UPDATE reports back; RLS that hides the row makes this empty.
let updatedRows: { id: string; updated_at?: string }[] = [{ id: "prod-1" }];
// The row as a plain SELECT sees it (for telling a lost race from a denial).
let currentRow: { updated_at: string } | null = null;
const updateFilters: [string, unknown][] = [];
const rpcSpy = vi.fn<(fn: string, args: Record<string, unknown>) => void>();
let rpcResult: { data: unknown; error: { code: string; message: string } | null } = { data: 2, error: null };

vi.mock("@/lib/supabase", () => ({
    supabase: {
        rpc: async (fn: string, args: Record<string, unknown>) => {
            rpcSpy(fn, args);
            return rpcResult;
        },
        from: () => ({
            insert: (rows: Record<string, unknown>[]) => {
                insertSpy(rows);
                return {
                    select: () => ({
                        single: async () => ({ data: { id: "new-id", ...rows[0] }, error: null }),
                    }),
                };
            },
            update: (patch: Record<string, unknown>) => {
                updateSpy(patch);
                const chain = {
                    eq: (col: string, val: unknown) => {
                        updateFilters.push([col, val]);
                        return chain;
                    },
                    select: async () => ({ data: updatedRows, error: null }),
                };
                return chain;
            },
            select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: currentRow, error: null }) }),
            }),
        }),
    },
}));

import { productRepository, ProductWriteDeniedError, ProductChangedElsewhereError } from "./product-repository";

type CreateArg = Parameters<typeof productRepository.create>[0];
type UpdateArg = Parameters<typeof productRepository.update>[1];

beforeEach(() => {
    insertSpy.mockClear();
    updateSpy.mockClear();
    updatedRows = [{ id: "prod-1" }];
    currentRow = null;
    updateFilters.length = 0;
    rpcSpy.mockClear();
    rpcResult = { data: 2, error: null };
});

describe("productRepository.update edit-conflict guard", () => {
    it("only writes over the version the editor loaded, and returns the new one", async () => {
        updatedRows = [{ id: "prod-1", updated_at: "2026-10-30T13:00:00Z" }];
        const next = await productRepository.update("prod-1", { name: "x" } as UpdateArg, { expectedUpdatedAt: "2026-10-30T12:00:00Z" });
        expect(updateFilters).toContainEqual(["updated_at", "2026-10-30T12:00:00Z"]);
        expect(next).toBe("2026-10-30T13:00:00Z");
    });

    it("reports a save that lost the race, not a permission problem", async () => {
        updatedRows = [];
        currentRow = { updated_at: "2026-10-30T12:30:00Z" };
        await expect(
            productRepository.update("prod-1", { name: "x" } as UpdateArg, { expectedUpdatedAt: "2026-10-30T12:00:00Z" }),
        ).rejects.toBeInstanceOf(ProductChangedElsewhereError);
    });

    it("still reports a denial when the row is unchanged but RLS refused", async () => {
        updatedRows = [];
        currentRow = { updated_at: "2026-10-30T12:00:00Z" };
        await expect(
            productRepository.update("prod-1", { name: "x" } as UpdateArg, { expectedUpdatedAt: "2026-10-30T12:00:00Z" }),
        ).rejects.toBeInstanceOf(ProductWriteDeniedError);
    });
});

describe("productRepository SKU persistence", () => {
    it("create() writes the sku column and strips computed fields", async () => {
        await productRepository.create(
            {
                name: "انفوي",
                sku: "envoy",
                price: 34750,
                // computed/joined fields with no real column — must be stripped
                variants: [],
                times_sold: 5,
                total_revenue: 100,
                profit_margin: 0.5,
                average_order_value: 20,
            } as unknown as CreateArg,
            "tenant-1",
        );

        expect(insertSpy).toHaveBeenCalledTimes(1);
        const row = insertSpy.mock.calls[0][0][0];
        expect(row.sku).toBe("envoy");
        expect(row.tenant_id).toBe("tenant-1");
        expect(row.is_archived).toBe(false);
        expect(row).not.toHaveProperty("variants");
        expect(row).not.toHaveProperty("times_sold");
        expect(row).not.toHaveProperty("total_revenue");
        expect(row).not.toHaveProperty("profit_margin");
        expect(row).not.toHaveProperty("average_order_value");
    });

    it("update() writes a changed sku and strips computed + immutable keys", async () => {
        await productRepository.update("prod-1", {
            sku: "envoy",
            price: 34750,
            times_sold: 9,
            id: "should-not-be-written",
            created_at: "should-not-be-written",
        } as unknown as UpdateArg);

        expect(updateSpy).toHaveBeenCalledTimes(1);
        const patch = updateSpy.mock.calls[0][0];
        expect(patch.sku).toBe("envoy");
        expect(patch).not.toHaveProperty("times_sold");
        expect(patch).not.toHaveProperty("id");
        expect(patch).not.toHaveProperty("created_at");
    });

    it("update() rejects when RLS let no row change, instead of reporting success", async () => {
        updatedRows = [];
        await expect(productRepository.update("prod-1", { price: 1000 } as UpdateArg)).rejects.toBeInstanceOf(
            ProductWriteDeniedError,
        );
        // A refusal is final: it is not retried.
        expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it("update() refuses stock: stock only moves by delta or shelf count", async () => {
        await expect(
            productRepository.update("prod-1", { stock_quantity: 5 } as unknown as UpdateArg),
        ).rejects.toThrow(/adjustStock or setCountedStock/);
        expect(updateSpy).not.toHaveBeenCalled();
    });
});

describe("productRepository price changes", () => {
    it("restores each product's own price and 'was' price in one database call", async () => {
        await productRepository.restorePrices([
            { id: "p1", price: 20000, compare_at_price: 25000, currentPrice: 30000 },
            { id: "p2", price: 15000, compare_at_price: null, currentPrice: 30000 },
        ]);

        expect(rpcSpy).toHaveBeenCalledTimes(1);
        expect(rpcSpy).toHaveBeenCalledWith("set_product_prices", {
            p_changes: [
                { id: "p1", price: 20000, set_compare_at: true, compare_at_price: 25000 },
                { id: "p2", price: 15000, set_compare_at: true, compare_at_price: null },
            ],
            p_reason: "Bulk price change undone",
        });
        expect(updateSpy).not.toHaveBeenCalled();
    });

    it("changes the price and clears compare-at only where asked, in one call", async () => {
        await productRepository.bulkChangePrice(
            [
                { id: "p1", oldPrice: 30000, clearCompareAt: true },
                { id: "p2", oldPrice: 30000, clearCompareAt: false },
            ],
            20000,
        );
        expect(rpcSpy).toHaveBeenCalledWith("set_product_prices", {
            p_changes: [
                { id: "p1", price: 20000, set_compare_at: true, compare_at_price: null },
                { id: "p2", price: 20000, set_compare_at: false, compare_at_price: null },
            ],
            p_reason: "Bulk price change",
        });
    });

    it("reports a refused change as a permission problem, not a success", async () => {
        rpcResult = { data: null, error: { code: "42501", message: "product not found or not allowed" } };
        await expect(
            productRepository.restorePrices([{ id: "p1", price: 1000, compare_at_price: null, currentPrice: 2000 }]),
        ).rejects.toBeInstanceOf(ProductWriteDeniedError);
    });
});

