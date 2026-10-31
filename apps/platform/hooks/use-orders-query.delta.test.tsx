import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";
import type { OrderWindow } from "@/lib/order-window";
import { RealtimeBatcher } from "@/lib/realtime-batcher";
import { duplicateCandidateWindow } from "@/lib/duplicate-window";

/**
 * The catch-up delta that replaces the 2s full refetch. Its start point is the
 * sync watermark: the tenant-wide high-water mark read BEFORE the last list
 * fetch (minus a one-time overlap), then each complete delta's newest row
 * (minus a small skew). A delta that hits PostgREST's 1,000-row cap may be
 * missing rows, so it never advances the watermark and the list is refetched.
 */

const TENANT = "tenant-1";
const H = vi.hoisted(() => ({
    findWindow: vi.fn(),
    findLatestUpdatedAt: vi.fn(),
    findChangedSince: vi.fn(),
    tenantId: "tenant-1" as string | null,
}));

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: {
        findWindow: H.findWindow,
        findLatestUpdatedAt: H.findLatestUpdatedAt,
        findChangedSince: H.findChangedSince,
    },
}));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true, tenantId: H.tenantId }),
}));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn() }));

import {
    DELTA_OVERLAP_MS,
    DELTA_ROW_CAP,
    DELTA_SKEW_MS,
    duplicateCandidateKeys,
    duplicateCandidateMeta,
    orderKeys,
    requestOrdersCatchUp,
    setOrderBatcher,
    syncOrdersDelta,
    useOrdersQuery,
} from "./use-orders-query";
import { getSyncWatermark } from "./orders-list-coverage";

// 45–60 days back: its own newest row was edited weeks ago.
const OLD_WINDOW = {
    fromInstant: Date.parse("2026-08-20T21:00:00.000Z"),
    toInstant: Date.parse("2026-09-04T20:59:59.999Z"),
    fromDay: "2026-08-21",
    toDay: "2026-09-04",
} satisfies NonNullable<OrderWindow>;
const FETCH_MARK = "2026-10-19T08:00:00.000Z";

function row(id: string, updatedAt: string, version = 1): Order {
    return {
        id,
        tenant_id: TENANT,
        order_id: id,
        customer_name: "x",
        phone: "07700000000",
        items: [],
        price: 1,
        status: "new",
        priority: "normal",
        payment_status: "cod",
        created_at: "2026-08-25T08:00:00.000Z",
        updated_at: updatedAt,
        version,
        is_return: false,
        is_replacement: false,
        is_archived: false,
    } as Order;
}

const ms = (iso: string) => Date.parse(iso);
const sinceOf = (call: unknown[]) => call[1] as string;

function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const batcher = new RealtimeBatcher({ queryClient: qc, queryKey: orderKeys.lists(), getWindow: () => OLD_WINDOW });
    setOrderBatcher(batcher);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    return { qc, wrapper, batcher };
}

