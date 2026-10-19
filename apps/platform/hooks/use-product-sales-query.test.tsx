import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Product sales come from `get_product_sales()`, not from the shared order book.
 * The book is windowed by the Orders date filter, so folding it in the browser
 * made /products report whichever window Orders was last left on.
 */

const H = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: H.rpc } }));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true }),
}));

import { useProductSalesQuery } from "./use-product-sales-query";

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}

beforeEach(() => {
    H.rpc.mockReset();
});

describe("useProductSalesQuery", () => {
    it("reads get_product_sales and keys the totals by product id", async () => {
        H.rpc.mockResolvedValue({
            data: [
                { product_id: "p1", times_sold: 7, total_revenue: 70000, line_count: 4 },
                { product_id: "p2", times_sold: 0, total_revenue: 0, line_count: 0 },
            ],
            error: null,
        });

        const { result } = renderHook(() => useProductSalesQuery(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.size).toBe(2));
        expect(H.rpc).toHaveBeenCalledWith("get_product_sales");
        expect(result.current.get("p1")).toEqual({ timesSold: 7, totalRevenue: 70000, averageOrderValue: 17500 });
        // No matched lines: the average is 0, not NaN.
        expect(result.current.get("p2")).toEqual({ timesSold: 0, totalRevenue: 0, averageOrderValue: 0 });
    });

    it("stays empty when the RPC fails rather than inventing totals", async () => {
        H.rpc.mockResolvedValue({ data: null, error: new Error("boom") });

        const { result } = renderHook(() => useProductSalesQuery(), { wrapper: wrapper() });

        await waitFor(() => expect(H.rpc).toHaveBeenCalled());
        expect(result.current.size).toBe(0);
    });
});
