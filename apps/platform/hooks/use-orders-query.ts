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
 * - Automatic caching (5 min stale, 30 min cache)
 * - Background refetching for fresh data
 * - Deduplication of parallel requests
 * - Instant data on repeat visits
 */
export function useOrdersQuery() {
    return useQuery({
        queryKey: orderKeys.lists(),
        queryFn: fetchOrders,
        // Data is fresh for 5 minutes
        staleTime: 5 * 60 * 1000,
        // Keep in cache for 30 minutes
        gcTime: 30 * 60 * 1000,
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
 */
export function usePrefetchOrders() {
    const queryClient = useQueryClient();

    return () => {
        queryClient.prefetchQuery({
            queryKey: orderKeys.lists(),
            queryFn: fetchOrders,
            staleTime: 5 * 60 * 1000,
        });
    };
}
