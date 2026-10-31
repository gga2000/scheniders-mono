import { describe, expect, it } from "vitest";
import type { Product } from "@/types/product";
import { resolveItemCost } from "./item-cost";

const product = (over: Partial<Product>): Product => ({ id: "p1", name: "Shirt", cost: 10, ...over }) as Product;

describe("resolveItemCost", () => {
    it("prefers product id over a same-named product", () => {
        const products = [product({ id: "a", name: "Shirt", cost: 5 }), product({ id: "b", name: "Shirt", cost: 9 })];
        expect(resolveItemCost({ name: "Shirt", product_id: "b", quantity: 2 }, products)).toEqual({ cost: 18, known: true });
    });

    it("uses the variant cost when the line names a variant", () => {
        const p = product({ variants: [{ id: "v1", cost: 7 } as never] });
        expect(resolveItemCost({ name: "Shirt", product_id: "p1", variant_id: "v1", quantity: 3 }, [p]).cost).toBe(21);
    });

    it("falls back to name for old lines without ids", () => {
        expect(resolveItemCost({ name: "shirt", quantity: 1 }, [product({})])).toEqual({ cost: 10, known: true });
    });

    it("flags a missing or zero cost as unknown", () => {
        expect(resolveItemCost({ name: "Ghost", quantity: 1 }, [product({})]).known).toBe(false);
        expect(resolveItemCost({ name: "Shirt", quantity: 1 }, [product({ cost: 0 })]).known).toBe(false);
    });
});
