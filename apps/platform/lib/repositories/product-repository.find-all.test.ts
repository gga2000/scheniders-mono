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
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: rows, error: null }),
    };
    return c;
}

vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: (table: string) => chain(tables[table] ?? []),
        rpc: async () => ({ data: [], error: null }),
    },
}));

import { productRepository } from "./product-repository";

describe("productRepository.findAll suppliers", () => {
    it("attaches each product's suppliers in query order and [] for none", async () => {
        const products = await productRepository.findAll("t1");
        const byId = new Map(products.map((p) => [p.id, p]));
        expect(byId.get("p1")?.suppliers?.map((s) => s.supplier_name)).toEqual(["Acme", "Beta"]);
        expect(byId.get("p2")?.suppliers).toEqual([]);
    });
});
