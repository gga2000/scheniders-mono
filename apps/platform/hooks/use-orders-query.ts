import { useQuery, useMutation, useQueryClient, useIsMutating, type QueryClient, type QueryState } from "@tanstack/react-query";
import {
    ORDERS_LIST_MUTATION_KEY,
    advanceSyncWatermark,
    cancelListFetches,
    ensureCoverage,
    getCommitGeneration,
    getSyncWatermark,
    markListLoaded,
    setActiveWindowKey,
    trackListFetch,
    useFailedOrdersWindowKey,
    useLoadedOrdersWindowKey,
} from "@/hooks/orders-list-coverage";
import { listCovers } from "@/lib/orders/coverage-key";
import { normalizePhoneLikeDb } from "@/lib/customer-trust-risk";
import { useEffect, useRef, useState } from "react";
import { type Order } from "@/types";
import { CACHE_PRESETS } from '@/lib/query-config';
import { diag } from "@/lib/diag";
import { perfTrace } from "@/lib/perf-trace";
import { orderRepository } from "@/lib/repositories/order-repository";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "sonner";
import { createOrderAction } from "@/app/actions/orders";
import type { CreateOrderInput } from "@/types/order";
import type { RealtimeBatcher } from "@/lib/realtime-batcher";
import { resolveStaleContacted } from "@/hooks/use-auto-no-response";
import { windowCacheKey, type OrderWindow } from "@/lib/order-window";
import { FutureOrderDateError } from "@/lib/order-date-guard";
import { reportOrderError } from "@/lib/order-telemetry";
// Refetch trigger constants
export const orderRefetchTriggers = {
    appReopen: "appReopen",
    realtimeReconnect: "realtimeReconnect",
} as const;

// Query keys for cache management
export const orderKeys = {
    all: ["orders"] as const,
    lists: () => [...orderKeys.all, "list"] as const,
    list: (filters: string) => [...orderKeys.lists(), { filters }] as const,
    details: () => [...orderKeys.all, "detail"] as const,
    detail: (id: string) => [...orderKeys.details(), id] as const,
    archived: () => [...orderKeys.all, "archived"] as const,
};

// =============================================
// BATCHER REGISTRY
// Module-level ref so mutations can call markMutated()
// on the active RealtimeBatcher without threading refs
// through the component tree.
// =============================================
let _orderBatcher: RealtimeBatcher | null = null;
export function setOrderBatcher(b: RealtimeBatcher | null) { _orderBatcher = b; }
function getOrderBatcher() { return _orderBatcher; }

/**
 * Every hook that touches the list cache calls this first: it creates the
 * per-client coverage store (hooks/orders-list-coverage.ts) and wires its
 * mutation flush to the catch-up delta. Idempotent.
 */
function coverage(queryClient: QueryClient): QueryClient {
    ensureCoverage(queryClient, {
        listKey: orderKeys.lists(),
        onMainKeyFlush: (tenantId) => { void requestOrdersCatchUp(queryClient, tenantId, { source: "mutationCancel" }); },
    });
    return queryClient;
}

/** The fetch-start high-water mark, or null (reported) when it cannot be read. */
async function readListMark(tenantId: string): Promise<string | null> {
    try {
        return await orderRepository.findLatestUpdatedAt(tenantId);
    } catch (err) {
        // The list fetch still runs; the previous watermark (older, so a safe
        // lower bound) is kept, or a later delta falls back to a refetch.
        reportOrderError(err, { operation: "orders-sync-watermark", tenantId });
        return null;
    }
}

/**
 * How far before a fetch-start mark the first delta after it reads. `updated_at`
 * is `now()` — the transaction START — so a write stamped just before the mark
 * can commit after the list pages were read. Applied once, from a fetch mark.
 */
export const DELTA_OVERLAP_MS = 120_000;
/** The same allowance for commit lag, from a delta's own watermark. Small: it re-reads tenant-wide changes. */
export const DELTA_SKEW_MS = 10_000;
/**
 * PostgREST's `max-rows` on this project (confirmed live: an unpaged select
 * returns exactly 1,000). `findChangedSince` is one unpaged select, newest
 * first, so a result this long may be missing its OLDEST rows: it cannot
 * advance the watermark, and the main list is refetched instead.
 */
export const DELTA_ROW_CAP = 1000;

function minIso(a: string, b: string | undefined): string {
    return b && Date.parse(b) < Date.parse(a) ? b : a;
}

/**
 * Incremental delta sync — used on realtime reconnect / app-reopen / heartbeat
 * drift and after our own status changes, INSTEAD of re-pulling the whole
 * window. Fetches every row changed since the sync watermark (the tenant-wide
 * high-water mark read before the last list fetch, raised by each complete
 * delta) and merges them through the batcher (same rules as live events).
 *
 * `opts.since` only lowers the start (a caller that knows its own write is
 * newer than it). Falls back to a full invalidate when there's no
 * cache/batcher/tenant or the delta fetch fails, and to an exact refetch of
 * the main list when there is no watermark or the delta hit DELTA_ROW_CAP.
 */
