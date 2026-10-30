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
let updatedRows: { id: string }[] = [{ id: "prod-1" }];

vi.mock("@/lib/supabase", () => ({
    supabase: {
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
                return { eq: () => ({ select: async () => ({ data: updatedRows, error: null }) }) };
            },
        }),
    },
}));

import { productRepository, ProductWriteDeniedError } from "./product-repository";

type CreateArg = Parameters<typeof productRepository.create>[0];
type UpdateArg = Parameters<typeof productRepository.update>[1];

beforeEach(() => {
    insertSpy.mockClear();
    updateSpy.mockClear();
    updatedRows = [{ id: "prod-1" }];
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