async function coldLoad() {
    const ctx = setup();
    const { result } = renderHook(() => useOrdersQuery(OLD_WINDOW, true), { wrapper: ctx.wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    return ctx;
}

beforeEach(() => {
    H.tenantId = TENANT;
    H.findWindow.mockReset();
    H.findLatestUpdatedAt.mockReset();
    H.findChangedSince.mockReset();
    H.findWindow.mockResolvedValue([row("a", "2026-09-12T10:00:00.000Z"), row("b", "2026-09-01T10:00:00.000Z")]);
    H.findLatestUpdatedAt.mockResolvedValue(FETCH_MARK);
    H.findChangedSince.mockResolvedValue([]);
    sessionStorage.clear();
});

describe("catch-up delta watermark", () => {
    it("a historical window's first delta starts at the fetch-start mark minus the overlap, not at the window's old rows", async () => {
        const { qc } = await coldLoad();
        expect(H.findLatestUpdatedAt).toHaveBeenCalledWith(TENANT);
        // The mark is read before the rows.
        expect(H.findLatestUpdatedAt.mock.invocationCallOrder[0]).toBeLessThan(H.findWindow.mock.invocationCallOrder[0]);

        await requestOrdersCatchUp(qc, TENANT, { source: "statusSettled" });
        expect(H.findChangedSince).toHaveBeenCalledTimes(1);
        const [tenant, since] = H.findChangedSince.mock.calls[0];
        expect(tenant).toBe(TENANT);
        expect(ms(since)).toBe(ms(FETCH_MARK) - DELTA_OVERLAP_MS);
        expect(ms(since)).toBeGreaterThan(ms("2026-09-12T10:00:00.000Z"));
    });

    it("applies the overlap once; the next delta starts at its newest row minus a small skew", async () => {
        const { qc } = await coldLoad();
        H.findChangedSince.mockResolvedValueOnce([row("a", "2026-10-19T08:03:00.000Z", 2)]);
        await requestOrdersCatchUp(qc, TENANT, { source: "first" });
        expect(getSyncWatermark(qc)).toEqual({ at: "2026-10-19T08:03:00.000Z", fromFetch: false });
        expect(qc.getQueryData<Order[]>(orderKeys.lists())?.find((o) => o.id === "a")?.version).toBe(2);

        await requestOrdersCatchUp(qc, TENANT, { source: "second" });
        expect(ms(sinceOf(H.findChangedSince.mock.calls[1]))).toBe(ms("2026-10-19T08:03:00.000Z") - DELTA_SKEW_MS);
    });

    it("an empty delta still spends the overlap", async () => {
        const { qc } = await coldLoad();
        await requestOrdersCatchUp(qc, TENANT, { source: "first" });
        await requestOrdersCatchUp(qc, TENANT, { source: "second" });
        expect(ms(sinceOf(H.findChangedSince.mock.calls[1]))).toBe(ms(FETCH_MARK) - DELTA_SKEW_MS);
    });

    it("a caller's own write lowers the start, never raises it", async () => {
        const { qc } = await coldLoad();
        await requestOrdersCatchUp(qc, TENANT, { source: "s", since: "2026-10-19T07:00:00.000Z" });
        expect(sinceOf(H.findChangedSince.mock.calls[0])).toBe("2026-10-19T07:00:00.000Z");
        await requestOrdersCatchUp(qc, TENANT, { source: "s", since: "2026-10-19T09:00:00.000Z" });
        expect(ms(sinceOf(H.findChangedSince.mock.calls[1]))).toBe(ms(FETCH_MARK) - DELTA_SKEW_MS);
    });

    it("a list fetch that commits after a delta finished during it re-arms the overlap, so the next delta re-reads the row", async () => {
        const { qc } = await coldLoad();
        // Focus: the list refetch reads its mark (08:00) and then a@v1 ...
        let release: (rows: Order[]) => void = () => {};
        H.findWindow.mockImplementationOnce(() => new Promise<Order[]>((r) => { release = r; }));
        const refetch = qc.refetchQueries({ queryKey: orderKeys.lists(), exact: true });
        await waitFor(() => expect(H.findWindow).toHaveBeenCalledTimes(2));
        // ... while the appReopen delta, started by the same focus, lands a@v2 first.
        H.findChangedSince.mockResolvedValueOnce([row("a", "2026-10-19T08:00:30.000Z", 2)]);
        await requestOrdersCatchUp(qc, TENANT, { source: "appReopen" });
        release([row("a", "2026-09-12T10:00:00.000Z", 1), row("b", "2026-09-01T10:00:00.000Z")]);
        await refetch;
        // The commit replaced a@v2 with its older read: the cache is complete
        // up to the fetch's mark only, and owes the overlap again.
        expect(getSyncWatermark(qc)).toEqual({ at: FETCH_MARK, fromFetch: true });
        H.findChangedSince.mockResolvedValueOnce([row("a", "2026-10-19T08:00:30.000Z", 2)]);
        await requestOrdersCatchUp(qc, TENANT, { source: "heartbeatDrift" });
        expect(ms(sinceOf(H.findChangedSince.mock.calls[1]))).toBe(ms(FETCH_MARK) - DELTA_OVERLAP_MS);
        expect(qc.getQueryData<Order[]>(orderKeys.lists())?.find((o) => o.id === "a")?.version).toBe(2);
    });
});

describe("catch-up delta and soft deletes", () => {
    it("a trashed row in the delta removes the cached copy and moves the watermark", async () => {
        const { qc } = await coldLoad();
        H.findChangedSince.mockResolvedValueOnce([{ ...row("a", "2026-10-19T08:05:00.000Z", 3), deleted_at: "2026-10-19T08:05:00.000Z" }]);
        await requestOrdersCatchUp(qc, TENANT, { source: "s" });
        expect(qc.getQueryData<Order[]>(orderKeys.lists())?.map((o) => o.id)).toEqual(["b"]);
        expect(getSyncWatermark(qc)?.at).toBe("2026-10-19T08:05:00.000Z");
    });
});

describe("catch-up delta on an empty window", () => {
    it("an empty (loaded) window is caught up by delta, not by invalidating every list query", async () => {
        H.findWindow.mockResolvedValue([]);
        const ctx = setup();
        const { result } = renderHook(() => useOrdersQuery(OLD_WINDOW, true), { wrapper: ctx.wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        const invalidate = vi.spyOn(ctx.qc, "invalidateQueries");
        H.findChangedSince.mockResolvedValueOnce([row("n", "2026-10-19T08:05:00.000Z")]);
        await requestOrdersCatchUp(ctx.qc, TENANT, { source: "s" });
        expect(H.findChangedSince).toHaveBeenCalledTimes(1);
        expect(invalidate).not.toHaveBeenCalled();
        expect(ctx.qc.getQueryData<Order[]>(orderKeys.lists())?.map((o) => o.id)).toEqual(["n"]);
    });
});

describe("catch-up delta and the duplicate margin", () => {
    const MARGIN = duplicateCandidateWindow(OLD_WINDOW);
    const MARGIN_KEY = duplicateCandidateKeys.window(MARGIN);
    // In the margin only: 30h before the visible window starts.
    const marginRow = (id: string, updatedAt: string, version = 1, extra: Partial<Order> = {}) =>
        ({ ...row(id, updatedAt, version), created_at: "2026-08-19T15:00:00.000Z", ...extra }) as Order;

    async function withMargin(rows: Order[]) {
        const ctx = await coldLoad();
        const margin = vi.fn(async () => rows);
        const { result } = renderHook(
            () => useQuery({ queryKey: MARGIN_KEY, queryFn: margin, staleTime: 60_000, meta: duplicateCandidateMeta(MARGIN) }),
            { wrapper: ctx.wrapper },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        return { ...ctx, margin };
    }
    const marginIds = (qc: QueryClient) => qc.getQueryData<Order[]>(MARGIN_KEY)?.map((o) => o.id).sort();

    it("merges the delta into the margin without refetching it", async () => {
        const { qc, margin } = await withMargin([marginRow("m1", "2026-10-01T00:00:00.000Z", 1), marginRow("m2", "2026-10-01T00:00:00.000Z", 1)]);
        H.findChangedSince.mockResolvedValueOnce([
            marginRow("m1", "2026-10-19T08:01:00.000Z", 2, { status: "confirmed" }),
            { ...marginRow("m2", "2026-10-19T08:02:00.000Z", 2), deleted_at: "2026-10-19T08:02:00.000Z" },
            marginRow("m3", "2026-10-19T08:03:00.000Z", 1),
            marginRow("far", "2026-10-19T08:04:00.000Z", 1, { created_at: "2026-10-10T08:00:00.000Z" }),
            marginRow("arch", "2026-10-19T08:04:00.000Z", 1, { is_archived: true }),
        ]);
        await requestOrdersCatchUp(qc, TENANT, { source: "s" });
        expect(margin).toHaveBeenCalledTimes(1);
        expect(marginIds(qc)).toEqual(["m1", "m3"]);
        expect(qc.getQueryData<Order[]>(MARGIN_KEY)?.find((o) => o.id === "m1")).toMatchObject({ status: "confirmed", version: 2 });
        for (const r of qc.getQueryData<Order[]>(MARGIN_KEY) ?? []) expect(r).not.toHaveProperty("deleted_at");
    });

    it("a delta row older than the margin copy leaves it alone", async () => {
        const { qc } = await withMargin([marginRow("m1", "2026-10-19T08:09:00.000Z", 5, { status: "in_transit" })]);
        H.findChangedSince.mockResolvedValueOnce([marginRow("m1", "2026-10-19T08:01:00.000Z", 4, { status: "confirmed" })]);
        await requestOrdersCatchUp(qc, TENANT, { source: "s" });
        expect(qc.getQueryData<Order[]>(MARGIN_KEY)?.[0]).toMatchObject({ status: "in_transit", version: 5 });
    });

    /** Mount the margin with a first fetch that waits for `release`; later fetches return `later`. */
    async function withSlowMargin(later: Order[] = []) {
        const ctx = await coldLoad();
        let release: (rows: Order[]) => void = () => {};
        let fail: (err: Error) => void = () => {};
        const margin = vi.fn()
            .mockImplementationOnce(() => new Promise<Order[]>((resolve, reject) => { release = resolve; fail = reject; }))
            .mockImplementation(async () => later);
        renderHook(
            () => useQuery({ queryKey: MARGIN_KEY, queryFn: margin, staleTime: 60_000, meta: duplicateCandidateMeta(MARGIN) }),
            { wrapper: ctx.wrapper },
        );
        await waitFor(() => expect(margin).toHaveBeenCalledTimes(1));
        return { ...ctx, margin, release: (rows: Order[]) => release(rows), fail: (err: Error) => fail(err) };
    }
    const settle = () => new Promise((r) => setTimeout(r, 20));

    it("a margin fetch in flight when deltas land is read once: the deltas are merged into its result when it settles", async () => {
        const { qc, margin, release } = await withSlowMargin();
        H.findChangedSince.mockResolvedValueOnce([marginRow("m1", "2026-10-19T08:01:00.000Z", 2, { status: "confirmed" })]);
        await requestOrdersCatchUp(qc, TENANT, { source: "first" });
        H.findChangedSince.mockResolvedValueOnce([
            marginRow("m3", "2026-10-19T08:02:00.000Z", 1),
            { ...marginRow("m2", "2026-10-19T08:03:00.000Z", 2), deleted_at: "2026-10-19T08:03:00.000Z" },
        ]);
        await requestOrdersCatchUp(qc, TENANT, { source: "second" });
        // The read started before both deltas and resolves after them.
        release([marginRow("m1", "2026-10-01T00:00:00.000Z", 1), marginRow("m2", "2026-10-01T00:00:00.000Z", 1)]);
        await waitFor(() => expect(marginIds(qc)).toEqual(["m1", "m3"]));
        await settle();
        expect(margin).toHaveBeenCalledTimes(1);
        expect(qc.getQueryData<Order[]>(MARGIN_KEY)?.find((o) => o.id === "m1")).toMatchObject({ status: "confirmed", version: 2 });
    });

    it("a margin read newer than the buffered delta row keeps its own copy", async () => {
        const { qc, margin, release } = await withSlowMargin();
        H.findChangedSince.mockResolvedValueOnce([marginRow("m1", "2026-10-19T08:01:00.000Z", 2, { status: "confirmed" })]);
        await requestOrdersCatchUp(qc, TENANT, { source: "s" });
        release([marginRow("m1", "2026-10-19T08:05:00.000Z", 3, { status: "in_transit" })]);
        await waitFor(() => expect(qc.getQueryData<Order[]>(MARGIN_KEY)?.[0]).toMatchObject({ status: "in_transit", version: 3 }));
        await settle();
        expect(qc.getQueryData<Order[]>(MARGIN_KEY)?.[0]).toMatchObject({ status: "in_transit", version: 3 });
        expect(margin).toHaveBeenCalledTimes(1);
    });

    it("a buffered row a peer trashed before the margin read is not added back", async () => {
        const { qc, batcher, release } = await withSlowMargin();
        H.findChangedSince.mockResolvedValueOnce([marginRow("m3", "2026-10-19T08:02:00.000Z", 1)]);
        await requestOrdersCatchUp(qc, TENANT, { source: "s" });
        // Realtime: the trash, after the delta read m3 and before the margin read.
        batcher.push({ eventType: "UPDATE", new: { ...marginRow("m3", "2026-10-19T08:03:00.000Z", 2), deleted_at: "2026-10-19T08:03:00.000Z" } as unknown as Record<string, unknown> });
        batcher.flush();
        release([marginRow("m1", "2026-10-01T00:00:00.000Z", 1)]);
        await waitFor(() => expect(marginIds(qc)).toEqual(["m1"]));
        await settle();
        expect(marginIds(qc)).toEqual(["m1"]);
    });

    it("a first margin load that fails is left to its own error state, not refetched by the merge", async () => {
        const { qc, margin, fail } = await withSlowMargin();
        H.findChangedSince.mockResolvedValueOnce([marginRow("m1", "2026-10-19T08:01:00.000Z", 2)]);
        await requestOrdersCatchUp(qc, TENANT, { source: "s" });
        fail(new Error("network"));
        await waitFor(() => expect(qc.getQueryState(MARGIN_KEY)?.status).toBe("error"));
        await settle();
        expect(margin).toHaveBeenCalledTimes(1);
        expect(qc.getQueryData(MARGIN_KEY)).toBeUndefined();
    });

    it("a margin refetch that fails keeps its earlier rows, with the buffered delta merged in", async () => {
        const { qc, margin } = await withMargin([marginRow("m1", "2026-10-01T00:00:00.000Z", 1)]);
        let fail: (err: Error) => void = () => {};
        margin.mockImplementationOnce(() => new Promise<Order[]>((_resolve, reject) => { fail = reject; }));
        void qc.refetchQueries({ queryKey: MARGIN_KEY, exact: true });
        await waitFor(() => expect(margin).toHaveBeenCalledTimes(2));
        H.findChangedSince.mockResolvedValueOnce([marginRow("m1", "2026-10-19T08:01:00.000Z", 2, { status: "confirmed" })]);
        await requestOrdersCatchUp(qc, TENANT, { source: "s" });
        fail(new Error("network"));
        await waitFor(() => expect(qc.getQueryData<Order[]>(MARGIN_KEY)?.[0]).toMatchObject({ status: "confirmed", version: 2 }));
        await settle();
        expect(margin).toHaveBeenCalledTimes(2);
    });

    it("an overflowing delta marks the margin stale too", async () => {
        const { qc, margin } = await withMargin([]);
        H.findChangedSince.mockResolvedValueOnce(Array.from({ length: DELTA_ROW_CAP }, (_, i) => row(`d${i}`, "2026-10-19T09:00:00.000Z", 5)));
        await requestOrdersCatchUp(qc, TENANT, { source: "s" });
        await waitFor(() => expect(margin).toHaveBeenCalledTimes(2));
    });
});

describe("catch-up delta overflow", () => {
    it(`a delta of ${DELTA_ROW_CAP} rows keeps the watermark and refetches the list exactly once`, async () => {
        const { qc } = await coldLoad();
        const capped = Array.from({ length: DELTA_ROW_CAP }, (_, i) => row(`d${i}`, "2026-10-19T09:00:00.000Z", 5));
        H.findChangedSince.mockResolvedValueOnce(capped);
        const before = getSyncWatermark(qc);
        const fetchesBefore = H.findWindow.mock.calls.length;
        const refetch = vi.spyOn(qc, "refetchQueries");

        await syncOrdersDelta(qc, TENANT, "heartbeatDrift");
        expect(getSyncWatermark(qc)).toEqual(before);
        // One exact refetch of the main list (the margin invalidate refetches through the same method).
        const mainRefetches = refetch.mock.calls.filter(([f]) => f?.exact === true && JSON.stringify(f.queryKey) === JSON.stringify(orderKeys.lists()));
        expect(mainRefetches).toEqual([[{ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false }]]);
        await waitFor(() => expect(H.findWindow.mock.calls.length).toBe(fetchesBefore + 1));
        // The partial batch was not applied as if it were complete.
        expect(qc.getQueryData<Order[]>(orderKeys.lists())?.some((o) => o.id.startsWith("d"))).toBe(false);
    });

    it("one row under the cap is a complete delta", async () => {
        const { qc } = await coldLoad();
        H.findChangedSince.mockResolvedValueOnce(Array.from({ length: DELTA_ROW_CAP - 1 }, (_, i) => row(`d${i}`, "2026-10-19T09:00:00.000Z")));
        const refetch = vi.spyOn(qc, "refetchQueries");
        await syncOrdersDelta(qc, TENANT, "heartbeatDrift");
        expect(refetch).not.toHaveBeenCalled();
        expect(getSyncWatermark(qc)?.at).toBe("2026-10-19T09:00:00.000Z");
    });
});

describe("catch-up delta fallbacks", () => {
    it("no watermark: refetches the list instead of trusting the cache's own newest row", async () => {
        H.findLatestUpdatedAt.mockRejectedValue(new Error("network"));
        const { qc } = await coldLoad();
        const refetch = vi.spyOn(qc, "refetchQueries");
        await syncOrdersDelta(qc, TENANT, "appReopen");
        expect(H.findChangedSince).not.toHaveBeenCalled();
        expect(refetch).toHaveBeenCalledWith({ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false });
    });

    it("a null tenant makes the catch-up a no-op: no delta and no full invalidate", async () => {
        const { qc } = await coldLoad();
        const invalidate = vi.spyOn(qc, "invalidateQueries");
        const refetch = vi.spyOn(qc, "refetchQueries");
        await requestOrdersCatchUp(qc, null, { source: "statusSettled" });
        expect(H.findChangedSince).not.toHaveBeenCalled();
        expect(invalidate).not.toHaveBeenCalled();
        expect(refetch).not.toHaveBeenCalled();
    });

    it("a failed delta falls back to a full invalidate and does not reject", async () => {
        const { qc } = await coldLoad();
        H.findChangedSince.mockRejectedValueOnce(new Error("boom"));
        const invalidate = vi.spyOn(qc, "invalidateQueries");
        await expect(requestOrdersCatchUp(qc, TENANT, { source: "s" })).resolves.toBeUndefined();
        expect(invalidate).toHaveBeenCalledWith({ queryKey: orderKeys.lists() });
    });
});

describe("catch-up coalescing", () => {
    it("requests during a running delta share one follow-up that starts after them", async () => {
        const { qc } = await coldLoad();
        let release: () => void = () => {};
        H.findChangedSince.mockImplementationOnce(() => new Promise<Order[]>((r) => { release = () => r([]); }));

        const first = requestOrdersCatchUp(qc, TENANT, { source: "mutationCancel" });
        await waitFor(() => expect(H.findChangedSince).toHaveBeenCalledTimes(1));
        let secondDone = false;
        const second = requestOrdersCatchUp(qc, TENANT, { source: "statusSettled", since: "2026-10-19T07:30:00.000Z" }).then(() => { secondDone = true; });
        const third = requestOrdersCatchUp(qc, TENANT, { source: "statusSettled", since: "2026-10-19T07:00:00.000Z" });

        release();
        await first;
        // The in-flight delta started before the second request: it cannot
        // resolve it.
        await second;
        await third;
        expect(secondDone).toBe(true);
        expect(H.findChangedSince).toHaveBeenCalledTimes(2);
        // The follow-up starts no later than the lowest floor asked for.
        expect(sinceOf(H.findChangedSince.mock.calls[1])).toBe("2026-10-19T07:00:00.000Z");
        // The second promise resolved only once the follow-up had run.
        expect(H.findChangedSince.mock.invocationCallOrder[1]).toBeGreaterThan(H.findChangedSince.mock.invocationCallOrder[0]);
    });
});
