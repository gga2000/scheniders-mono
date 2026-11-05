"use client";

import { usePersistedToggle } from "@/hooks/use-persisted-toggle";
import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { useStuckInTransit } from "@/hooks/use-stuck-in-transit";
import { usePrimeRowSets } from "@/hooks/use-prime-shipments";
import { usePaymentUnchecked } from "@/hooks/use-payment-unchecked";
import { useDuplicateDispatchGuard } from "@/hooks/use-duplicate-dispatch-guard";
import { useStockShortfallGuard } from "@/hooks/use-stock-shortfall-guard";
import { useShallow } from "zustand/react/shallow";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useDebounce } from "@/hooks/use-debounce";
import { Order, OrderItem } from "@/lib/supabase";
import type { OrderFilters } from "@/types/order";
import { orderMatchesRiskLevel } from "@/lib/order-filter-utils";
import { countVisibility, listCountVisible } from "@/lib/orders/count-visibility";
import { isScheduleDue } from "@/lib/order-format-utils";
import { sortDesktopList } from "@/lib/orders/list-sort";
import { useShieldDanger } from "@/hooks/use-shield-danger";

/** Statuses that settle a purchase for Shield (shield.sync_phone): only these move a Trust score. */
const SHIELD_FINISHED: ReadonlySet<string> = new Set(["completed", "delivered", "rejected", "no_response", "cancelled", "returned", "refunded", "refund_delivered", "return_pending"]);
import { dangerBandOf, dangerCounts, trustByOrderId } from "@/lib/shield/danger";
import { desktopPreviewRows } from "@/lib/orders/list-preview";
import { perfTrace } from "@/lib/perf-trace";
import { orderRepository } from "@/lib/repositories/order-repository";
import { useOrderBulkOperations } from "@/hooks/use-order-bulk-operations";
import { reportOrderError } from "@/lib/order-telemetry";
import { useSidebar } from "@/components/layout/dashboard-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { useRecordContact } from "@/hooks/use-record-contact";
import type { VirtualizedOrderList } from "@/components/orders/virtualized-order-list";

