"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { DuplicateConfirmDialog } from "@/components/orders/duplicate-confirm-dialog";
import { useDuplicateDispatchGuard } from "@/hooks/use-duplicate-dispatch-guard";
import { useShallow } from "zustand/react/shallow";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useDebounce } from "@/hooks/use-debounce";
import { Order, OrderItem } from "@/lib/supabase";
import type { OrderFilters } from "@/types/order";
import { orderMatchesRiskLevel } from "@/lib/order-filter-utils";
import { countVisibility } from "@/lib/orders/count-visibility";
import { getScheduledState, isScheduleDue } from "@/lib/order-format-utils";
import { SwipeableOrderCard } from "@/components/orders/swipeable-order-card";
import { orderRepository } from "@/lib/repositories/order-repository";
import { OrderDialogs } from "@/components/orders/order-dialogs";
import { OrderBulkDialogs } from "@/components/orders/order-bulk-dialogs";
import { useOrderBulkOperations } from "@/hooks/use-order-bulk-operations";
import { reportOrderError } from "@/lib/order-telemetry";

// Dynamic imports for other heavy components
const WorkflowTabs = dynamic(
    () => import("@/components/orders/workflow-tabs").then(mod => ({ default: mod.WorkflowTabs })),
    { ssr: false, loading: () => <div className="w-full h-96 animate-pulse bg-muted/20 rounded-2xl" /> }
);
const VirtualizedOrderList = dynamic(
    () => import("@/components/orders/virtualized-order-list").then(mod => ({ default: mod.VirtualizedOrderList })),
    { ssr: false, loading: () => <div className="w-full h-[600px] animate-pulse bg-muted/20 rounded-2xl" /> }
);
const DateRangePicker = dynamic(
    () => import("@scheniders/ui/date-range-picker").then(mod => ({ default: mod.DateRangePicker })),
    { ssr: false, loading: () => <div className="w-full h-10 animate-pulse bg-muted/20 rounded-xl" /> }
);
import { GlobalSearchField } from "@/components/orders/global-search-field";
import { OrderSearchBanner } from "@/components/orders/order-search-banner";
import { OrdersAnalyticsPanel } from "@/components/orders/orders-analytics-panel";
import { OrdersFilterBar } from "@/components/orders/orders-filter-bar";
import { EmptyState } from "@/components/ui/empty-states";
import { StaggerContainer, StaggerItem, EASE_CHROME, EASE_PANEL, EASE_CROSSFADE } from "@/components/layout/page-transition";
import { useSidebar } from "@/components/layout/dashboard-layout";
const SavedViewsTabs = dynamic(
    () => import("@/components/orders/saved-views-tabs").then(mod => ({ default: mod.SavedViewsTabs })),
    { ssr: false, loading: () => <div className="w-48 h-10 animate-pulse bg-muted/20 rounded-xl" /> }
);
const StickyFilterBar = dynamic(
    () => import("@/components/orders/sticky-filter-bar").then(mod => ({ default: mod.StickyFilterBar })),
    { ssr: false, loading: () => <div className="w-full h-14 animate-pulse bg-muted/20 rounded-2xl" /> }
);
const VirtualizedOrderTable = dynamic(
    () => import("@/components/orders/virtualized-order-table").then(mod => ({ default: mod.VirtualizedOrderTable })),
    { loading: () => null, ssr: false }
);
const ScrollToTopButton = dynamic(
    () => import("@scheniders/ui/scroll-to-top-button").then(mod => ({ default: mod.ScrollToTopButton })),
    { ssr: false, loading: () => <div className="hidden" /> }
);
const BackupPrompt = dynamic(
    () => import("@/components/vault/backup-prompt").then(mod => ({ default: mod.BackupPrompt })),
    { ssr: false, loading: () => <div className="hidden" /> }
);
const IraqMap = dynamic(
    () => import("@/components/shared/iraq-map").then(mod => ({ default: mod.IraqMap })),
    { ssr: false, loading: () => <div className="w-full h-[350px] animate-pulse bg-muted/20 rounded-2xl" /> }
);
const StoreCapturesPanel = dynamic(
    () => import("@/components/orders/store-captures-panel").then(mod => ({ default: mod.StoreCapturesPanel })),
    { ssr: false, loading: () => null }
);
import { useIsMobile } from "@/hooks/use-mobile";
import { OrderPipeline } from "@/components/orders/order-pipeline";
import { motion, AnimatePresence } from "framer-motion";
import {
    Plus,
    Download,
    Package,
    CheckSquare,
    MapPin,
    CalendarDays,
    BarChart3,
    Trash2,
    LayoutGrid,
    Table,
    Bell,
    BellOff,
    List,
    GitBranch,
    SlidersHorizontal,
    LayoutList,
    Rows3,
    Archive,
    RotateCcw,
    Minimize2,
    Maximize2,
    Truck,
    PackageX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canOfferSelectAll } from "@/lib/order-bulk-scope";
import { notificationService } from "@/lib/notification-service";
import { toast } from "@/hooks/use-toast";

import { useLanguage } from "@/hooks/use-language";
import { useRecordContact } from "@/hooks/use-record-contact";

