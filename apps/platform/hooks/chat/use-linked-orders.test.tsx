import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";

/**
 * Chat threads link to orders by uuid. The orders context is the /orders date
 * window (default: today), so an order from another day was "not loaded" and
 * its thread lost status, price and the action bar. Orders in the window come
 * from the window (the live copy); only the rest are fetched.
 */

const H = vi.hoisted(() => ({
    findByIds: vi.fn(),
    contextOrders: [] as Order[],
    tenantId: "tenant-1" as string | null,
}));

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: { findByIds: H.findByIds },
}));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true, tenantId: H.tenantId }),
}));
vi.mock("@/components/providers/orders-provider", () => ({
    useOrdersContext: () => ({ orders: H.contextOrders }),
}));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useLinkedOrders } from "./use-linked-orders";

const order = (id: string, status: Order["status"]) => ({ id, order_id: `LF-${id}`, status }) as Order;

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}

beforeEach(() => {
    H.findByIds.mockReset();
    H.contextOrders = [];
    H.tenantId = "tenant-1";
});

describe("useLinkedOrders", () => {
    it("takes window orders from context and fetches only the rest", async () => {
        H.contextOrders = [order("a", "confirmed")];
        H.findByIds.mockResolvedValue([order("b", "delivered")]);

        const ids = ["a", "b"];
        const { result } = renderHook(() => useLinkedOrders(ids), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.get("b")?.status).toBe("delivered"));
        expect(H.findByIds).toHaveBeenCalledTimes(1);
        expect(H.findByIds).toHaveBeenCalledWith("tenant-1", ["b"]);
        expect(result.current.get("a")).toBe(H.contextOrders[0]);
    });

    it("makes no request when every linked order is in the window", async () => {
        H.contextOrders = [order("a", "new")];
        const ids = ["a"];
        const { result } = renderHook(() => useLinkedOrders(ids), { wrapper: wrapper() });

        await new Promise((r) => setTimeout(r, 20));
        expect(H.findByIds).not.toHaveBeenCalled();
        expect(result.current.get("a")?.status).toBe("new");
    });

    it("does not fetch before a tenant is active", async () => {
        H.tenantId = null;
        const ids = ["x"];
        renderHook(() => useLinkedOrders(ids), { wrapper: wrapper() });

        await new Promise((r) => setTimeout(r, 20));
        expect(H.findByIds).not.toHaveBeenCalled();
    });
});
