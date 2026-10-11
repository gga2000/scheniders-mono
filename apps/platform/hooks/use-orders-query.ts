import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
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
import type { OrderWindow } from "@/lib/order-window";
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
 * Incremental delta sync — used on realtime reconnect / app-reopen / heartbeat
 * drift INSTEAD of re-pulling the entire orders table (~5.8MB / 3k+ rows).
 * Fetches only rows changed since the cache's high-water mark (max updated_at)
 * and merges them through the batcher (same rules as live events). Falls back to
 * a full invalidate when there's no cache/batcher or the delta fetch fails.
 */
export async function syncOrdersDelta(queryClient: QueryClient, source: string): Promise<void> {
    const cached = queryClient.getQueryData<Order[]>(orderKeys.lists());
    const batcher = getOrderBatcher();
    if (!cached || cached.length === 0 || !batcher) {
        diag.log(`[Diag:RQ:Delta] source=${source} — no cache/batcher, full refetch`);
        queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
        return;
    }
    // High-water mark: the newest updated_at currently in cache.
    let since = '';
    for (const o of cached) {
        if (o.updated_at && o.updated_at > since) since = o.updated_at;
    }
    if (!since) {
        queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
        return;
    }
    try {
        const _t = performance.now();
        const changed = await orderRepository.findChangedSince(since);
        const applied = batcher.applyChangedOrders(changed);
        diag.log(`[Diag:RQ:Delta] source=${source} since=${since} fetched=${changed.length} applied=${applied} took=${(performance.now() - _t).toFixed(1)}ms`);
    } catch (err) {
        diag.error(`[Diag:RQ:Delta] source=${source} FAILED — full refetch`, err);
        queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    }
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

/** A stable string for a window, so a snapshot is only ever reused for the window it holds. */
export function windowCacheKey(window: OrderWindow): string {
    return window ? `${window.fromInstant}-${window.toInstant}` : "all";
}

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

// Fetch all active orders — auth gating is handled by the `enabled` flag in useOrdersQuery.
async function fetchOrders(window: OrderWindow = null): Promise<Order[]> {
    const _tFetch = performance.now();
    perfTrace.markRepeat('orders:fetch-start');
    diag.log(`[Diag:RQ:Fetch] fetchOrders START`);
    const result = await orderRepository.findWindow(window);
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

// Fetch archived orders
async function fetchArchivedOrders(): Promise<Order[]> {
    return orderRepository.findArchived();
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
    const queryClient = useQueryClient();
    const { session, clientReady } = useAuth();

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
    const isFirstWindow = useRef(true);
    useEffect(() => {
        if (isFirstWindow.current) {
            // Nothing has been fetched yet; the query's own initial fetch covers it.
            isFirstWindow.current = false;
            return;
        }
        void queryClient.refetchQueries({ queryKey: orderKeys.lists() });
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
            const snapshot = readSwrCache(windowCacheKey(windowRef.current));
            if (snapshot) {
                diag.log(`[Diag:RQ:SWR] Hydrated ${snapshot.orders.length} orders from sessionStorage`);
                queryClient.setQueryData(orderKeys.lists(), snapshot.orders, { updatedAt: snapshot.savedAt });
            }
        }
        setSnapshotChecked(true);
    }, [filtersSettled, snapshotChecked, queryClient]);

    return useQuery({
        queryKey: orderKeys.lists(),
        queryFn: () => fetchOrders(windowRef.current),
        // CRITICAL: Wait for Supabase client's internal session to be ready
        // Not just React state - the client must have completed _initialize()
        enabled: !!session && clientReady && filtersSettled && snapshotChecked,
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
}

/**
 * useArchivedOrdersQuery - React Query hook for archived orders
 */
export function useArchivedOrdersQuery(enabled: boolean = true) {
    return useQuery({
        queryKey: orderKeys.archived(),
        queryFn: fetchArchivedOrders,
        enabled,
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
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ orderId, updates, expectedVersion }: { orderId: string; updates: Partial<Order>; expectedVersion?: number }) => {
            const data = await orderRepository.update(orderId, updates, expectedVersion);
            return { orderId, updates, data };
        },
        // Optimistic update - update cache immediately
        onMutate: async ({ orderId, updates }) => {
            diag.log(`[Diag:RQ:UpdateMut] onMutate orderId=${orderId} fields=${Object.keys(updates).join(',')}`);
            getOrderBatcher()?.markMutated(orderId);
            await queryClient.cancelQueries({ queryKey: orderKeys.lists() });

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
    const queryClient = useQueryClient();

    return useMutation({
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
            const batcher = getOrderBatcher();

            // Mark as recently mutated so realtime batcher skips stale broadcasts
            batcher?.markMutated(orderId);
            await queryClient.cancelQueries({ queryKey: orderKeys.lists() });

            const previousOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());

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

            return { previousOrders, mutSeq };
        },
        onSuccess: ({ orderId, data }, variables, context) => {
            // LATEST-WINS: If a newer mutation has started for this order,
            // don't overwrite the cache — the newer mutation's optimistic state is correct.
            if (context?.mutSeq != null && !isMutationCurrent(orderId, context.mutSeq)) {
                diag.log(`[Diag:RQ:StatusMut] onSuccess SKIPPED (superseded) orderId=${orderId} mutSeq=${context.mutSeq}`);
                return;
            }
            diag.log(`[Diag:RQ:StatusMut] onSuccess orderId=${orderId} mutSeq=${context?.mutSeq}`);

            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.map((order) =>
                    order.id === orderId ? { ...order, ...data } : order
                );
                return updated;
            });
        },
        onError: (err, variables, context) => {
            diag.log(`[Diag:RQ:StatusMut] onError orderId=${variables.orderId} err=${err instanceof Error ? err.message : err} mutSeq=${context?.mutSeq} rollingBack=${!!context?.previousOrders}`);
            // LATEST-WINS: If a newer mutation has started for this order,
            // don't rollback — the newer mutation's optimistic state is correct.
            if (context?.mutSeq != null && !isMutationCurrent(variables.orderId, context.mutSeq)) return;

            reportOrderError(err, { operation: "updateOrderStatus", orderId: variables.orderId, extra: { status: variables.status } });

            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }

            if (err instanceof Error && err.message === "CONFLICT_DETECTED") {
                toast.error("Order was modified elsewhere. Refreshing data...", { duration: 3000 });
                // Force a fresh refetch immediately
                queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            } else {
                toast.error(err instanceof Error ? err.message : "Failed to update order status.");
            }
        },
        // Self-healing: re-sync cache from Supabase after every mutation settles.
        // This catches any subtle optimistic/realtime desync within 2 seconds.
        onSettled: () => {
            diag.log(`[Diag:RQ:StatusMut] onSettled — scheduling refetch in 2s`);
            setTimeout(() => {
                diag.log(`[Diag:RQ:StatusMut] onSettled REFETCH fired (2s delayed)`);
                queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            }, 2000);
        },
    });
}

