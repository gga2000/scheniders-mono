"use client";

import { useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Order } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

// Decomposed hooks
import { useOrderFilters } from "@/hooks/use-order-filters";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { useOrderAuxiliary } from "@/hooks/use-order-auxiliary";
import { useDuplicateWindowAlerts } from "@/hooks/use-duplicate-window-alerts";
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
    orderPreviewKeys,
    setOrderBatcher,
    useOrderListPreview,
} from "@/hooks/use-orders-query";
import { useLoadedOrdersWindowKey } from "@/hooks/orders-list-coverage";

import { useEffect } from "react";
import { useOrderFilterState } from "@/hooks/use-order-filter-state";
import { useServerOrderSearch } from "@/hooks/use-server-order-search";
import { useOrdersAggregates } from "@/hooks/use-orders-aggregates";
import { assertAggregateParity } from "@/lib/order-aggregate-parity";
import { windowCacheKey, windowFromDateFilter } from "@/lib/order-window";
import { listCovers } from "@/lib/orders/coverage-key";
import { perfTrace } from "@/lib/perf-trace";

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
    const { tenantId } = useAuth();

    // On app reopen, sync ONLY the delta (rows changed since the cache's
    // high-water mark) instead of re-pulling the whole ~5.8MB table. Skip when
    // there's no cache yet — the query fetches on its own once the session is ready.
    useAppLifecycle(() => {
        if (queryClient.getQueryData(orderKeys.lists())) {
            void syncOrdersDelta(queryClient, tenantId, "appReopen");
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
    const ordersWindowKey = windowCacheKey(ordersWindow);
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

    // Search is a server lookup over the whole order book, not a filter on the
    // loaded window: an order from last month is found by its phone or number
    // without touching the date filter, and clearing the search returns to the
    // exact view the merchant left.
    const orderSearch = useServerOrderSearch(filters.searchQuery, { liveOrders: orders });

    // The window the cached rows were loaded for (null: nothing committed yet).
    // Counts are only shown while it covers the filter's window.
    const loadedWindowKey = useLoadedOrdersWindowKey();
    const listLoadedKey = cachedOrders === undefined ? null : loadedWindowKey;

    // The head of a wide list fetch, painted read-only until the window commits
    // (lib/orders/list-preview.ts). useOrderFilters gates it on coverage.
    const listPreviewData = useOrderListPreview(ordersWindowKey);
    const preview = useMemo(
        () => (listPreviewData ? { rows: listPreviewData.rows, newestCutoff: listPreviewData.newestCutoff } : null),
        [listPreviewData],
    );

    // 1. Filters — filter state, presets, persistence, derived lists
    const filterHook = useOrderFilters({
        orders,
        searchResults: orderSearch.active ? orderSearch.orders : null,
        filters,
        setFilters,
        clearFilters,
        loadedWindowKey: listLoadedKey,
        preview,
    });

    // The list holds the whole filtered window — now (the cache) AND in the
    // list's deferred render. Before the first commit nothing is complete,
    // whatever the window: "act on everything" (ship with no selection,
    // select all) must not act on a preview or on another window's rows.
    const listCovered = listCovers(listLoadedKey, ordersWindowKey) && filterHook.countViewFacts.covered;
    const ordersAreComplete = ordersCacheIsCompleteSet(ordersWindow) && listCovered;

    // A preview is only ever shown while uncovered; once covered it is stale.
    // Reset, not removed: the preview observer stays attached to its query, so
    // a later head for the same window still reaches it. Nothing refetches —
    // the preview query has no queryFn (skipToken).
    useEffect(() => {
        if (!listCovered) return;
        perfTrace.mark("orders:complete");
        void queryClient.resetQueries({ queryKey: orderPreviewKeys.all });
    }, [listCovered, queryClient]);

    // 2. Realtime — Supabase channel subscription (updates RQ cache directly)
    const { batcherRef } = useOrderRealtime({
        tenantId,
        getWindow: () => ordersWindowRef.current,
        onReconnect: () => {
            // Reconnect: flush any missed events via an incremental delta sync,
            // not a full-table refetch.
            void syncOrdersDelta(queryClient, tenantId, "realtimeReconnect");
        }
    });

    // Register batcher for mutation guard (mutations call markMutated on it).
    // The realtime channel, and with it the batcher, is created once the tenant
    // is known and recreated on a tenant switch; the ref itself never changes,
    // so tenantId is what re-runs this after useOrderRealtime's effect has set
    // the new batcher (effects run in declaration order).
    useEffect(() => {
        setOrderBatcher(batcherRef.current);
        return () => setOrderBatcher(null);
    }, [batcherRef, tenantId]);

    // Server-computed aggregates — on this page ONLY for what the loaded rows
    // cannot answer: the city / product option lists of the whole filter and
    // the headline `stats` cards that are not a count of a list the page opens
    // (revenue, conversion, velocity). Never for a clickable count: those are
    // derived from the rows the list shows (see `statusCounts`), and while the
    // cache does not cover the active window they are hidden, not substituted
    // from the RPC, whose predicates differ.
    //
    // Held until the saved filter has replaced the seed (`filtersSettled`), so
    // the seed's numbers are never fetched.
    const { data: serverAggregates } = useOrdersAggregates(filters, { enabled: filtersSettled });


    // 3. Auxiliary — reference data, customer helpers, stats
    const auxiliaryHook = useOrderAuxiliary({
        orders,
        archivedOrders,
        searchOrders: orderSearch.active ? orderSearch.orders : null,
    });

    // 48h money-at-risk duplicates. Needs the window, because a windowed view
    // must look past its own edges to find a twin placed the day before.
    const { getDuplicateWindowAlert, getConfirmBlockingTwin, duplicateCandidates } =
        useDuplicateWindowAlerts(orders, ordersWindow);

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
    //
    // Status counts are no longer compared: the page takes them from the
    // client, with the list's own predicates, which deliberately differ from
    // the RPC's (completed excludes refunds and replacements; refunds is
    // `is_return`), so the two are not expected to agree.
    useEffect(() => {
        if (!serverAggregates || !ordersAreComplete) return;
        assertAggregateParity("stats", auxiliaryHook.stats as unknown as Record<string, number>, serverAggregates.stats);
    }, [serverAggregates, ordersAreComplete, auxiliaryHook.stats]);


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
        // Taken over the same rows as `filteredOrders`, with the same predicate
        // table (lib/orders/order-chips.ts), so a chip's number is the length
        // of the list it opens. Never the RPC's: its rules differ and it is not
        // invalidated by list writes (the 219-vs-119 incident, 2026-10-17).
        statusCounts: filterHook.statusCounts,
        /** Needs Attention counts, each the length of the list its click opens. */
        attentionCounts: filterHook.attentionCounts,
        /**
         * Whether the counts describe the list on screen (not searching, rows
         * loaded for the filter's window), from the list's own deferred render.
         * Pages combine it with their refinements via lib/orders/count-visibility.
         */
        countViewFacts: filterHook.countViewFacts,
        statusCountsReady: filterHook.countViewFacts.ready,
        /**
         * The list is the whole filtered window (the cache covers it, in the
         * list's render). While false, no count of the list — header, "select
         * all N" — is shown: the list is still loading, or is another window's.
         */
        listCovered,
        /**
         * The head of a wide list fetch (lib/orders/list-preview.ts), filtered
         * and sorted like `filteredOrders`, while the window is still loading.
         * Pages show it READ-ONLY after dropping the rows that could still move
         * (desktopPreviewRows / mobilePreviewRows), and never count it.
         */
        listPreview: filterHook.listPreview,
        // Archive
        archivedOrders,
        fetchArchivedOrders: crudHook.fetchArchivedOrders,
        filteredOrders: filterHook.filteredOrders,
        /** Server search state for `filters.searchQuery`; `filteredOrders` holds its matches while active. */
        orderSearch: {
            active: orderSearch.active,
            pending: orderSearch.pending,
            isFetching: orderSearch.isFetching,
            error: orderSearch.error,
        },
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
        adChannelSummary: filterHook.adChannelSummary,

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
        bulkReschedule: crudHook.bulkReschedule,
        bulkArchive: crudHook.bulkArchive,
        bulkUnarchive: crudHook.bulkUnarchive,
        bulkDelete: crudHook.bulkDelete,
        exportOrders: crudHook.exportOrders,
        createBatch: crudHook.createBatch,

        // Return orders

        /** True while the cached list is the complete filtered set (see ORDERS_CACHE_IS_COMPLETE_SET). */
        ordersAreComplete,

        // Detection & history
        getDuplicatesForOrder: auxiliaryHook.getDuplicatesForOrder,
        hasDuplicates: auxiliaryHook.hasDuplicates,
        getDuplicateWindowAlert,
        getConfirmBlockingTwin,
        duplicateCandidates,
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
        orderSearch.active,
        orderSearch.pending,
        orderSearch.isFetching,
        orderSearch.error,
        listCovered,
        ordersAreComplete,
    ]);

    return contextValue;
}
