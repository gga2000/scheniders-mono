import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type Order } from "@/types";
import { CACHE_PRESETS } from '@/lib/query-config';
import { orderRepository } from "@/lib/repositories/order-repository";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "sonner";
import type { RealtimeBatcher } from "@/lib/realtime-batcher";
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
// SESSION STORAGE SWR CACHE (Stale-While-Revalidate)
// Shows cached data instantly on refresh while
// fetching fresh data in the background.
// Uses sessionStorage (not IndexedDB) to avoid
// cross-tab staleness / conflict-detection issues.
// =============================================
const SS_KEY = "orders_cache_v1";

function getCachedOrders(): Order[] | undefined {
    if (typeof window === "undefined") return undefined;
    try {
        const raw = sessionStorage.getItem(SS_KEY);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
    } catch {
        // Corrupt or unavailable — ignore
    }
    return undefined;
}

export function setCachedOrders(orders: Order[]): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(SS_KEY, JSON.stringify(orders));
    } catch {
        // QuotaExceeded — ignore, cache is best-effort
    }
}

// Fetch all active orders — auth gating is handled by the `enabled` flag in useOrdersQuery.
async function fetchOrders(): Promise<Order[]> {
    const result = await orderRepository.findAll();

    // Persist to sessionStorage for SWR on next refresh
    setCachedOrders(result);

    return result;
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
export function useOrdersQuery(refetchTrigger?: string) {
    const queryClient = useQueryClient();
    const { session } = useAuth();
    // Read cached data once via useState lazy initializer (avoids ref-during-render lint)
    const [cachedInitialData] = useState(() => getCachedOrders());

    // Force refetch when trigger changes
    useEffect(() => {
        if (refetchTrigger) {
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
        }
    }, [refetchTrigger, queryClient]);

    return useQuery({
        queryKey: orderKeys.lists(),
        queryFn: fetchOrders,
        // Auth-gated: don't fetch until we have a session
        // This eliminates the "No auth session" throw → retry cycle
        enabled: !!session,
        // Serve cached data instantly while refetching in background
        initialData: cachedInitialData,
        // If we have initialData, mark it as potentially stale so
        // React Query refetches immediately in the background
        initialDataUpdatedAt: cachedInitialData ? 0 : undefined,
        // Short staleTime — realtime patches keep cache fresh between refetches
        staleTime: 30 * 1000, // 30 seconds
        gcTime: CACHE_PRESETS.FREQUENT.gcTime, // 10 mins
        // Refetch when window regains focus to catch missed updates
        refetchOnWindowFocus: true, // respects staleTime (30s)
        // Refetch on mount to ensure fresh data
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
        mutationFn: async ({ orderId, updates, user_id }: { orderId: string; updates: Partial<Order>; user_id?: string }) => {
            const data = await orderRepository.update(orderId, updates);
            return { orderId, updates, data };
        },
        // Optimistic update - update cache immediately
        onMutate: async ({ orderId, updates }) => {
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
                // Keep SWR session storage perfectly in sync to avoid stale flash on refresh
                if (updated) setCachedOrders(updated);
                return updated;
            });

            return { previousOrders };
        },
        onSuccess: ({ orderId, data }) => {
            // Overwrite optimistic cache with actual server data to ensure consistency
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.map((order) =>
                    order.id === orderId ? { ...order, ...data } : order
                );
                if (updated) setCachedOrders(updated);
                return updated;
            });
        },
        onError: (err, variables, context) => {
            console.error(`[UpdateOrder] onError for ${variables.orderId}:`, err);
            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
            toast.error(err instanceof Error ? err.message : "Failed to update order.");
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
        }: {
            orderId: string;
            status: Order["status"];
            rejectionReason?: string;
        }) => {
            const data = await orderRepository.updateStatus(orderId, status, rejectionReason);
            return { orderId, status, data };
        },
        onMutate: async ({ orderId, status, rejectionReason }) => {
            const mutSeq = nextMutationSeq(orderId);
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
                            updated_at: new Date().toISOString(),
                        } as Order)
                        : order
                );
                // Keep SWR session storage perfectly in sync to avoid stale flash on refresh
                if (updated) setCachedOrders(updated);
                return updated;
            });

            return { previousOrders, mutSeq };
        },
        onSuccess: ({ orderId, data }, variables, context) => {
            // LATEST-WINS: If a newer mutation has started for this order,
            // don't overwrite the cache — the newer mutation's optimistic state is correct.
            if (context?.mutSeq != null && !isMutationCurrent(orderId, context.mutSeq)) return;

            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.map((order) =>
                    order.id === orderId ? { ...order, ...data } : order
                );
                if (updated) setCachedOrders(updated);
                return updated;
            });
        },
        onError: (err, variables, context) => {
            // LATEST-WINS: If a newer mutation has started for this order,
            // don't rollback — the newer mutation's optimistic state is correct.
            if (context?.mutSeq != null && !isMutationCurrent(variables.orderId, context.mutSeq)) return;

            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
            toast.error(err instanceof Error ? err.message : "Failed to update order status.");
        },
        // Self-healing: re-sync cache from Supabase after every mutation settles.
        // This catches any subtle optimistic/realtime desync within 2 seconds.
        onSettled: () => {
            setTimeout(() => {
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
            queryFn: fetchOrders,
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
            await orderRepository.delete(orderId);
            return orderId;
        },
        onMutate: async (orderId) => {
            await queryClient.cancelQueries({ queryKey: orderKeys.lists() });

            const previousOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());

            // Optimistic update
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.filter((order) => order.id !== orderId) || [];
                // Keep SWR session storage perfectly in sync to avoid stale flash on refresh
                setCachedOrders(updated);
                return updated;
            });

            return { previousOrders };
        },
        onError: (err, variables, context) => {
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

    return useMutation({
        mutationFn: async (orderData: Omit<Order, "id" | "created_at" | "updated_at">) => {
            const { createOrderAction } = await import("@/app/actions/orders");
            const result = await createOrderAction(orderData);
            if (!result.success || !result.data) {
                console.error("[createOrderMutation] Server action failed:", result.error);
                console.error("[createOrderMutation] Order data:", JSON.stringify(orderData, null, 2));
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
        onError: (err, variables, context) => {
            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
            toast.error(err instanceof Error ? err.message : "Failed to create order");
        },
    });
}