export async function syncOrdersDelta(
    queryClient: QueryClient,
    tenantId: string | null,
    source: string,
    opts: { since?: string } = {},
): Promise<void> {
    coverage(queryClient);
    const cached = queryClient.getQueryData<Order[]>(orderKeys.lists());
    const batcher = getOrderBatcher();
    if (!cached || cached.length === 0 || !batcher || !tenantId) {
        diag.log(`[Diag:RQ:Delta] source=${source} — no cache/batcher, full refetch`);
        queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
        return;
    }
    const mark = getSyncWatermark(queryClient);
    if (!mark) {
        // No fetch-start mark (e.g. a snapshot hydrated without one). The cache's
        // own newest `updated_at` is not a safe start: client-rewritten rows carry
        // the client clock. Re-read the window instead.
        diag.log(`[Diag:RQ:Delta] source=${source} — no sync watermark, refetching the list`);
        void queryClient.refetchQueries({ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false });
        return;
    }
    const since = minIso(
        new Date(Date.parse(mark.at) - (mark.fromFetch ? DELTA_OVERLAP_MS : DELTA_SKEW_MS)).toISOString(),
        opts.since,
    );
    const commitGen = getCommitGeneration(queryClient);
    try {
        const _t = performance.now();
        const changed = await orderRepository.findChangedSince(tenantId, since);
        if (changed.length >= DELTA_ROW_CAP) {
            diag.warn(`[Diag:RQ:Delta] overflow source=${source} since=${since} fetched=${changed.length} — watermark kept, refetching the list`);
            void queryClient.refetchQueries({ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false });
            return;
        }
        const applied = batcher.applyChangedOrders(changed);
        propagateRiskData(queryClient, changed);
        advanceSyncWatermark(queryClient, changed, commitGen);
        diag.log(`[Diag:RQ:Delta] source=${source} since=${since} fetched=${changed.length} applied=${applied} took=${(performance.now() - _t).toFixed(1)}ms`);
    } catch (err) {
        diag.error(`[Diag:RQ:Delta] source=${source} FAILED — full refetch`, err);
        queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    }
}

interface CatchUpQueue {
    running: Promise<void> | null;
    /** Requests that arrived while `running` was in flight, merged into one follow-up. */
    next: { promise: Promise<void>; resolve: () => void; tenantId: string; source: string; since?: string } | null;
}
const catchUps = new WeakMap<QueryClient, CatchUpQueue>();

/**
 * Schedule a catch-up delta for the list cache. The one way mutation code asks
 * for one.
 *
 * Coalesced per client: at most one delta in flight, and every request that
 * arrives meanwhile shares ONE follow-up (lowest `since` wins). The returned
 * promise resolves only after a delta that STARTED AFTER THE REQUEST has
 * finished — a request never resolves on an in-flight delta that could not
 * contain its write. It never rejects (`syncOrdersDelta` reports and falls
 * back). A null tenant is a no-op: the list query is disabled then, and a
 * full invalidate would only refetch nothing.
 */
export function requestOrdersCatchUp(
    queryClient: QueryClient,
    tenantId: string | null,
    { source, since }: { source: string; since?: string },
): Promise<void> {
    if (!tenantId) return Promise.resolve();
    let queue = catchUps.get(queryClient);
    if (!queue) {
        queue = { running: null, next: null };
        catchUps.set(queryClient, queue);
    }
    const q = queue;

    const start = (t: string, s: string, floor: string | undefined): Promise<void> => {
        const run = syncOrdersDelta(queryClient, t, s, { since: floor })
            .catch((err: unknown) => { diag.error(`[Diag:RQ:Delta] catch-up source=${s} threw`, err); })
            .then(() => {
                const follow = q.next;
                q.next = null;
                if (follow) {
                    q.running = start(follow.tenantId, follow.source, follow.since);
                    void q.running.then(follow.resolve);
                } else {
                    q.running = null;
                }
            });
        return run;
    };

    if (!q.running) {
        q.running = start(tenantId, source, since);
        return q.running;
    }
    if (!q.next) {
        let resolve: () => void = () => {};
        const promise = new Promise<void>((r) => { resolve = r; });
        q.next = { promise, resolve, tenantId, source, since };
    } else {
        q.next.tenantId = tenantId;
        q.next.source = `${q.next.source}+${source}`;
        if (since) q.next.since = q.next.since ? minIso(q.next.since, since) : since;
    }
    return q.next.promise;
}

