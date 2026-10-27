import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";

/**
 * The bulk-delete confirmation listed only selected orders found in the loaded
 * window, so orders picked from a search (any date), or still selected after
 * the search was cleared, were missing from the list of what would be deleted.
 */

const H = vi.hoisted(() => ({ findByIds: vi.fn() }));
vi.mock("@/lib/repositories/order-repository", () => ({ orderRepository: { findByIds: H.findByIds } }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "t1" }) }));

import { useResolvedOrders } from "./use-resolved-orders";

const order = (id: string) => ({ id, order_id: `#${id}`, customer_name: `name-${id}` }) as unknown as Order;

function wrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => H.findByIds.mockReset());
afterEach(cleanup);

describe("useResolvedOrders", () => {
    it("lists selected orders from the window and the search results without a request", () => {
        const { result } = renderHook(
            () => useResolvedOrders(new Set(["a", "s"]), [[order("a"), order("b")], [order("s")]], true),
            { wrapper: wrapper() },
        );
        expect(result.current.orders.map((o) => o.id)).toEqual(["a", "s"]);
        expect(result.current.pending).toBe(false);
        expect(H.findByIds).not.toHaveBeenCalled();
    });

    it("reads the selected orders the page no longer holds, and counts the ones that are gone", async () => {
        H.findByIds.mockResolvedValue([order("old")]);
        const { result } = renderHook(
            () => useResolvedOrders(new Set(["a", "old", "trashed"]), [[order("a")]], true),
            { wrapper: wrapper() },
        );
        expect(result.current.pending).toBe(true);
        await waitFor(() => expect(result.current.pending).toBe(false));
        expect(H.findByIds).toHaveBeenCalledWith("t1", ["old", "trashed"]);
        expect(result.current.orders.map((o) => o.id)).toEqual(["a", "old"]);
        expect(result.current.missing).toBe(1);
    });

    it("makes no request while the confirmation is closed", async () => {
        renderHook(() => useResolvedOrders(new Set(["x"]), [[]], false), { wrapper: wrapper() });
        await new Promise((r) => setTimeout(r, 20));
        expect(H.findByIds).not.toHaveBeenCalled();
    });
});
