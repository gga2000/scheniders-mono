import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const H = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: H.rpc } }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "tenant-1" }) }));

import { useCustomerOrderCounts } from "./use-customer-order-counts";

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return Wrapper;
}

beforeEach(() => {
    H.rpc.mockReset();
    H.rpc.mockResolvedValue({ data: [{ normalized_phone: "7715380120", order_count: 2 }], error: null });
});

describe("useCustomerOrderCounts", () => {
    it("asks the server once per customer, whatever shape the phone is stored in", async () => {
        // The same customer in two stored shapes, plus a row with no phone.
        const orders = [{ phone: "+9647715380120" }, { phone: "07715380120" }, { phone: "" }];
        const { result } = renderHook(() => useCustomerOrderCounts(orders, orders.length), { wrapper: wrapper() });
        await waitFor(() => expect(result.current?.get("7715380120")).toBe(2));
        expect(H.rpc).toHaveBeenCalledWith("get_customer_order_counts", {
            _tenant_id: "tenant-1",
            _phones: ["7715380120"],
        });
    });

    it("asks again when the list gains a row, so a new order is counted", async () => {
        const orders = [{ phone: "07715380120" }];
        const { rerender } = renderHook(({ version }) => useCustomerOrderCounts(orders, version), {
            wrapper: wrapper(),
            initialProps: { version: 1 },
        });
        await waitFor(() => expect(H.rpc).toHaveBeenCalledTimes(1));
        rerender({ version: 2 });
        await waitFor(() => expect(H.rpc).toHaveBeenCalledTimes(2));
    });

    it("does not call the server for a list with no phones", async () => {
        renderHook(() => useCustomerOrderCounts([], 0), { wrapper: wrapper() });
        await new Promise((r) => setTimeout(r, 20));
        expect(H.rpc).not.toHaveBeenCalled();
    });
});
