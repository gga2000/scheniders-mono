import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";

/**
 * A status change used to re-download the whole window 2s later. It now
 * catches up with one delta from the sync watermark, merged into the main list
 * and the duplicate margin, then marks the search stale. These drive the real useOrderCrud.updateOrderStatus,
 * useUpdateStatusMutation, useOrdersQuery and RealtimeBatcher over a fake DB
 * that reproduces the two writes a status change makes: the PATCH
 * (version base+1) and the order_status_history insert, whose trigger
 * (update_order_last_actor) writes the row again (base+2, updated_at moves).
 */

const TENANT = "tenant-1";

type DbRow = Order & { net_profit?: number; deleted_at?: string | null; waseet_qr_id?: string | null };

const H = vi.hoisted(() => ({
    db: [] as Record<string, unknown>[],
    clock: 0,
    tenantId: "tenant-1" as string | null,
    findWindow: vi.fn(),
    findChangedSince: vi.fn(),
    findLatestUpdatedAt: vi.fn(),
    updateStatus: vi.fn(),
    historyInsert: vi.fn(),
    holdDelta: null as null | Promise<void>,
}));

/** Server time: each write is a second later. */
function tick(): string {
    H.clock += 1000;
    return new Date(Date.parse("2026-10-19T08:00:00.000Z") + H.clock).toISOString();
}
const dbRow = (id: string) => H.db.find((r) => r.id === id) as Record<string, unknown>;
/** What findChangedSince returns: the list columns plus deleted_at, trashed rows included. */
const deltaShape = (r: Record<string, unknown>) => ({ ...listShape(r), deleted_at: r.deleted_at ?? null }) as unknown as Order;
const listShape = (r: Record<string, unknown>) => {
    const copy = { ...r };
    delete copy.net_profit;
    delete copy.deleted_at;
    delete copy.waseet_qr_id;
    return copy as unknown as Order;
};

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: {
        findWindow: H.findWindow,
        findChangedSince: H.findChangedSince,
        findLatestUpdatedAt: H.findLatestUpdatedAt,
        updateStatus: H.updateStatus,
    },
}));
vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: (table: string) => ({
            insert: async (rows: Record<string, unknown>[]) => {
                if (table === "order_status_history") return H.historyInsert(rows);
                return { error: null };
            },
        }),
        rpc: async () => ({ data: null, error: null }),
    },
}));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({
        session: { access_token: "t" },
        clientReady: true,
        tenantId: H.tenantId,
        user: { id: "u1", email: "staff@example.com" },
        profile: { display_name: "Staff" },
    }),
}));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn(), splitOrderAction: vi.fn(), unsplitOrderAction: vi.fn() }));
vi.mock("@/lib/activity-logger", () => ({ activityLogger: { log: vi.fn(), logStatusChange: vi.fn(), logOrderCreate: vi.fn() } }));
vi.mock("@/lib/inventory-engine", () => ({ deductSupplies: vi.fn(), quarantineOrder: vi.fn(), removeFromQuarantine: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RealtimeBatcher } from "@/lib/realtime-batcher";
import { belongsInWindow, type OrderWindow } from "@/lib/order-window";
import { useOrderCrud } from "./use-order-crud";
import { useDuplicateWindowAlerts } from "./use-duplicate-window-alerts";
import { orderKeys, requestOrdersCatchUp, setOrderBatcher, useOrdersQuery, useUpdateStatusMutation } from "./use-orders-query";

const SEARCH_KEY = [...orderKeys.lists(), "search", "0770", 20] as const;
/** The Baghdad day 2026-10-19, which the seeded orders were placed on. */
const TODAY = {
    fromInstant: Date.parse("2026-10-18T21:00:00.000Z"),
    toInstant: Date.parse("2026-10-19T20:59:59.999Z"),
    fromDay: "2026-10-19",
    toDay: "2026-10-19",
} satisfies NonNullable<OrderWindow>;

function seed(id: string, version: number, extra: Partial<DbRow> = {}): Record<string, unknown> {
    return {
        id,
        tenant_id: TENANT,
        order_id: id,
        customer_name: "x",
        phone: "07701112222",
        items: [],
        price: 1,
        status: "new",
        priority: "normal",
        payment_status: "cod",
        created_at: "2026-10-19T07:00:00.000Z",
        updated_at: "2026-10-19T07:00:00.000Z",
        version,
        is_return: false,
        is_replacement: false,
        is_archived: false,
        risk_data: { level: "low", score: 1 },
        net_profit: 900,
        deleted_at: null,
        waseet_qr_id: "QR-1",
        ...extra,
    };
}

async function mount() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const batcher = new RealtimeBatcher({ queryClient: qc, queryKey: orderKeys.lists(), flushDelayMs: 1, getWindow: () => null });
    setOrderBatcher(batcher);
    // A search result row carries columns the list does not (deleted_at, waseet_qr_id).
    qc.setQueryData(SEARCH_KEY, [{ ...listShape(dbRow("o1")), deleted_at: null, waseet_qr_id: "QR-1" }]);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => {
        const list = useOrdersQuery(null, true);
        const crud = useOrderCrud({ orders: list.data ?? [] });
        return { list, crud };
    }, { wrapper });
    await waitFor(() => expect(result.current.list.data?.length).toBe(H.db.length));
    return { qc, batcher, result };
}

