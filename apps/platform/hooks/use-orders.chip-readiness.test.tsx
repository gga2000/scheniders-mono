import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order, OrderFilters } from "@/lib/supabase";

/**
 * When the counts may be shown. They are taken over the loaded rows, so they
 * are only true while those rows are the whole of the filter's window and the
 * list on screen is the hook's list: not while searching, and not while the
 * cache still holds another window (first load, a window change in flight,
 * cancelled or failed). Then they are hidden — never filled in from
 * get_orders_aggregates, which is held until the saved filter is applied.
 *
 * Drives the real useOrders composition, like the parity oracle.
 */

const TODAY_FROM = "2026-10-19";
type Snapshot = { ready: boolean; statusIsAll: boolean; rows: number; delivered: number; listLength: number };

const H = vi.hoisted(() => ({
    db: [] as Array<Record<string, unknown>>,
    filters: {} as Record<string, unknown>,
    settled: true,
    setFilters: null as null | ((f: Record<string, unknown>) => void),
    setSettled: null as null | ((s: boolean) => void),
    search: { active: false, orders: null as null | unknown[] },
    findWindow: vi.fn(),
    rpcCalls: 0,
}));

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
            if (name === "get_orders_aggregates") H.rpcCalls++;
            return { data: { status_counts: {}, stats: {}, cities: [], products: [], total_risk_count: 0 }, error: null };
        },
        from: () => chain(),
    },
}));
vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: {
        findWindow: H.findWindow,
        findLatestUpdatedAt: async () => "2026-10-19T08:00:00.000Z",
        findChangedSince: async () => [],
        findArchived: async () => [],
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
            const [settled, setSettled] = useState(H.settled);
            H.setFilters = setFilters as (f: Record<string, unknown>) => void;
            H.setSettled = setSettled;
            return { filters, setFilters, clearFilters: () => setFilters({ status: "all" } as OrderFilters), filtersSettled: settled };
        },
    };
});
vi.mock("@/hooks/use-order-realtime", () => ({ useOrderRealtime: () => ({ batcherRef: { current: null } }) }));
vi.mock("@/hooks/use-realtime-heartbeat", () => ({ useRealtimeHeartbeat: () => undefined }));
vi.mock("@/hooks/use-app-lifecycle", () => ({ useAppLifecycle: () => undefined }));
vi.mock("@/hooks/use-server-order-search", () => ({
    useServerOrderSearch: () => ({ active: H.search.active, orders: H.search.orders, pending: false, isFetching: false, error: null }),
}));
vi.mock("@/hooks/use-order-auxiliary", () => ({
    useOrderAuxiliary: () => ({ stats: {}, rejectionReasons: [], messageTemplates: [] }),
}));
vi.mock("@/hooks/use-duplicate-window-alerts", () => ({
    duplicateCandidateKeys: { all: ["orders", "list", "duplicate-candidates"] },
    useDuplicateWindowAlerts: () => ({ getDuplicateWindowAlert: () => null, getConfirmBlockingTwin: () => null, duplicateCandidates: [] }),
}));
vi.mock("@/lib/inventory-engine", () => ({ deductSupplies: () => undefined, quarantineOrder: () => undefined, removeFromQuarantine: () => undefined }));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn(), splitOrderAction: vi.fn(), unsplitOrderAction: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useOrders } from "./use-orders";

function row(i: number, status: string, createdAt: string): Record<string, unknown> {
    return {
        id: `o-${status}-${createdAt}-${i}`,
        tenant_id: "tenant-1",
        order_id: `LF-${i}`,
        customer_name: "x",
        phone: `0770${String(i).padStart(7, "0")}`,
        items: [],
        price: 1,
        status,
        priority: "normal",
        payment_status: "cod",
        created_at: createdAt,
        updated_at: createdAt,
        version: 1,
        is_return: false,
        is_replacement: false,
        is_archived: false,
    };
}

/** Rows a window holds: Today = created on 2026-10-19 (Baghdad), All = everything. */
function rowsFor(window: { fromInstant: number; toInstant: number } | null): Order[] {
    return H.db
        .filter((r) => !window || (Date.parse(r.created_at as string) >= window.fromInstant && Date.parse(r.created_at as string) <= window.toInstant))
        .map((r) => ({ ...r })) as unknown as Order[];
}

function deferred<T>() {
    let resolve: (v: T) => void = () => {};
    let reject: (e: unknown) => void = () => {};
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const renders: Snapshot[] = [];
    const hook = renderHook(() => {
        const v = useOrders();
        renders.push({
            ready: v.countViewFacts.ready,
            statusIsAll: v.countViewFacts.statusIsAll,
            rows: v.orders.length,
            delivered: v.statusCounts.delivered,
            listLength: v.filteredOrders.length,
        });
        return v;
    }, { wrapper });
    return { ...hook, renders, client };
}

