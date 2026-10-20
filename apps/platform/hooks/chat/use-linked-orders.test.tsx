import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";

/**
 * Chat threads link to orders by uuid. Chat is mounted by the root layout,
 * above every route that mounts the order book, so the linked orders are
 * fetched by id on every route — including ones placed on another day, which
 * the book's date window (default: today) never held.
 */

const H = vi.hoisted(() => ({
    findByIds: vi.fn(),
    tenantId: "tenant-1" as string | null,
}));

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: { findByIds: H.findByIds },
}));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true, tenantId: H.tenantId }),
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
    H.tenantId = "tenant-1";
});

describe("useLinkedOrders", () => {
    it("fetches every linked order by id, once per distinct id, without an order book mounted", async () => {
        H.findByIds.mockResolvedValue([order("a", "confirmed"), order("b", "delivered")]);

        const ids = ["b", "a", "b"];
        const { result } = renderHook(() => useLinkedOrders(ids), { wrapper: wrapper() });

        await waitFor(() => expect(result.current.get("b")?.status).toBe("delivered"));
        expect(result.current.get("a")?.status).toBe("confirmed");
        expect(H.findByIds).toHaveBeenCalledTimes(1);
        expect(H.findByIds).toHaveBeenCalledWith("tenant-1", ["a", "b"]);
    });

    it("makes no request when no thread links to an order", async () => {
        const ids: string[] = [];
        const { result } = renderHook(() => useLinkedOrders(ids), { wrapper: wrapper() });

        await new Promise((r) => setTimeout(r, 20));
        expect(H.findByIds).not.toHaveBeenCalled();
        expect(result.current.size).toBe(0);
    });

    it("does not fetch before a tenant is active", async () => {
        H.tenantId = null;
        const ids = ["x"];
        renderHook(() => useLinkedOrders(ids), { wrapper: wrapper() });

        await new Promise((r) => setTimeout(r, 20));
        expect(H.findByIds).not.toHaveBeenCalled();
    });
});