const cached = (qc: QueryClient, id: string) => qc.getQueryData<Order[]>(orderKeys.lists())?.find((o) => o.id === id);

beforeEach(() => {
    H.clock = 0;
    H.tenantId = TENANT;
    H.holdDelta = null;
    H.db = [seed("o1", 4), seed("o2", 1, { phone: "07703334444" })];
    H.findWindow.mockReset().mockImplementation(async (_tenant: string, w: OrderWindow) =>
        H.db.filter((r) => !r.deleted_at && belongsInWindow(r as unknown as Order, w)).map(listShape));
    H.findLatestUpdatedAt.mockReset().mockImplementation(async () => H.db.map((r) => r.updated_at as string).sort().at(-1) ?? null);
    H.findChangedSince.mockReset().mockImplementation(async (_tenant: string, since: string) => {
        if (H.holdDelta) await H.holdDelta;
        // Like the real select: every changed row, trashed ones included, with deleted_at.
        return H.db.filter((r) => (r.updated_at as string) >= since).map(deltaShape);
    });
    H.updateStatus.mockReset().mockImplementation(async (id: string, status: string, _reason: unknown, by: string, _avatar: unknown, expectedVersion?: number) => {
        const row = dbRow(id);
        if (typeof expectedVersion === "number" && row.version !== expectedVersion) throw new Error("CONFLICT_DETECTED");
        Object.assign(row, { status, version: (row.version as number) + 1, updated_at: tick(), last_status_changed_by_name: by });
        return { ...row } as unknown as Order; // select(): every column, net_profit included
    });
    H.historyInsert.mockReset().mockImplementation(async (rows: Record<string, unknown>[]) => {
        // trigger_update_order_last_actor: a second UPDATE of the order.
        const row = dbRow(rows[0].order_id as string);
        Object.assign(row, { version: (row.version as number) + 1, updated_at: tick(), last_status_changed_by_name: `${rows[0].changed_by} (actor)` });
        return { error: null };
    });
    sessionStorage.clear();
});

afterEach(() => setOrderBatcher(null));

