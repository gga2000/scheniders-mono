import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { Product } from "@/lib/supabase";

const findOneForList = vi.fn<(tenantId: string, id: string) => Promise<Product | null>>();

vi.mock("@/lib/repositories/product-repository", () => ({
    productRepository: { findOneForList: (tenantId: string, id: string) => findOneForList(tenantId, id) },
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({}) }));

import { productKeys, refreshProductRows } from "./use-products-query";

const row = (id: string, stock: number) => ({ id, stock_quantity: stock }) as Product;

let client: QueryClient;
beforeEach(() => {
    findOneForList.mockReset();
    client = new QueryClient();
    client.setQueryData(productKeys.list("t1"), [row("a", 1), row("b", 2), row("c", 3)]);
});

describe("refreshProductRows", () => {
    it("patches only the edited rows and drops a row that is gone, without a full refetch", async () => {
        const invalidate = vi.spyOn(client, "invalidateQueries");
        findOneForList.mockImplementation(async (_t, id) => (id === "a" ? row("a", 9) : null));

        await refreshProductRows(client, "t1", ["a", "c", "a"]);

        expect(findOneForList).toHaveBeenCalledTimes(2);
        expect(client.getQueryData(productKeys.list("t1"))).toEqual([row("a", 9), row("b", 2)]);
        expect(invalidate).not.toHaveBeenCalled();
    });

    it("puts a new product at the top of the list", async () => {
        findOneForList.mockImplementation(async (_t, id) => row(id, 5));
        await refreshProductRows(client, "t1", ["new"]);
        expect(client.getQueryData<Product[]>(productKeys.list("t1"))?.map((p) => p.id)).toEqual(["new", "a", "b", "c"]);
    });

    it("falls back to one full refetch when the row read fails or there are many rows", async () => {
        const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
        findOneForList.mockRejectedValue(new Error("offline"));
        await refreshProductRows(client, "t1", ["a"]);
        expect(invalidate).toHaveBeenCalledTimes(1);

        await refreshProductRows(client, "t1", Array.from({ length: 11 }, (_, i) => `p${i}`));
        expect(invalidate).toHaveBeenCalledTimes(2);
        expect(findOneForList).toHaveBeenCalledTimes(1);
    });
});
