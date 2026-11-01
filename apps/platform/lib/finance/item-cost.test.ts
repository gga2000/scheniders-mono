import { describe, expect, it } from "vitest";
import type { Product } from "@/types/product";
import { resolveItemCost, resolveOrderLineCost } from "./item-cost";

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

describe("resolveOrderLineCost", () => {
    const order = { id: "o1" };
    const line = { name: "Shirt", product_id: "p1", quantity: 2 };

    it("uses the cost frozen at delivery even after the product cost changed", () => {
        const repriced = [product({ cost: 99 })];
        const snapshots = new Map([["o1", [10]]]);
        expect(resolveOrderLineCost(order, 0, line, repriced, snapshots)).toEqual({ cost: 20, known: true });
    });

    it("prices a line with no frozen cost at the cost on file now", () => {
        const products = [product({ cost: 12 })];
        expect(resolveOrderLineCost(order, 0, line, products, new Map([["o1", [null]]]))).toEqual({ cost: 24, known: true });
        expect(resolveOrderLineCost(order, 0, line, products, new Map())).toEqual({ cost: 24, known: true });
        expect(resolveOrderLineCost(order, 0, line, products)).toEqual({ cost: 24, known: true });
    });

    it("matches lines by position", () => {
        const snapshots = new Map([["o1", [10, 30]]]);
        expect(resolveOrderLineCost(order, 1, { name: "Hat", quantity: 1 }, [], snapshots)).toEqual({ cost: 30, known: true });
    });
});