describe("status change catch-up (replaces the 2s full refetch)", () => {
    it("lands the trigger's base+2 write without refetching the window", async () => {
        const { qc, result } = await mount();
        const windowFetches = H.findWindow.mock.calls.length;

        let outcome: { success: boolean } | undefined;
        await act(async () => { outcome = await result.current.crud.updateOrderStatus("o1", "confirmed"); });
        expect(outcome?.success).toBe(true);

        await waitFor(() => expect(cached(qc, "o1")?.version).toBe(6));
        expect(cached(qc, "o1")).toMatchObject({ status: "confirmed", last_status_changed_by_name: "Staff (actor)" });
        // The old refetch fired at 2s: wait past it.
        await act(async () => { await new Promise((r) => setTimeout(r, 2_300)); });
        expect(H.findWindow.mock.calls.length).toBe(windowFetches);
        expect(H.findChangedSince).toHaveBeenCalledTimes(1);
        // The search row was patched (keeping its own columns), and no margin
        // column entered any cache.
        const search = qc.getQueryData<Record<string, unknown>[]>(SEARCH_KEY)?.[0];
        expect(search).toMatchObject({ status: "confirmed", deleted_at: null, waseet_qr_id: "QR-1" });
        for (const rows of qc.getQueriesData<Record<string, unknown>[]>({ queryKey: orderKeys.lists() }).map(([, d]) => d ?? [])) {
            for (const r of rows) expect(r).not.toHaveProperty("net_profit");
        }
    }, 10_000);

    it("with realtime silent, a second change on the same order is based on base+2 and does not conflict", async () => {
        const { qc, result } = await mount();
        await act(async () => { await result.current.crud.updateOrderStatus("o1", "confirmed"); });
        let second: { success: boolean; error?: string } | undefined;
        await act(async () => { second = await result.current.crud.updateOrderStatus("o1", "in_transit"); });
        expect(second).toEqual({ success: true });
        expect(H.updateStatus.mock.calls[1][5]).toBe(6);
        await waitFor(() => expect(cached(qc, "o1")).toMatchObject({ status: "in_transit", version: 8 }));
    });

    it("a second change waits for a catch-up requested while another delta was in flight", async () => {
        const { qc, result } = await mount();
        // A mutation-cancel delta is in flight when our status change lands.
        let release: () => void = () => {};
        H.holdDelta = new Promise<void>((r) => { release = r; });
        const inFlight = requestOrdersCatchUp(qc, TENANT, { source: "mutationCancel" });
        await waitFor(() => expect(H.findChangedSince).toHaveBeenCalledTimes(1));

        await act(async () => { await result.current.crud.updateOrderStatus("o1", "confirmed"); });
        let second: Promise<{ success: boolean }> = Promise.resolve({ success: false });
        act(() => { second = result.current.crud.updateOrderStatus("o1", "in_transit"); });
        await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
        // The second change has not fired: its base version is still arriving.
        expect(H.updateStatus).toHaveBeenCalledTimes(1);

        H.holdDelta = null;
        release();
        await act(async () => { await inFlight; await second; });
        expect(await second).toEqual({ success: true });
        expect(H.updateStatus.mock.calls[1][5]).toBe(6);
        // The in-flight delta, then exactly one follow-up carrying our write
        // (and a third for the second change's own catch-up).
        expect(H.findChangedSince.mock.calls.length).toBe(3);
    }, 10_000);

    it("a same-window refresh cancelled by the change is caught up by delta, not re-downloaded", async () => {
        const { qc, result } = await mount();
        let releaseFetch: () => void = () => {};
        H.findWindow.mockImplementationOnce(() => new Promise<Order[]>((r) => { releaseFetch = () => r(H.db.map(listShape)); }));
        void qc.refetchQueries({ queryKey: orderKeys.lists(), exact: true });
        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(2));

        await act(async () => { await result.current.crud.updateOrderStatus("o1", "confirmed"); });
        releaseFetch(); // the cancelled fetch finishes downloading and is discarded
        await waitFor(() => expect(cached(qc, "o1")?.version).toBe(6));
        await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
        expect(H.findWindow).toHaveBeenCalledTimes(2);
        // The flush's delta (at settle) and the status catch-up (after the
        // history row) — the second joins a follow-up, as its write may be newer.
        expect(H.findChangedSince).toHaveBeenCalledTimes(2);
    });

    it("a window-change fetch cancelled by the change is refetched once, after it settles", async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        setOrderBatcher(new RealtimeBatcher({ queryClient: qc, queryKey: orderKeys.lists(), flushDelayMs: 1, getWindow: () => null }));
        const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
        const TODAY = { fromInstant: Date.parse("2026-10-18T21:00:00.000Z"), toInstant: Date.parse("2026-10-19T20:59:59.999Z"), fromDay: "2026-10-19", toDay: "2026-10-19" };
        const { result, rerender } = renderHook(({ w }: { w: typeof TODAY | null }) => {
            const list = useOrdersQuery(w, true);
            return { list, crud: useOrderCrud({ orders: list.data ?? [] }) };
        }, { wrapper, initialProps: { w: TODAY as typeof TODAY | null } });
        await waitFor(() => expect(result.current.list.data?.length).toBe(2));

        let releaseAll: () => void = () => {};
        H.findWindow.mockImplementationOnce(() => new Promise<Order[]>((r) => { releaseAll = () => r(H.db.map(listShape)); }));
        rerender({ w: null }); // Today → All Orders
        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(2));

        await act(async () => { await result.current.crud.updateOrderStatus("o1", "confirmed"); });
        releaseAll();
        // The cancelled All fetch never claimed the window; the reconciler
        // fetches All exactly once more.
        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(3));
        expect(H.findWindow.mock.calls[2]).toEqual([TENANT, null, { onPreview: expect.any(Function) }]);
        await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
        expect(H.findWindow).toHaveBeenCalledTimes(3);
    });

    it("a status change made outside useOrderCrud (the chat callers) still runs one catch-up", async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        setOrderBatcher(new RealtimeBatcher({ queryClient: qc, queryKey: orderKeys.lists(), flushDelayMs: 1, getWindow: () => null }));
        qc.setQueryData(SEARCH_KEY, [{ ...listShape(dbRow("o1")), deleted_at: null, waseet_qr_id: "QR-1" }]);
        const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
        // order-action-bar.tsx / composer.tsx: the mutation alone, plain mutate().
        const { result } = renderHook(() => {
            const list = useOrdersQuery(null, true);
            return { list, status: useUpdateStatusMutation() };
        }, { wrapper });
        await waitFor(() => expect(result.current.list.data?.length).toBe(H.db.length));
        // A colleague edits o2 and realtime missed it: only a catch-up brings it in.
        Object.assign(dbRow("o2"), { status: "rejected", version: 2, updated_at: tick() });

        act(() => { result.current.status.mutate({ orderId: "o1", status: "confirmed", expectedVersion: 4 }); });

        await waitFor(() => expect(cached(qc, "o2")).toMatchObject({ status: "rejected", version: 2 }));
        expect(cached(qc, "o1")).toMatchObject({ status: "confirmed", version: 5 });
        await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
        expect(H.findChangedSince).toHaveBeenCalledTimes(1);
        // The delta started at or below our own write.
        expect(Date.parse(H.findChangedSince.mock.calls[0][1] as string)).toBeLessThanOrEqual(Date.parse(dbRow("o1").updated_at as string));
        expect(H.historyInsert).not.toHaveBeenCalled();
    });

    it("a response older than the cache does not roll the row back", async () => {
        const { qc, result } = await mount();
        // A peer's v6 reached us (realtime) while our PATCH (v5) was in flight.
        H.updateStatus.mockImplementationOnce(async (id: string, status: string) => {
            qc.setQueryData<Order[]>(orderKeys.lists(), (old) => old?.map((o) => o.id === id ? { ...o, version: 6, status: "cancelled" } : o));
            const row = dbRow(id);
            Object.assign(row, { status, version: 5, updated_at: tick() });
            return { ...row } as unknown as Order;
        });
        H.historyInsert.mockImplementationOnce(async () => ({ error: null }));
        H.findChangedSince.mockImplementation(async () => []);
        await act(async () => { await result.current.crud.updateOrderStatus("o1", "confirmed"); });
        expect(cached(qc, "o1")).toMatchObject({ version: 6, status: "cancelled" });
    });

    it("a peer soft delete that realtime missed is removed by the catch-up", async () => {
        const { qc, result } = await mount();
        // A colleague moves o2 to the trash; realtime is silent.
        const at = tick();
        Object.assign(dbRow("o2"), { deleted_at: at, version: 2, updated_at: at });
        await act(async () => { await result.current.crud.updateOrderStatus("o1", "confirmed"); });
        await waitFor(() => expect(cached(qc, "o1")?.version).toBe(6));
        expect(cached(qc, "o2")).toBeUndefined();
        for (const o of qc.getQueryData<Order[]>(orderKeys.lists()) ?? []) expect(o).not.toHaveProperty("deleted_at");
    });

    it("on Today with the duplicate margin mounted, a status change downloads no window: the delta updates the margin", async () => {
        // o3: the same customer as o1, placed yesterday at 23:00 Baghdad — in
        // the ±48h margin, not in Today.
        H.db.push(seed("o3", 1, { created_at: "2026-10-18T20:00:00.000Z" }));
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        setOrderBatcher(new RealtimeBatcher({ queryClient: qc, queryKey: orderKeys.lists(), flushDelayMs: 1, getWindow: () => TODAY }));
        const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
        const { result } = renderHook(() => {
            const list = useOrdersQuery(TODAY, true);
            const dup = useDuplicateWindowAlerts(list.data ?? [], TODAY);
            return { list, dup, crud: useOrderCrud({ orders: list.data ?? [] }) };
        }, { wrapper });
        await waitFor(() => expect(result.current.list.data?.map((o) => o.id).sort()).toEqual(["o1", "o2"]));
        await waitFor(() => expect(result.current.dup.duplicateCandidates.map((o) => o.id).sort()).toEqual(["o1", "o2", "o3"]));
        const windowFetches = H.findWindow.mock.calls.length;
        expect(windowFetches).toBe(2); // the list and the margin

        // A colleague confirms the yesterday twin; realtime is silent.
        Object.assign(dbRow("o3"), { status: "confirmed", version: 2, updated_at: tick() });
        await act(async () => { await result.current.crud.updateOrderStatus("o2", "rejected"); });
        await act(async () => { await new Promise((r) => setTimeout(r, 2_300)); });

        expect(H.findWindow.mock.calls.length).toBe(windowFetches);
        expect(H.findChangedSince).toHaveBeenCalledTimes(1);
        // The double-dispatch guard sees the twin's new status at once.
        expect(result.current.dup.duplicateCandidates.find((o) => o.id === "o3")).toMatchObject({ status: "confirmed", version: 2 });
        expect(result.current.dup.getConfirmBlockingTwin("o1")?.id).toBe("o3");
    }, 10_000);

    it("a peer write between the watermark and ours is applied by the catch-up", async () => {
        const { qc, result } = await mount();
        // A colleague edits o2; realtime missed it.
        Object.assign(dbRow("o2"), { status: "rejected", version: 2, updated_at: tick() });
        await act(async () => { await result.current.crud.updateOrderStatus("o1", "confirmed"); });
        await waitFor(() => expect(cached(qc, "o2")).toMatchObject({ status: "rejected", version: 2 }));
    });

    it("propagates the delta row's fresh risk to same-customer rows, and leaves others alone", async () => {
        // Same customer as o1, last edited long before the watermark: the delta
        // does not return it.
        H.db.push(seed("o3", 1, { updated_at: "2026-10-01T07:00:00.000Z" }));
        const { qc, result } = await mount();
        H.historyInsert.mockImplementationOnce(async (rows: Record<string, unknown>[]) => {
            const row = dbRow(rows[0].order_id as string);
            Object.assign(row, { version: (row.version as number) + 1, updated_at: tick() });
            // trg_update_trust_orders moved the customer's trust row; every
            // read of an order with this phone now joins the new risk.
            for (const r of H.db) if (r.phone === row.phone) r.risk_data = { level: "high", score: 80 };
            return { error: null };
        });
        const o2Before = cached(qc, "o2");
        await act(async () => { await result.current.crud.updateOrderStatus("o1", "rejected"); });
        await waitFor(() => expect(cached(qc, "o3")?.risk_data).toEqual({ level: "high", score: 80 }));
        expect(cached(qc, "o2")).toBe(o2Before);
    });

    it("a failed write reverts only the failed row's optimistic fields and replays the skipped peer event", async () => {
        const { qc, batcher, result } = await mount();
        H.updateStatus.mockImplementationOnce(async () => {
            // While our PATCH is in flight: a peer edits o2, and a peer write
            // to o1 (v5) arrives — skipped by the guard as a possible echo.
            batcher.push({ eventType: "UPDATE", new: { ...listShape(dbRow("o2")), status: "rejected", version: 2 } });
            batcher.push({ eventType: "UPDATE", new: { ...listShape(dbRow("o1")), status: "cancelled", version: 5 } });
            await new Promise((r) => setTimeout(r, 20));
            throw new Error("network down");
        });
        let outcome: { success: boolean } | undefined;
        await act(async () => { outcome = await result.current.crud.updateOrderStatus("o1", "confirmed"); });
        expect(outcome?.success).toBe(false);
        await waitFor(() => expect(cached(qc, "o1")).toMatchObject({ status: "cancelled", version: 5 }));
        expect(cached(qc, "o2")).toMatchObject({ status: "rejected", version: 2 });
        // The search row keeps its own columns.
        expect(qc.getQueryData<Record<string, unknown>[]>(SEARCH_KEY)?.[0]).toMatchObject({ waseet_qr_id: "QR-1" });
    });

    it("a conflict reverts the optimistic fields first, drops the held event and refetches once", async () => {
        const { qc, batcher, result } = await mount();
        const invalidate = vi.spyOn(qc, "invalidateQueries");
        let statusWhenRefetched: string | undefined;
        invalidate.mockImplementation(async () => { statusWhenRefetched = cached(qc, "o1")?.status; });
        H.updateStatus.mockImplementationOnce(async () => {
            batcher.push({ eventType: "UPDATE", new: { ...listShape(dbRow("o1")), status: "cancelled", version: 5 } });
            await new Promise((r) => setTimeout(r, 20));
            throw new Error("CONFLICT_DETECTED");
        });
        await act(async () => { await result.current.crud.updateOrderStatus("o1", "confirmed"); });
        expect(statusWhenRefetched).toBe("new");
        expect(invalidate.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(orderKeys.lists()) && !f?.predicate)).toHaveLength(1);
        await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
        expect(cached(qc, "o1")?.version).toBe(4);
        // The guard is gone.
        batcher.push({ eventType: "UPDATE", new: { ...listShape(dbRow("o1")), version: 7 } });
        await waitFor(() => expect(cached(qc, "o1")?.version).toBe(7));
    });
});