// Per-order mutation sequence: prevents stale onSuccess/onError from
// overwriting newer optimistic state when rapid-fire mutations overlap.
const _orderMutationSeq = new Map<string, { seq: number; ts: number }>();
const SEQ_CLEANUP_INTERVAL_MS = 30_000;
const SEQ_MAX_AGE_MS = 30_000;

function nextMutationSeq(orderId: string): number {
    const prev = _orderMutationSeq.get(orderId);
    const seq = (prev?.seq ?? 0) + 1;
    _orderMutationSeq.set(orderId, { seq, ts: Date.now() });
    return seq;
}
function isMutationCurrent(orderId: string, seq: number): boolean {
    return _orderMutationSeq.get(orderId)?.seq === seq;
}

// Periodic cleanup: remove entries older than 30s to prevent memory growth
if (typeof window !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [id, entry] of _orderMutationSeq) {
            if (now - entry.ts > SEQ_MAX_AGE_MS) _orderMutationSeq.delete(id);
        }
    }, SEQ_CLEANUP_INTERVAL_MS);
}

// =============================================
// SESSION STORAGE SWR CACHE
// Shows stale data instantly on refresh while
// fresh data loads in the background (~2.5s).
// =============================================
const SWR_CACHE_KEY = 'schneiders_orders_swr';
const SWR_TS_KEY = 'schneiders_orders_swr_ts';
const SWR_WINDOW_KEY = 'schneiders_orders_swr_window';
const SWR_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes — discard if older

// Moved to lib/order-window so pure modules (useOrderFilters) can use it
// without importing this one; re-exported for existing imports.
export { windowCacheKey };

export function writeSwrCache(orders: Order[], windowKey: string): void {
    // An empty result is not worth caching, and caching it is actively harmful:
    // hydrating from it makes React Query report `isLoading: false` with no rows,
    // which is indistinguishable from "this merchant has no orders". See
    // readSwrCache.
    if (orders.length === 0) return;
    try {
        // Measure the SYNCHRONOUS main-thread serialization cost + payload size.
        const serialized = perfTrace.time('swr-stringify', () => JSON.stringify(orders), s => s.length);
        sessionStorage.setItem(SWR_CACHE_KEY, serialized);
        sessionStorage.setItem(SWR_TS_KEY, String(Date.now()));
        sessionStorage.setItem(SWR_WINDOW_KEY, windowKey);
    } catch {
        // sessionStorage full or unavailable — non-critical
    }
}

/**
 * The snapshot for `windowKey`, or null. A snapshot of a different window is
 * refused: hydrating one showed, say, today's rows under an "All Orders" filter
 * as if they were fresh.
 */
export function readSwrCache(windowKey: string): { orders: Order[]; savedAt: number } | null {
    try {
        const ts = sessionStorage.getItem(SWR_TS_KEY);
        if (!ts || Date.now() - Number(ts) > SWR_MAX_AGE_MS) return null;
        if (sessionStorage.getItem(SWR_WINDOW_KEY) !== windowKey) return null;
        const raw = sessionStorage.getItem(SWR_CACHE_KEY);
        if (!raw) return null;
        // Measure the SYNCHRONOUS main-thread parse cost (runs during render via initialData).
        const parsed = perfTrace.time('swr-parse', () => JSON.parse(raw) as Order[], () => raw.length);
        // An empty cache tells us nothing, and returning it would be worse than
        // returning nothing: React Query treats `[]` as loaded data, so the page
        // drops out of its loading state and renders the "No orders yet" empty
        // state while the real fetch is still in flight. A merchant with 4,778
        // orders was shown "When you receive orders, they'll appear here".
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        return { orders: parsed, savedAt: Number(ts) };
    } catch {
        return null;
    }
}

/**
 * Whether a cache holding `window` is the COMPLETE set matching the merchant's
 * filters, or only a slice of it.
 *
 * A null window means no date filter is active, so the fetch loaded everything.
 * Any other window is by definition a subset — and the actions that mean "act on
 * everything I can see" (ship-with-no-selection, select-all) must refuse rather
 * than silently operate on whichever rows happened to load.
 */
export function ordersCacheIsCompleteSet(window: OrderWindow): boolean {
    return window === null;
}

/** One row per id, first occurrence kept (the list is newest-first). */
export function dedupeById(rows: Order[]): Order[] {
    const seen = new Set<string>();
    let duplicate = false;
    for (const row of rows) {
        if (seen.has(row.id)) { duplicate = true; break; }
        seen.add(row.id);
    }
    if (!duplicate) return rows;
    const kept = new Map<string, Order>();
    for (const row of rows) if (!kept.has(row.id)) kept.set(row.id, row);
    return [...kept.values()];
}

/**
 * Whether a window change must cancel the in-flight list fetch before
 * refetching. React Query cancels a running fetch on refetch only when data
 * already exists; with none it JOINS it, and the first fetch — for the old
 * window — commits under the new filter.
 */
