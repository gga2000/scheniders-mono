import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OrderWindow } from "@/lib/order-window";

/**
 * Production bug, 2026-10-12: the Confirmed chip read 1 over "No confirmed
 * orders". Filter state settles over two renders — a seed first, then the
 * merchant's saved filter — and the first fetch started with the SEED window.
 * The refetch for the real window then joined that in-flight request (React
 * Query only cancels a refetch when data already exists), so the cache held the
 * seed window, marked fresh.
 *
 * The rule pinned here: no fetch runs until filters have settled, and the first
 * one uses the settled window.
 */

const H = vi.hoisted(() => ({ findWindow: vi.fn(), tenantId: "tenant-1" as string | null }));

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: { findWindow: H.findWindow },
}));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true, tenantId: H.tenantId }),
}));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useOrdersQuery } from "./use-orders-query";

const TODAY = { fromInstant: Date.parse("2026-10-11T21:00:00.000Z"), toInstant: Date.parse("2026-10-12T20:59:59.999Z"), fromDay: "2026-10-12", toDay: "2026-10-12" } satisfies NonNullable<OrderWindow>;

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}

beforeEach(() => {
    H.findWindow.mockReset();
    H.findWindow.mockResolvedValue([]);
    H.tenantId = "tenant-1";
    sessionStorage.clear();
});

describe("useOrdersQuery window gating", () => {
    it("does not fetch the seed window, and fetches the settled window once", async () => {
        const { rerender } = renderHook(
            ({ window, settled }: { window: OrderWindow; settled: boolean }) => useOrdersQuery(window, settled),
            { wrapper: wrapper(), initialProps: { window: TODAY as OrderWindow, settled: false } },
        );

        // The seed (Today) is on screen in filter state but must not be fetched.
        await new Promise((r) => setTimeout(r, 20));
        expect(H.findWindow).not.toHaveBeenCalled();

        // The saved filter arrives: All Orders.
        rerender({ window: null, settled: true });

        await waitFor(() => expect(H.findWindow).toHaveBeenCalled());
        expect(H.findWindow).toHaveBeenCalledTimes(1);
        expect(H.findWindow).toHaveBeenCalledWith("tenant-1", null);
    });

    it("refuses a sessionStorage snapshot of a different window", async () => {
        sessionStorage.setItem("schneiders_orders_swr", JSON.stringify([{ id: "today-row", status: "new" }]));
        sessionStorage.setItem("schneiders_orders_swr_ts", String(Date.now()));
        sessionStorage.setItem("schneiders_orders_swr_window", `${TODAY.fromInstant}-${TODAY.toInstant}`);

        const { result } = renderHook(() => useOrdersQuery(null, true), { wrapper: wrapper() });

        await waitFor(() => expect(H.findWindow).toHaveBeenCalledWith("tenant-1", null));
        await waitFor(() => expect(result.current.data).toEqual([]));
    });

    it("does not fetch until the active tenant is known", async () => {
        // RLS alone would return every tenant the user belongs to; the list is
        // one tenant's book, so with no tenant there is nothing to ask for.
        H.tenantId = null;
        renderHook(() => useOrdersQuery(null, true), { wrapper: wrapper() });
        await new Promise((r) => setTimeout(r, 20));
        expect(H.findWindow).not.toHaveBeenCalled();
    });
});
