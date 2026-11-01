import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order, OrderFilters } from "@/lib/supabase";
import type { OrderListPreview } from "@/lib/orders/list-preview";
import type { ListReadOptions } from "@/lib/repositories/order-repository";

/**
 * All Orders paints its head (the newest rows and every pinned row) before the
 * whole book has loaded. The preview is a separate, read-only value: the list
 * (`filteredOrders`), every count and "act on everything" stay exactly as
 * they were while the window loads — empty, hidden and refused — and the
 * preview disappears in the same render the full list arrives.
 *
 * Drives the real useOrders composition, like the chip-readiness suite.
 */

type Snapshot = {
    ready: boolean;
    covered: boolean;
    complete: boolean;
    preview: number | null;
    list: number;
};

const H = vi.hoisted(() => ({
    db: [] as Array<Record<string, unknown>>,
    filters: {} as Record<string, unknown>,
    setFilters: null as null | ((f: Record<string, unknown>) => void),
    search: { active: false, orders: null as null | unknown[] },
    findWindow: vi.fn(),
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
        rpc: async () => ({ data: { status_counts: {}, stats: {}, cities: [], products: [], total_risk_count: 0 }, error: null }),
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
            H.setFilters = setFilters as (f: Record<string, unknown>) => void;
            return { filters, setFilters, clearFilters: () => setFilters({ status: "all" } as OrderFilters), filtersSettled: true };
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
vi.mock("@/lib/inventory-engine", () => ({ deductSupplies: () => undefined }));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn(), splitOrderAction: vi.fn(), unsplitOrderAction: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { useOrders } from "./use-orders";

function row(i: number, status: string): Record<string, unknown> {
    const at = new Date(Date.parse("2026-10-19T08:00:00.000Z") - i * 60_000).toISOString();
    return {
        id: `o${String(1000 - i).padStart(4, "0")}`,
        tenant_id: "tenant-1",
        order_id: `LF-${i}`,
        customer_name: "x",
        phone: `0770${String(i).padStart(7, "0")}`,
        items: [],
        price: 1,
        status,
        priority: "normal",
        payment_status: "cod",
        created_at: at,
        updated_at: at,
        version: 1,
        is_return: false,
        is_replacement: false,
        is_archived: false,
        is_pinned: false,
    };
}

const book = (): Order[] => H.db.map((r) => ({ ...r })) as unknown as Order[];

function headOf(rows: Order[], n = 5): OrderListPreview {
    return { rows: rows.slice(0, n), newestCutoff: rows[n - 1].created_at, total: rows.length, withRisk: false };
}

function deferred<T>() {
    let resolve: (v: T) => void = () => {};
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
}

function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const renders: Snapshot[] = [];
    const hook = renderHook(() => {
        const v = useOrders();
        renders.push({
            ready: v.countViewFacts.ready,
            covered: v.listCovered,
            complete: v.ordersAreComplete,
            preview: v.listPreview ? v.listPreview.rows.length : null,
            list: v.filteredOrders.length,
        });
        return v;
    }, { wrapper });
    return { ...hook, renders, client };
}

/** A list fetch that publishes `preview`, then waits for the test to release the full rows. */
function heldFetchWithPreview(preview: OrderListPreview) {
    const full = deferred<Order[]>();
    H.findWindow.mockImplementationOnce(async (_t: string, _w: unknown, opts: ListReadOptions = {}) => {
        opts.onPreview?.(preview);
        return full.promise;
    });
    return full;
}

beforeEach(() => {
    H.filters = { status: "all" };
    H.search = { active: false, orders: null };
    H.db = [
        ...Array.from({ length: 8 }, (_, i) => row(i, i % 2 === 0 ? "delivered" : "new")),
    ];
    H.findWindow.mockReset().mockImplementation(async () => book());
    sessionStorage.clear();
});

afterEach(cleanup);

describe("All Orders list preview", () => {
    it("shows the head while the book loads — list, counts and act-on-everything untouched — and drops it as the book lands", async () => {
        const full = heldFetchWithPreview(headOf(book()));
        const { result, renders } = mount();

        await waitFor(() => expect(result.current.listPreview?.rows.length).toBe(5));
        expect(result.current.filteredOrders).toEqual([]);
        expect(result.current.listCovered).toBe(false);
        expect(result.current.countViewFacts.ready).toBe(false);
        // window = null ("All") used to read as complete before anything loaded.
        expect(result.current.ordersAreComplete).toBe(false);

        const from = renders.length;
        await act(async () => { full.resolve(book()); await full.promise; });
        await waitFor(() => expect(result.current.listCovered).toBe(true));
        expect(result.current.listPreview).toBeNull();
        expect(result.current.ordersAreComplete).toBe(true);
        expect(result.current.filteredOrders.length).toBe(8);

        // No render shows a preview beside a covered list, or counts beside a preview.
        for (const r of renders) {
            if (r.preview !== null) expect({ covered: r.covered, ready: r.ready, complete: r.complete, list: r.list })
                .toEqual({ covered: false, ready: false, complete: false, list: 0 });
            if (r.covered) expect(r.preview).toBeNull();
        }
        // The swap is one render: from the preview straight to the full list.
        const after = renders.slice(from);
        expect(after.some((r) => r.preview === null && !r.covered)).toBe(false);
    });

    it("filters the head with the list's own filter", async () => {
        H.filters = { status: "delivered" };
        const full = heldFetchWithPreview(headOf(book()));
        const { result } = mount();
        await waitFor(() => expect(result.current.listPreview).not.toBeNull());
        expect(result.current.listPreview?.rows.map((r) => r.status)).toEqual(["delivered", "delivered", "delivered"]);
        await act(async () => { full.resolve(book()); await full.promise; });
    });

    it("is not shown while searching: the list is the server's hits", async () => {
        H.search = { active: true, orders: [] };
        const full = heldFetchWithPreview(headOf(book()));
        const { result } = mount();
        await waitFor(() => expect(H.findWindow).toHaveBeenCalled());
        await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
        expect(result.current.listPreview).toBeNull();
        await act(async () => { full.resolve(book()); await full.promise; });
    });

    it("a head a refetch reads for a window the list already covers is never shown", async () => {
        const { result, client } = mount();
        await waitFor(() => expect(result.current.listCovered).toBe(true));
        const full = heldFetchWithPreview(headOf(book()));
        await act(async () => { void client.refetchQueries({ queryKey: ["orders", "list"], exact: true }); });
        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(2));
        await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
        expect(result.current.listPreview).toBeNull();
        expect(client.getQueryCache().findAll({ queryKey: ["orders", "preview"] }).every((q) => q.state.data === undefined)).toBe(true);
        await act(async () => { full.resolve(book()); await full.promise; });
    });

    it("a window change to All shows All's head instead of the previous window's rows", async () => {
        H.filters = { status: "all", dateFrom: "2026-10-19", dateTo: "2026-10-19" };
        const { result } = mount();
        await waitFor(() => expect(result.current.listCovered).toBe(true));
        const full = heldFetchWithPreview(headOf(book(), 3));
        act(() => { H.setFilters?.({ status: "all" }); });
        await waitFor(() => expect(result.current.listPreview?.rows.length).toBe(3));
        expect(result.current.listCovered).toBe(false);
        expect(result.current.ordersAreComplete).toBe(false);
        await act(async () => { full.resolve(book()); await full.promise; });
        await waitFor(() => expect(result.current.listCovered).toBe(true));
        expect(result.current.listPreview).toBeNull();
    });
});