export function shouldCancelBeforeWindowRefetch(state: Pick<QueryState<unknown>, "data" | "fetchStatus"> | undefined): boolean {
    return !!state && state.data === undefined && state.fetchStatus === "fetching";
}

// Fetch the active tenant's orders — auth gating is handled by the `enabled` flag in useOrdersQuery.
async function fetchOrders(tenantId: string, window: OrderWindow = null): Promise<Order[]> {
    const _tFetch = performance.now();
    perfTrace.markRepeat('orders:fetch-start');
    diag.log(`[Diag:RQ:Fetch] fetchOrders START`);
    // Pages are read in parallel, so an order inserted mid-fetch can shift a
    // row across a page boundary and arrive twice; it must count once.
    const result = dedupeById(await orderRepository.findWindow(tenantId, window));
    perfTrace.mark('orders:fetch-done', { count: result.length });
    diag.log(`[Diag:RQ:Fetch] fetchOrders OK count=${result.length} took=${(performance.now() - _tFetch).toFixed(1)}ms`);

    // Layer 1: Resolve stale "contacted" orders → "no_response" at fetch time.
    // This ensures the React Query cache ALWAYS has correct statuses from the
    // first render — no flicker, no delayed effects, no cron dependency.
    const resolved = resolveStaleContacted(result);

    // Persist to sessionStorage for SWR on next refresh
    writeSwrCache(resolved, windowCacheKey(window));

    return resolved;
}

/**
 * The active tenant, or a thrown error. Queries that call this are disabled
 * until `useAuth` has a tenant, so it only throws if one runs anyway (a manual
 * refetch before the profile loads) — and then it must fail rather than read
 * every tenant RLS happens to allow.
 */
function requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new Error("No active tenant");
    return tenantId;
}

/**
 * useOrdersQuery - React Query hook for fetching orders with caching
 *
 * FAANG-level optimizations:
 * 1. SessionStorage SWR: cached data shown instantly on refresh
 * 2. Auth-gated: only fetches when session is ready (no throw+retry)
 * 3. Column-pruned fetch via orderRepository.findAll()
 *
 * @param refetchTrigger - Optional trigger to force refetch
 */
