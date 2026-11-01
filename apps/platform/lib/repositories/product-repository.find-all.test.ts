import { describe, it, expect, vi } from "vitest";

/*
 * The Supplies tab and the reorder drawer group supplies by supplier. The list
 * query used to load no supplier rows at all, so every supply fell into "no
 * supplier" and could not get a purchase order. findAll must attach them,
 * primary first, and keep a product without suppliers at [].
 */

const tables: Record<string, unknown[]> = {
    products: [
        { id: "p1", name: "Box", variants: [] },
        { id: "p2", name: "Tape", variants: [] },
    ],
    product_suppliers: [
        { id: "s1", product_id: "p1", supplier_name: "Acme", is_primary: true },
        { id: "s2", product_id: "p1", supplier_name: "Beta", is_primary: false },
    ],
};

function chain(rows: unknown[]) {
    const c: Record<string, unknown> = {
        select: () => c,
        eq: () => c,
        order: () => c,
        range: () => c,
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: rows, error: null }),
    };
    return c;
}

vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: (table: string) => chain(tables[table] ?? []),
        rpc: (fn: string) => chain(fn === "supplier_unit_costs" ? [{ id: "s1", unit_cost: 700 }] : []),
    },
}));

import { productRepository } from "./product-repository";

describe("productRepository.findSupplierLinks", () => {
    it("groups each product's suppliers in query order; a product without suppliers has no entry", async () => {
        const links = await productRepository.findSupplierLinks("t1");
        expect(links.get("p1")?.map((s) => s.supplier_name)).toEqual(["Acme", "Beta"]);
        expect(links.has("p2")).toBe(false);
    });

    it("merges each supplier's unit cost from the cost function, null when hidden", async () => {
        const links = await productRepository.findSupplierLinks("t1");
        expect((links.get("p1") ?? []).map((s) => s.unit_cost)).toEqual([700, null]);
    });
});

describe("productRepository.findAll", () => {
    it("does not carry suppliers: the product list stays light", async () => {
        const products = await productRepository.findAll("t1");
        expect(products.every((p) => p.suppliers === undefined)).toBe(true);
    });
});
