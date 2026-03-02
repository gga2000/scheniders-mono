"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type Order, type OrderItem } from "@/types";
import { CACHE_PRESETS } from '@/lib/query-config';
import { orderRepository } from "@/lib/repositories/order-repository";

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

// Fetch all active orders
async function fetchOrders(): Promise<Order[]> {
    return orderRepository.findAll();
}

// Fetch archived orders
async function fetchArchivedOrders(): Promise<Order[]> {
    return orderRepository.findArchived();
}

/**
 * useOrdersQuery - React Query hook for fetching orders with caching
 *
 * Benefits:
 * - Automatic caching with optimized timings
 * - Background refetching for fresh data on window focus
 * - Deduplication of parallel requests
 * - Instant data on repeat visits (from cache)
 * - Force refetch on app reopen after being closed
 *
 * @param refetchTrigger - Optional trigger to force refetch (changes invalidate cache)
 */
export function useOrdersQuery(refetchTrigger?: string) {
    const queryClient = useQueryClient();

    // Force refetch when trigger changes
    useEffect(() => {
        if (refetchTrigger) {
            console.log(`[useOrdersQuery] Force refetch triggered: ${refetchTrigger}`);
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
        }
    }, [refetchTrigger, queryClient]);

    return useQuery({
        queryKey: orderKeys.lists(),
        queryFn: fetchOrders,
        // Increased cache time to reduce queries heavily on 3G
        staleTime: CACHE_PRESETS.FREQUENT.staleTime * 2, // 4 mins
        gcTime: CACHE_PRESETS.FREQUENT.gcTime * 2, // 20 mins
        // Refetch when window regains focus to catch missed updates
        refetchOnWindowFocus: "always",
        // Don't refetch on mount if data is in cache (use stale data, refetch in background)
        refetchOnMount: false,
        // Network Optimization: Exponential backoff for 3G drops
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
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
        mutationFn: async ({ orderId, updates }: { orderId: string; updates: Partial<Order> }) => {
            await orderRepository.update(orderId, updates);
            return { orderId, updates };
        },
        // Optimistic update - update cache immediately
        onMutate: async ({ orderId, updates }) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: orderKeys.lists() });

            // Snapshot current data
            const previousOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());

            // Optimistically update cache
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) =>
                old?.map((order) =>
                    order.id === orderId ? { ...order, ...updates } : order
                )
            );

            return { previousOrders };
        },
        // Rollback on error
        onError: (err, variables, context) => {
            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
        },
        // Refetch after success to ensure consistency
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
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
            const updateData = await orderRepository.updateStatus(orderId, status, rejectionReason);
            return { orderId, status, updateData };
        },
        onMutate: async ({ orderId, status, rejectionReason }) => {
            await queryClient.cancelQueries({ queryKey: orderKeys.lists() });

            const previousOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());

            // Optimistic update
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) =>
                old?.map((order) =>
                    order.id === orderId
                        ? {
                            ...order,
                            status,
                            // Carry new reason if provided; clear stale one when reverting away from cancelled/rejected
                            rejection_reason: rejectionReason
                                ? rejectionReason
                                : (status === "cancelled" || status === "rejected")
                                    ? order.rejection_reason
                                    : undefined,
                            delivered_at: status === "delivered" ? new Date().toISOString() : order.delivered_at,
                        }
                        : order
                )
            );

            return { previousOrders };
        },
        onError: (err, variables, context) => {
            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
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
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) =>
                old?.filter((order) => order.id !== orderId) || []
            );

            return { previousOrders };
        },
        onError: (err, variables, context) => {
            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
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
            // We can't use server actions here easily if we want to keep it purely client-side hook logic 
            // but useOrders used createOrderAction. Let's stick to that or import it.
            // Ideally this should invoke the server action or supabase directly. 
            // Since createOrderAction is complex (generates ID etc), we should probably wrap it.
            // However, for consistency with other mutations in this file, we might want to keep it simple.
            // BUT createOrderAction handles ID generation which is crucial.
            // Let's defer implementation of logic to the consumer or import the action.
            // Ideally: import { orderRepository } from "@/lib/repositories/order-repository";
            // But we can't import server actions into this file easily if it's "use client"? 
            // Actually we can.

            // Wait, the previous file imported `createOrderAction` in `use-orders.ts`. 
            // Passing it as a prop or importing it here? 
            // Let's assume we can fetch it or pass it.
            // Actually, the mutationFn can just call the server action. 
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
        onError: (err, variables, context) => {
            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
        },
        onSettled: () => {
            // Invalidate to get the real ID and server-side fields
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
        },
    });
}