export function useOrdersQuery(window: OrderWindow = null, filtersSettled = true, refetchTrigger?: string) {
    const queryClient = coverage(useQueryClient());
    const { session, clientReady, tenantId } = useAuth();

    // The query key deliberately does NOT include the window. Realtime, every
    // mutation, delta sync and the sessionStorage SWR cache all read and write
    // `orderKeys.lists()`; keying per window would scatter those across caches.
    // The cache holds one window at a time and a change re-fetches it.
    //
    // Because the key is constant, the window has to reach the fetch some other
    // way, and a captured closure is not good enough. Filter state settles over
    // two renders — the defaults (today) first, then the merchant's persisted
    // filters — so the FIRST fetch would start with today's window, the filters
    // would then widen to "all", and the in-flight request would resolve and
    // populate the cache as fresh. One fetch, for a window nobody asked for.
    //
    // The list then showed today's rows while the server-computed chips
    // correctly reported the real filter: "In Transit 103" above an empty list,
    // righting itself minutes later when something else triggered a refetch.
    //
    // Reading the window from a ref at call time means whichever fetch runs uses
    // the CURRENT window, and refetch (rather than invalidate) guarantees a new
    // one actually runs when the window changes instead of racing the request
    // already in flight.
    const windowRef = useRef(window);
    windowRef.current = window;

    const windowKey = windowCacheKey(window);

    // The window the page shows; coverage compares the loaded window with it.
    useEffect(() => {
        setActiveWindowKey(queryClient, windowKey);
    }, [windowKey, queryClient]);

    const isFirstWindow = useRef(true);
    useEffect(() => {
        if (isFirstWindow.current) {
            // Nothing has been fetched yet; the query's own initial fetch covers it.
            isFirstWindow.current = false;
            return;
        }
        void (async () => {
            // A first load still running for the OLD window would be joined, not
            // replaced, and commit under the new filter. Cancel it first.
            if (shouldCancelBeforeWindowRefetch(queryClient.getQueryState(orderKeys.lists()))) {
                await queryClient.cancelQueries({ queryKey: orderKeys.lists(), exact: true });
            }
            await queryClient.refetchQueries({ queryKey: orderKeys.lists() });
        })();
    }, [windowKey, queryClient]);

    // Force refetch when trigger changes
    useEffect(() => {
        if (refetchTrigger) {
            diag.log(`[Diag:RQ:Query] refetchTrigger=${refetchTrigger}`);
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
        }
    }, [refetchTrigger, queryClient]);

    // Nothing is fetched or hydrated until the merchant's saved filter has
    // replaced the default seed. Before this gate the first fetch ran with the
    // seed window, and the refetch for the real window JOINED that in-flight
    // request (React Query only cancels a refetch when data already exists), so
    // the cache was filled with the wrong window and marked fresh: "Confirmed 1"
    // over "No confirmed orders" until a refocus 30s later.
    //
    // Once settled, a sessionStorage snapshot of the SAME window may seed the
    // cache for an instant first paint; React Query then refetches it if stale.
    const [snapshotChecked, setSnapshotChecked] = useState(false);
    useEffect(() => {
        if (!filtersSettled || snapshotChecked) return;
        if (queryClient.getQueryData(orderKeys.lists()) === undefined) {
            const snapshotKey = windowCacheKey(windowRef.current);
            const snapshot = readSwrCache(snapshotKey);
            if (snapshot) {
                diag.log(`[Diag:RQ:SWR] Hydrated ${snapshot.orders.length} orders from sessionStorage`);
                // The snapshot is a whole window as it was fetched: it covers that window.
                markListLoaded(queryClient, snapshotKey, null);
                queryClient.setQueryData(orderKeys.lists(), dedupeById(snapshot.orders), { updatedAt: snapshot.savedAt });
            }
        }
        setSnapshotChecked(true);
    }, [filtersSettled, snapshotChecked, queryClient]);

    // CRITICAL: Wait for Supabase client's internal session to be ready
    // Not just React state - the client must have completed _initialize()
    const enabled = !!session && clientReady && !!tenantId && filtersSettled && snapshotChecked;

    const query = useQuery({
        queryKey: orderKeys.lists(),
        queryFn: () => {
            const t = requireTenant(tenantId);
            return trackListFetch(queryClient, windowCacheKey(windowRef.current), () => readListMark(t), () => fetchOrders(t, windowRef.current));
        },
        enabled,
        // Short staleTime — realtime patches keep cache fresh between refetches
        staleTime: 30 * 1000, // 30 seconds
        gcTime: CACHE_PRESETS.FREQUENT.gcTime, // 10 mins
        // Refetch when window regains focus to catch missed updates
        refetchOnWindowFocus: true, // respects staleTime (30s)
        // Refetch on mount if data is stale
        refetchOnMount: true,
        // Lighter retry since we no longer throw for missing auth
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    });

    // Coverage reconciler. Whenever the query is idle and enabled, no list
    // mutation is pending, and the loaded window does not cover the one on
    // screen, fetch it. That ends every uncovered state: a window-change fetch
    // a mutation cancelled, a first load cancelled before it committed, a
    // snapshot of a different window. It cannot loop: a started fetch is not
    // idle, a commit covers the window, and a failed fetch for THIS window sets
    // `failedKey`, which leaves the query's own error and retry UI in charge.
    const loadedKey = useLoadedOrdersWindowKey();
    const failedKey = useFailedOrdersWindowKey();
    const listMutations = useIsMutating({ mutationKey: ORDERS_LIST_MUTATION_KEY });
    const fetchStatus = query.fetchStatus;
    useEffect(() => {
        if (!enabled || fetchStatus !== "idle" || listMutations > 0) return;
        if (listCovers(loadedKey, windowKey)) return;
        if (failedKey === windowKey) return;
        diag.log(`[Diag:RQ:Coverage] reconcile loaded=${loadedKey} active=${windowKey} — refetching`);
        void queryClient.refetchQueries({ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false });
    }, [enabled, fetchStatus, listMutations, loadedKey, failedKey, windowKey, queryClient]);

    return query;
}

/**
 * useArchivedOrdersQuery - React Query hook for archived orders
 */
export function useArchivedOrdersQuery(enabled: boolean = true) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: orderKeys.archived(),
        queryFn: () => orderRepository.findArchived(requireTenant(tenantId)),
        enabled: enabled && !!tenantId,
        // Archived orders don't need real-time freshness
        staleTime: CACHE_PRESETS.STATIC.staleTime * 2, // 1 hour
        gcTime: CACHE_PRESETS.STATIC.gcTime * 2,
        // Network Optimization: Exponential backoff for 3G drops
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });
}

/**
 * useUpdateOrderMutation - Optimistic update for order changes
 */
