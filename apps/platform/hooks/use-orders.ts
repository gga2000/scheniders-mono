"use client";

import { useMemo, useRef } from "react";
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
    ordersCacheIsCompleteSet,
    useArchivedOrdersQuery,
    syncOrdersDelta,
    orderKeys,
    setOrderBatcher,
} from "@/hooks/use-orders-query";

import { useEffect } from "react";
import { useOrderFilterState } from "@/hooks/use-order-filter-state";
import { useOrdersAggregates } from "@/hooks/use-orders-aggregates";
import { assertAggregateParity } from "@/lib/order-aggregate-parity";
import { windowFromDateFilter } from "@/lib/order-window";

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

    // On app reopen, sync ONLY the delta (rows changed since the cache's
    // high-water mark) instead of re-pulling the whole ~5.8MB table. Skip when
    // there's no cache yet — the query fetches on its own once the session is ready.
    useAppLifecycle(() => {
        if (queryClient.getQueryData(orderKeys.lists())) {
            void syncOrdersDelta(queryClient, "appReopen");
        }
    });

    // Filter state is resolved BEFORE the fetch. `useOrderFilters` derives its
    // lists from the orders that come back, so it cannot also own the filter the
    // fetch depends on — that was circular, and it is what blocked windowing.
    const { filters, setFilters, clearFilters, filtersSettled } = useOrderFilterState();

    // The window the fetch will load, derived from the merchant's date filter.
    // Realtime and the bulk-scope guards read the same value, so what is fetched,
    // what realtime will add, and what "all visible" means can never disagree.
    const ordersWindow = useMemo(
        () => windowFromDateFilter(filters.dateFrom, filters.dateTo),
        [filters.dateFrom, filters.dateTo],
    );
    const ordersAreComplete = ordersCacheIsCompleteSet(ordersWindow);
    const ordersWindowRef = useRef(ordersWindow);
    ordersWindowRef.current = ordersWindow;

    const { data: cachedOrders, isLoading: queryLoading, isFetching: queryFetching, status: queryStatus, error: queryError } = useOrdersQuery(ordersWindow, filtersSettled);

    // Single source of truth: React Query cache
    const orders = cachedOrders ?? [];
    const loading = queryLoading;
    // `loading` is React Query's isLoading, which is only true during the FIRST
    // fetch of an ENABLED query. Two common states slip past it, and both render
    // as "we have zero orders" unless they are handled:
    //
    //   - a refetch (window change, reconnect, stale SWR hydration) keeps the old
    //     data — or no data — while new rows are still arriving;
    //   - a DISABLED query, which this one is until the Supabase client finishes
    //     initialising, is pending but not fetching, so isLoading is false and
    //     `data` is undefined.
    //
    // A merchant with 4,778 orders was shown "No orders yet. When you receive
    // orders, they'll appear here." Distinguishing "not loaded" from "loaded and
    // genuinely empty" is what these two flags are for.
    const isRefreshing = queryFetching;
    const ordersPending = queryStatus === "pending";
    const error = queryError instanceof Error ? queryError.message : queryError ? "Failed to fetch orders" : null;

    // =============================================
    // COMPOSE SUB-HOOKS
    // =============================================

    // Sync archived orders from React Query (must be before filterHook)
    const { data: cachedArchivedOrders } = useArchivedOrdersQuery(false);
    const archivedOrders = cachedArchivedOrders ?? [];

    // 1. Filters — filter state, presets, persistence, derived lists
    const filterHook = useOrderFilters({ orders, archivedOrders, filters, setFilters, clearFilters });

    // 2. Realtime — Supabase channel subscription (updates RQ cache directly)
    const { batcherRef } = useOrderRealtime({
        getWindow: () => ordersWindowRef.current,
        onReconnect: () => {
            // Reconnect: flush any missed events via an incremental delta sync,
            // not a full-table refetch.
            void syncOrdersDelta(queryClient, "realtimeReconnect");
        }
    });

    // Register batcher for mutation guard (mutations call markMutated on it)
    useEffect(() => {
        setOrderBatcher(batcherRef.current);
        return () => setOrderBatcher(null);
    }, [batcherRef]);

    // Server-computed aggregates. These describe the whole filter, not the rows
    // that happen to be loaded, which is what lets the fetch narrow to a window
    // without the status chips and stat cards quietly reporting the window's
    // numbers as if they were the filter's.
    const { data: serverAggregates } = useOrdersAggregates(filters);


    // 3. Auxiliary — reference data, customer helpers, stats
    const auxiliaryHook = useOrderAuxiliary({ orders, archivedOrders });

    // While the cache still holds the complete set, both sides are computable —
    // so verify they agree before the windowed fetch makes the client's version
    // impossible to check. Dev-only; compiles to nothing in production.
    //
    // `ordersAreComplete` is the whole precondition and it was missing: with a
    // date window active — which is the DEFAULT, today — the client's counts
    // describe the window while the server's describe the whole filter, so they
    // differ by design. The guard fired on that difference and reported "the
    // windowed fetch would ship wrong numbers" about the one case where nothing
    // is wrong, because the page renders the SERVER counts.
    //
    // It also had no dependency array, so it re-ran on every render and printed
    // the same false alarm ten times a page load. A guard that cries wolf on a
    // healthy page is worse than no guard: it trains you to scroll past the line
    // that will one day be real.
    useEffect(() => {
        if (!serverAggregates || !ordersAreComplete) return;
        assertAggregateParity("status counts", filterHook.statusCounts, serverAggregates.status_counts);
        assertAggregateParity("stats", auxiliaryHook.stats as unknown as Record<string, number>, serverAggregates.stats);
    }, [serverAggregates, ordersAreComplete, filterHook.statusCounts, auxiliaryHook.stats]);


    // 4. CRUD — all order mutations, undo, notes, timeline, etc.
    const crudHook = useOrderCrud({ orders });

    // 5. Heartbeat — lightweight 30s check for silent realtime disconnections
    useRealtimeHeartbeat({ enabled: !loading });


    // =============================================
    // RETURN OBJECT (same shape for backward compat)
    // =============================================

    const contextValue = useMemo(() => ({
        // Core data
        orders,
        isRefreshing,
        ordersPending,
        statusCounts: serverAggregates?.status_counts ?? filterHook.statusCounts,
        // Archive
        archivedOrders,
        fetchArchivedOrders: crudHook.fetchArchivedOrders,
        filteredOrders: filterHook.filteredOrders,
        loading,
        error,
        // Server supplies the headline numbers; the client keeps the parts it
        // still derives locally (velocity, peak hour, revenue trends).
        stats: serverAggregates ? { ...auxiliaryHook.stats, ...serverAggregates.stats } : auxiliaryHook.stats,

        // Reference data
        rejectionReasons: auxiliaryHook.rejectionReasons,
        messageTemplates: auxiliaryHook.messageTemplates,
        filterPresets: filterHook.filterPresets,
        availableCities: serverAggregates?.cities ?? filterHook.availableCities,
        availableProducts: serverAggregates?.products ?? filterHook.availableProducts,
        availableProductsInView: filterHook.availableProductsInView,

        // Filters
        filters: filterHook.filters,
        setFilters: filterHook.setFilters,
        filtersSettled,
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
        createReplacementOrder: crudHook.createReplacementOrder,

        /** True while the cached list is the complete filtered set (see ORDERS_CACHE_IS_COMPLETE_SET). */
        ordersAreComplete,

        // Detection & history
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
        getBlacklistEntry: auxiliaryHook.getBlacklistEntry,
        addToBlacklist: auxiliaryHook.addToBlacklist,
        removeFromBlacklist: auxiliaryHook.removeFromBlacklist,

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
        isRefreshing,
        ordersPending,
        error,
        filtersSettled,
        filterHook,
        auxiliaryHook,
        crudHook,
         
    ]);

    return contextValue;
}
