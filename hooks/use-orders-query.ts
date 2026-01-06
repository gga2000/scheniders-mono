"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Order } from "@/lib/supabase";
import { normalizeOrder } from "@/lib/order-normalize-utils";

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
    const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(normalizeOrder);
}

// Fetch archived orders
async function fetchArchivedOrders(): Promise<Order[]> {
    const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("is_archived", true)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(normalizeOrder);
}

/**
 * useOrdersQuery - React Query hook for fetching orders with caching
 * 
 * Benefits:
 * - Automatic caching with optimized timings
 * - Background refetching for fresh data on window focus
 * - Deduplication of parallel requests
 * - Instant data on repeat visits (from cache)
 */
export function useOrdersQuery() {
    return useQuery({
        queryKey: orderKeys.lists(),
        queryFn: fetchOrders,
        // Data is fresh for 2 minutes (balance between freshness and performance)
        staleTime: 2 * 60 * 1000,
        // Keep in cache for 10 minutes (allows instant back-navigation)
        gcTime: 10 * 60 * 1000,
        // Refetch when window regains focus to catch missed updates
        refetchOnWindowFocus: "always",
        // Don't refetch on mount if data is in cache (use stale data, refetch in background)
        refetchOnMount: false,
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
        staleTime: 10 * 60 * 1000, // Archived orders change less frequently
    });
}

/**
 * useUpdateOrderMutation - Optimistic update for order changes
 */
export function useUpdateOrderMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ orderId, updates }: { orderId: string; updates: Partial<Order> }) => {
            const { error } = await supabase
                .from("orders")
                .update(updates)
                .eq("id", orderId);

            if (error) throw error;
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
            const updateData: Partial<Order> = { status };
            if (rejectionReason) updateData.rejection_reason = rejectionReason;
            if (status === "delivered") updateData.delivered_at = new Date().toISOString();
            if (status === "cancelled") updateData.cancelled_at = new Date().toISOString();

            const { error } = await supabase
                .from("orders")
                .update(updateData)
                .eq("id", orderId);

            if (error) throw error;
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
                            rejection_reason: rejectionReason || order.rejection_reason,
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
            staleTime: 2 * 60 * 1000,
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
            const { error } = await supabase
                .from("orders")
                .delete()
                .eq("id", orderId);

            if (error) throw error;
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
            // Ideally: import { createOrderAction } from "@/app/actions/orders";
            // But we can't import server actions into this file easily if it's "use client"? 
            // Actually we can.

            // Wait, the previous file imported `createOrderAction` in `use-orders.ts`. 
            // Passing it as a prop or importing it here? 
            // Let's assume we can fetch it or pass it.
            // Actually, the mutationFn can just call the server action. 
            const { createOrderAction } = await import("@/app/actions/orders");
            const result = await createOrderAction(orderData);
            if (!result.success || !result.data) {
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