export function useUpdateOrderMutation() {
    const queryClient = coverage(useQueryClient());
    const { tenantId } = useAuth();

    return useMutation({
        mutationKey: [...ORDERS_LIST_MUTATION_KEY, "update"],
        mutationFn: async ({ orderId, updates, expectedVersion }: { orderId: string; updates: Partial<Order>; expectedVersion?: number }) => {
            const data = await orderRepository.update(orderId, updates, expectedVersion);
            return { orderId, updates, data };
        },
        // Optimistic update - update cache immediately
        onMutate: async ({ orderId, updates }) => {
            diag.log(`[Diag:RQ:UpdateMut] onMutate orderId=${orderId} fields=${Object.keys(updates).join(',')}`);
            getOrderBatcher()?.markMutated(orderId);
            await cancelListFetches(queryClient, tenantId);

            // Snapshot current data to revert if the request fails
            const previousOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());

            // Optimistically update cache 
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.map((order) =>
                    order.id === orderId
                        ? { ...order, ...updates } as Order
                        : order
                );
                return updated;
            });

            return { previousOrders };
        },
        onSuccess: ({ orderId, data }) => {
            diag.log(`[Diag:RQ:UpdateMut] onSuccess orderId=${orderId}`);
            // Overwrite optimistic cache with actual server data to ensure consistency
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.map((order) =>
                    order.id === orderId ? { ...order, ...data } : order
                );
                return updated;
            });
        },
        onError: (err, variables, context) => {
            diag.log(`[Diag:RQ:UpdateMut] onError orderId=${variables.orderId} err=${err instanceof Error ? err.message : err} rollingBack=${!!context?.previousOrders}`);
            reportOrderError(err, {
                operation: "updateOrder",
                orderId: variables.orderId,
                extra: { fields: Object.keys(variables.updates ?? {}) },
            });

            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }

            if (err instanceof Error && err.message === "CONFLICT_DETECTED") {
                toast.error("Order was modified elsewhere. Refreshing data...", { duration: 3000 });
                // Force a fresh refetch immediately to get the latest state
                queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            } else if (err instanceof FutureOrderDateError) {
                // Shown against the order-date field by the caller, with the
                // merchant's other edits still in the form — not as a toast.
            } else {
                toast.error(err instanceof Error ? err.message : "Failed to update order.");
            }
        },
    });
}

/**
 * useUpdateStatusMutation - Optimistic status change
 */
export function useUpdateStatusMutation() {
    const queryClient = coverage(useQueryClient());
    const { tenantId } = useAuth();

    return useMutation({
        mutationKey: [...ORDERS_LIST_MUTATION_KEY, "status"],
        mutationFn: async ({
            orderId,
            status,
            rejectionReason,
            rejectionReasonId,
            last_status_changed_by_name,
            last_status_changed_by_avatar,
            expectedVersion,
        }: {
            orderId: string;
            status: Order["status"];
            rejectionReason?: string;
            rejectionReasonId?: string;
            last_status_changed_by_name?: string;
            last_status_changed_by_avatar?: string;
            expectedVersion?: number;
        }) => {
            const data = await orderRepository.updateStatus(
                orderId,
                status,
                rejectionReason,
                last_status_changed_by_name,
                last_status_changed_by_avatar,
                expectedVersion,
                rejectionReasonId
            );
            return { orderId, status, data };
        },
        onMutate: async ({ orderId, status, rejectionReason, last_status_changed_by_name, last_status_changed_by_avatar }) => {
            const mutSeq = nextMutationSeq(orderId);
            diag.log(`[Diag:RQ:StatusMut] onMutate orderId=${orderId} status=${status} mutSeq=${mutSeq}`);

            // Only this row is snapshotted: a whole-array rollback would also
            // undo every realtime update other rows received meanwhile.
            const previousRow = queryClient.getQueryData<Order[]>(orderKeys.lists())?.find((o) => o.id === orderId);

            // Guard the row against our own write's echo (versions up to base+1);
            // the history trigger's base+2 write and later peer writes apply.
            getOrderBatcher()?.markMutated(orderId, previousRow?.version);
            await cancelListFetches(queryClient, tenantId);

            // Optimistic update
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.map((order) =>
                    order.id === orderId
                        ? ({
                            ...order,
                            status,
                            rejection_reason: rejectionReason
                                ? rejectionReason
                                : (status === "cancelled" || status === "rejected")
                                    ? order.rejection_reason
                                    : undefined,
                            delivered_at: status === "delivered" ? new Date().toISOString() : order.delivered_at,
                            // Deliberately NOT stamping `updated_at` here: a
                            // client-clock value would be compared against real
                            // server timestamps by the realtime dedup and could
                            // suppress genuine incoming events. onSuccess writes
                            // the authoritative server row moments later.
                            last_status_changed_by_name,
                            last_status_changed_by_avatar,
                        } as Order)
                        : order
                );
                return updated;
            });

            return { previousRow, mutSeq };
        },
        onSuccess: ({ orderId, data }, variables, context) => {
            // LATEST-WINS: If a newer mutation has started for this order,
            // don't overwrite the cache — the newer mutation's optimistic state is correct.
            if (context?.mutSeq != null && !isMutationCurrent(orderId, context.mutSeq)) {
                diag.log(`[Diag:RQ:StatusMut] onSuccess SKIPPED (superseded) orderId=${orderId} mutSeq=${context.mutSeq}`);
                return;
            }
            diag.log(`[Diag:RQ:StatusMut] onSuccess orderId=${orderId} mutSeq=${context?.mutSeq}`);

            // The PATCH response, into every list-prefixed cache (main list,
            // search, duplicate margin) — version-checked, and only the keys
            // each cached row already has: the response is `select()` (every
            // column), and the margin columns must never enter a list cache.
            queryClient.setQueriesData<Order[]>({ queryKey: orderKeys.lists() }, (old) => patchRow(old, data));
        },
        onError: (err, variables, context) => {
            diag.log(`[Diag:RQ:StatusMut] onError orderId=${variables.orderId} err=${err instanceof Error ? err.message : err} mutSeq=${context?.mutSeq} reverting=${!!context?.previousRow}`);
            // LATEST-WINS: If a newer mutation has started for this order,
            // don't rollback — the newer mutation's optimistic state is correct.
            if (context?.mutSeq != null && !isMutationCurrent(variables.orderId, context.mutSeq)) return;

            reportOrderError(err, { operation: "updateOrderStatus", orderId: variables.orderId, extra: { status: variables.status } });

            // Revert only the fields the optimistic write set, and only while
            // the row is still at the version that write was based on.
            if (context?.previousRow) {
                const previousRow = context.previousRow;
                queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => revertOptimisticStatus(old, previousRow));
            }

            const conflict = err instanceof Error && err.message === "CONFLICT_DETECTED";
            // A non-conflict failure means the event the guard skipped was not
            // our echo: re-apply it. A conflict is superseded by the refetch.
            getOrderBatcher()?.releaseGuard(variables.orderId, { replay: !conflict });

            if (conflict) {
                toast.error("Order was modified elsewhere. Refreshing data...", { duration: 3000 });
                // Force a fresh refetch immediately
                queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            } else {
                toast.error(err instanceof Error ? err.message : "Failed to update order status.");
            }
        },
        // No onSettled refetch. The status change's only caller,
        // useOrderCrud.updateOrderStatus, runs `catchUpAfterOwnWrite` once
        // the history row (and the trigger's base+2 write) has landed. It used
        // to re-download the whole window 2s after every status change.
    });
}

