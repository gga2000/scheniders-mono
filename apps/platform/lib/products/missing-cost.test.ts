import { describe, expect, it } from "vitest";
import type { ProductVariant } from "@/types/product";
import { hasStockWithoutCost } from "./missing-cost";

const base = { product_type: "physical" as const, is_archived: false, stock_quantity: 5, cost: undefined, variants: [] as ProductVariant[] };
const variant = (stock: number, cost?: number): ProductVariant =>
    ({ id: "v", product_id: "p", created_at: "", name: "v", stock_quantity: stock, cost }) as ProductVariant;

describe("hasStockWithoutCost", () => {
    it("flags a product with pieces and no cost, where 0 counts as no cost", () => {
        expect(hasStockWithoutCost(base)).toBe(true);
        expect(hasStockWithoutCost({ ...base, cost: 0 })).toBe(true);
        expect(hasStockWithoutCost({ ...base, cost: 4_000 })).toBe(false);
    });

    it("leaves out empty shelves, archived and non-physical products", () => {
        expect(hasStockWithoutCost({ ...base, stock_quantity: 0 })).toBe(false);
        expect(hasStockWithoutCost({ ...base, is_archived: true })).toBe(false);
        expect(hasStockWithoutCost({ ...base, product_type: "digital" })).toBe(false);
    });

    it("reads pieces from the variants, falling back to the product's cost", () => {
        expect(hasStockWithoutCost({ ...base, stock_quantity: 0, variants: [variant(3)] })).toBe(true);
        expect(hasStockWithoutCost({ ...base, stock_quantity: 0, variants: [variant(3, 2_500)] })).toBe(false);
        expect(hasStockWithoutCost({ ...base, stock_quantity: 0, cost: 2_500, variants: [variant(3)] })).toBe(false);
        expect(hasStockWithoutCost({ ...base, stock_quantity: 9, variants: [variant(0)] })).toBe(false);
    });
});