beforeEach(() => {
    H.filters = { status: "all", dateFrom: TODAY_FROM, dateTo: TODAY_FROM };
    H.settled = true;
    H.search = { active: false, orders: null };
    H.rpcCalls = 0;
    H.db = [
        ...Array.from({ length: 3 }, (_, i) => row(i, "delivered", "2026-10-19T08:00:00.000Z")),
        ...Array.from({ length: 5 }, (_, i) => row(i, "delivered", "2026-10-01T08:00:00.000Z")),
        ...Array.from({ length: 2 }, (_, i) => row(i, "new", "2026-10-01T08:00:00.000Z")),
    ];
    H.findWindow.mockReset().mockImplementation(async (_t: string, w: { fromInstant: number; toInstant: number } | null) => rowsFor(w));
    sessionStorage.clear();
});

// Each test drives the latest mount through H.setFilters; unmount the previous one.
afterEach(cleanup);

describe("count readiness", () => {
    it("is ready once the window's rows are loaded, and the chips equal the list", async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.countViewFacts.ready).toBe(true));
        expect(result.current.statusCounts.all).toBe(3);
        expect(result.current.filteredOrders.length).toBe(3);
    });

    it("is not ready while searching", async () => {
        H.search = { active: true, orders: [] };
        const { result } = mount();
        await waitFor(() => expect(result.current.orders.length).toBe(3));
        expect(result.current.countViewFacts.ready).toBe(false);
    });

    it("hides the counts during a window change until the new window's rows land — no ready render holds Today's rows under All", async () => {
        const { result, renders } = mount();
        await waitFor(() => expect(result.current.countViewFacts.ready).toBe(true));

        const all = deferred<Order[]>();
        H.findWindow.mockImplementationOnce(() => all.promise);
        act(() => { H.setFilters?.({ status: "all" }); });
        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(2));
        await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
        expect(result.current.countViewFacts.ready).toBe(false);

        const from = renders.length;
        await act(async () => { all.resolve(rowsFor(null)); await all.promise; });
        await waitFor(() => expect(result.current.countViewFacts.ready).toBe(true));
        expect(result.current.statusCounts.all).toBe(10);
        // Across the whole switch: a ready render always has the All rows.
        for (const r of renders.slice(from)) if (r.ready) expect(r.rows).toBe(10);
        for (const r of renders) if (r.ready) expect(r.listLength).toBe(r.rows);
    });

    it("a window change during the first load cancels it and fetches the new window once", async () => {
        const first = deferred<Order[]>();
        H.findWindow.mockImplementationOnce(() => first.promise);
        const { result } = mount();
        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(1));

        act(() => { H.setFilters?.({ status: "all" }); });
        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(2));
        expect(H.findWindow.mock.calls[1][1]).toBeNull();
        first.resolve(rowsFor({ fromInstant: Date.parse("2026-10-18T21:00:00.000Z"), toInstant: Date.parse("2026-10-19T20:59:59.999Z") }));

        await waitFor(() => expect(result.current.countViewFacts.ready).toBe(true));
        expect(result.current.orders.length).toBe(10);
        await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
        expect(H.findWindow).toHaveBeenCalledTimes(2);
    });

    it("when the active window's own fetch fails, counts stay hidden and the reconciler does not retry it", { timeout: 12_000 }, async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.countViewFacts.ready).toBe(true));
        H.findWindow.mockImplementation(async () => { throw new Error("boom"); });
        act(() => { H.setFilters?.({ status: "all" }); });
        // useOrdersQuery retries twice (1s, 2s) before the error stands.
        await waitFor(() => expect(result.current.error).toBe("boom"), { timeout: 6_000 });
        const calls = H.findWindow.mock.calls.length;
        await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
        expect(H.findWindow.mock.calls.length).toBe(calls);
        expect(result.current.countViewFacts.ready).toBe(false);
    });

    it("a status switch moves statusIsAll in the same render as the list", async () => {
        H.db.push(row(9, "new", "2026-10-19T09:00:00.000Z")); // Today: 3 delivered + 1 new
        const { result, renders } = mount();
        await waitFor(() => expect(result.current.countViewFacts.ready).toBe(true));
        act(() => { H.setFilters?.({ status: "delivered", dateFrom: TODAY_FROM, dateTo: TODAY_FROM }); });
        await waitFor(() => expect(result.current.countViewFacts.statusIsAll).toBe(false));
        act(() => { H.setFilters?.({ status: "all", dateFrom: TODAY_FROM, dateTo: TODAY_FROM }); });
        await waitFor(() => expect(result.current.countViewFacts.statusIsAll).toBe(true));
        // Every render that shows a list pairs statusIsAll with the all-status
        // list (4) and its absence with the delivered list (3).
        const shown = renders.filter((r) => r.listLength > 0);
        expect(shown.some((r) => !r.statusIsAll)).toBe(true);
        for (const r of shown) expect({ statusIsAll: r.statusIsAll, list: r.listLength }).toEqual({ statusIsAll: r.statusIsAll, list: r.statusIsAll ? 4 : 3 });
    });
});

describe("get_orders_aggregates on the orders page", () => {
    it("is not called while the saved filter is unsettled, then once", async () => {
        H.settled = false;
        mount();
        await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
        expect(H.rpcCalls).toBe(0);
        act(() => { H.setSettled?.(true); });
        await waitFor(() => expect(H.rpcCalls).toBe(1));
        await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
        expect(H.rpcCalls).toBe(1);
    });
});