/** The fields the optimistic status write sets — and so the only ones a failed write reverts. */
const OPTIMISTIC_STATUS_FIELDS = [
    "status", "rejection_reason", "delivered_at", "last_status_changed_by_name", "last_status_changed_by_avatar",
] as const satisfies readonly (keyof Order)[];

/** Revert the optimistic fields of `previous.id`, if the cached row is still at `previous.version`. */
export function revertOptimisticStatus(rows: Order[] | undefined, previous: Order): Order[] | undefined {
    if (!rows) return rows;
    let changed = false;
    const next = rows.map((o) => {
        if (o.id !== previous.id || o.version !== previous.version) return o;
        changed = true;
        const reverted: Order = { ...o };
        for (const key of OPTIMISTIC_STATUS_FIELDS) {
            Object.assign(reverted, { [key]: previous[key] });
        }
        return reverted;
    });
    return changed ? next : rows;
}

/**
 * Write a server row into a cached list: skipped when the cache already holds
 * a newer version, and limited to the keys the cached row already has (so a
 * `select()` response cannot add the margin columns to a list cache). Returns
 * `rows` unchanged when nothing differs.
 */
export function patchRow(rows: Order[] | undefined, data: Order): Order[] | undefined {
    if (!Array.isArray(rows)) return rows;
    let changed = false;
    const next = rows.map((o) => {
        if (o.id !== data.id) return o;
        if (typeof o.version === "number" && typeof data.version === "number" && data.version < o.version) return o;
        const source = data as unknown as Record<string, unknown>;
        const current = o as unknown as Record<string, unknown>;
        let patched: Record<string, unknown> | null = null;
        for (const key of Object.keys(current)) {
            if (key in source && source[key] !== current[key]) {
                patched ??= { ...current };
                patched[key] = source[key];
            }
        }
        if (!patched) return o;
        changed = true;
        return patched as unknown as Order;
    });
    return changed ? next : rows;
}

function riskDataEqual(a: Order["risk_data"], b: Order["risk_data"]): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * `risk_data` is a pure function of (tenant, normalized phone): a status change
 * moves the customer's trust row in the same transaction, so every cached
 * order with that phone has new risk. Delta rows carry fresh `risk_data`
 * (withRiskData); copy it onto same-customer rows in the main list. No request.
 */
export function propagateRiskData(queryClient: QueryClient, changed: readonly Order[]): void {
    const fresh = new Map<string, Order["risk_data"]>();
    for (const row of changed) {
        if (row.risk_data === undefined || !row.tenant_id) continue;
        const phone = normalizePhoneLikeDb(row.phone);
        if (phone) fresh.set(`${row.tenant_id}|${phone}`, row.risk_data);
    }
    if (fresh.size === 0) return;
    queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
        if (!old) return old;
        let changedAny = false;
        const next = old.map((o) => {
            if (!o.tenant_id) return o;
            const risk = fresh.get(`${o.tenant_id}|${normalizePhoneLikeDb(o.phone)}`);
            if (risk === undefined || riskDataEqual(o.risk_data, risk)) return o;
            changedAny = true;
            return { ...o, risk_data: risk };
        });
        return changedAny ? next : old;
    });
}

