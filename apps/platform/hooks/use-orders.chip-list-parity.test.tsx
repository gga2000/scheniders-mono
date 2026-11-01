import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order, OrderFilters } from "@/lib/supabase";

/**
 * Production, 2026-10-17, tenant b5c4…: filter "All Orders" + chip "تم التوصيل"
 * (delivered). The chip read 219, the header above the list read 119.
 *
 * order_status_history shows two "Bulk update to completed" runs from the
 * page: 100 delivered orders at 21:42:35–21:43:36 UTC, then 119 more at
 * 21:46:13–21:47:47. Between them the database held exactly 119 delivered
 * orders — the LIST was right. The chip was the pre-bulk snapshot: every chip
 * the merchant reported (all 5173, completed 2885, rejected 556, in_transit 37)
 * reconciles to the state before 21:42, not after.
 *
 * Cause: the chips come from `get_orders_aggregates` under the query key
 * ["orders","aggregates",params], while every list mutation (bulk status,
 * single status, realtime, delta sync) writes or invalidates only
 * ["orders","list"]. Nothing ever invalidates the aggregates, and `status` is
 * not in their key, so clicking chips does not refetch them either. They stay
 * at whatever the server said when the filter was last changed.
 *
 * This drives the real composition (`useOrders`): real useOrdersQuery,
 * useOrderFilters, useOrdersAggregates and useOrderCrud.bulkUpdateStatus over
 * a fake database. Only I/O and unrelated side-panels are stubbed.
 */

type Row = Order & { deleted_at?: string | null };

const H = vi.hoisted(() => ({
    db: [] as Array<Record<string, unknown>>,
    filters: { status: "delivered" } as Record<string, unknown>,
}));

function activeRows() {
    return H.db.filter((o) => !o.is_archived && !o.deleted_at);
}

/** What `get_orders_aggregates` returns for an unfiltered "All Orders" call (live definition, 2026-10-18). */
function serverStatusCounts() {
    const scope = activeRows();
    const n = (pred: (o: Record<string, unknown>) => boolean) => scope.filter(pred).length;
    return {
        all: scope.length,
        new: n((o) => o.status === "new"),
        contacted: n((o) => o.status === "contacted"),
        confirmed: n((o) => o.status === "confirmed" || o.status === "return_pending"),
        cancelled: n((o) => o.status === "cancelled"),
        in_transit: n((o) => o.status === "in_transit"),
        delivered: n((o) => o.status === "delivered"),
        completed: n((o) => o.status === "completed"),
        rejected: n((o) => o.status === "rejected"),
        no_response: n((o) => o.status === "no_response"),
        return_pending: n((o) => o.status === "return_pending"),
        refund_delivered: n((o) => o.status === "refund_delivered"),
        refund_failed: n((o) => o.status === "refund_failed"),
        refunds: n((o) => ["return_pending", "refund_delivered", "refund_failed"].includes(o.status as string)),
        pending_checkout: n((o) => o.status === "pending_checkout"),
        suspended: n((o) => o.status === "suspended"),
    };
}

/** A chainable, awaitable PostgREST stand-in for the incidental reads (filter presets, history insert). */
function chain(): unknown {
    const result = Promise.resolve({ data: [], error: null, count: 0 });
    const proxy: unknown = new Proxy(function () {}, {
        get(_t, prop) {
            if (prop === "then") return result.then.bind(result);
            if (prop === "catch") return result.catch.bind(result);
            if (prop === "finally") return result.finally.bind(result);
            return () => proxy;
        },
        apply() {
            return proxy;
        },
    });
    return proxy;
}

vi.mock("@/lib/supabase", () => ({
    supabase: {
        rpc: async (name: string) => {
            if (name !== "get_orders_aggregates") return { data: null, error: null };
            return {
                data: { status_counts: serverStatusCounts(), stats: {}, cities: [], products: [], total_risk_count: 0 },
                error: null,
            };
        },
        from: () => chain(),
    },
}));

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: {
        findWindow: async () => activeRows().map((o) => ({ ...o })),
        findArchived: async () => [],
        // The real one writes in sequential batches and reports each batch; one batch is enough here.
        bulkUpdateStatus: async (
            ids: string[],
            status: string,
            _reason: unknown,
            _by: unknown,
            _avatar: unknown,
            _versions: unknown,
            hooks?: { onBatchSettled?: (o: { succeeded: { id: string; order: Order }[]; failed: [] }) => Promise<void> | void },
        ) => {
            const succeeded: { id: string; order: Order }[] = [];
            for (const id of ids) {
                const row = H.db.find((o) => o.id === id);
                if (!row) continue;
                row.status = status;
                row.completed_at = status === "completed" ? "2026-10-17T21:42:35.000Z" : row.completed_at;
                row.version = ((row.version as number) ?? 1) + 1;
                succeeded.push({ id, order: { ...row } as unknown as Order });
            }
            await hooks?.onBatchSettled?.({ succeeded, failed: [] });
            return { successfulOperations: succeeded, failedOperations: [] };
        },
    },
}));

vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({
        session: { access_token: "t" },
        clientReady: true,
        tenantId: "tenant-1",
        user: { id: "u1", email: "m@example.com" },
        profile: { display_name: "Merchant" },
    }),
}));

vi.mock("@/hooks/use-order-filter-state", async () => {
    const { useState } = await import("react");
    return {
        useOrderFilterState: () => {
            const [filters, setFilters] = useState(H.filters as OrderFilters);
            return { filters, setFilters, clearFilters: () => setFilters({ status: "all" } as OrderFilters), filtersSettled: true };
        },
    };
});

// Side panels the chip/list numbers do not depend on.
vi.mock("@/hooks/use-order-realtime", () => ({ useOrderRealtime: () => ({ batcherRef: { current: null } }) }));
vi.mock("@/hooks/use-realtime-heartbeat", () => ({ useRealtimeHeartbeat: () => undefined }));
vi.mock("@/hooks/use-app-lifecycle", () => ({ useAppLifecycle: () => undefined }));
vi.mock("@/hooks/use-server-order-search", () => ({
    useServerOrderSearch: () => ({ active: false, orders: null, pending: false, isFetching: false, error: null }),
}));
vi.mock("@/hooks/use-order-auxiliary", () => ({
    useOrderAuxiliary: () => ({ stats: {}, rejectionReasons: [], messageTemplates: [] }),
}));
vi.mock("@/hooks/use-duplicate-window-alerts", () => ({
    duplicateCandidateKeys: { all: ["duplicate-candidates"] },
    useDuplicateWindowAlerts: () => ({
        getDuplicateWindowAlert: () => null,
        getConfirmBlockingTwin: () => null,
        duplicateCandidates: [],
    }),
}));
vi.mock("@/lib/inventory-engine", () => ({
    deductSupplies: () => undefined,
}));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn(), splitOrderAction: vi.fn(), unsplitOrderAction: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { useOrders } from "./use-orders";

function row(i: number, status: string): Row {
    return {
        id: `o-${status}-${i}`,
        tenant_id: "tenant-1",
        order_id: `LF-${status}-${i}`,
        customer_name: "x",
        phone: `0770${String(i).padStart(7, "0")}`,
        items: [],
        price: 25000,
        status,
        priority: "normal",
        payment_status: "cod",
        created_at: new Date(Date.parse("2026-10-14T21:00:00.000Z") - i * 60_000).toISOString(),
        updated_at: "2026-10-14T21:00:00.000Z",
        version: 1,
        is_return: false,
        is_archived: false,
        deleted_at: null,
    } as unknown as Row;
}

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    H.filters = { status: "delivered" };
    H.db = [
        ...Array.from({ length: 219 }, (_, i) => row(i, "delivered")),
        ...Array.from({ length: 30 }, (_, i) => row(i, "completed")),
    ] as unknown as Array<Record<string, unknown>>;
    sessionStorage.clear();
});

describe("orders page: status chip count vs list count, All Orders", () => {
    it("agree before anything changes (219 / 219)", async () => {
        const { result } = renderHook(() => useOrders(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.filteredOrders.length).toBe(219));
        await waitFor(() => expect(result.current.statusCounts.delivered).toBe(219));
    });

    it("still agree after the merchant bulk-completes 100 of the delivered orders", async () => {
        const { result } = renderHook(() => useOrders(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.filteredOrders.length).toBe(219));
        await waitFor(() => expect(result.current.statusCounts.delivered).toBe(219));

        const first100 = result.current.filteredOrders.slice(0, 100).map((o) => o.id);
        await act(async () => {
            await result.current.bulkUpdateStatus(first100, "completed", { notify: false });
        });

        // The list is right: the database now holds 119 delivered orders.
        await waitFor(() => expect(result.current.filteredOrders.length).toBe(119));
        expect(activeRows().filter((o) => o.status === "delivered")).toHaveLength(119);

        // The chip for the same filter state must say the same. On main it
        // stays at the pre-bulk 219: nothing invalidates ["orders","aggregates"].
        await waitFor(
            () => expect(result.current.statusCounts.delivered).toBe(result.current.filteredOrders.length),
            { timeout: 1500 },
        );
        expect(result.current.statusCounts.completed).toBe(130);
    });
});
