import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";
import type { OrderWindow } from "@/lib/order-window";
import { bookKey, setBookStorageForTests, writePersistedBook, type BookStorage } from "@/lib/orders/persisted-book";

/**
 * The order list is kept on the device. A visit restores it, fetches only
 * what changed since it was saved (a delta from its watermark), checks the
 * row count against the server, and refreshes risk_data. The whole window is
 * read only when there is no usable copy or the count disagrees. Focus,
 * remount and reconnect never re-read the window.
 */

const TENANT = "tenant-1";
const USER = "user-1";
const MARK = "2026-10-22T08:00:00.000Z";

const H = vi.hoisted(() => ({
    findWindow: vi.fn(),
    findChangedSince: vi.fn(),
    countWindow: vi.fn(),
    findTrustFor: vi.fn(),
    tenantId: "tenant-1" as string | null,
}));

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: {
        findWindow: H.findWindow,
        findChangedSince: H.findChangedSince,
        countWindow: H.countWindow,
        findTrustFor: H.findTrustFor,
        findLatestUpdatedAt: async () => "2026-10-22T09:00:00.000Z",
    },
    attachRiskData: (rows: Order[]) => rows.map((r) => ({ ...r, risk_data: { refreshed: true } })),
}));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true, tenantId: H.tenantId, user: { id: "user-1" } }),
}));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn() }));

import { orderKeys, setOrderBatcher, useOrdersQuery } from "./use-orders-query";
import { RealtimeBatcher } from "@/lib/realtime-batcher";

class MemoryStorage implements BookStorage {
    map = new Map<string, unknown>();
    async get(key: string) { return structuredClone(this.map.get(key)); }
    async set(key: string, value: unknown) { this.map.set(key, structuredClone(value)); }
    async del(key: string) { this.map.delete(key); }
    async keys() { return [...this.map.keys()]; }
}

function row(id: string, extra: Partial<Order> = {}): Order {
    return {
        id, tenant_id: TENANT, order_id: id, customer_name: "x", phone: "07700000000", items: [], price: 1,
        status: "new", priority: "normal", payment_status: "cod", created_at: "2026-10-20T08:00:00.000Z",
        updated_at: "2026-10-21T08:00:00.000Z", version: 1, is_return: false, is_replacement: false, is_archived: false,
        ...extra,
    } as Order;
}

let mem: MemoryStorage;

function setup(window: OrderWindow = null) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setOrderBatcher(new RealtimeBatcher({ queryClient: qc, queryKey: orderKeys.lists(), getWindow: () => window }));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useOrdersQuery(window, true), { wrapper });
    return { qc, ...hook };
}

const saveBook = (rows: Order[], over: Record<string, unknown> = {}) =>
    writePersistedBook({ userId: USER, tenantId: TENANT, windowKey: "all", rows, mark: MARK, savedAt: Date.now(), ...over });

beforeEach(() => {
    mem = new MemoryStorage();
    setBookStorageForTests(mem);
    H.tenantId = TENANT;
    for (const m of [H.findWindow, H.findChangedSince, H.countWindow, H.findTrustFor]) m.mockReset();
    H.findWindow.mockResolvedValue([]);
    H.findChangedSince.mockResolvedValue([]);
    H.findTrustFor.mockResolvedValue([]);
});
afterEach(() => {
    cleanup();
    setOrderBatcher(null);
    setBookStorageForTests(null);
    vi.useRealTimers();
});

describe("a saved order book", () => {
    it("is restored, brought current by a delta from its mark, count-checked and risk-refreshed — with no window read", async () => {
        await saveBook([row("a"), row("b")]);
        H.countWindow.mockResolvedValue(3);
        // Changed since the save: a new order.
        H.findChangedSince.mockResolvedValue([row("c", { created_at: "2026-10-22T08:30:00.000Z", updated_at: "2026-10-22T08:30:00.000Z" })]);

        const { result } = setup();

        await waitFor(() => expect(result.current.data?.map((o) => o.id).sort()).toEqual(["a", "b", "c"]));
        await waitFor(() => expect(H.findTrustFor).toHaveBeenCalledTimes(1));
        await waitFor(() => expect((result.current.data?.[0] as Order & { risk_data?: unknown }).risk_data).toEqual({ refreshed: true }));

        expect(H.findWindow).not.toHaveBeenCalled();
        // The delta reached back from the saved mark (by the fetch overlap).
        const since = H.findChangedSince.mock.calls[0][1] as string;
        expect(Date.parse(since)).toBeLessThanOrEqual(Date.parse(MARK));
        expect(H.countWindow).toHaveBeenCalledWith(TENANT, null);
    });

    it("is re-read from the server when its row count disagrees after the delta", async () => {
        // A hard delete the delta cannot see: the server has one row fewer.
        await saveBook([row("a"), row("b")]);
        H.countWindow.mockResolvedValue(1);
        H.findWindow.mockResolvedValue([row("a")]);

        const { result } = setup();

        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current.data?.map((o) => o.id)).toEqual(["a"]));
    });

    it("of another window is not used", async () => {
        await saveBook([row("today")], { windowKey: "1-2" });
        H.findWindow.mockResolvedValue([row("x")]);
        const { result } = setup(null);
        await waitFor(() => expect(result.current.data?.map((o) => o.id)).toEqual(["x"]));
        expect(H.findWindow).toHaveBeenCalledTimes(1);
    });

    it("holding another tenant's rows is not used", async () => {
        await saveBook([row("foreign", { tenant_id: "tenant-2" } as Partial<Order>)]);
        // The count would match: only the tenant check keeps the copy out.
        H.countWindow.mockResolvedValue(1);
        H.findWindow.mockResolvedValue([row("mine")]);
        const { result } = setup();
        await waitFor(() => expect(result.current.data?.map((o) => o.id)).toEqual(["mine"]));
    });
});