export default function OrdersPage() {
    const { sidebarExpanded } = useSidebar();
    // 🔍 DIAGNOSTIC: Track loading → content transition (one-shot, not per-render)
    const pageMountTime = useRef<number | null>(null);
    const hasLoggedMount = useRef(false);
    const hasLoggedContent = useRef(false);

    useEffect(() => {
        if (!hasLoggedMount.current) {
            pageMountTime.current = performance.now();
            hasLoggedMount.current = true;
            if (pageMountTime.current !== null) {
                console.log(`[OrdersPage] first render at ${Math.round(pageMountTime.current)}ms`);
            }
        }
    }, []);

    const [isMounted, setIsMounted] = useState(false);
    const [isReturnsOpen, setIsReturnsOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    // Sub-filters (Type + Products rows) are hidden by default — show only when
    // the merchant clicks the toggle next to the barcode button. Per-device pref.
    const [showSubFilters, setShowSubFilters] = useState(false);
    useEffect(() => {
        const stored = typeof window !== "undefined" ? localStorage.getItem("ordersShowSubFilters") : null;
        if (stored !== null) setShowSubFilters(stored === "true");
    }, []);
    const toggleSubFilters = useCallback(() => {
        setShowSubFilters((v) => {
            const next = !v;
            localStorage.setItem("ordersShowSubFilters", String(next));
            return next;
        });
    }, []);
    // Order pipeline funnel — hidden by default, surfaced via toolbar toggle.
    // Per-device pref, mirrors the sub-filters pattern above.
    const [showPipeline, setShowPipeline] = useState(false);
    useEffect(() => {
        const stored = typeof window !== "undefined" ? localStorage.getItem("ordersShowPipeline") : null;
        if (stored !== null) setShowPipeline(stored === "true");
    }, []);
    const togglePipeline = useCallback(() => {
        setShowPipeline((v) => {
            const next = !v;
            localStorage.setItem("ordersShowPipeline", String(next));
            return next;
        });
    }, []);
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
        updateOrder,
        isBlacklisted,
        getBlacklistEntry,
        addToBlacklist,
        removeFromBlacklist,
        stats,
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
        fetchOrders: refreshOrders,
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

    // Get products for Excel import matching
    useProductsCrud();
    const isMobile = useIsMobile();
    const { t } = useLanguage();

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
        workflowMode, toggleWorkflowMode,
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
            workflowMode: s.workflowMode,
            toggleWorkflowMode: s.toggleWorkflowMode,
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
        if (!splitOrderDialog.order) return;

        // Show loading state could be nice here if dialog supported it
        const result = await splitOrder(splitOrderDialog.order.id, keptItems, returnedItems);

        if (result.success) {
            setSplitOrderDialog({ open: false, order: null });

            // Force data refresh to show new orders
            await refreshOrders();

            toast.success(
                "Order split successfully",
                "Return order has been created"
            );
        } else {
            toast.error(
                "Split failed",
                result.error || t("orderDetail.splitError")
            );
        }
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
                toast.error("Order not found", "This order may have been deleted.");
            }
        } catch (err) {
            // Falling back to the list row is better than refusing to open, but
            // it was previously silent: the operator edited a possibly-stale
            // record with no idea the refresh had failed.
            reportOrderError(err, { operation: "orders-view-details-fetch", orderId: order.id });
            toast.warning(
                "Showing the last known details",
                "This order could not be refreshed, so it may be out of date.",
            );
            setSelectedOrder(order);
            setIsModalOpen(true);
        }
    }, [setSelectedOrder, setIsModalOpen]);

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
                "Showing the last known details",
                "This order could not be refreshed, so it may be out of date.",
            );
            setSelectedOrder(order);
        }
    }, [setSelectedOrder]);



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
    const defRiskLevel = React.useDeferredValue(filters.riskLevel);
    const defSortConfig = React.useDeferredValue(sortConfig);
    const defSortConfigs = React.useDeferredValue(sortConfigs);

    // Sort hook's filtered orders
    // Advanced Filtering & Sorting
    const filteredOrders = useMemo(() => {
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

        // 2. Sort
        const activeSorts = defSortConfigs.length > 0 ? defSortConfigs : defSortConfig ? [defSortConfig] : [];

        // Same reason as in use-order-filters: the comparator ran `new Date()`
        // twice per comparison. Resolve each order's timestamp once up front.
        const createdAtMs = new Map<string, number>();
        for (const order of result) {
            const parsed = Date.parse(order.created_at);
            createdAtMs.set(order.id, Number.isNaN(parsed) ? 0 : parsed);
        }
        const createdAt = (order: Order) => createdAtMs.get(order.id) ?? 0;
        // Orders parked for a later day are not today's work: they stay in the
        // list of the day they arrived (where the status chips count them) but
        // sink below the live queue instead of mixing into it.
        const parked = new Set(result.filter(o => getScheduledState(o.scheduled_date) === "future").map(o => o.id));

        result.sort((a, b) => {
            // Priority: Pinned first
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;

            const aParked = parked.has(a.id);
            const bParked = parked.has(b.id);
            if (aParked !== bParked) return aParked ? 1 : -1;

            // Multi-column sort
            for (const sc of activeSorts) {
                let aVal: unknown = a[sc.key as keyof Order];
                let bVal: unknown = b[sc.key as keyof Order];

                if (sc.key === 'amount') { aVal = Number(a.price); bVal = Number(b.price); }
                if (sc.key === 'order_id') { aVal = a.sequence_number || a.order_id; bVal = b.sequence_number || b.order_id; }
                if (sc.key === 'created_at') { aVal = createdAt(a); bVal = createdAt(b); }

                if (aVal != null && bVal != null && aVal < bVal) return sc.direction === 'asc' ? -1 : 1;
                if (aVal != null && bVal != null && aVal > bVal) return sc.direction === 'asc' ? 1 : -1;
            }

            if (activeSorts.length > 0) return 0;

            // Default sort: Newest first
            return createdAt(b) - createdAt(a);
        });
        return result;
    }, [hookFilteredOrders, defSortConfig, defSortConfigs, defColumnFilters, defFilterDuplicatesOnly, defFilterDueToday, getCustomerOrderCount, defRiskLevel]);

    // Calculate flagged orders count for "Needs Attention" card (data quality issues + rejected orders).
    // Counted with the same predicate the filter uses, so the number on the card
    // can never disagree with the list you get after clicking it.
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
    const countVis = useMemo(() => countVisibility({
        facts: countViewFacts,
        archived: defShowArchived,
        columnFilter: Object.values(defColumnFilters || {}).some(Boolean),
        riskLevel: defRiskLevel,
        duplicatesOnly: defFilterDuplicatesOnly,
        dueToday: defFilterDueToday,
    }), [countViewFacts, defShowArchived, defColumnFilters, defRiskLevel, defFilterDuplicatesOnly, defFilterDueToday]);

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

    const handleStatusUpdate = async (orderId: string, status: Order["status"], reason?: string, reasonId?: string) => {
        if (duplicateGuard.holdStatusChange(orderId, status, () => { void runStatusUpdate(orderId, status, reason, reasonId); })) {
            return;
        }
        await runStatusUpdate(orderId, status, reason, reasonId);
    };

    const runStatusUpdate = async (orderId: string, status: Order["status"], reason?: string, reasonId?: string) => {
        setLoadingId(orderId);
        try {
            const result = await updateOrderStatus(orderId, status, reason, reasonId);
            if (result?.success || result === undefined) {
                toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDesc").replace("{status}", String(status)));
            } else if (result?.error) {
                toast.error(t("toast.updateFailed"), result.error);
            }
        } catch (err) {
            toast.error(t("toast.updateFailed"), err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoadingId(null);
        }
    };

    const toggleOrderSelection = useCallback((orderId: string) => {
        useOrderStore.getState().toggleOrderSelection(orderId);
    }, []);

    const PAGE_SELECT_LIMIT = 50;

    const selectAll = useCallback(() => {
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
    }, [filteredOrders]);

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
        if (duplicateGuard.holdStatusChange(orderId, status, () => { void updateOrderStatus(orderId, status, reason); })) {
            return { success: false };
        }
        return updateOrderStatus(orderId, status, reason);
    };

    /** Bulk confirm and bulk In Transit, routed through the duplicate guard. */
    const guardedBulkActions = {
        ...bulkActions,
        confirm: async () => {
            const ids = Array.from(useOrderStore.getState().selectedOrders);
            if (duplicateGuard.hold(ids, "confirm", () => { void bulkActions.confirm(); })) return;
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
    const deferredDisplayedOrders = React.useDeferredValue(displayedOrders);

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
    const hasActiveFilters = !!(filters.dateFrom || filters.dateTo || filters.city || filters.product || filters.priority || filters.adChannel);

    // Pre-compute maps for O(1) lookups and stable object references to prevent re-renders
    const returnOrderInfoMap = useMemo(() => {
        const map = new Map();
        orders.forEach(o => {
            if (o.is_return && o.original_order_id) {
                map.set(o.original_order_id, {
                    order: o,
                    returnOrderId: o.order_id,
                    returnSequenceNumber: o.sequence_number
                });
            }
        });
        return map;
    }, [orders]);

    const originalOrderInfoMap = useMemo(() => {
        const map = new Map();
        orders.forEach(o => {
            if (o.is_return && o.original_order_id) {
                const originalOrder = orders.find(orig => orig.id === o.original_order_id);
                if (originalOrder) {
                    map.set(o.id, {
                        order: originalOrder,
                        originalOrderId: originalOrder.order_id,
                        originalSequenceNumber: originalOrder.sequence_number
                    });
                }
            }
        });
        return map;
    }, [orders]);

    // Helper function to find return order for an original order
    const getReturnOrderInfo = useCallback((orderId: string) => {
        return returnOrderInfoMap.get(orderId) || null;
    }, [returnOrderInfoMap]);

    // Helper function to find original order info for a return order
    const getOriginalOrderInfo = useCallback((returnOrderId: string | undefined) => {
        if (!returnOrderId) return null;
        return originalOrderInfoMap.get(returnOrderId) || null;
    }, [originalOrderInfoMap]);

    // Handle logging transition once
    if (!loading && !hasLoggedContent.current && pageMountTime.current !== null) {
        hasLoggedContent.current = true;
    } else if (loading && !hasLoggedContent.current && pageMountTime.current !== null) {
        // Still loading skeleton
    }

    // `loading` misses a pending-but-disabled query — which this one is until the
    // Supabase client finishes initialising — so without ordersPending the page
    // fell through to content with zero orders and rendered the empty state.
    const isInitialLoading = !isMounted || loading || ordersPending;

    return (
        <AnimatePresence mode="wait">
            {isInitialLoading ? (
                <motion.div
                    key="skeleton"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.25, ease: EASE_CROSSFADE } }}
                    className="min-h-screen bg-[var(--background)]"
                />
            ) : error ? (
                <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="min-h-screen flex items-center justify-center"
                >
                    <div className="pastel-card pastel-card-pink p-8 text-center">
                        <h2 className="text-xl font-bold text-rose-900 mb-2">{t("orders.errorTitle")}</h2>
                        <p className="text-rose-700">{error}</p>
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    key="content"
                    initial="hidden"
                    animate="visible"
                    variants={{
                        hidden: { opacity: 0 },
                        visible: {
                            opacity: 1,
                            transition: {
                                duration: 0.3,
                                ease: EASE_CROSSFADE,
                                staggerChildren: 0.07,
                            },
                        },
                    }}
                >
                    <div className="min-h-screen p-4 md:p-6 lg:p-8 orders-page relative">
                        <div className="space-y-4 md:space-y-6">
                            {/* Section 1: Toolbar — stagger child */}
                            <motion.div
                                variants={{
                                    hidden: { opacity: 0, y: 6 },
                                    visible: {
                                        opacity: 1,
                                        y: 0,
                                        transition: { duration: 0.35, ease: EASE_CHROME },
                                    },
                                }}
                            >

                                {/* Collapsed Toolbar Bar - Minimal floating header when collapsed */}
                                <AnimatePresence initial={false}>
                                    {toolbarCollapsed && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.25, ease: EASE_CHROME }}
                                            className="sticky top-2 z-50"
                                        >
                                            <div className="flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl orders-collapsed-toolbar bg-[var(--card-bg)] border border-[var(--card-border)] shadow-lg">
                                                {/* Left: Select All + Order count and status */}
                                                <div className="flex items-center gap-3">
                                                    {/* Select All Checkbox */}
                                                    <button
                                                        onClick={selectAll}
                                                        className={cn(
                                                            "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                                                            selectedOrders.size === filteredOrders.length && filteredOrders.length > 0
                                                                ? "bg-[var(--ink)] border-[var(--ink)] text-white"
                                                                : "border-[var(--card-border)] hover:border-[var(--foreground-muted)]"
                                                        )}
                                                        title="Select all"
                                                    >
                                                        {selectedOrders.size === filteredOrders.length && filteredOrders.length > 0 && (
                                                            <CheckSquare className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                    <div className="flex items-center gap-2">
                                                        <Package className="w-5 h-5 text-foreground" />
                                                        <span className="font-bold text-lg text-foreground" data-orders-header-count>{filteredOrders.length}</span>
                                                        <span className="text-muted text-sm">orders</span>
                                                    </div>
                                                    {selectedOrders.size > 0 && (
                                                        <span className="px-2.5 py-1 text-xs font-semibold bg-[var(--pastel-purple-light)] text-purple-700 rounded-full">
                                                            {selectedOrders.size} selected
                                                        </span>
                                                    )}
                                                    {filters.status && filters.status !== 'all' && (
                                                        <span className="px-2.5 py-1 text-xs font-semibold bg-[var(--pastel-yellow)] text-amber-800 rounded-full capitalize">
                                                            {filters.status.replace('_', ' ')}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Center: Quick search */}
                                                <div className="hidden md:flex items-center gap-2 flex-1 max-w-md">
                                                    <GlobalSearchField setFilters={setFilters} onScannerOpen={() => setIsScannerOpen(true)} />
                                                </div>

                                                {/* Right: Quick actions + Expand */}
                                                <div className="flex items-center gap-2">
                                                    {/* Returns Cockpit Button */}
                                                    <button
                                                        onClick={() => setIsReturnsOpen(true)}
                                                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-500 text-white shadow-sm hover:bg-orange-600 transition-all text-sm font-semibold"
                                                        title="Returns cockpit (scan returned packages)"
                                                    >
                                                        <PackageX className="w-4 h-4" />
                                                        <span className="hidden sm:inline">Returns</span>
                                                    </button>

                                                    {/* New Order Button */}
                                                    <button
                                                        onClick={() => setIsCreateModalOpen(true)}
                                                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--button-success)] text-white shadow-sm hover:bg-[var(--button-success-hover)] transition-all text-sm font-semibold"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                        <span className="hidden sm:inline">{t("orders.status.new")}</span>
                                                    </button>

                                                    {/* Expand Button */}
                                                    <button
                                                        onClick={toggleToolbarCollapse}
                                                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-muted hover:text-foreground hover:bg-[var(--card-bg)] transition-all text-sm font-medium"
                                                        title="Expand toolbar (⌘\\)"
                                                    >
                                                        <Maximize2 className="w-4 h-4" />
                                                        <span className="hidden lg:inline">{t("orders.filter.expand")}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Full Header - Hidden when collapsed */}
                                <AnimatePresence initial={false}>
                                    {!toolbarCollapsed && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.3, ease: EASE_PANEL }}
                                            onAnimationStart={() => setIsHeaderAnimating(true)}
                                            onAnimationComplete={() => setIsHeaderAnimating(false)}
                                            className={cn(
                                                isHeaderAnimating ? "overflow-hidden" : "overflow-visible"
                                            )}
                                        >
                                            {/* Page Header - Premium State-of-the-Art Design */}
                                            <motion.div
                                                initial={{ opacity: 0, y: -6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.3, ease: EASE_CHROME }}
                                                className="space-y-3"
                                            >
                                                {/* Title Row - Premium */}
                                                <div className="flex items-center justify-between pb-2">
                                                    <div className="flex items-center gap-4">
                                                        {/* Select All - Custom Glass Checkbox */}
                                                        <button
                                                            onClick={selectAll}
                                                            className={cn(
                                                                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 group relative overflow-hidden",
                                                                selectedOrders.size === filteredOrders.length && filteredOrders.length > 0
                                                                    ? "border-transparent text-white"
                                                                    : "border-muted-foreground/30 hover:border-primary/50"
                                                            )}
                                                            title="Select all"
                                                        >
                                                            {selectedOrders.size === filteredOrders.length && filteredOrders.length > 0 && (
                                                                <div className="absolute inset-0 bg-gradient-to-br from-primary to-violet-600 opacity-100" />
                                                            )}
                                                            <CheckSquare className={cn("w-3.5 h-3.5 z-10 transition-transform duration-300", selectedOrders.size > 0 ? "scale-100" : "scale-0")} />
                                                        </button>

                                                        {/* Order Count - Glass Pill */}
                                                        <div className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] orders-toolbar-pill">
                                                            <div className="p-2 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 dark:!bg-none dark:bg-[var(--primary)] text-white dark:text-black shadow-lg shadow-amber-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
                                                                <Package className="w-4 h-4" />
                                                            </div>
                                                            <div className="flex flex-col leading-none">
                                                                <div className="flex items-baseline gap-1.5">
                                                                    <span className="text-2xl font-black text-foreground dark:text-white" data-orders-header-count>
                                                                        {filteredOrders.length}
                                                                    </span>
                                                                    <span className="text-xs font-semibold text-muted-foreground dark:text-[var(--foreground-muted)] uppercase tracking-wide">{t("orders.title")}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Selection Indicator */}
                                                        <AnimatePresence>
                                                            {selectedOrders.size > 0 && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, scale: 0.8, x: -20 }}
                                                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                                                    exit={{ opacity: 0, scale: 0.8, x: -20 }}
                                                                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500 text-white shadow-lg shadow-violet-500/25"
                                                                >
                                                                    <span className="text-sm font-bold">{selectedOrders.size}</span>
                                                                    <span className="text-xs font-medium opacity-80">{t("orders.selected")}</span>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>

                                                    {/* Actions */}
                                                    {/* Old Actions Location Removed */}
                                                </div>

                                                {/* Row 2: Control Groups - Premium Glass Cards.
                                                    One flex container so justify-between spreads free space
                                                    evenly between ALL cards. Never position:sticky a card in
                                                    here — it paints over the cards scrolling beneath it; the
                                                    edge fades below signal overflow instead. */}
                                                    <div
                                                        ref={toolbarScrollRef}
                                                        className={cn(
                                                            "flex items-start justify-between gap-3 pt-2 pb-6 w-full md:mx-0 md:px-0 overflow-x-auto scrollbar-hide flex-nowrap",
                                                            toolbarFade.left && toolbarFade.right && "[mask-image:linear-gradient(to_right,transparent,black_32px,black_calc(100%-32px),transparent)]",
                                                            toolbarFade.left && !toolbarFade.right && "[mask-image:linear-gradient(to_right,transparent,black_32px)]",
                                                            !toolbarFade.left && toolbarFade.right && "[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]"
                                                        )}
                                                    >

                                                    {/* View Group */}
                                                    <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0 min-w-min">
                                                        <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.view")}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            {/* Saved Views Dropdown */}
                                                            <SavedViewsTabs
                                                                presets={filterPresets}
                                                                activePresetId={activePresetId}
                                                                onSelect={(presetId) => {
                                                                    setActivePresetId(presetId);
                                                                    loadFilterPreset(presetId);
                                                                }}
                                                                onSave={(name) => {
                                                                    const preset = saveFilterPreset(name);
                                                                    setActivePresetId(preset.id);
                                                                }}
                                                                onDelete={(presetId) => {
                                                                    deleteFilterPreset(presetId);
                                                                    if (activePresetId === presetId) {
                                                                        setActivePresetId(null);
                                                                        clearFilters();
                                                                    }
                                                                }}
                                                                onClearFilter={() => {
                                                                    setActivePresetId(null);
                                                                    clearFilters();
                                                                }}
                                                            />

                                                            <div className="w-px h-8 bg-black/5 mx-0.5 orders-toolbar-divider" />
                                                            {/* Workflow Toggle */}
                                                            <div className="flex items-center bg-black/5 rounded-xl p-1 gap-1">
                                                                <button
                                                                    onClick={() => workflowMode && toggleWorkflowMode()}
                                                                    className={cn(
                                                                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2",
                                                                        !workflowMode
                                                                            ? "bg-white text-foreground shadow-sm dark:bg-[var(--primary)] dark:text-black dark:shadow-[0_0_8px_rgba(239,255,0,0.2)]"
                                                                            : "text-muted-foreground hover:text-foreground"
                                                                    )}
                                                                >
                                                                    <List className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => !workflowMode && toggleWorkflowMode()}
                                                                    className={cn(
                                                                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2",
                                                                        workflowMode
                                                                            ? "bg-white text-foreground shadow-sm dark:bg-[var(--primary)] dark:text-black dark:shadow-[0_0_8px_rgba(239,255,0,0.2)]"
                                                                            : "text-muted-foreground hover:text-foreground"
                                                                    )}
                                                                >
                                                                    <GitBranch className="w-4 h-4" />
                                                                </button>
                                                            </div>

                                                            <div className="w-px h-8 bg-black/5 mx-0.5 orders-toolbar-divider" />

                                                            {/* Layout Toggles */}
                                                            {!workflowMode && [
                                                                { mode: "cards" as const, icon: LayoutGrid, label: "Cards" },
                                                                { mode: "table" as const, icon: Table, label: "Table" },
                                                            ].map((v) => (
                                                                <button
                                                                    key={v.mode}
                                                                    onClick={() => setViewMode(v.mode)}
                                                                    title={v.label}
                                                                    className={cn(
                                                                        "p-2.5 rounded-xl transition-all duration-300",
                                                                        (viewMode === v.mode || (viewMode === "list" && v.mode === "cards"))
                                                                            ? "bg-white text-foreground shadow-sm dark:bg-[var(--primary)] dark:text-black dark:shadow-[0_0_8px_rgba(239,255,0,0.2)] ring-1 ring-black/5"
                                                                            : "text-muted-foreground hover:bg-lime-50 dark:hover:bg-[#EFFF00]/10 hover:text-foreground dark:hover:bg-white/5"
                                                                    )}
                                                                >
                                                                    <v.icon className="w-4 h-4" />
                                                                </button>
                                                            ))}

                                                            {/* Compact Toggle */}
                                                            {!workflowMode && (viewMode === "cards" || viewMode === "list") && (
                                                                <button
                                                                    onClick={() => {
                                                                        const newLevel = ((compactView + 1) % 3) as 0 | 1 | 2;
                                                                        setCompactView(newLevel);
                                                                        localStorage.setItem("ordersCompactView", String(newLevel));
                                                                    }}
                                                                    className={cn(
                                                                        "p-2.5 rounded-xl transition-all duration-300",
                                                                        compactView === 1 && "bg-purple-100 text-purple-600 shadow-sm dark:bg-[var(--primary)] dark:text-black",
                                                                        compactView === 2 && "bg-indigo-100 text-indigo-600 shadow-sm dark:bg-[var(--primary)] dark:text-black",
                                                                        compactView === 0 && "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                                    )}
                                                                    title={compactView === 0 ? "Switch to Compact" : compactView === 1 ? "Compact View" : "Ultra Compact"}
                                                                >
                                                                    {compactView === 0
                                                                        ? <Rows3 className="w-4 h-4" />
                                                                        : compactView === 1
                                                                            ? <LayoutList className="w-4 h-4" />
                                                                            : <List className="w-4 h-4" />
                                                                    }
                                                                </button>
                                                            )}

                                                            {/* Grid Toggle - only visible in compact modes */}
                                                            {!workflowMode && (viewMode === "cards" || viewMode === "list") && compactView >= 1 && (
                                                                <button
                                                                    onClick={() => {
                                                                        const newVal = !compactGrid;
                                                                        setCompactGrid(newVal);
                                                                        localStorage.setItem("ordersCompactGrid", String(newVal));
                                                                    }}
                                                                    className={cn(
                                                                        "p-2.5 rounded-xl transition-all duration-300",
                                                                        compactGrid
                                                                            ? "bg-amber-100 text-amber-700 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                                            : "text-muted-foreground hover:bg-lime-50 dark:hover:bg-[#EFFF00]/10 hover:text-foreground dark:hover:bg-white/5"
                                                                    )}
                                                                    title={compactGrid ? "Grid View" : "Switch to Grid"}
                                                                >
                                                                    <LayoutGrid className="w-4 h-4" />
                                                                </button>
                                                            )}

                                                            <div className="w-px h-8 bg-black/5 mx-0.5 orders-toolbar-divider" />

                                                            {/* Collapse Toolbar */}
                                                            <button
                                                                onClick={toggleToolbarCollapse}
                                                                className="p-2.5 rounded-xl text-muted-foreground hover:bg-amber-200/60 hover:text-foreground transition-all duration-300 hover:rotate-90 active:scale-95"
                                                                title="Collapse toolbar"
                                                            >
                                                                <Minimize2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Filter Group */}
                                                    <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0">
                                                        <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.filter")}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            {/* Date Picker */}
                                                            <div>
                                                                <button
                                                                    ref={dateButtonRef}
                                                                    onClick={() => setShowDatePicker(!showDatePicker)}
                                                                    className={cn(
                                                                        "px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 border",
                                                                        (filters.dateFrom || filters.dateTo)
                                                                            ? "bg-lime-50 dark:bg-[#EFFF00]/5 border-lime-400 dark:border-[#EFFF00]/40 text-foreground shadow-sm"
                                                                            : "border-[var(--card-border)] dark:border-white/10 text-muted-foreground hover:bg-lime-50 dark:hover:bg-[#EFFF00]/10 hover:text-foreground hover:border-lime-400/40 dark:hover:border-[#EFFF00]/40"
                                                                    )}
                                                                >
                                                                    <CalendarDays className={cn(
                                                                        "w-4 h-4 transition-colors",
                                                                        (filters.dateFrom || filters.dateTo) ? "text-lime-600 dark:text-[#EFFF00]" : "text-muted-foreground group-hover:text-foreground"
                                                                    )} />
                                                                    <span className={cn("hidden", sidebarExpanded ? "xl:inline" : "lg:inline")}>
                                                                        {(() => {
                                                                            if (!filters.dateFrom) return "All Orders";
                                                                            const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                                                            const now = new Date();
                                                                            const todayStr = fmt(now);
                                                                            const df = filters.dateFrom;
                                                                            const dt = filters.dateTo || df;

                                                                            // A. Preset-First Logic (Definitive match)
                                                                            const datePreset = useOrderStore.getState().datePreset;
                                                                            if (datePreset) {
                                                                                const presets: Record<string, { label: string; range: () => { f: string; t: string } }> = {
                                                                                    today: { label: "Today", range: () => ({ f: todayStr, t: todayStr }) },
                                                                                    yesterday: { label: "Yesterday", range: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = fmt(d); return { f: s, t: s }; } },
                                                                                    thisWeek: { label: "This Week", range: () => { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); return { f: fmt(d), t: todayStr }; } },
                                                                                    thisMonth: { label: "This Month", range: () => { const d = new Date(now.getFullYear(), now.getMonth(), 1); return { f: fmt(d), t: todayStr }; } },
                                                                                    thisYear: { label: "This Year", range: () => { const d = new Date(now.getFullYear(), 0, 1); return { f: fmt(d), t: todayStr }; } },
                                                                                    last7: { label: "Last 7 Days", range: () => { const d = new Date(); d.setDate(now.getDate() - 6); return { f: fmt(d), t: todayStr }; } },
                                                                                    last30: { label: "Last 30 Days", range: () => { const d = new Date(); d.setDate(now.getDate() - 29); return { f: fmt(d), t: todayStr }; } },
                                                                                    pastYear: { label: "Past Year", range: () => { const d = new Date(); d.setFullYear(now.getFullYear() - 1); return { f: fmt(d), t: todayStr }; } },
                                                                                };

                                                                                if (presets[datePreset]) {
                                                                                    const { f, t } = presets[datePreset].range();
                                                                                    if (df === f && dt === t) return presets[datePreset].label;
                                                                                }
                                                                            }

                                                                            // B. Fallback Guessing Logic
                                                                            // 1. Specific Days (Highest Priority)
                                                                            // Today
                                                                            if (df === todayStr && dt === todayStr) return "Today";
                                                                            // Yesterday
                                                                            const yest = new Date(); yest.setDate(yest.getDate() - 1);
                                                                            const yesterdayStr = fmt(yest);
                                                                            if (df === yesterdayStr && dt === yesterdayStr) return "Yesterday";

                                                                            // 2. Calendar Ranges
                                                                            // This Week
                                                                            const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
                                                                            if (df === fmt(weekStart) && dt === todayStr) return "This Week";
                                                                            // This Month
                                                                            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                                                                            if (df === fmt(monthStart) && dt === todayStr) return "This Month";
                                                                            // This Year
                                                                            const yearStart = new Date(now.getFullYear(), 0, 1);
                                                                            if (df === fmt(yearStart) && dt === todayStr) return "This Year";

                                                                            // 3. Rolling Ranges (Lower Priority)
                                                                            // Last 7 Days
                                                                            const d7 = new Date(); d7.setDate(now.getDate() - 7);
                                                                            if (df === fmt(d7) && dt === todayStr) return "Last 7 Days";
                                                                            // Last 30 Days
                                                                            const d30 = new Date(); d30.setDate(now.getDate() - 30);
                                                                            if (df === fmt(d30) && dt === todayStr) return "Last 30 Days";
                                                                            // Past Year
                                                                            const yearAgo = new Date(); yearAgo.setFullYear(now.getFullYear() - 1);
                                                                            if (df === fmt(yearAgo) && dt === todayStr) return "Past Year";
                                                                            // Custom range or single date
                                                                            const fmtDisplay = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                                                            if (df === dt) return fmtDisplay(df);
                                                                            return `${fmtDisplay(df)} — ${fmtDisplay(dt)}`;
                                                                        })()}
                                                                    </span>
                                                                </button>
                                                                {showDatePicker && createPortal(
                                                                    <div
                                                                        ref={datePickerRef}
                                                                        className="fixed z-[9999] orders-date-popover"
                                                                        style={{ top: datePickerPos.top, left: datePickerPos.left }}
                                                                    >
                                                                        <DateRangePicker
                                                                            inline
                                                                            dateFrom={filters.dateFrom}
                                                                            dateTo={filters.dateTo}
                                                                            onDateChange={(from, to, presetId) => {
                                                                                setFilters({ ...filters, dateFrom: from, dateTo: to });
                                                                                useOrderStore.getState().setDatePreset(presetId || null);
                                                                                setShowDatePicker(false);
                                                                            }}
                                                                        />
                                                                    </div>,
                                                                    document.body
                                                                )}
                                                            </div>

                                                            {/* Advanced Filters Toggle */}
                                                            <button
                                                                onClick={() => {
                                                                    const newValue = !showSearchBar;
                                                                    setShowSearchBar(newValue);
                                                                    localStorage.setItem("ordersShowSearchBar", String(newValue));
                                                                }}
                                                                className={cn(
                                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                                    showSearchBar
                                                                        ? "bg-blue-100 text-blue-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                                )}
                                                                title="Advanced Filters"
                                                            >
                                                                <SlidersHorizontal className="w-4 h-4" />
                                                            </button>

                                                            {/* Order Pipeline Toggle */}
                                                            <button
                                                                onClick={togglePipeline}
                                                                className={cn(
                                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                                    showPipeline
                                                                        ? "bg-emerald-100 text-emerald-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                                )}
                                                                title={t("orders.pipeline.toggle", "Order pipeline")}
                                                                aria-label={t("orders.pipeline.toggle", "Order pipeline")}
                                                                aria-pressed={showPipeline}
                                                            >
                                                                <GitBranch className="w-4 h-4" />
                                                            </button>

                                                            <div className="w-px h-8 bg-black/5 mx-0.5 orders-toolbar-divider" />

                                                            {/* Archive Toggle */}
                                                            <button
                                                                onClick={async () => {
                                                                    if (!showArchived && archivedOrders.length === 0) {
                                                                        await fetchArchivedOrders();
                                                                    }
                                                                    setShowArchived(!showArchived);
                                                                }}
                                                                title={showArchived ? t("orders.archived") : t("orders.archive")}
                                                                aria-label={showArchived ? t("orders.archived") : t("orders.archive")}
                                                                aria-pressed={showArchived}
                                                                className={cn(
                                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                                    showArchived
                                                                        ? "bg-orange-100/50 text-orange-700 shadow-sm"
                                                                        : "text-muted-foreground hover:bg-amber-100/40 hover:text-foreground"
                                                                )}
                                                            >
                                                                <Archive className="w-4 h-4" />
                                                            </button>

                                                            {/* Trash Page Button */}
                                                            <Link
                                                                href="/orders/trash"
                                                                title="Trash"
                                                                aria-label="View soft-deleted orders"
                                                                className="p-2.5 rounded-xl transition-all duration-300 text-muted-foreground hover:bg-red-100/40 hover:text-red-600 flex items-center justify-center"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Link>
                                                        </div>
                                                    </div>

                                                    {/* Tools Group - NEW */}
                                                    <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0">
                                                        <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.tools")}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            {/* Notifications */}
                                                            <button
                                                                onClick={async () => {
                                                                    const newState = !notificationsEnabled;
                                                                    if (newState) {
                                                                        const granted = await notificationService.requestPermission();
                                                                        if (granted) {
                                                                            setNotificationsEnabled(true);
                                                                            notificationService.showNotification({
                                                                                title: "Notifications Enabled",
                                                                                body: "You will now be notified of new orders",
                                                                            });
                                                                        }
                                                                        setSoundEnabled(true);
                                                                        notificationService.soundEnabled = true;
                                                                    } else {
                                                                        setNotificationsEnabled(false);
                                                                        setSoundEnabled(false);
                                                                        notificationService.soundEnabled = false;
                                                                    }
                                                                }}
                                                                className={cn(
                                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                                    notificationsEnabled
                                                                        ? "bg-green-100 text-green-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                                )}
                                                                title="Notifications"
                                                            >
                                                                {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                                                            </button>

                                                            {/* Stats Toggle */}
                                                            <button
                                                                onClick={() => {
                                                                    const newLevel = ((analyticsLevel + 1) % 3) as 0 | 1 | 2;
                                                                    setAnalyticsLevel(newLevel);
                                                                    localStorage.setItem("ordersAnalyticsLevel", String(newLevel));
                                                                }}
                                                                className={cn(
                                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                                    analyticsLevel > 0
                                                                        ? "bg-indigo-100 text-indigo-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                                )}
                                                                title="Analytics"
                                                            >
                                                                <BarChart3 className="w-4 h-4" />
                                                            </button>

                                                            {/* Map Toggle */}
                                                            <button
                                                                onClick={() => setShowMapPanel(prev => !prev)}
                                                                className={cn(
                                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                                    showMapPanel
                                                                        ? "bg-rose-100 text-rose-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                                )}
                                                                title={t("map.title")}
                                                            >
                                                                <MapPin className="w-4 h-4" />
                                                            </button>

                                                            {/* Undo Button */}
                                                            <AnimatePresence>
                                                                {canUndo && (
                                                                    <motion.button
                                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                                        animate={{ opacity: 1, scale: 1 }}
                                                                        exit={{ opacity: 0, scale: 0.8 }}
                                                                        onClick={async () => {
                                                                            // The result was discarded, so a refused undo looked
                                                                            // identical to a successful one.
                                                                            const result = await undoLastAction();
                                                                            if (result.success) {
                                                                                toast.success("Undone", result.undoneAction);
                                                                            } else if (result.error) {
                                                                                toast.warning("Nothing was undone", result.error);
                                                                            }
                                                                        }}
                                                                        className="p-2.5 rounded-xl bg-lime-100/50 text-lime-700 hover:bg-lime-100 transition-all shadow-sm"
                                                                        title="Undo Last Action"
                                                                    >
                                                                        <RotateCcw className="w-4 h-4" />
                                                                    </motion.button>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    </div>

                                                    {/* Export Group */}
                                                    <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0">
                                                        <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.export")}</span>
                                                        <div className="flex items-center gap-1.5">

                                                            <button
                                                                onClick={() => setIsExportModalOpen(true)}
                                                                className="p-2.5 rounded-xl text-muted-foreground hover:bg-amber-200/60 hover:text-foreground transition-all duration-300"
                                                                title="Export"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setShipConfirmCompany('prime');
                                                                    setShipConfirmKey(k => k + 1);
                                                                    setShipConfirmOpen(true);
                                                                }}
                                                                className="p-2.5 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 shadow-lg shadow-slate-900/20 transition-all duration-300 flex items-center gap-2"
                                                                title="Ship via Prime"
                                                            >
                                                                <Truck className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Action Group */}
                                                    <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0">
                                                        <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.actions")}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                onClick={() => setIsReturnsOpen(true)}
                                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 text-white hover:bg-orange-600 hover:-translate-y-0.5 transition-all duration-300 font-bold text-sm"
                                                                title="Returns cockpit (scan returned packages)"
                                                            >
                                                                <PackageX className="w-4 h-4" />
                                                                <span className="whitespace-nowrap hidden lg:inline">Returns</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setIsCreateModalOpen(true)}
                                                                className="group relative px-4 py-2.5 rounded-xl bg-foreground text-background hover:bg-foreground/90 dark:bg-[var(--primary)] dark:text-[var(--primary-fg)] dark:hover:bg-[var(--primary)] dark:shadow-[0_0_15px_rgba(239,255,0,0.3)] dark:hover:shadow-[0_0_20px_rgba(239,255,0,0.5)] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                                                            >
                                                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                                                <div className="relative flex items-center gap-2 font-bold text-sm">
                                                                    <Plus className="w-4 h-4" />
                                                                    {!sidebarExpanded && (
                                                                        <>
                                                                            <span className="whitespace-nowrap hidden lg:inline">{t("orders.newOrder")}</span>
                                                                            <span className="whitespace-nowrap lg:hidden">{t("orders.newOrderShort")}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        </div>
                                                    </div>

                                                </div>
                                            </motion.div>

                                            {/* Saved Views Tabs */}
                                            {/* Old Saved Views Location Removed */}

                                            {/* Collapsible Analytics Panel */}
                                            <OrdersAnalyticsPanel
                                                analyticsLevel={analyticsLevel}
                                                stats={stats}
                                                statusCounts={statusCounts}
                                                filters={filters}
                                                setFilters={setFilters}
                                                flaggedCount={flaggedCount}
                                                attentionCounts={attentionCounts}
                                                countsHidden={!countVis.chips}
                                                flaggedCountHidden={!countVis.flaggedCard}
                                            />

                                            {/* Order Pipeline — collapsible funnel overview, sits above the search bar (hidden by default) */}
                                            <AnimatePresence initial={false}>
                                                {showPipeline && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.3, ease: EASE_PANEL }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="pb-4">
                                                            <OrderPipeline
                                                                statusCounts={statusCounts}
                                                                countsHidden={!countVis.chips}
                                                                activeStatus={typeof filters.status === "string" ? filters.status : undefined}
                                                                onSelectStatus={(status) =>
                                                                    setFilters({ ...filters, status: status as Order["status"] | undefined })
                                                                }
                                                            />
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* Filters & Search Bar */}
                                            <OrdersFilterBar
                                                bulkActions={guardedBulkActions}
                                                isBulkProcessing={isBulkProcessing}
                                                hasActiveFilters={hasActiveFilters}
                                                totalRiskCount={totalRiskCount}
                                                dueTodayCount={dueTodayCount}
                                                countsHidden={!countVis.chips}
                                                dueTodayCountHidden={!countVis.dueTodayBadge}
                                                riskCountHidden={!countVis.riskBadge}
                                                showSubFilters={showSubFilters}
                                                toggleSubFilters={toggleSubFilters}
                                                onOpenScanner={() => setIsScannerOpen(true)}
                                            />

                                            {/* Mobile Sticky Filter Bar - Rendered outside overflow-hidden container */}
                                            {isMobile && showSearchBar && (
                                                <StickyFilterBar
                                                    filters={filters}
                                                    setFilters={setFilters}
                                                    statusCounts={statusCounts}
                                                    totalRiskCount={totalRiskCount}
                                                    showFilters={showFilters}
                                                    setShowFilters={setShowFilters}
                                                    hasActiveFilters={hasActiveFilters}
                                                    groupBy={groupBy}
                                                    setGroupBy={setGroupBy}
                                                    filterDuplicatesOnly={filterDuplicatesOnly}
                                                    setFilterDuplicatesOnly={setFilterDuplicatesOnly}
                                                    filterDueToday={filterDueToday}
                                                    setFilterDueToday={setFilterDueToday}
                                                    dueTodayCount={dueTodayCount}
                                                    countsHidden={!countVis.chips}
                                                    dueTodayCountHidden={!countVis.dueTodayBadge}
                                                    riskCountHidden={!countVis.riskBadge}
                                                    showSubFilters={showSubFilters}
                                                    isMobile={true}
                                                />
                                            )}

                                        </motion.div>
                                    )}
                                </AnimatePresence>

                            </motion.div>

                            {/* Section 2: Order Cards — stagger child */}
                            <motion.div
                                variants={{
                                    hidden: { opacity: 0, y: 6 },
                                    visible: {
                                        opacity: 1,
                                        y: 0,
                                        transition: { duration: 0.35, ease: EASE_CHROME },
                                    },
                                }}
                            >
                                <div className="space-y-3">
                                    {/* Active Duplicates Filter Indicator */}
                                    {filterDuplicatesOnly && (
                                        <div className="flex items-center gap-2 px-2">
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 border border-orange-200 text-orange-700">
                                                <span className="text-xs font-semibold">🔄 عرض المكررين فقط</span>
                                                <button
                                                    onClick={() => setFilterDuplicatesOnly(false)}
                                                    className="text-orange-500 hover:text-orange-700 font-bold text-xs"
                                                    title="إزالة الفلتر"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Store-form phones (abandoned_carts) sit beside, never inside,
                                        the pending_checkout rows: those rows, their statuses and their
                                        counts stay exactly as they are. Abandoned tab only. */}
                                    {filters.status === "pending_checkout" && !showArchived && <StoreCapturesPanel />}
                                    {/* While searching, the list is a lookup across every date and status. */}
                                    {!showArchived && <OrderSearchBanner count={filteredOrders.length} />}

                                    {/* Workflow Mode */}
                                    {workflowMode ? (
                                        <WorkflowTabs
                                            orders={filteredOrders}
                                            onStatusUpdate={guardedStatusUpdate}
                                            onUpdate={updateOrder}
                                            onViewDetails={handleViewDetails}
                                            isBlacklisted={isBlacklisted}
                                            messageTemplates={messageTemplates}
                                        />
                                    ) : (
                                        <>
                                            {/* Selection Banner */}
                                            <AnimatePresence>
                                                {selectedOrders.size > 0 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className={cn(
                                                            "flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl text-sm font-medium mb-3",
                                                            selectedOrders.size > 20
                                                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                                                : "bg-blue-50 text-blue-700 border border-blue-100"
                                                        )}
                                                    >
                                                        <span className="font-semibold">{selectedOrders.size} orders selected</span>
                                                        {canOfferSelectAll({
                                                            selectedCount: selectedOrders.size,
                                                            loadedCount: filteredOrders.length,
                                                            pageSelectLimit: PAGE_SELECT_LIMIT,
                                                            ordersAreComplete,
                                                        }) && (
                                                            <button
                                                                onClick={() => {
                                                                    useOrderStore.getState().selectAll(filteredOrders.map(o => o.id));
                                                                }}
                                                                className="underline font-bold hover:opacity-80 transition-opacity"
                                                            >
                                                                Select all {filteredOrders.length} orders
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setSelectedOrders(new Set())}
                                                            className="text-xs underline opacity-70 hover:opacity-100 transition-opacity"
                                                        >
                                                            Clear selection
                                                        </button>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* Cards View */}
                                            {(viewMode === "cards" || viewMode === "list") && (
                                                <>
                                                    {displayedOrders.length === 0 && (isRefreshing || ordersPending || (!showArchived && orderSearch.pending)) ? (
                                                        /* An empty list while rows are still arriving is not an empty
                                                           list. `loading` covers only the first fetch, so a refetch —
                                                           after a window change, a reconnect, or a stale SWR
                                                           hydration — used to fall straight through to the empty
                                                           state, and a merchant with 4,778 orders was told "No orders
                                                           yet. When you receive orders, they'll appear here." */
                                                        <div className="space-y-3" aria-busy="true" aria-live="polite">
                                                            {[0, 1, 2, 3].map(i => (
                                                                <div key={i} className="w-full h-24 animate-pulse bg-muted/20 rounded-2xl" />
                                                            ))}
                                                        </div>
                                                    ) : displayedOrders.length === 0 ? (
                                                        <EmptyState
                                                            type={isFirstRun ? "no-orders" : (filters.status && ['new', 'contacted', 'confirmed', 'delivered', 'rejected'].includes(filters.status) ? filters.status : "all") as "new" | "contacted" | "confirmed" | "delivered" | "rejected" | "all"}
                                                            searchQuery={filters.searchQuery}
                                                            hasFilters={emptyStateHasFilters}
                                                        />
                                                    ) : compactView >= 1 && compactGrid ? (
                                                        /* PERF-2: the compact grid used to render every filtered
                                                           order at once. It is the same virtualized list as below,
                                                           in grid mode — `content-visibility` is deliberately not
                                                           applied any more, because it would make the virtualizer
                                                           measure the placeholder height instead of the card. */
                                                        <VirtualizedOrderList
                                                            orders={displayedOrders}
                                                            gridMode
                                                            gridClassName={cn(
                                                                "grid gap-2",
                                                                compactView === 2
                                                                    ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                                                                    : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                                                            )}
                                                            loadingId={loadingId}
                                                            selectedOrders={selectedOrders}
                                                            messageTemplates={workflowTemplates}
                                                            onStatusUpdate={handleStatusUpdate}
                                                            onViewDetails={handleViewDetails}
                                                            onToggleSelection={toggleOrderSelection}
                                                            onTogglePin={togglePin}
                                                            onCloneOrder={cloneOrder}
                                                            onScreenshot={setScreenshotOrder}
                                                            onCancelWithReason={(o) => {
                                                                setOrderToCancel(o);
                                                                setCancelDialogOpen(true);
                                                            }}
                                                            onRejectWithReason={(o) => {
                                                                setOrderToReject(o);
                                                                setRejectDialogOpen(true);
                                                            }}
                                                            onToggleReviewed={toggleReviewed}
                                                            onOpenTemplatePanel={(o) => {
                                                                setOrderForTemplate(o);
                                                                setTemplatePanelOpen(true);
                                                            }}
                                                            onShowDuplicates={(o) => {
                                                                setDuplicateOrder(o);
                                                                setShowDuplicateModal(true);
                                                            }}
                                                            onMergeWithPrevious={async (keepId, archiveId) => {
                                                                await mergeOrders(keepId, archiveId);
                                                            }}
                                                            isBlacklisted={isBlacklisted}
                                                            getBlacklistEntry={getBlacklistEntry}
                                                            onAddToBlacklist={addToBlacklist}
                                                            onRemoveFromBlacklist={removeFromBlacklist}
                                                            getRiskAssessment={getRiskAssessmentByPhone}
                                                            getCustomerOrderCount={getCustomerOrderCount}
                                                            getCustomerArchivedCount={getCustomerArchivedCount}
                                                            getCustomerHistory={getCustomerHistory}
                                                            getReturnOrderInfo={getReturnOrderInfo}
                                                            getOriginalOrderInfo={getOriginalOrderInfo}
                                                            compactView={compactView}
                                                            actionDock={actionDock}
                                                            getRiskLevel={getRiskLevelByPhone}
                                                            hasDuplicates={hasDuplicates}
                                                            getDuplicateWindowAlert={getDuplicateWindowAlert}
                                                            onContactRecorded={recordContact}
                                                            onSplitOrder={(order) => setSplitOrderDialog({ open: true, order })}
                                                        />
                                                    ) : displayedOrders.length >= 10 ? (
                                                        /* Use virtualized list for 50+ orders */
                                                        <VirtualizedOrderList
                                                            orders={displayedOrders}
                                                            loadingId={loadingId}
                                                            selectedOrders={selectedOrders}
                                                            messageTemplates={workflowTemplates}
                                                            onStatusUpdate={handleStatusUpdate}
                                                            onViewDetails={handleViewDetails}
                                                            onToggleSelection={toggleOrderSelection}
                                                            onTogglePin={togglePin}
                                                            onCloneOrder={cloneOrder}
                                                            onScreenshot={setScreenshotOrder}
                                                            onCancelWithReason={(o) => {
                                                                setOrderToCancel(o);
                                                                setCancelDialogOpen(true);
                                                            }}
                                                            onRejectWithReason={(o) => {
                                                                setOrderToReject(o);
                                                                setRejectDialogOpen(true);
                                                            }}
                                                            onToggleReviewed={toggleReviewed}
                                                            onOpenTemplatePanel={(o) => {
                                                                setOrderForTemplate(o);
                                                                setTemplatePanelOpen(true);
                                                            }}
                                                            onShowDuplicates={(o) => {
                                                                setDuplicateOrder(o);
                                                                setShowDuplicateModal(true);
                                                            }}
                                                            onMergeWithPrevious={async (keepId, archiveId) => {
                                                                await mergeOrders(keepId, archiveId);
                                                            }}
                                                            isBlacklisted={isBlacklisted}
                                                            getBlacklistEntry={getBlacklistEntry}
                                                            onAddToBlacklist={addToBlacklist}
                                                            onRemoveFromBlacklist={removeFromBlacklist}
                                                            getRiskAssessment={getRiskAssessmentByPhone}
                                                            getCustomerOrderCount={getCustomerOrderCount}
                                                            getCustomerArchivedCount={getCustomerArchivedCount}
                                                            getCustomerHistory={getCustomerHistory}
                                                            getReturnOrderInfo={getReturnOrderInfo}
                                                            getOriginalOrderInfo={getOriginalOrderInfo}
                                                            compactView={compactView}
                                                            actionDock={actionDock}
                                                            getRiskLevel={getRiskLevelByPhone}
                                                            hasDuplicates={hasDuplicates}
                                                            getDuplicateWindowAlert={getDuplicateWindowAlert}
                                                            onContactRecorded={recordContact}
                                                            onSplitOrder={(order) => setSplitOrderDialog({ open: true, order })}
                                                        />
                                                    ) : (
                                                        /* Use animated list for <50 orders */
                                                        <StaggerContainer key="orders-list" className="space-y-3">
                                                            {displayedOrders.map((order) => {
                                                                const customerOrders = getCustomerHistory(order.phone);
                                                                const orderCount = getCustomerOrderCount(order.phone, order.order_id);
                                                                const previousOrder = !order.is_return ? (customerOrders.find(o => o.id !== order.id) || null) : null;

                                                                return (
                                                                    <StaggerItem key={order.id}>
                                                                        <SwipeableOrderCard
                                                                            order={order}
                                                                            loadingId={loadingId}
                                                                            onStatusUpdate={handleStatusUpdate}
                                                                            onViewDetails={handleViewDetails}
                                                                            onSplit={() => setSplitOrderDialog({ open: true, order })}
                                                                            isBlacklisted={isBlacklisted(order.phone)}
                                                                            blacklistEntry={getBlacklistEntry(order.phone)}
                                                                            onAddToBlacklist={addToBlacklist}
                                                                            onRemoveFromBlacklist={removeFromBlacklist}
                                                                            riskLevel={(order.risk_data?.level || "low") as "low" | "medium" | "high" | "blocked"}
                                                                            riskAssessment={order.risk_data}
                                                                            customerOrderCount={orderCount}
                                                                            archivedOrderCount={getCustomerArchivedCount(order.phone)}
                                                                            previousOrder={previousOrder}
                                                                            onMergeWithPrevious={async (keepId: string, archiveId: string) => {
                                                                                await mergeOrders(keepId, archiveId);
                                                                            }}
                                                                            onShowDuplicates={(o: Order) => {
                                                                                setDuplicateOrder(o);
                                                                                setShowDuplicateModal(true);
                                                                            }}
                                                                            duplicateAlert={getDuplicateWindowAlert(order.id)}
                                                                            onContactRecorded={recordContact}
                                                                            onTogglePin={togglePin}
                                                                            onCloneOrder={cloneOrder}
                                                                            onScreenshot={setScreenshotOrder}
                                                                            onCancelWithReason={(o: Order) => {
                                                                                setOrderToCancel(o);
                                                                                setCancelDialogOpen(true);
                                                                            }}
                                                                            onRejectWithReason={(o: Order) => {
                                                                                setOrderToReject(o);
                                                                                setRejectDialogOpen(true);
                                                                            }}
                                                                            onToggleReviewed={toggleReviewed}
                                                                            returnOrderInfo={getReturnOrderInfo(order.id)}
                                                                            originalOrderInfo={getOriginalOrderInfo(order.original_order_id)}
                                                                            compact={compactView}
                                                                            actionDock={actionDock}
                                                                            isVirtualized={false}
                                                                            onOpenTemplatePanel={(o: Order) => {
                                                                                setOrderForTemplate(o);
                                                                                setTemplatePanelOpen(true);
                                                                            }}
                                                                            messageTemplates={workflowTemplates}
                                                                            isSelected={selectedOrders.has(order.id)}
                                                                            onToggleSelection={toggleOrderSelection}
                                                                            />
                                                                    </StaggerItem>
                                                                );
                                                            })}
                                                        </StaggerContainer>
                                                    )}
                                                </>
                                            )}

                                            {/* Table View - State of the Art */}
                                            {viewMode === "table" && (
                                                <VirtualizedOrderTable
                                                    groupedOrders={groupedOrders}
                                                    groupBy={groupBy}
                                                    displayedOrders={displayedOrders}
                                                    sortConfig={sortConfig}
                                                    toggleSort={toggleSort}
                                                    selectedOrders={selectedOrders}
                                                    selectAll={selectAll}
                                                    toggleOrderSelection={toggleOrderSelection}
                                                    togglePin={togglePin}
                                                    setSelectedOrder={setSelectedOrderWithFetch}
                                                    setIsModalOpen={setIsModalOpen}
                                                    getDuplicateWindowAlert={getDuplicateWindowAlert}
                                                    onContactRecorded={recordContact}
                                                    setDuplicateOrder={setDuplicateOrder}
                                                    setShowDuplicateModal={setShowDuplicateModal}
                                                    modePrice={modePrice}
                                                    updateOrderStatus={guardedStatusUpdate}
                                                    getRiskLevel={getRiskLevelByPhone}
                                                    columnFilters={columnFilters}
                                                    setColumnFilters={setColumnFilters}
                                                    openFilterColumn={openFilterColumn}
                                                    setOpenFilterColumn={setOpenFilterColumn}
                                                    availableCities={availableCities}
                                                    availableProducts={availableProducts}
                                                    filters={filters}
                                                    setFilters={setFilters}
                                                />
                                            )}


                                        </>
                                    )}
                                </div>
                            </motion.div>
                        </div>

                        {/* Governorate Map Side Panel - Floating */}
                        <AnimatePresence initial={false}>
                            {showMapPanel && (
                                <motion.div
                                    initial={{ opacity: 0, x: 40 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 40 }}
                                    transition={{ duration: 0.3, ease: EASE_PANEL }}
                                    className="hidden lg:block fixed top-20 right-6 z-40"
                                >
                                    <div className="w-[340px] h-[420px] shadow-xl rounded-3xl overflow-hidden">
                                        <IraqMap orders={filteredOrders} />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/*
                        ARCH-1: the modal tail — 325 lines of dialogs — used to sit
                        here. It is now two components split by what they act on: one
                        order, or a selection. Both read the store and the orders
                        context directly, because that is where their state already
                        lived; only what the page genuinely owns is passed in.
                    */}
                    <OrderDialogs
                        isMounted={isMounted}
                        isReturnsOpen={isReturnsOpen}
                        setIsReturnsOpen={setIsReturnsOpen}
                        isScannerOpen={isScannerOpen}
                        setIsScannerOpen={setIsScannerOpen}
                        workflowTemplates={workflowTemplates}
                        displayedOrders={displayedOrders}
                        onSplitConfirm={handleSplitOrder}
                        onStatusUpdate={handleStatusUpdate}
                    />

                    <OrderBulkDialogs bulk={guardedBulk} getDispatchTwin={getConfirmBlockingTwin} />

                    {/* Lives here rather than in either dialog group: it guards the
                        card, the table and the bulk bar alike. */}
                    <DuplicateConfirmDialog
                        {...duplicateGuard.dialogProps}
                        onCompare={(order) => {
                            setDuplicateOrder(order);
                            setShowDuplicateModal(true);
                        }}
                    />

                    {/* Scroll to Top Button */}
                    <ScrollToTopButton />

                    {/* Monthly Backup Reminder */}
                    <BackupPrompt />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
