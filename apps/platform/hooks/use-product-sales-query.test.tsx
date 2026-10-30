import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const H = vi.hoisted(() => ({ rpc: vi.fn(), tenantId: "tenant-1" as string | null }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: H.rpc } }));
vi.mock("@/lib/repositories/product-repository", () => ({ productRepository: {} }));
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
    it("maps get_product_sales rows by product id for the active tenant, revenue per order in whole IQD", async () => {
        H.rpc.mockResolvedValue({
            data: [
                { product_id: "p1", units_sold: 16, revenue: 740500, order_count: 3, units_sold_30d: 4, revenue_30d: 185000 },
                { product_id: "p2", units_sold: 0, revenue: 0, order_count: 0, units_sold_30d: 0, revenue_30d: 0 },
            ],
            error: null,
        });

        const { result } = renderHook(() => useProductSalesQuery(), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.size).toBe(2));
        expect(H.rpc).toHaveBeenCalledWith("get_product_sales", { p_tenant_id: "tenant-1" });
        expect(result.current.get("p1")).toEqual({
            timesSold: 16, totalRevenue: 740500, averageOrderValue: 246833, timesSold30d: 4, revenue30d: 185000,
        });
        expect(result.current.get("p2")).toEqual({
            timesSold: 0, totalRevenue: 0, averageOrderValue: 0, timesSold30d: 0, revenue30d: 0,
        });
    });

    it("does not call the RPC when the screen doesn't show sales", async () => {
        const { result } = renderHook(() => useProductSalesQuery(false), { wrapper: wrapper() });

        await new Promise((r) => setTimeout(r, 20));
        expect(H.rpc).not.toHaveBeenCalled();
        expect(result.current.size).toBe(0);
    });

    it("does not call the RPC before the active tenant is known", async () => {
        H.tenantId = null;
        const { result } = renderHook(() => useProductSalesQuery(), { wrapper: wrapper() });

        await new Promise((r) => setTimeout(r, 20));
        expect(H.rpc).not.toHaveBeenCalled();
        expect(result.current.size).toBe(0);
    });
});