describe("saving the book", () => {
    it("saves the fetched window with its watermark once the list settles", async () => {
        H.findWindow.mockResolvedValue([row("a")]);
        const { result } = setup();
        await waitFor(() => expect(result.current.data).toHaveLength(1));

        await waitFor(() => expect(mem.map.has(bookKey(USER, TENANT, "all"))).toBe(true), { timeout: 4000 });
        const saved = mem.map.get(bookKey(USER, TENANT, "all")) as { rows: Order[]; mark: string | null };
        expect(saved.rows.map((r) => r.id)).toEqual(["a"]);
        expect(saved.mark).toBe("2026-10-22T09:00:00.000Z");
    });

    it("waits while a mutation is pending, so an optimistic value is never saved", async () => {
        H.findWindow.mockResolvedValue([row("a")]);
        const { qc, result } = setup();
        await waitFor(() => expect(result.current.data).toHaveLength(1));

        let finish: () => void = () => {};
        const pending = qc.getMutationCache().build(qc, { mutationFn: () => new Promise<void>((r) => { finish = r; }) });
        void pending.execute(undefined);
        act(() => { qc.setQueryData<Order[]>(orderKeys.lists(), [row("a", { status: "confirmed" })]); });

        await new Promise((r) => setTimeout(r, 2600));
        expect(mem.map.has(bookKey(USER, TENANT, "all"))).toBe(false);

        await act(async () => { finish(); });
        await waitFor(() => expect(mem.map.has(bookKey(USER, TENANT, "all"))).toBe(true), { timeout: 5000 });
    }, 12_000);

    it("never saves rows of another tenant under this one", async () => {
        H.findWindow.mockResolvedValue([row("a", { tenant_id: "tenant-2" } as Partial<Order>)]);
        const { result } = setup();
        await waitFor(() => expect(result.current.data).toHaveLength(1));
        await new Promise((r) => setTimeout(r, 2600));
        expect(mem.map.size).toBe(0);
    });
});

describe("no automatic full re-read", () => {
    it("on focus, or on a network reconnect", async () => {
        H.findWindow.mockResolvedValue([row("a")]);
        const { result } = setup();
        await waitFor(() => expect(result.current.data).toHaveLength(1));
        expect(H.findWindow).toHaveBeenCalledTimes(1);

        // Make the data stale, then focus and reconnect.
        await new Promise((r) => setTimeout(r, 10));
        act(() => {
            focusManager.setFocused(false);
            focusManager.setFocused(true);
            onlineManager.setOnline(false);
            onlineManager.setOnline(true);
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(H.findWindow).toHaveBeenCalledTimes(1);
        focusManager.setFocused(undefined);
    });

    it("on a remount with the list still in memory: a delta instead", async () => {
        H.findWindow.mockResolvedValue([row("a")]);
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
        setOrderBatcher(new RealtimeBatcher({ queryClient: qc, queryKey: orderKeys.lists(), getWindow: () => null }));
        const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
        const first = renderHook(() => useOrdersQuery(null, true), { wrapper });
        await waitFor(() => expect(first.result.current.data).toHaveLength(1));
        first.unmount();

        const second = renderHook(() => useOrdersQuery(null, true), { wrapper });
        await waitFor(() => expect(H.findChangedSince).toHaveBeenCalled());
        expect(second.result.current.data).toHaveLength(1);
        expect(H.findWindow).toHaveBeenCalledTimes(1);
        // An in-memory list is not count-checked: only a device copy is.
        expect(H.countWindow).not.toHaveBeenCalled();
    });
});