/** All state, data and handlers of the orders page; app/orders/page.tsx and its sections render from this. */
export function useOrdersPageModel() {
    const { sidebarExpanded } = useSidebar();
    const [isMounted, setIsMounted] = useState(false);
    const [isReturnsOpen, setIsReturnsOpen] = useState(false);
    const [isStockTodayOpen, setIsStockTodayOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    // Sub-filters (Type + Products rows) are hidden by default — show only when
    // the merchant clicks the toggle next to the barcode button. Per-device pref.
    const [showSubFilters, toggleSubFilters] = usePersistedToggle("ordersShowSubFilters");
    // Ad-channel chips — hidden by default, toggled from the search bar like the
    // sub-filters above. Per-device pref.
    const [showAdChannels, toggleAdChannels] = usePersistedToggle("ordersShowAdChannels");
    const [showAdsChips, toggleAdsChips] = usePersistedToggle("ordersShowAdsChips");
    // Order pipeline funnel — hidden by default, surfaced via toolbar toggle.
    // Per-device pref, mirrors the sub-filters pattern above.
    const [showPipeline, togglePipeline] = usePersistedToggle("ordersShowPipeline");
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Stamps who opened a WhatsApp chat from a card (template sends are stamped server-side).
    const recordContact = useRecordContact();

    const {

        orders,
        filteredOrders: hookFilteredOrders,
        loading,
        isRefreshing,
        ordersPending,
        orderSearch,
        error,
        updateOrderStatus,
        isBlacklisted,
        getBlacklistEntry,
        addToBlacklist,
        removeFromBlacklist,
        availableCities,
        availableProducts,
        filters,
        setFilters,
        clearFilters,
        filterPresets,
        saveFilterPreset,
        loadFilterPreset,
        deleteFilterPreset,
        hasDuplicates,
        getDuplicateWindowAlert,
        getConfirmBlockingTwin,
        getCustomerHistory,
        getCustomerOrderCount,
        mergeOrders,
        // Pin & Clone
        togglePin,
        toggleReviewed,
        cloneOrder,
        // Archive
        archivedOrders,
        fetchArchivedOrders,
        getCustomerArchivedCount,
        // Undo
        undoLastAction,
        canUndo,
        // Check order ID
        // Duplicate management
        statusCounts,
        attentionCounts,
        countViewFacts,
        ordersAreComplete,
        listCovered,
        listPreview,
        filtersSettled,
        // Message templates
        messageTemplates,
    } = useOrdersContext();

    // Apply drill-through params from the dashboard (?status=, ?city=, ?product=)
    // once the saved filter has loaded. Applied any earlier, they were overwritten
    // by the saved filter (the link did nothing) and, before auth, persisted under
    // the anonymous key. DV-D2: city and product exist in OrderFilters but were
    // never read from the URL, so the dashboard could only hand over a status.
    // `?search=` is applied by OrderSearchParamSync.
    const drillParamsApplied = useRef(false);
    useEffect(() => {
        if (!filtersSettled || drillParamsApplied.current || typeof window === 'undefined') return;
        drillParamsApplied.current = true;
        const params = new URLSearchParams(window.location.search);
        const statusParam = params.get('status');
        const cityParam = params.get('city');
        const productParam = params.get('product');
        if (!statusParam && !cityParam && !productParam) return;
        setFilters(prev => ({
            ...prev,
            ...(statusParam ? { status: statusParam as OrderFilters['status'] } : {}),
            ...(cityParam ? { city: cityParam } : {}),
            ...(productParam ? { product: productParam } : {}),
        }));
    }, [filtersSettled, setFilters]);

    // Products for Excel import matching, and the oversold count on Stock today.
    const { products } = useProductsCrud();
    const oversoldCount = useMemo(
        () => products.filter(p => !p.is_archived && !p.is_supply && !p.is_filler
            && ((p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0) < 0 || (p.open_box_quantity ?? 0) < 0)).length,
        [products]
    );
    const isMobile = useIsMobile();
    const { t } = useLanguage();
    const datePreset = useOrderStore((s) => s.datePreset);
    const { can } = usePermission();
    const canUnblock = can(PERMISSIONS.UNBLOCK_CUSTOMERS);
    const canBlock = can(PERMISSIONS.BLOCK_CUSTOMERS);

    // ── Zustand Store (replaces ~35 useState calls) ──
    // Selected through `useShallow` rather than destructured off the bare store:
    // a no-selector `useOrderStore()` compares whole-state identity, so every
    // keystroke re-rendered this entire component and defeated the memo on
    // GlobalSearchField.
    const {
        // View preferences
        viewMode, setViewMode,
        compactView, setCompactView,
        compactGrid, setCompactGrid,
        actionDock,
        showSearchBar, setShowSearchBar,
        analyticsLevel, setAnalyticsLevel,
        toolbarCollapsed, toggleToolbarCollapse,
        setSoundEnabled,
        // Filter UI
        showFilters, setShowFilters,
        groupBy, setGroupBy,
        filterDuplicatesOnly, setFilterDuplicatesOnly,
        filterDueToday, setFilterDueToday,
        sortConfig, sortConfigs, toggleSort,
        columnFilters, setColumnFilters,
        openFilterColumn, setOpenFilterColumn,
        activePresetId, setActivePresetId,
        // Modals
        setIsModalOpen,
        setSelectedOrder,
        setIsCreateModalOpen,
        setShowDuplicateModal,
        setDuplicateOrder,
        setCancelDialogOpen,
        setOrderToCancel,
        setRejectDialogOpen,
        setOrderToReject,
        setTemplatePanelOpen,
        setOrderForTemplate,
        setIsExportModalOpen,
        splitOrderDialog, setSplitOrderDialog,
        setScreenshotOrder,
        showDatePicker, setShowDatePicker,
        datePickerPos, setDatePickerPos,
        // Selection
        selectedOrders, setSelectedOrders,
        showArchived, setShowArchived,
        loadingId, setLoadingId,
        // Transient
        isHeaderAnimating, setIsHeaderAnimating,
        notificationsEnabled, setNotificationsEnabled,
    } = useOrderStore(
        useShallow((s) => ({
            viewMode: s.viewMode,
            setViewMode: s.setViewMode,
            compactView: s.compactView,
            setCompactView: s.setCompactView,
            compactGrid: s.compactGrid,
            setCompactGrid: s.setCompactGrid,
            actionDock: s.actionDock,
            showSearchBar: s.showSearchBar,
            setShowSearchBar: s.setShowSearchBar,
            analyticsLevel: s.analyticsLevel,
            setAnalyticsLevel: s.setAnalyticsLevel,
            toolbarCollapsed: s.toolbarCollapsed,
            toggleToolbarCollapse: s.toggleToolbarCollapse,
            setSoundEnabled: s.setSoundEnabled,
            showFilters: s.showFilters,
            setShowFilters: s.setShowFilters,
            showPresets: s.showPresets,
            setShowPresets: s.setShowPresets,
            newPresetName: s.newPresetName,
            setNewPresetName: s.setNewPresetName,
            groupBy: s.groupBy,
            setGroupBy: s.setGroupBy,
            filterDuplicatesOnly: s.filterDuplicatesOnly,
            setFilterDuplicatesOnly: s.setFilterDuplicatesOnly,
            filterDueToday: s.filterDueToday,
            setFilterDueToday: s.setFilterDueToday,
            sortConfig: s.sortConfig,
            sortConfigs: s.sortConfigs,
            toggleSort: s.toggleSort,
            columnFilters: s.columnFilters,
            setColumnFilters: s.setColumnFilters,
            openFilterColumn: s.openFilterColumn,
            setOpenFilterColumn: s.setOpenFilterColumn,
            activePresetId: s.activePresetId,
            setActivePresetId: s.setActivePresetId,
            isModalOpen: s.isModalOpen,
            setIsModalOpen: s.setIsModalOpen,
            selectedOrder: s.selectedOrder,
            setSelectedOrder: s.setSelectedOrder,
            isCreateModalOpen: s.isCreateModalOpen,
            setIsCreateModalOpen: s.setIsCreateModalOpen,
            showDuplicateModal: s.showDuplicateModal,
            setShowDuplicateModal: s.setShowDuplicateModal,
            duplicateOrder: s.duplicateOrder,
            setDuplicateOrder: s.setDuplicateOrder,
            cancelDialogOpen: s.cancelDialogOpen,
            setCancelDialogOpen: s.setCancelDialogOpen,
            orderToCancel: s.orderToCancel,
            setOrderToCancel: s.setOrderToCancel,
            rejectDialogOpen: s.rejectDialogOpen,
            setRejectDialogOpen: s.setRejectDialogOpen,
            orderToReject: s.orderToReject,
            setOrderToReject: s.setOrderToReject,
            templatePanelOpen: s.templatePanelOpen,
            setTemplatePanelOpen: s.setTemplatePanelOpen,
            orderForTemplate: s.orderForTemplate,
            setOrderForTemplate: s.setOrderForTemplate,
            setIsImportModalOpen: s.setIsImportModalOpen,
            isExportModalOpen: s.isExportModalOpen,
            setIsExportModalOpen: s.setIsExportModalOpen,
            splitOrderDialog: s.splitOrderDialog,
            setSplitOrderDialog: s.setSplitOrderDialog,
            screenshotOrder: s.screenshotOrder,
            setScreenshotOrder: s.setScreenshotOrder,
            showDatePicker: s.showDatePicker,
            setShowDatePicker: s.setShowDatePicker,
            datePickerPos: s.datePickerPos,
            setDatePickerPos: s.setDatePickerPos,
            selectedOrders: s.selectedOrders,
            setSelectedOrders: s.setSelectedOrders,
            showArchived: s.showArchived,
            setShowArchived: s.setShowArchived,
            loadingId: s.loadingId,
            setLoadingId: s.setLoadingId,
            isFilterPanelAnimating: s.isFilterPanelAnimating,
            setIsFilterPanelAnimating: s.setIsFilterPanelAnimating,
            isHeaderAnimating: s.isHeaderAnimating,
            setIsHeaderAnimating: s.setIsHeaderAnimating,
            notificationsEnabled: s.notificationsEnabled,
            setNotificationsEnabled: s.setNotificationsEnabled,
        })),
    );

    // Sync local search input when filters.searchQuery is cleared externally (e.g. "clear filters" button)
    useEffect(() => {
        if (!filters.searchQuery) {
            useOrderStore.getState().setLocalSearchQuery("");
        }
         
    }, [filters.searchQuery]);

    const debouncedColumnFilters = useDebounce(columnFilters, 300);

    // Domain state (stays local — not UI state)
    const { splitOrder } = useOrdersContext();

    const handleSplitOrder = async (keptItems: OrderItem[], returnedItems: OrderItem[]) => {
        if (!splitOrderDialog.order) return false;
        // splitOrder shows the success toast (with undo) and refreshes the list.
        const result = await splitOrder(splitOrderDialog.order.id, keptItems, returnedItems);
        if (result.success) {
            setSplitOrderDialog({ open: false, order: null });
        } else {
            toast.error(
                t("orders.toast.splitFailed"),
                result.error || t("orderDetail.splitError")
            );
        }
        return result.success;
    };

    /**
     * Lazy-fetch full order data before opening detail modal.
     * List queries only fetch ~45 core columns; detail modal needs all 60+ fields.
     */
    const handleViewDetails = useCallback(async (order: Order) => {
        try {
            // Fetch full order data (all columns) from v_orders_with_risk
            const fullOrder = await orderRepository.findById(order.id);
            if (fullOrder) {
                setSelectedOrder(fullOrder);
                setIsModalOpen(true);
            } else {
                // Order was deleted or doesn't exist
                toast.error(t("orders.toast.notFound"), t("orders.toast.notFoundDesc"));
            }
        } catch (err) {
            // Falling back to the list row is better than refusing to open, but
            // it was previously silent: the operator edited a possibly-stale
            // record with no idea the refresh had failed.
            reportOrderError(err, { operation: "orders-view-details-fetch", orderId: order.id });
            toast.warning(
                t("orders.toast.staleDetails"),
                t("orders.toast.staleDetailsDesc"),
            );
            setSelectedOrder(order);
            setIsModalOpen(true);
        }
    }, [setSelectedOrder, setIsModalOpen, t]);

    /**
     * Wrapper for setSelectedOrder that lazy-fetches full order data.
     * Used by VirtualizedOrderTable which calls setSelectedOrder directly.
     */
    const setSelectedOrderWithFetch = useCallback(async (order: Order) => {
        try {
            const fullOrder = await orderRepository.findById(order.id);
            if (fullOrder) {
                setSelectedOrder(fullOrder);
            } else {
                setSelectedOrder(order);
            }
        } catch (err) {
            // Same silent-stale path as handleViewDetails, reached from the table.
            reportOrderError(err, { operation: "orders-select-order-fetch", orderId: order.id });
            toast.warning(
                t("orders.toast.staleDetails"),
                t("orders.toast.staleDetailsDesc"),
            );
            setSelectedOrder(order);
        }
    }, [setSelectedOrder, t]);



    // A tenant with no orders at all must not be told its filters matched nothing.
    // `hasFilters` counts the date range, so "no filters" here means the full window.
    const emptyStateHasFilters = !!(filters.dateFrom || filters.dateTo || filters.city || filters.product || filters.priority);
    const isFirstRun = (orders?.length ?? 0) === 0 && !filters.searchQuery && !emptyStateHasFilters;

    // ARCH-6: the order store is module-level, so an open modal, a bulk
    // selection or a half-finished inline edit outlived this page and came back
    // on the next visit — with a stale order snapshot behind it. Clear the
    // transient half on unmount; view preferences and filters persist as before.
    useEffect(() => {
        return () => {
            useOrderStore.getState().resetTransientState();
        };
    }, []);

    // Get workflow templates for the template panel
    const workflowTemplates = useMemo(() =>
        messageTemplates.filter(t =>
            t.template_type === 'confirmation' ||
            t.template_type === 'reminder' ||
            t.template_type === 'discount'
        ),
        [messageTemplates]
    );

    // Refs for date picker positioning (not state — stays local)
    const dateButtonRef = useRef<HTMLButtonElement>(null);
    const datePickerRef = useRef<HTMLDivElement>(null);

    // Toolbar scroller edge fades — only shown while content actually
    // overflows on that side, so nothing ever hard-clips at the seam.
    const toolbarScrollRef = useRef<HTMLDivElement>(null);
    const [toolbarFade, setToolbarFade] = useState({ left: false, right: false });
    useEffect(() => {
        const el = toolbarScrollRef.current;
        if (!el) return;
        const update = () => {
            const left = el.scrollLeft > 4;
            const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
            setToolbarFade(prev => (prev.left === left && prev.right === right) ? prev : { left, right });
        };
        update();
        el.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", update);
            ro.disconnect();
        };
    }, []);

    // Update date picker position when opened
    useEffect(() => {
        if (showDatePicker && dateButtonRef.current) {
            const rect = dateButtonRef.current.getBoundingClientRect();
            setDatePickerPos({ top: rect.bottom + 8, left: rect.left });
        }
    }, [showDatePicker, setDatePickerPos]);

    // Close date picker on click outside
    useEffect(() => {
        if (!showDatePicker) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dateButtonRef.current && !dateButtonRef.current.contains(e.target as Node) &&
                datePickerRef.current && !datePickerRef.current.contains(e.target as Node)
            ) {
                setShowDatePicker(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showDatePicker, setShowDatePicker]);

    // Keyboard shortcut: Cmd/Ctrl + \ to toggle toolbar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
                e.preventDefault();
                toggleToolbarCollapse();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleToolbarCollapse]);



    // Defer heavy list inputs to prevent main-thread blocking during concurrent renders.
    // `hookFilteredOrders` is not re-deferred: useOrderFilters derives it, and
    // every count in the context, from its own deferred values only, so the
    // list and the counts above it always come from the same render.
    const defColumnFilters = React.useDeferredValue(debouncedColumnFilters);
    const defFilterDuplicatesOnly = React.useDeferredValue(filterDuplicatesOnly);
    const defFilterDueToday = React.useDeferredValue(filterDueToday);
    const filterStuckTransit = useOrderStore(s => s.filterStuckTransit);
    const defFilterStuckTransit = React.useDeferredValue(filterStuckTransit);
    const { stuckIds } = useStuckInTransit();
    const stuckIdSet = useMemo(() => new Set(stuckIds), [stuckIds]);
    const filterPaymentUnchecked = useOrderStore(s => s.filterPaymentUnchecked);
    const defFilterPaymentUnchecked = React.useDeferredValue(filterPaymentUnchecked);
    const paymentUncheckedIds = usePaymentUnchecked();
    const paymentUncheckedSet = useMemo(() => new Set(paymentUncheckedIds), [paymentUncheckedIds]);
    const filterPrimeBucket = useOrderStore(s => s.filterPrimeBucket);
    const defFilterPrimeBucket = React.useDeferredValue(filterPrimeBucket);
    const { sets: primeRowSets } = usePrimeRowSets();
    const defRiskLevel = React.useDeferredValue(filters.riskLevel);
    const defSortConfig = React.useDeferredValue(sortConfig);
    const defSortConfigs = React.useDeferredValue(sortConfigs);
    const shieldClosedCount = useMemo(
        () => (orders ?? []).reduce((n, o) => (SHIELD_FINISHED.has(o.status) ? n + 1 : n), 0),
        [orders],
    );
    const { trustByPhone: dangerTrust, ready: dangerReady, failed: dangerFailed, retry: retryDanger } = useShieldDanger(shieldClosedCount);
    const dangerBand = useOrderStore(s => s.dangerBand);
    const defDangerBand = React.useDeferredValue(dangerBand);

    // Sort hook's filtered orders
    // Advanced Filtering & Sorting
    // Every list filter except the danger band. The danger counts are taken
    // over these rows, so a band's count is exactly the list you get when you
    // pick it.
    const preDangerOrders = useMemo(() => {
        let result = [...hookFilteredOrders];

        // 1. Apply Column Filters
        Object.entries(defColumnFilters || {}).forEach(([key, value]) => {
            if (!value) return;
            const lowerValue = value.toLowerCase();
            result = result.filter(o => {
                if (key === 'customer_name') return o.customer_name?.toLowerCase().includes(lowerValue);
                if (key === 'phone') return o.phone?.includes(lowerValue) || o.secondary_phone?.includes(lowerValue);
                if (key === 'city') return o.city?.toLowerCase().includes(lowerValue);
                if (key === 'address_details') return (o.address_details?.toLowerCase().includes(lowerValue)) || (o.city?.toLowerCase().includes(lowerValue));
                if (key === 'order_id') return o.order_id?.toLowerCase().includes(lowerValue) || String(o.sequence_number).includes(lowerValue);
                if (key === 'all') {
                    // Optimized global search - join fields once per order vs checking all
                    const searchStr = `${o.customer_name || ''} ${o.phone || ''} ${o.secondary_phone || ''} ${o.city || ''} ${o.address_details || ''} ${o.order_id || ''} ${o.sequence_number || ''} ${o.notes || ''}`.toLowerCase();
                    return searchStr.includes(lowerValue);
                }
                return true;
            });
        });

        // 1.2. Apply Risk/Flagged Filter — the predicate itself lives in
        // lib/order-filter-utils so the mobile screen runs the same one.
        if (defRiskLevel) {
            result = result.filter(o => orderMatchesRiskLevel(o, defRiskLevel));
        }

        // 1.5. Apply Duplicates-Only Filter
        if (defFilterDuplicatesOnly) {
            result = result.filter(o => getCustomerOrderCount(o.phone) > 1);
        }

        // 1.6. Apply Due-Today Filter — orders that were parked for a later day
        //      and whose day has now arrived.
        if (defFilterDueToday) {
            result = result.filter(o => isScheduleDue(o.status, o.scheduled_date));
        }

        // 1.7. Stuck-in-transit filter — in transit 7+ days (lib/orders/stuck-in-transit.ts).
        if (defFilterStuckTransit) {
            result = result.filter(o => stuckIdSet.has(o.id));
        }

        // 1.8. Payment-not-checked queue (lib/orders/payment-check.ts).
        if (defFilterPaymentUnchecked) {
            result = result.filter(o => paymentUncheckedSet.has(o.id));
        }

        // 1.9. In transit, one bucket of the Prime row (lib/prime/track.ts).
        if (defFilterPrimeBucket) {
            const ids = primeRowSets.get(defFilterPrimeBucket);
            result = result.filter(o => ids?.has(o.id) ?? false);
        }

        return result;
    }, [hookFilteredOrders, defColumnFilters, defFilterDuplicatesOnly, defFilterDueToday, defFilterStuckTransit, stuckIdSet, defFilterPaymentUnchecked, paymentUncheckedSet, defFilterPrimeBucket, primeRowSets, getCustomerOrderCount, defRiskLevel]);

    const filteredOrders = useMemo(() => {
        // A copy: sortDesktopList sorts in place, and preDangerOrders is memoized.
        let result = [...preDangerOrders];

        // 1.10. Shield danger level (slider or section): one band, riskiest first (lib/shield/danger.ts).
        if (defDangerBand) {
            result = result.filter(o => dangerBandOf(o, dangerTrust) === defDangerBand);
        }

        // 2. Sort: pinned first, parked last, then the column sorts, else
        // newest first (lib/orders/list-sort.ts — shared with the preview's
        // prefix proof).
        const activeSorts = defSortConfigs.length > 0 ? defSortConfigs : defSortConfig ? [defSortConfig] : [];
        return sortDesktopList(result, activeSorts, Date.now(), defDangerBand ? trustByOrderId(result, dangerTrust) : undefined);
    }, [preDangerOrders, defDangerBand, dangerTrust, defSortConfig, defSortConfigs]);

    // Calculate flagged orders count for "Needs Attention" card (data quality issues + rejected orders).
    // Counted with the same predicate the filter uses, so the number on the card
    // can never disagree with the list you get after clicking it.
    // The danger section's band counts, over the same rows as the list.
    const dangerBandCounts = useMemo(() => dangerCounts(preDangerOrders, dangerTrust), [preDangerOrders, dangerTrust]);

    const flaggedCount = useMemo(() => {
        return hookFilteredOrders.filter(o => orderMatchesRiskLevel(o, 'flagged')).length;
    }, [hookFilteredOrders]);

    // Orders parked for a later day whose day has arrived — the "due today" queue.
    // Same rows and predicate as the filter, so the badge is the length of the
    // list the toggle opens. It used to count the raw cache, ignoring the
    // status tab and every other filter.
    const dueTodayCount = useMemo(() => {
        return hookFilteredOrders.filter(o => isScheduleDue(o.status, o.scheduled_date)).length;
    }, [hookFilteredOrders]);

    // The risk badge: the list with the risk filter on, over the same rows.
    // Turning the toggle on also clears status and dates, so with it off this
    // only equals that list when status and dates are already clear — the
    // visibility rule hides it otherwise (lib/orders/count-visibility.ts).
    const totalRiskCount = useMemo(() => {
        return hookFilteredOrders.filter(o => orderMatchesRiskLevel(o, defRiskLevel ?? 'flagged')).length;
    }, [hookFilteredOrders, defRiskLevel]);

    // Which counts describe the list on screen. All inputs are deferred, like
    // the list itself, so a count never shows for one render against the
    // previous list. Hidden counts render "—" (search, archive, a refinement,
    // or rows still loading for the window).
    const defShowArchived = React.useDeferredValue(showArchived);
    const defPrimeQueue = React.useDeferredValue(useOrderStore((s) => s.primeQueue));
    const countVis = useMemo(() => countVisibility({
        facts: countViewFacts,
        archived: defShowArchived,
        columnFilter: Object.values(defColumnFilters || {}).some(Boolean),
        riskLevel: defRiskLevel,
        duplicatesOnly: defFilterDuplicatesOnly,
        dueToday: defFilterDueToday,
        stuckTransit: defFilterStuckTransit,
        paymentUnchecked: defFilterPaymentUnchecked,
        primeBucket: defFilterPrimeBucket !== null,
        primeQueue: defPrimeQueue !== null,
    }), [countViewFacts, defShowArchived, defColumnFilters, defRiskLevel, defFilterDuplicatesOnly, defFilterDueToday, defFilterStuckTransit, defFilterPaymentUnchecked, defFilterPrimeBucket, defPrimeQueue]);

    // The head of a wide list fetch, while the window loads — rows in under a
    // second instead of a skeleton for the whole book. Only for the plain list:
    // a column filter, a sort, the risk / duplicates / due-today toggles, a
    // grouping or the workflow board each wait for the full window, because
    // over a partial list they would show the wrong rows. Read-only and never
    // counted (lib/orders/list-preview.ts); rows that could still move when the
    // book lands are dropped.
    const previewOrders = useMemo(() => {
        if (!listPreview || defShowArchived || groupBy !== "none") return null;
        if (Object.values(defColumnFilters || {}).some(Boolean) || defRiskLevel || defFilterDuplicatesOnly || defFilterDueToday || defFilterStuckTransit || defFilterPaymentUnchecked || defFilterPrimeBucket) return null;
        if (defSortConfigs.length > 0 || defSortConfig) return null;
        return desktopPreviewRows(listPreview.rows);
    }, [listPreview, defShowArchived, groupBy, defColumnFilters, defRiskLevel, defFilterDuplicatesOnly, defFilterDueToday, defFilterStuckTransit, defFilterPaymentUnchecked, defFilterPrimeBucket, defSortConfigs, defSortConfig]);
    const previewing = previewOrders !== null;
    // A count of the list is its length only once the list is the whole
    // window (or the server's search hits): never over a preview or the
    // previous window's rows.
    const listCountShown = listCountVisible({ listCovered, searching: orderSearch.active });

    useEffect(() => {
        if (!previewing) return;
        const frame = requestAnimationFrame(() => perfTrace.mark("orders:preview-paint"));
        return () => cancelAnimationFrame(frame);
    }, [previewing]);

    // Scroll to top when filters change to prevent empty list illusion
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [filters, filterDuplicatesOnly, filterDueToday]);

    /**
     * Confirming or shipping an order whose 48h twin is already committed sends
     * a second courier to the same customer. Every way to confirm or move to In
     * Transit on this page comes through `duplicateGuard`: a card, the details
     * modal, the table's status dropdown, the workflow tabs, the bulk bar and
     * the floating selection bar. The courier export warns inside its own
     * confirmation dialog instead (see ShipExportConfirmationDialog).
     */
    const duplicateGuard = useDuplicateDispatchGuard(orders, getConfirmBlockingTwin);
    /**
     * A confirm that needs more stock than is free is held too (a warning, not
     * a block). It is asked after the duplicate question, so a confirm the
     * operator already pushed past one guard still meets the other.
     */
    const stockGuard = useStockShortfallGuard(orders, products);
    const holdStatusChange = (orderId: string, status: Order["status"], proceed: () => void): boolean =>
        duplicateGuard.holdStatusChange(orderId, status, () => {
            if (!stockGuard.holdStatusChange(orderId, status, proceed)) proceed();
        }) || stockGuard.holdStatusChange(orderId, status, proceed);

    const statusUpdateNow = async (orderId: string, status: Order["status"], reason?: string, reasonId?: string) => {
        if (holdStatusChange(orderId, status, () => { void runStatusUpdate(orderId, status, reason, reasonId); })) {
            return;
        }
        await runStatusUpdate(orderId, status, reason, reasonId);
    };
    // Every card gets this handler. It reads the latest orders through a ref so
    // its identity never changes: a new function each render made every visible
    // (memoised) card re-render on any page update, such as one checkbox.
    const statusUpdateRef = useRef(statusUpdateNow);
    useLayoutEffect(() => {
        statusUpdateRef.current = statusUpdateNow;
    });
    const handleStatusUpdate = useCallback(
        (orderId: string, status: Order["status"], reason?: string, reasonId?: string) =>
            statusUpdateRef.current(orderId, status, reason, reasonId),
        [],
    );

    const runStatusUpdate = async (orderId: string, status: Order["status"], reason?: string, reasonId?: string) => {
        setLoadingId(orderId);
        // The status before the change, so the success toast can undo it (a
        // swipe on mobile commits with no other acknowledgement).
        const previousStatus = orders.find((o) => o.id === orderId)?.status;
        try {
            // updateOrderStatus tells staff about its own failures; only the
            // success is announced here, so a failure is one message.
            const result = await updateOrderStatus(orderId, status, reason, reasonId);
            if (result?.success || result === undefined) {
                toast.success(t("toast.statusUpdated"), {
                    description: t("toast.statusUpdatedDesc").replace("{status}", String(status)),
                    action: previousStatus && previousStatus !== status
                        ? { label: t("toast.undo"), onClick: () => { void updateOrderStatus(orderId, previousStatus); } }
                        : undefined,
                });
            }
        } finally {
            setLoadingId(null);
        }
    };

    // Toolbar callbacks.
    const openScanner = useCallback(() => setIsScannerOpen(true), []);
    const openReturns = useCallback(() => setIsReturnsOpen(true), []);
    // A card's «وصل؟ استلمه» (the «راجع» list) opens the returns desk; the desk takes the parcel in.
    const returnIntakeRequest = useOrderStore(s => s.returnIntakeRequest);
    useEffect(() => {
        if (returnIntakeRequest) setIsReturnsOpen(true);
    }, [returnIntakeRequest]);
    const openCreateModal = useCallback(() => setIsCreateModalOpen(true), [setIsCreateModalOpen]);

    // Card callbacks, stable so a page re-render does not re-render every card.
    const openCancelDialog = useCallback((o: Order) => {
        setOrderToCancel(o);
        setCancelDialogOpen(true);
    }, [setOrderToCancel, setCancelDialogOpen]);
    const openRejectDialog = useCallback((o: Order) => {
        setOrderToReject(o);
        setRejectDialogOpen(true);
    }, [setOrderToReject, setRejectDialogOpen]);
    const openTemplatePanel = useCallback((o: Order) => {
        setOrderForTemplate(o);
        setTemplatePanelOpen(true);
    }, [setOrderForTemplate, setTemplatePanelOpen]);
    const showDuplicates = useCallback((o: Order) => {
        setDuplicateOrder(o);
        setShowDuplicateModal(true);
    }, [setDuplicateOrder, setShowDuplicateModal]);
    const mergeWithPrevious = useCallback(async (keepId: string, archiveId: string) => {
        await mergeOrders(keepId, archiveId);
    }, [mergeOrders]);
    const openSplitDialog = useCallback((order: Order) => {
        setSplitOrderDialog({ open: true, order });
    }, [setSplitOrderDialog]);

    const toggleOrderSelection = useCallback((orderId: string) => {
        useOrderStore.getState().toggleOrderSelection(orderId);
    }, []);

    const PAGE_SELECT_LIMIT = 50;

    const selectAll = useCallback(() => {
        // Nothing to select from a preview: its rows are read-only.
        if (previewing) return;
        const store = useOrderStore.getState();
        if (store.selectedOrders.size > 0) {
            store.clearSelection();
        } else {
            // Select first PAGE_SELECT_LIMIT orders instead of all
            const idsToSelect = filteredOrders.length > PAGE_SELECT_LIMIT
                ? filteredOrders.slice(0, PAGE_SELECT_LIMIT).map(o => o.id)
                : filteredOrders.map(o => o.id);
            store.selectAll(idsToSelect);
        }
    }, [filteredOrders, previewing]);

    // ARCH-1: every bulk operation — the status handlers, archive, the soft
    // delete and its undo, the courier export and the post-export prompt — used
    // to sit inline here. It is one concern with its own state, so it moved to
    // its own hook rather than being split between a file that holds the state
    // and a file that renders it.
    const bulk = useOrderBulkOperations();
    const {
        isBulkProcessing,
        bulkActions,
        setShipConfirmCompany,
        setShipConfirmOpen,
        setShipConfirmKey,
    } = bulk;

    /**
     * The raw updater, routed through the duplicate guard — for the table's
     * status dropdown and the workflow tabs. A held change resolves as not
     * applied; the dialog's "anyway" button applies it.
     */
    const guardedStatusUpdate = async (
        orderId: string,
        status: Order["status"],
        reason?: string,
    ): Promise<{ success: boolean; error?: string }> => {
        if (holdStatusChange(orderId, status, () => { void updateOrderStatus(orderId, status, reason); })) {
            return { success: false };
        }
        return updateOrderStatus(orderId, status, reason);
    };

    /** Bulk confirm and bulk In Transit, routed through the duplicate guard. */
    const guardedBulkActions = {
        ...bulkActions,
        confirm: async () => {
            const ids = Array.from(useOrderStore.getState().selectedOrders);
            const run = () => { void bulkActions.confirm(); };
            if (duplicateGuard.hold(ids, "confirm", () => { if (!stockGuard.holdConfirm(ids, run)) run(); })) return;
            if (stockGuard.holdConfirm(ids, run)) return;
            await bulkActions.confirm();
        },
        inTransit: async () => {
            const ids = Array.from(useOrderStore.getState().selectedOrders);
            if (duplicateGuard.hold(ids, "dispatch", () => { void bulkActions.inTransit(); })) return;
            await bulkActions.inTransit();
        },
    };
    // The floating selection bar lives in OrderBulkDialogs and reads
    // `bulk.bulkActions` — it must get the guarded set too, or bulk confirm
    // from there walks straight past the guard.
    const guardedBulk = { ...bulk, bulkActions: guardedBulkActions };

    const [showMapPanel, setShowMapPanel] = useState(false);

    // Switch between regular and archived orders
    const displayedOrders = showArchived ? archivedOrders : filteredOrders;
    // What the list renders: the preview while the window loads.
    const listOrders = previewOrders ?? displayedOrders;
    const deferredDisplayedOrders = React.useDeferredValue(listOrders);

    // Risk data by phone, built once. These lookups are called once per rendered
    // row, and each used to be a `.find()` over the whole list — O(rows x visible)
    // on every render. Mirrors the O(1) map `getCustomerOrderCount` already uses.
    const riskByPhone = useMemo(() => {
        const map = new Map<string, Order["risk_data"]>();
        for (const o of deferredDisplayedOrders) {
            if (o.phone && !map.has(o.phone)) map.set(o.phone, o.risk_data);
        }
        return map;
    }, [deferredDisplayedOrders]);

    const getRiskAssessmentByPhone = useCallback(
        (phone: string) => riskByPhone.get(phone),
        [riskByPhone],
    );

    const getRiskLevelByPhone = useCallback(
        (phone: string): "low" | "medium" | "high" | "blocked" => {
            const level = riskByPhone.get(phone)?.level || "low";
            return (level === "flagged" ? "high" : level) as "low" | "medium" | "high" | "blocked";
        },
        [riskByPhone],
    );


    const groupedOrders = useMemo(() => {
        if (groupBy === 'none') {
            return {};
        }

        const groups: Record<string, Order[]> = {};
        deferredDisplayedOrders.forEach(order => {
            let key = 'Other';
            if (groupBy === 'status') key = order.status;
            else if (groupBy === 'city') key = order.city || 'Unknown';
            else if (groupBy === 'verified') key = order.status === 'confirmed' ? 'Verified' : 'Other'; // 'Unverified' might be too broad

            if (!groups[key]) groups[key] = [];
            groups[key].push(order);
        });
        return groups;
    }, [deferredDisplayedOrders, groupBy]);

    // Calculate mode price for deviation highlighting
    const modePrice = useMemo(() => {
        const counts: Record<number, number> = {};
        let max = 0;
        let mode = 0;
        deferredDisplayedOrders.forEach(o => {
            const p = Math.abs(Number(o.price));
            if (p > 0) {
                counts[p] = (counts[p] || 0) + 1;
                if (counts[p] > max) { max = counts[p]; mode = p; }
            }
        });
        return mode;
    }, [deferredDisplayedOrders]);



    // Check if any advanced filters are active
    const hasActiveFilters = !!(filters.dateFrom || filters.dateTo || filters.city || filters.product || filters.priority || filters.adChannel || filters.adCampaign);

    // Pre-compute maps for O(1) lookups and stable object references to prevent re-renders.
    // An original can have several refunds; the card links to the newest.
    const returnOrderInfoMap = useMemo(() => {
        const map = new Map<string, { order: Order; returnOrderId: string; returnSequenceNumber?: number }>();
        for (const o of orders) {
            if (!o.is_return || !o.original_order_id) continue;
            const current = map.get(o.original_order_id);
            if (current && current.order.created_at >= o.created_at) continue;
            map.set(o.original_order_id, { order: o, returnOrderId: o.order_id, returnSequenceNumber: o.sequence_number });
        }
        return map;
    }, [orders]);

    // Keyed by the ORIGINAL's id: a refund order looks its original up by its own original_order_id.
    const originalOrderInfoMap = useMemo(() => {
        const referenced = new Set<string>();
        for (const o of orders) if (o.is_return && o.original_order_id) referenced.add(o.original_order_id);
        const map = new Map<string, { order: Order; originalOrderId: string; originalSequenceNumber?: number }>();
        for (const o of orders) {
            if (referenced.has(o.id)) map.set(o.id, { order: o, originalOrderId: o.order_id, originalSequenceNumber: o.sequence_number });
        }
        return map;
    }, [orders]);

    // Helper function to find return order for an original order
    const getReturnOrderInfo = useCallback((orderId: string) => {
        return returnOrderInfoMap.get(orderId) || null;
    }, [returnOrderInfoMap]);

    // Helper function to find the original order of a refund order, by its original_order_id
    const getOriginalOrderInfo = useCallback((originalOrderId: string | undefined) => {
        if (!originalOrderId) return null;
        return originalOrderInfoMap.get(originalOrderId) || null;
    }, [originalOrderInfoMap]);

    // `loading` misses a pending-but-disabled query — which this one is until the
    // Supabase client finishes initialising — so without ordersPending the page
    // fell through to content with zero orders and rendered the empty state.
    // A preview is content: the page renders it instead of the skeleton.
    const isInitialLoading = !isMounted || ((loading || ordersPending) && !previewing);
    // Load tracing: the first render of real content (rows or a preview) in this visit.
    const contentTraced = useRef(false);
    useEffect(() => {
        if (isInitialLoading || contentTraced.current) return;
        contentTraced.current = true;
        perfTrace.markRepeat("orders:content-render", { rows: orders.length, previewing });
        // An empty window paints its empty state, not rows: that ends the load too.
        if (orders.length === 0 && !previewing) perfTrace.markPainted("orders:list-painted", "orders", { empty: true });
    }, [isInitialLoading, orders.length, previewing]);

    // Shared by both virtualised card lists (single column and compact grid).
    const cardListProps = {
        orders: listOrders,
        loadingId,
        selectedOrders,
        messageTemplates: workflowTemplates,
        onStatusUpdate: handleStatusUpdate,
        onViewDetails: handleViewDetails,
        onToggleSelection: toggleOrderSelection,
        onTogglePin: togglePin,
        onCloneOrder: cloneOrder,
        onScreenshot: setScreenshotOrder,
        onCancelWithReason: openCancelDialog,
        onRejectWithReason: openRejectDialog,
        onToggleReviewed: toggleReviewed,
        onOpenTemplatePanel: openTemplatePanel,
        onShowDuplicates: showDuplicates,
        onMergeWithPrevious: mergeWithPrevious,
        isBlacklisted,
        getBlacklistEntry,
        onAddToBlacklist: canBlock ? addToBlacklist : undefined,
        onRemoveFromBlacklist: canUnblock ? removeFromBlacklist : undefined,
        getRiskAssessment: getRiskAssessmentByPhone,
        getCustomerOrderCount,
        getCustomerArchivedCount,
        getCustomerHistory,
        getReturnOrderInfo,
        getOriginalOrderInfo,
        compactView,
        actionDock,
        getRiskLevel: getRiskLevelByPhone,
        hasDuplicates,
        getDuplicateWindowAlert,
        onContactRecorded: recordContact,
        onSplitOrder: openSplitDialog,
    } satisfies Partial<React.ComponentProps<typeof VirtualizedOrderList>>;


    return {
        sidebarExpanded,
        isMounted,
        setIsMounted,
        isReturnsOpen,
        setIsReturnsOpen,
        isStockTodayOpen,
        setIsStockTodayOpen,
        isScannerOpen,
        setIsScannerOpen,
        showSubFilters,
        toggleSubFilters,
        showAdChannels,
        toggleAdChannels,
        showAdsChips,
        toggleAdsChips,
        showPipeline,
        togglePipeline,
        recordContact,
        orders,
        hookFilteredOrders,
        loading,
        isRefreshing,
        ordersPending,
        orderSearch,
        error,
        updateOrderStatus,
        isBlacklisted,
        getBlacklistEntry,
        addToBlacklist,
        removeFromBlacklist,
        availableCities,
        availableProducts,
        filters,
        setFilters,
        clearFilters,
        filterPresets,
        saveFilterPreset,
        loadFilterPreset,
        deleteFilterPreset,
        hasDuplicates,
        getDuplicateWindowAlert,
        getConfirmBlockingTwin,
        getCustomerHistory,
        getCustomerOrderCount,
        mergeOrders,
        togglePin,
        toggleReviewed,
        cloneOrder,
        archivedOrders,
        fetchArchivedOrders,
        getCustomerArchivedCount,
        undoLastAction,
        canUndo,
        statusCounts,
        attentionCounts,
        countViewFacts,
        ordersAreComplete,
        listCovered,
        listPreview,
        filtersSettled,
        messageTemplates,
        drillParamsApplied,
        products,
        oversoldCount,
        isMobile,
        t,
        datePreset,
        can,
        canUnblock,
        canBlock,
        viewMode,
        setViewMode,
        compactView,
        setCompactView,
        compactGrid,
        setCompactGrid,
        actionDock,
        showSearchBar,
        setShowSearchBar,
        analyticsLevel,
        setAnalyticsLevel,
        toolbarCollapsed,
        toggleToolbarCollapse,
        setSoundEnabled,
        showFilters,
        setShowFilters,
        groupBy,
        setGroupBy,
        filterDuplicatesOnly,
        setFilterDuplicatesOnly,
        filterDueToday,
        setFilterDueToday,
        sortConfig,
        sortConfigs,
        toggleSort,
        dangerBandCounts,
        dangerListTotal: preDangerOrders.length,
        dangerReady,
        dangerFailed,
        retryDanger,
        columnFilters,
        setColumnFilters,
        openFilterColumn,
        setOpenFilterColumn,
        activePresetId,
        setActivePresetId,
        setIsModalOpen,
        setSelectedOrder,
        setIsCreateModalOpen,
        setShowDuplicateModal,
        setDuplicateOrder,
        setCancelDialogOpen,
        setOrderToCancel,
        setRejectDialogOpen,
        setOrderToReject,
        setTemplatePanelOpen,
        setOrderForTemplate,
        setIsExportModalOpen,
        splitOrderDialog,
        setSplitOrderDialog,
        setScreenshotOrder,
        showDatePicker,
        setShowDatePicker,
        datePickerPos,
        setDatePickerPos,
        selectedOrders,
        setSelectedOrders,
        showArchived,
        setShowArchived,
        loadingId,
        setLoadingId,
        isHeaderAnimating,
        setIsHeaderAnimating,
        notificationsEnabled,
        setNotificationsEnabled,
        debouncedColumnFilters,
        splitOrder,
        handleSplitOrder,
        handleViewDetails,
        setSelectedOrderWithFetch,
        emptyStateHasFilters,
        isFirstRun,
        workflowTemplates,
        dateButtonRef,
        datePickerRef,
        toolbarScrollRef,
        toolbarFade,
        setToolbarFade,
        defColumnFilters,
        defFilterDuplicatesOnly,
        defFilterDueToday,
        filterStuckTransit,
        defFilterStuckTransit,
        stuckIds,
        stuckIdSet,
        filterPaymentUnchecked,
        defFilterPaymentUnchecked,
        paymentUncheckedIds,
        paymentUncheckedSet,
        defRiskLevel,
        defSortConfig,
        defSortConfigs,
        filteredOrders,
        flaggedCount,
        dueTodayCount,
        totalRiskCount,
        defShowArchived,
        countVis,
        previewOrders,
        previewing,
        listCountShown,
        duplicateGuard,
        stockGuard,
        holdStatusChange,
        statusUpdateNow,
        statusUpdateRef,
        handleStatusUpdate,
        runStatusUpdate,
        openScanner,
        openReturns,
        openCreateModal,
        openCancelDialog,
        openRejectDialog,
        openTemplatePanel,
        showDuplicates,
        mergeWithPrevious,
        openSplitDialog,
        toggleOrderSelection,
        PAGE_SELECT_LIMIT,
        selectAll,
        bulk,
        isBulkProcessing,
        bulkActions,
        setShipConfirmCompany,
        setShipConfirmOpen,
        setShipConfirmKey,
        guardedStatusUpdate,
        guardedBulkActions,
        guardedBulk,
        showMapPanel,
        setShowMapPanel,
        displayedOrders,
        listOrders,
        deferredDisplayedOrders,
        riskByPhone,
        getRiskAssessmentByPhone,
        getRiskLevelByPhone,
        groupedOrders,
        modePrice,
        hasActiveFilters,
        returnOrderInfoMap,
        originalOrderInfoMap,
        getReturnOrderInfo,
        getOriginalOrderInfo,
        isInitialLoading,
        contentTraced,
        cardListProps,
    };
}

export type OrdersPageModel = ReturnType<typeof useOrdersPageModel>;
