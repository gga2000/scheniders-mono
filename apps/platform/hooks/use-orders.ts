"use client";

import { useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Order } from "@/lib/supabase";

// Decomposed hooks
import { useOrderFilters } from "@/hooks/use-order-filters";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { useOrderAuxiliary } from "@/hooks/use-order-auxiliary";
import { useOrderCrud } from "@/hooks/use-order-crud";
import { useAppLifecycle } from "@/hooks/use-app-lifecycle";

// React Query hooks for caching
import {
    useOrdersQuery,
    useArchivedOrdersQuery,
    orderRefetchTriggers,
} from "@/hooks/use-orders-query";

// =============================================
// ENHANCED ORDERS HOOK (Composition Root)
// Composes focused sub-hooks into a single API
// surface. Same return type for backward compat.
// =============================================

export function useOrders() {
    // =============================================
    // REACT QUERY INTEGRATION FOR CACHING
    // =============================================
    const queryClient = useQueryClient();

    // Track refetch triggers for app reopen and realtime reconnection
    const [refetchTrigger, setRefetchTrigger] = useState<string | undefined>();

    // Detect app reopen and trigger refetch
    useAppLifecycle(() => {
        console.log("[useOrders] App reopened - triggering order refetch");
        setRefetchTrigger(orderRefetchTriggers.appReopen + Date.now());
    });

    const { data: cachedOrders, isLoading: queryLoading, error: queryError, isFetching } = useOrdersQuery(refetchTrigger);

    // Core state - seeded from React Query cache
    const [orders, setOrders] = useState<Order[]>(() => {
        const cached = queryClient.getQueryData<Order[]>(["orders", "list"]);
        return cached || [];
    });
    const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(() => {
        const cached = queryClient.getQueryData<Order[]>(["orders", "list"]);
        return !cached;
    });
    const [error, setError] = useState<string | null>(null);

    // Sync React Query data to local state
    useEffect(() => {
        if (cachedOrders) {
            setOrders(cachedOrders);
            setLoading(false);
            setError(null);
        }
    }, [cachedOrders]);

    // Handle query errors
    useEffect(() => {
        if (queryError) {
            setError(queryError instanceof Error ? queryError.message : "Failed to fetch orders");
            setLoading(false);
        }
    }, [queryError]);

    // =============================================
    // COMPOSE SUB-HOOKS
    // =============================================

    // 1. Filters — filter state, presets, persistence, derived lists
    const filterHook = useOrderFilters({ orders, archivedOrders });

    // 2. Realtime — Supabase channel subscription
    const { realtimeVersion } = useOrderRealtime({
        setOrders,
        onReconnect: () => {
            console.log("[useOrders] Realtime reconnected - triggering refetch");
            setRefetchTrigger(orderRefetchTriggers.realtimeReconnect + Date.now());
        }
    });

    // 3. Auxiliary — reference data, customer helpers, stats
    const auxiliaryHook = useOrderAuxiliary({ orders, archivedOrders });

    // 4. CRUD — all order mutations, undo, notes, timeline, etc.
    const crudHook = useOrderCrud({ orders, setOrders });

    // Sync archived orders from React Query
    const { data: cachedArchivedOrders } = useArchivedOrdersQuery(
        !!filterHook.filters.searchQuery && !!filterHook.filters.searchIncludesArchive
    );

    useEffect(() => {
        if (cachedArchivedOrders) {
            setArchivedOrders(cachedArchivedOrders);
        }
    }, [cachedArchivedOrders]);

    // =============================================
    // RETURN OBJECT (same shape for backward compat)
    // =============================================

    const contextValue = useMemo(() => ({
        // Core data
        orders,
        statusCounts: filterHook.statusCounts,
        // Archive
        archivedOrders,
        fetchArchivedOrders: crudHook.fetchArchivedOrders,
        filteredOrders: filterHook.filteredOrders,
        loading,
        error,
        stats: auxiliaryHook.stats,
        realtimeVersion,

        // Reference data
        rejectionReasons: auxiliaryHook.rejectionReasons,
        messageTemplates: auxiliaryHook.messageTemplates,
        filterPresets: filterHook.filterPresets,
        availableCities: filterHook.availableCities,
        availableProducts: filterHook.availableProducts,

        // Filters
        filters: filterHook.filters,
        setFilters: filterHook.setFilters,
        clearFilters: filterHook.clearFilters,
        saveFilterPreset: filterHook.saveFilterPreset,
        loadFilterPreset: filterHook.loadFilterPreset,
        deleteFilterPreset: filterHook.deleteFilterPreset,

        // Single order operations
        refetch: crudHook.fetchOrders,
        updateOrderStatus: crudHook.updateOrderStatus,
        updateOrder: crudHook.updateOrder,
        createOrder: crudHook.createOrder,
        cloneOrder: crudHook.cloneOrder,
        splitOrder: crudHook.splitOrder,
        setScheduledDate: crudHook.setScheduledDate,
        setPriority: crudHook.setPriority,
        setPaymentStatus: crudHook.setPaymentStatus,
        togglePin: crudHook.togglePin,
        setPin: crudHook.setPin,
        toggleReviewed: crudHook.toggleReviewed,
        markAsVerifiedCustomer: crudHook.markAsVerifiedCustomer,
        deleteOrder: crudHook.deleteOrder,

        // Bulk operations
        bulkUpdateStatus: crudHook.bulkUpdateStatus,
        bulkArchive: crudHook.bulkArchive,
        bulkUnarchive: crudHook.bulkUnarchive,
        bulkDelete: crudHook.bulkDelete,
        exportOrders: crudHook.exportOrders,
        createBatch: crudHook.createBatch,

        // Return orders
        createReturnOrder: crudHook.createReturnOrder,

        // Detection & history
        checkDuplicateOrder: auxiliaryHook.checkDuplicateOrder,
        getDuplicatesForOrder: auxiliaryHook.getDuplicatesForOrder,
        hasDuplicates: auxiliaryHook.hasDuplicates,
        getCustomerHistory: auxiliaryHook.getCustomerHistory,
        getCustomerOrderCount: auxiliaryHook.getCustomerOrderCount,
        getCustomerArchivedCount: auxiliaryHook.getCustomerArchivedCount,
        mergeOrders: crudHook.mergeOrders,
        fetchOrders: crudHook.fetchOrders,

        // Notes
        addOrderNote: crudHook.addOrderNote,
        getOrderNotes: crudHook.getOrderNotes,

        // Timeline
        getOrderTimeline: crudHook.getOrderTimeline,

        // Reminders
        setFollowUpReminder: crudHook.setFollowUpReminder,
        getActiveReminders: crudHook.getActiveReminders,
        completeReminder: crudHook.completeReminder,

        // Blacklist
        isBlacklisted: auxiliaryHook.isBlacklisted,

        // Duplicate management
        getCustomerOrders: auxiliaryHook.getCustomerOrders,
        dismissDuplicate: crudHook.dismissDuplicate,

        // Undo functionality
        undoLastAction: crudHook.undoLastAction,
        getLastUndoAction: crudHook.getLastUndoAction,
        clearUndoStack: crudHook.clearUndoStack,
        canUndo: crudHook.canUndo,
        checkOrderIdExists: crudHook.checkOrderIdExists,
    }), [
        orders, filterHook, archivedOrders, loading, error, auxiliaryHook,
        realtimeVersion, crudHook,
    ]);

    return contextValue;
}
