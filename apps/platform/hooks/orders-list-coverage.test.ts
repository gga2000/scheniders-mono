import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { act, renderHook } from "@testing-library/react";
import { MutationObserver, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { listCovers } from "@/lib/orders/coverage-key";
import {
    ORDERS_LIST_MUTATION_KEY,
    advanceSyncWatermark,
    cacheCoversActiveWindow,
    cancelListFetches,
    ensureCoverage,
    getCommitGeneration,
    getLoadedWindowKey,
    getSyncWatermark,
    markListLoaded,
    setActiveWindowKey,
    trackListFetch,
    useFailedOrdersWindowKey,
    useLoadedOrdersWindowKey,
} from "./orders-list-coverage";
import { shouldCancelBeforeWindowRefetch } from "./use-orders-query";

vi.mock("@/lib/repositories/order-repository", () => ({ orderRepository: {} }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: null }) }));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const LIST = ["orders", "list"] as const;
const SEARCH = ["orders", "list", "search", "x", 20] as const;
const TODAY = "1000-1999";

type Row = { id: string; updated_at: string };

function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onMainKeyFlush = vi.fn();
    ensureCoverage(qc, { listKey: LIST, onMainKeyFlush });
    return { qc, onMainKeyFlush };
}

function deferred<T>() {
    let resolve: (v: T) => void = () => {};
    let reject: (e: unknown) => void = () => {};
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 5));

function fetchList(qc: QueryClient, key: string, rows: Row[], mark: string | null = "2026-10-18T10:00:00.000Z") {
    return qc.fetchQuery({ queryKey: LIST, queryFn: () => trackListFetch(qc, key, async () => mark, async () => rows) });
}