/**
 * After our own write has fully landed (for a status change: the PATCH and the
 * history row whose trigger writes the row again), bring every list cache up
 * to date: one catch-up delta for the main list — it carries our row at its
 * final version, any peer writes since the watermark, and fresh risk — then a
 * refetch of the ACTIVE list sub-keys (search, the duplicate margin), which
 * realtime never patches. This is what the 2s full refetch used to do, at the
 * cost of one delta and the small sub-queries. Never rejects.
 */
export async function catchUpAfterOwnWrite(
    queryClient: QueryClient,
    tenantId: string | null,
    { source, since }: { source: string; since?: string },
): Promise<void> {
    if (!tenantId) return;
    await requestOrdersCatchUp(queryClient, tenantId, { source, since });
    const mainKeyLength = orderKeys.lists().length;
    await queryClient
        .invalidateQueries({ queryKey: orderKeys.lists(), predicate: (q) => q.queryKey.length > mainKeyLength })
        .catch((err: unknown) => { diag.error("[Diag:RQ:CatchUp] sub-key refresh failed", err); });
}

/**
 * usePrefetchOrders - Prefetch orders data on hover/focus
 * Call this on navigation link hover to preload data before user clicks
 */
export function usePrefetchOrders() {
    const queryClient = coverage(useQueryClient());
    const { tenantId } = useAuth();

    return () => {
        if (!tenantId) return;
        queryClient.prefetchQuery({
            queryKey: orderKeys.lists(),
            // Prefetch on hover has no filter context; it warms the unwindowed
            // list and the real query replaces it with the active window.
            queryFn: () => trackListFetch(queryClient, "all", () => readListMark(tenantId), () => fetchOrders(tenantId, null)),
            // Match staleTime from useOrdersQuery
            staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        });
    };
}

/**
 * useDeleteOrderMutation - Optimistic delete
 */
export function useDeleteOrderMutation() {
    const queryClient = coverage(useQueryClient());
    const { tenantId } = useAuth();

    return useMutation({
        mutationKey: [...ORDERS_LIST_MUTATION_KEY, "delete"],
        mutationFn: async (orderId: string) => {
            await orderRepository.update(orderId, { deleted_at: new Date().toISOString() });
            return orderId;
        },
        onMutate: async (orderId) => {
            await cancelListFetches(queryClient, tenantId);

            const previousOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());

            // Optimistic update
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.filter((order) => order.id !== orderId) || [];
                return updated;
            });

            return { previousOrders };
        },
        onError: (err, variables, context) => {
            reportOrderError(err, { operation: "deleteOrder", orderId: variables });
            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
            toast.error(err instanceof Error ? err.message : "Failed to delete order");
        },
    });
}

/**
 * useCreateOrderMutation - Optimistic create
 */
export function useCreateOrderMutation() {
    const queryClient = coverage(useQueryClient());
    // The server action derives the tenant from this token — the client no
    // longer tells the server which tenant to write into.
    const { session, tenantId } = useAuth();

    return useMutation({
        mutationKey: [...ORDERS_LIST_MUTATION_KEY, "create"],
        mutationFn: async (orderData: CreateOrderInput) => {
            const result = await createOrderAction(orderData, session?.access_token ?? "");
            if (!result.success || !result.data) {
                console.error("[createOrderMutation] Server action failed:", result.error);
                throw new Error(result.error || "Failed to create order");
            }
            return result.data;
        },
        onMutate: async (newOrder) => {
            await cancelListFetches(queryClient, tenantId);

            const previousOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());

            // Create a temporary optimistic order
            const tempId = `temp-${Date.now()}`;
            const optimisticOrder = {
                ...newOrder,
                id: tempId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                // Fill other required fields with defaults if missing
                status: newOrder.status || "new",
                is_archived: false,
                payment_status: newOrder.payment_status || "cod",
            } as Order;

            // Optimistic update - add to top
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) =>
                [optimisticOrder, ...(old || [])]
            );

            return { previousOrders, tempId };
        },
        onSuccess: (realOrder, _variables, context) => {
            // Replace the temporary optimistic order with the real server data
            if (context?.tempId) {
                queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) =>
                    (old || []).map(o => o.id === context.tempId ? realOrder : o)
                );
            }
        },
        onError: (err, _variables, context) => {
            reportOrderError(err, { operation: "createOrder" });
            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
            toast.error(err instanceof Error ? err.message : "Failed to create order");
        },
    });
}
