import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";

/**
 * Chat threads link to orders by uuid. Chat is mounted by the root layout,
 * above every route that mounts the order book, so the linked orders are
 * fetched by id on every route — including ones placed on another day, which
 * the book's date window (default: today) never held.
 */

type Handler = (payload: { new: Record<string, unknown> }) => void;
type StatusCallback = (status: string, err?: Error) => void;

const H = vi.hoisted(() => ({
    findByIds: vi.fn(),
    tenantId: "tenant-1" as string | null,
    configs: [] as unknown[],
    handlers: [] as Handler[],
    statusCallbacks: [] as StatusCallback[],
    removed: 0,
}));

vi.mock("@/lib/supabase", () => {
    const channel = {
        on(_type: string, config: unknown, handler: Handler) {
            H.configs.push(config);
            H.handlers.push(handler);
            return channel;
        },
        subscribe(cb: StatusCallback) {
            H.statusCallbacks.push(cb);
            return channel;
        },
    };
    return {
        supabase: {
            channel: () => channel,
            removeChannel: async () => {
                H.removed++;
            },
        },
    };
});

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: { findByIds: H.findByIds },
}));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true, tenantId: H.tenantId }),
}));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useLinkedOrders } from "./use-linked-orders";

const order = (id: string, status: Order["status"], version = 1) =>
    ({ id, order_id: `LF-${id}`, status, version }) as Order;

/** A realtime UPDATE payload: the whole `orders` row, as Supabase sends it. */
const updated = (id: string, status: Order["status"], version: number, extra: Record<string, unknown> = {}) => ({
    new: { id, tenant_id: "tenant-1", order_id: `LF-${id}`, status, version, items: [], margin: 999, deleted_at: null, ...extra },
});

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}

beforeEach(() => {
    H.findByIds.mockReset();
    H.tenantId = "tenant-1";
    H.configs.length = 0;
    H.handlers.length = 0;
    H.statusCallbacks.length = 0;
    H.removed = 0;
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

describe("useLinkedOrders — live updates", () => {
    async function mounted(initial: Order[]) {
        H.findByIds.mockResolvedValue(initial);
        const ids = initial.map((o) => o.id);
        const hook = renderHook(() => useLinkedOrders(ids), { wrapper: wrapper() });
        await waitFor(() => expect(hook.result.current.size).toBe(initial.length));
        return hook;
    }

    it("listens for UPDATEs on the active tenant's orders only, while a thread links to one", async () => {
        const empty: string[] = [];
        renderHook(() => useLinkedOrders(empty), { wrapper: wrapper() });
        expect(H.configs).toEqual([]);

        await mounted([order("a", "confirmed")]);
        expect(H.configs).toEqual([
            { event: "UPDATE", schema: "public", table: "orders", filter: "tenant_id=eq.tenant-1" },
        ]);
    });

    it("shows a teammate's change at once, with the version the next change must send", async () => {
        const { result } = await mounted([order("a", "confirmed", 3), order("b", "new", 1)]);

        act(() => H.handlers[0](updated("a", "in_transit", 4)));

        await waitFor(() => expect(result.current.get("a")?.status).toBe("in_transit"));
        expect(result.current.get("a")?.version).toBe(4);
        expect(result.current.get("b")?.status).toBe("new");
        expect(H.findByIds).toHaveBeenCalledTimes(1);
        // Only the list columns are taken from the realtime row.
        expect(result.current.get("a")).not.toHaveProperty("margin");
    });

    it("keeps what the row does not carry, and ignores an older revision", async () => {
        const withRisk = { ...order("a", "confirmed", 5), risk_data: { level: "high" } } as unknown as Order;
        const { result } = await mounted([withRisk]);

        act(() => H.handlers[0](updated("a", "new", 4)));
        expect(result.current.get("a")?.status).toBe("confirmed");

        act(() => H.handlers[0](updated("a", "delivered", 6)));
        await waitFor(() => expect(result.current.get("a")?.status).toBe("delivered"));
        expect(result.current.get("a")).toMatchObject({ risk_data: { level: "high" } });
    });

    it("drops a soft-deleted order and ignores orders no thread links to", async () => {
        const { result } = await mounted([order("a", "confirmed"), order("b", "new")]);

        act(() => H.handlers[0](updated("zzz", "in_transit", 9)));
        act(() => H.handlers[0](updated("b", "new", 2, { deleted_at: "2026-10-20T10:00:00Z" })));

        await waitFor(() => expect(result.current.has("b")).toBe(false));
        expect([...result.current.keys()]).toEqual(["a"]);
    });

    it("refetches after a reconnect, and closes the channel on unmount", async () => {
        const { unmount } = await mounted([order("a", "confirmed")]);
        const status = H.statusCallbacks[0];

        act(() => status("SUBSCRIBED"));
        expect(H.findByIds).toHaveBeenCalledTimes(1);
        act(() => status("CHANNEL_ERROR", new Error("socket")));
        act(() => status("SUBSCRIBED"));
        await waitFor(() => expect(H.findByIds).toHaveBeenCalledTimes(2));

        unmount();
        expect(H.removed).toBe(1);
    });
});