/**
 * usePrefetchOrders - Prefetch orders data on hover/focus
 * Call this on navigation link hover to preload data before user clicks
 */
export function usePrefetchOrders() {
    const queryClient = useQueryClient();

    return () => {
        queryClient.prefetchQuery({
            queryKey: orderKeys.lists(),
            // Prefetch on hover has no filter context; it warms the unwindowed
            // list and the real query replaces it with the active window.
            queryFn: () => fetchOrders(null),
            // Match staleTime from useOrdersQuery
            staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        });
    };
}

/**
 * useDeleteOrderMutation - Optimistic delete
 */
export function useDeleteOrderMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (orderId: string) => {
            await orderRepository.update(orderId, { deleted_at: new Date().toISOString() });
            return orderId;
        },
        onMutate: async (orderId) => {
            await queryClient.cancelQueries({ queryKey: orderKeys.lists() });

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
    const queryClient = useQueryClient();
    // The server action derives the tenant from this token — the client no
    // longer tells the server which tenant to write into.
    const { session } = useAuth();

    return useMutation({
        mutationFn: async (orderData: CreateOrderInput) => {
            const result = await createOrderAction(orderData, session?.access_token ?? "");
            if (!result.success || !result.data) {
                console.error("[createOrderMutation] Server action failed:", result.error);
                throw new Error(result.error || "Failed to create order");
            }
            return result.data;
        },
        onMutate: async (newOrder) => {
            await queryClient.cancelQueries({ queryKey: orderKeys.lists() });

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
