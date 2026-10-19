import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const H = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: H.rpc } }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "tenant-1" }) }));

import { useOrdersAggregates } from "./use-orders-aggregates";

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
    H.rpc.mockReset();
    H.rpc.mockResolvedValue({ data: { status_counts: {}, stats: {}, cities: [], products: [], total_risk_count: 0 }, error: null });
});

describe("useOrdersAggregates", () => {
    it("with no options (the dashboard) runs once, as before", async () => {
        renderHook(() => useOrdersAggregates({}), { wrapper: wrapper() });
        await waitFor(() => expect(H.rpc).toHaveBeenCalledTimes(1));
        expect(H.rpc).toHaveBeenCalledWith("get_orders_aggregates", expect.objectContaining({ _tenant_id: "tenant-1" }));
    });

    it("held while the caller's filter is not settled, then runs once for the settled filter", async () => {
        const { rerender } = renderHook(
            ({ settled, from }: { settled: boolean; from?: string }) => useOrdersAggregates({ dateFrom: from }, { enabled: settled }),
            { wrapper: wrapper(), initialProps: { settled: false, from: "2026-10-19" } as { settled: boolean; from?: string } },
        );
        await sleep(20);
        expect(H.rpc).not.toHaveBeenCalled();
        rerender({ settled: true, from: undefined });
        await waitFor(() => expect(H.rpc).toHaveBeenCalledTimes(1));
        expect(H.rpc.mock.calls[0][1]).toMatchObject({ _date_from: null });
    });
});
