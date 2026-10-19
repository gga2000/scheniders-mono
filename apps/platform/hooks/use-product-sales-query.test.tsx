import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Products' lifetime sales come from `get_product_sales()`, not from the orders
 * context — that context is the /orders date window (default: today), so the
 * old client fold reported one day's sales as the product's history.
 */

const H = vi.hoisted(() => ({ rpc: vi.fn(), tenantId: "tenant-1" as string | null }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: H.rpc } }));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true, tenantId: H.tenantId }),
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
    H.tenantId = "tenant-1";
});

describe("useProductSalesQuery", () => {
    it("maps RPC rows by product id, averaging revenue over matched lines", async () => {
        H.rpc.mockResolvedValue({
            data: [
                { product_id: "p1", times_sold: 16, total_revenue: 740500, line_count: 4 },
                { product_id: "p2", times_sold: 0, total_revenue: 0, line_count: 0 },
            ],
            error: null,
        });

        const { result } = renderHook(() => useProductSalesQuery(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.size).toBe(2));
        expect(H.rpc).toHaveBeenCalledWith("get_product_sales");
        expect(result.current.get("p1")).toEqual({ timesSold: 16, totalRevenue: 740500, averageOrderValue: 185125 });
        expect(result.current.get("p2")).toEqual({ timesSold: 0, totalRevenue: 0, averageOrderValue: 0 });
    });

    it("does not call the RPC before a tenant is active", async () => {
        H.tenantId = null;
        const { result } = renderHook(() => useProductSalesQuery(), { wrapper: wrapper() });

        await new Promise((r) => setTimeout(r, 20));
        expect(H.rpc).not.toHaveBeenCalled();
        expect(result.current.size).toBe(0);
    });
});
