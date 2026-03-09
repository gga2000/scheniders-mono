"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Order } from "@/lib/supabase";

// Decomposed hooks
import { useOrderFilters } from "@/hooks/use-order-filters";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { useOrderAuxiliary } from "@/hooks/use-order-auxiliary";
import { useOrderCrud } from "@/hooks/use-order-crud";
import { useAppLifecycle } from "@/hooks/use-app-lifecycle";
import { useRealtimeHeartbeat } from "@/hooks/use-realtime-heartbeat";

// React Query hooks for caching
import {
    useOrdersQuery,
    useArchivedOrdersQuery,
    orderRefetchTriggers,
    orderKeys,
    setOrderBatcher,
} from "@/hooks/use-orders-query";

import { useState, useEffect } from "react";
import { toast } from "sonner";

// =============================================
// ENHANCED ORDERS HOOK (Composition Root)
// Composes focused sub-hooks into a single API
// surface. Same return type for backward compat.
//
// ARCHITECTURE: React Query cache is the SINGLE
// source of truth for orders. No local useState
// copy. Sub-hooks manipulate the cache directly
// via queryClient.setQueryData / invalidateQueries.
// =============================================

export function useOrders() {
    // =============================================
    // REACT QUERY INTEGRATION FOR CACHING
    // =============================================
    const queryClient = useQueryClient();

    // Track refetch triggers for app reopen and realtime reconnection
    const [refetchTrigger, setRefetchTrigger] = useState<string | undefined>();

    // Detect app reopen and trigger refetch (only if we already have data —
    // if not, the query will fetch automatically when session becomes available)
    useAppLifecycle(() => {
        if (queryClient.getQueryData(orderKeys.lists())) {
            console.log("[Diag:Orders] REFETCH_TRIGGER source=appReopen");
            setRefetchTrigger(orderRefetchTriggers.appReopen + Date.now());
        }
    });

    const { data: cachedOrders, isLoading: queryLoading, error: queryError } = useOrdersQuery(refetchTrigger);

    // Single source of truth: React Query cache
    const orders = cachedOrders ?? [];
    const loading = queryLoading;
    const error = queryError instanceof Error ? queryError.message : queryError ? "Failed to fetch orders" : null;

    // =============================================
    // COMPOSE SUB-HOOKS
    // =============================================

    // Archived orders
    const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);

    // 1. Filters — filter state, presets, persistence, derived lists
    const filterHook = useOrderFilters({ orders, archivedOrders });

    // 2. Realtime — Supabase channel subscription (updates RQ cache directly)
    const { batcherRef } = useOrderRealtime({
        onReconnect: () => {
            console.log("[Diag:Orders] REFETCH_TRIGGER source=realtimeReconnect");
            setRefetchTrigger(orderRefetchTriggers.realtimeReconnect + Date.now());
        }
    });

    // Register batcher for mutation guard (mutations call markMutated on it)
    useEffect(() => {
        setOrderBatcher(batcherRef.current);
        return () => setOrderBatcher(null);
    }, [batcherRef]);

    // 3. Auxiliary — reference data, customer helpers, stats
    const auxiliaryHook = useOrderAuxiliary({ orders, archivedOrders });

    // 4. CRUD — all order mutations, undo, notes, timeline, etc.
    const crudHook = useOrderCrud({ orders });

    // 5. Heartbeat — lightweight 30s check for silent realtime disconnections
    useRealtimeHeartbeat({ enabled: !loading });

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
    // AUTO-UPDATE CONTACTED -> NO_RESPONSE
    // =============================================
    const [hasRunAutoUpdate, setHasRunAutoUpdate] = useState(false);

    useEffect(() => {
        if (!orders || orders.length === 0 || hasRunAutoUpdate) return;

        const now = Date.now();
        const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

        const expiredIds = orders
            .filter(o => {
                if (o.status !== "contacted") return false;
                const refDate = new Date(o.updated_at || o.created_at).getTime();
                return (now - refDate) > FORTY_EIGHT_HOURS;
            })
            .map(o => o.id);

        if (expiredIds.length > 0) {
            console.log(`[Diag:Orders] AUTO_UPDATE contacted→no_response count=${expiredIds.length}`);
            crudHook.bulkUpdateStatus(expiredIds, "no_response").then(res => {
                if (res?.success || res === undefined) {
                    toast.success(
                        `${expiredIds.length} orders safely auto-updated to "No Response"`
                    );
                }
            });
        }

        // Set this to true regardless of whether we found expired IDs, 
        // to prevent re-running this check unnecessarily in this session.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHasRunAutoUpdate(true);
    }, [orders, hasRunAutoUpdate, crudHook]);

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
        orders,
        archivedOrders,
        loading,
        error,
        filterHook,
        auxiliaryHook,
        crudHook,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ]);

    return contextValue;
}