describe("orders list coverage", () => {
    it("a committed fetch claims its window, and the watermark is the fetch-start mark", async () => {
        const { qc } = setup();
        setActiveWindowKey(qc, TODAY);
        await fetchList(qc, TODAY, [{ id: "a", updated_at: "2026-10-01T00:00:00.000Z" }], "2026-10-18T10:00:00.000Z");
        expect(getLoadedWindowKey(qc)).toBe(TODAY);
        expect(getSyncWatermark(qc)).toEqual({ at: "2026-10-18T10:00:00.000Z", fromFetch: true });
        expect(cacheCoversActiveWindow(qc)).toBe(true);
    });

    it("a row stamped by the client clock (resolveStaleContacted) never raises the watermark", async () => {
        const { qc } = setup();
        // The rewrite stamps `updated_at: new Date()` — here a clock 10 minutes fast.
        const future = new Date(Date.now() + 10 * 60_000).toISOString();
        await fetchList(qc, "all", [{ id: "a", updated_at: future }], "2026-10-18T10:00:00.000Z");
        expect(getSyncWatermark(qc)?.at).toBe("2026-10-18T10:00:00.000Z");
    });

    it("setQueryData (optimistic, realtime, delta) moves neither the key nor the watermark", async () => {
        const { qc } = setup();
        await fetchList(qc, TODAY, [{ id: "a", updated_at: "x" }]);
        const gen = getCommitGeneration(qc);
        qc.setQueryData(LIST, [{ id: "b", updated_at: "2030-01-01T00:00:00.000Z" }]);
        setActiveWindowKey(qc, "all");
        qc.setQueryData(LIST, []);
        expect(getLoadedWindowKey(qc)).toBe(TODAY);
        expect(getSyncWatermark(qc)?.at).toBe("2026-10-18T10:00:00.000Z");
        expect(getCommitGeneration(qc)).toBe(gen);
    });

    it("a fetch cancelled mid-flight never claims its window, even when it resolves later", async () => {
        const { qc } = setup();
        await fetchList(qc, TODAY, [{ id: "a", updated_at: "x" }]);
        const late = deferred<Row[]>();
        void qc.fetchQuery({ queryKey: LIST, queryFn: () => trackListFetch(qc, "all", async () => "2026-10-19T00:00:00.000Z", () => late.promise) }).catch(() => undefined);
        await flush();
        await qc.cancelQueries({ queryKey: LIST });
        late.resolve([{ id: "b", updated_at: "x" }]);
        await flush();
        expect(getLoadedWindowKey(qc)).toBe(TODAY);
        expect(getSyncWatermark(qc)?.at).toBe("2026-10-18T10:00:00.000Z");
    });

    it("a superseding fetch claims the second window; the first one's late mark is ignored", async () => {
        const { qc } = setup();
        const firstMark = deferred<string | null>();
        const first = deferred<Row[]>();
        void qc.fetchQuery({ queryKey: LIST, queryFn: () => trackListFetch(qc, TODAY, () => firstMark.promise, () => first.promise) }).catch(() => undefined);
        await flush();
        await qc.cancelQueries({ queryKey: LIST });
        await fetchList(qc, "all", [{ id: "b", updated_at: "x" }], "2026-10-18T12:00:00.000Z");
        firstMark.resolve("2026-10-18T13:00:00.000Z");
        first.resolve([]);
        await flush();
        expect(getLoadedWindowKey(qc)).toBe("all");
        expect(getSyncWatermark(qc)?.at).toBe("2026-10-18T12:00:00.000Z");
    });

    it("removing the list (sign-out) clears the key and the watermark", async () => {
        const { qc } = setup();
        await fetchList(qc, TODAY, [{ id: "a", updated_at: "x" }]);
        qc.removeQueries({ queryKey: LIST });
        expect(getLoadedWindowKey(qc)).toBeNull();
        expect(getSyncWatermark(qc)).toBeNull();
    });

    it("a full book loaded while Today is active covers Today only", async () => {
        const { qc } = setup();
        setActiveWindowKey(qc, TODAY);
        await fetchList(qc, "all", [{ id: "a", updated_at: "x" }]);
        expect(getLoadedWindowKey(qc)).toBe(TODAY);
        setActiveWindowKey(qc, "all");
        expect(cacheCoversActiveWindow(qc)).toBe(false);
    });

    it("switching from All to Today with the full book loaded narrows the claim to Today", async () => {
        const { qc } = setup();
        setActiveWindowKey(qc, "all");
        await fetchList(qc, "all", [{ id: "a", updated_at: "x" }]);
        setActiveWindowKey(qc, TODAY);
        expect(getLoadedWindowKey(qc)).toBe(TODAY);
        expect(cacheCoversActiveWindow(qc)).toBe(true);
    });

    it("returns the null server snapshot during SSR", () => {
        const { qc } = setup();
        markListLoaded(qc, TODAY, null);
        const Probe = () => createElement("span", null, `loaded=${String(useLoadedOrdersWindowKey())}`);
        const html = renderToString(createElement(QueryClientProvider, { client: qc }, createElement(Probe)));
        expect(html).toContain("loaded=null");
    });

    it("no render pairs the claimed window with another window's rows", async () => {
        const { qc } = setup();
        setActiveWindowKey(qc, TODAY);
        // A cache already holding another window's row, not yet claimed.
        qc.setQueryData(LIST, [{ id: "z", updated_at: "x" }]);
        const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
        const renders: { loaded: string | null; rows: number | null }[] = [];
        renderHook(() => {
            const loaded = useLoadedOrdersWindowKey();
            const { data } = useQuery({ queryKey: LIST, queryFn: async () => [] as Row[], enabled: false });
            renders.push({ loaded, rows: data ? data.length : null });
        }, { wrapper });

        // Deliberately outside act(): act would batch every update into one
        // render and hide a notification delivered ahead of the rows.
        const previous = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
        try {
            await fetchList(qc, TODAY, [{ id: "a", updated_at: "x" }, { id: "b", updated_at: "x" }]);
            await flush();
            await flush();
        } finally {
            (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previous;
        }
        // Every render pairs the key with the rows it describes.
        const mixed = renders.filter((r) => (r.loaded === TODAY) !== (r.rows === 2));
        expect(mixed).toEqual([]);
        expect(renders.at(-1)).toEqual({ loaded: TODAY, rows: 2 });
    });

    it("a fetch that rejects marks its window failed; the next tracked fetch clears it", async () => {
        const { qc } = setup();
        const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
        const { result } = renderHook(() => useFailedOrdersWindowKey(), { wrapper });
        await act(async () => {
            await expect(qc.fetchQuery({ queryKey: LIST, queryFn: () => trackListFetch(qc, TODAY, async () => null, async () => { throw new Error("boom"); }) })).rejects.toThrow("boom");
            await flush();
        });
        expect(result.current).toBe(TODAY);
        await act(async () => {
            await fetchList(qc, TODAY, [{ id: "a", updated_at: "x" }]);
            await flush();
        });
        expect(result.current).toBeNull();
        expect(getLoadedWindowKey(qc)).toBe(TODAY);
    });

    it("a hydrated snapshot claims its window and, with a stored mark, the watermark", () => {
        const { qc } = setup();
        markListLoaded(qc, TODAY, "2026-10-18T09:00:00.000Z");
        expect(getLoadedWindowKey(qc)).toBe(TODAY);
        expect(getSyncWatermark(qc)).toEqual({ at: "2026-10-18T09:00:00.000Z", fromFetch: true });
    });
});

describe("sync watermark advance", () => {
    it("a complete delta raises it to its newest row and spends the overlap", async () => {
        const { qc } = setup();
        await fetchList(qc, TODAY, [], "2026-10-18T10:00:00.000Z");
        const gen = getCommitGeneration(qc);
        advanceSyncWatermark(qc, [{ updated_at: "2026-10-18T10:05:00.000Z" }, { updated_at: "2026-10-18T09:59:00.000Z" }], gen);
        expect(getSyncWatermark(qc)).toEqual({ at: "2026-10-18T10:05:00.000Z", fromFetch: false });
        // An empty delta keeps the mark but has applied the overlap.
        advanceSyncWatermark(qc, [], getCommitGeneration(qc));
        expect(getSyncWatermark(qc)).toEqual({ at: "2026-10-18T10:05:00.000Z", fromFetch: false });
    });

    it("a delta that spans a committed fetch does not move it", async () => {
        const { qc } = setup();
        await fetchList(qc, TODAY, [], "2026-10-18T10:00:00.000Z");
        const gen = getCommitGeneration(qc);
        await fetchList(qc, TODAY, [], "2026-10-18T11:00:00.000Z");
        advanceSyncWatermark(qc, [{ updated_at: "2026-10-18T12:00:00.000Z" }], gen);
        expect(getSyncWatermark(qc)).toEqual({ at: "2026-10-18T11:00:00.000Z", fromFetch: true });
    });
});

describe("cancelled list fetches flush once no list mutation is pending", () => {
    function mutation(qc: QueryClient, fn: () => Promise<unknown>) {
        return new MutationObserver(qc, {
            mutationKey: [...ORDERS_LIST_MUTATION_KEY, "update"],
            mutationFn: fn,
            onMutate: async () => { await cancelListFetches(qc, "tenant-1"); },
        });
    }

    it("a cancelled same-window main refresh is caught up once, after two mutations that settle in the same tick", async () => {
        const { qc, onMainKeyFlush } = setup();
        setActiveWindowKey(qc, TODAY);
        await fetchList(qc, TODAY, [{ id: "a", updated_at: "x" }]);
        const refresh = deferred<Row[]>();
        void qc.fetchQuery({ queryKey: LIST, staleTime: 0, queryFn: () => trackListFetch(qc, TODAY, async () => null, () => refresh.promise) }).catch(() => undefined);
        await flush();

        const shared = deferred<void>();
        const m1 = mutation(qc, () => shared.promise);
        const m2 = mutation(qc, () => shared.promise);
        const p = Promise.all([m1.mutate(undefined), m2.mutate(undefined)]);
        await flush();
        shared.resolve();
        await p;
        await flush();
        expect(onMainKeyFlush).toHaveBeenCalledTimes(1);
        expect(onMainKeyFlush).toHaveBeenCalledWith("tenant-1");
    });

    it("nothing in flight: nothing to flush", async () => {
        const { qc, onMainKeyFlush } = setup();
        setActiveWindowKey(qc, TODAY);
        await fetchList(qc, TODAY, [{ id: "a", updated_at: "x" }]);
        const spy = vi.spyOn(qc, "refetchQueries");
        await mutation(qc, async () => undefined).mutate(undefined);
        await flush();
        expect(onMainKeyFlush).not.toHaveBeenCalled();
        expect(spy).not.toHaveBeenCalled();
    });

    it("an uncovered main list is left to the reconciler; a cancelled search is refetched exactly", async () => {
        const { qc, onMainKeyFlush } = setup();
        setActiveWindowKey(qc, "all");
        await fetchList(qc, TODAY, [{ id: "a", updated_at: "x" }]); // Today loaded, All on screen
        const main = deferred<Row[]>();
        void qc.fetchQuery({ queryKey: LIST, staleTime: 0, queryFn: () => trackListFetch(qc, "all", async () => null, () => main.promise) }).catch(() => undefined);
        const search = deferred<Row[]>();
        void qc.fetchQuery({ queryKey: SEARCH, queryFn: () => search.promise }).catch(() => undefined);
        await flush();

        const spy = vi.spyOn(qc, "refetchQueries");
        await mutation(qc, async () => undefined).mutate(undefined);
        await flush();
        expect(onMainKeyFlush).not.toHaveBeenCalled();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith({ queryKey: SEARCH, exact: true }, { cancelRefetch: false });
    });
});

describe("pure helpers", () => {
    it("listCovers", () => {
        expect(listCovers(null, "all")).toBe(false);
        expect(listCovers(null, TODAY)).toBe(false);
        expect(listCovers("all", TODAY)).toBe(true);
        expect(listCovers("all", "all")).toBe(true);
        expect(listCovers(TODAY, TODAY)).toBe(true);
        expect(listCovers(TODAY, "all")).toBe(false);
        expect(listCovers(TODAY, "2000-2999")).toBe(false);
    });

    it("shouldCancelBeforeWindowRefetch: only a first load still running", () => {
        expect(shouldCancelBeforeWindowRefetch({ data: undefined, fetchStatus: "fetching" })).toBe(true);
        expect(shouldCancelBeforeWindowRefetch({ data: [], fetchStatus: "fetching" })).toBe(false);
        expect(shouldCancelBeforeWindowRefetch({ data: undefined, fetchStatus: "idle" })).toBe(false);
        expect(shouldCancelBeforeWindowRefetch(undefined)).toBe(false);
    });
});
