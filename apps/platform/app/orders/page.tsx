"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { useShallow } from "zustand/react/shallow";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useDebounce } from "@/hooks/use-debounce";
import { Order, PaymentStatus, OrderItem } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { isOrderFlagged } from "@/lib/data-quality-utils";
import { getBaseOrderId, getStatusLabel } from "@/lib/utils";
import { SwipeableOrderCard } from "@/components/dashboard/swipeable-order-card";
import { orderRepository } from "@/lib/repositories/order-repository";
import { withOrderModalBoundary } from "@/components/orders/order-modal-boundary";
import { reportOrderError } from "@/lib/order-telemetry";

const OrderDetailsModal = withOrderModalBoundary(
    "OrderDetailsModal",
    dynamic(
        () => import("@/components/orders/order-details-modal").then(mod => ({ default: mod.OrderDetailsModal })),
        { loading: () => null, ssr: false }
    )
);
const CreateOrderModal = withOrderModalBoundary(
    "CreateOrderModal",
    dynamic(
        () => import("@/components/orders/create-order-modal").then(mod => ({ default: mod.CreateOrderModal })),
        { loading: () => null, ssr: false }
    )
);
const ReturnsCockpitModal = withOrderModalBoundary(
    "ReturnsCockpitModal",
    dynamic(
        () => import("@/components/returns/returns-cockpit-modal").then(mod => ({ default: mod.ReturnsCockpitModal })),
        { loading: () => null, ssr: false }
    )
);
const BarcodeScanner = withOrderModalBoundary(
    "BarcodeScanner",
    dynamic(
        () => import("@/components/products/barcode-scanner").then(mod => ({ default: mod.BarcodeScanner })),
        { loading: () => null, ssr: false }
    )
);
// Dynamic imports for other heavy components
const FloatingActionBar = dynamic(
    () => import("@/components/orders/floating-action-bar").then(mod => ({ default: mod.FloatingActionBar })),
    { ssr: false, loading: () => <div className="hidden" /> }
);
const WorkflowTabs = dynamic(
    () => import("@/components/orders/workflow-tabs").then(mod => ({ default: mod.WorkflowTabs })),
    { ssr: false, loading: () => <div className="w-full h-96 animate-pulse bg-muted/20 rounded-2xl" /> }
);
const DuplicateComparisonModal = withOrderModalBoundary(
    "DuplicateComparisonModal",
    dynamic(
        () => import("@/components/orders/duplicate-comparison-modal").then(mod => ({ default: mod.DuplicateComparisonModal })),
        { loading: () => null, ssr: false }
    )
);
const ExportReportModal = withOrderModalBoundary(
    "ExportReportModal",
    dynamic(
        () => import("@/components/orders/export-report-modal").then(mod => ({ default: mod.ExportReportModal })),
        { loading: () => null, ssr: false }
    )
);
const WhatsAppTemplatePanel = withOrderModalBoundary(
    "WhatsAppTemplatePanel",
    dynamic(
        () => import("@/components/orders/whatsapp-template-panel").then(mod => ({ default: mod.WhatsAppTemplatePanel })),
        { loading: () => null, ssr: false }
    )
);
const SplitOrderDialog = withOrderModalBoundary(
    "SplitOrderDialog",
    dynamic(
        () => import("@/components/orders/split-order-dialog").then(mod => ({ default: mod.SplitOrderDialog })),
        { loading: () => null, ssr: false }
    )
);
const VirtualizedOrderList = dynamic(
    () => import("@/components/orders/virtualized-order-list").then(mod => ({ default: mod.VirtualizedOrderList })),
    { ssr: false, loading: () => <div className="w-full h-[600px] animate-pulse bg-muted/20 rounded-2xl" /> }
);
const DateRangePicker = dynamic(
    () => import("@scheniders/ui/date-range-picker").then(mod => ({ default: mod.DateRangePicker })),
    { ssr: false, loading: () => <div className="w-full h-10 animate-pulse bg-muted/20 rounded-xl" /> }
);
import { EmptyState } from "@/components/ui/empty-states";
import { StaggerContainer, StaggerItem, EASE_CHROME, EASE_PANEL, EASE_CROSSFADE } from "@/components/layout/page-transition";
import { useSidebar } from "@/components/layout/dashboard-layout";
const SavedViewsTabs = dynamic(
    () => import("@/components/orders/saved-views-tabs").then(mod => ({ default: mod.SavedViewsTabs })),
    { ssr: false, loading: () => <div className="w-48 h-10 animate-pulse bg-muted/20 rounded-xl" /> }
);
const OrderConfirmationCard = dynamic(
    () => import("@/components/orders/order-confirmation-card").then(mod => ({ default: mod.OrderConfirmationCard })),
    { ssr: false, loading: () => <div className="hidden" /> }
);
const CancellationReasonDialog = withOrderModalBoundary(
    "CancellationReasonDialog",
    dynamic(
        () => import("@/components/orders/cancellation-reason-dialog").then(mod => ({ default: mod.CancellationReasonDialog })),
        { loading: () => null, ssr: false }
    )
);
const ShipExportConfirmationDialog = withOrderModalBoundary(
    "ShipExportConfirmationDialog",
    dynamic(
        () => import("@/components/orders/ship-export-confirmation-dialog").then(mod => ({ default: mod.ShipExportConfirmationDialog })),
        { loading: () => null, ssr: false }
    )
);
const MoveToTransitDialog = withOrderModalBoundary(
    "MoveToTransitDialog",
    dynamic(
        () => import("@/components/orders/move-to-transit-dialog").then(mod => ({ default: mod.MoveToTransitDialog })),
        { loading: () => null, ssr: false }
    )
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
import { useIsMobile } from "@/hooks/use-mobile";
import { OrderPipeline } from "@/components/orders/order-pipeline";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Plus,
    Download,
    Upload,
    Package,
    CheckSquare,
    ChevronDown,
    MapPin,
    CreditCard,
    CalendarDays,
    X,
    BarChart3,
    Bookmark,
    Save,
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
    TrendingUp,
    ShieldCheck,
    Minimize2,
    Maximize2,
    Truck,
    Sparkles,
    PhoneCall,
    CheckCircle2,
    Activity,
    AlertTriangle,
    MessageCircle,
    PackageX,
    ScanBarcode,
    ChevronsDownUp,
    ChevronsUpDown,
} from "lucide-react";
import { extractScannedOrderId } from "@/lib/scan-utils";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { canShipWithoutSelection, canOfferSelectAll } from "@/lib/order-bulk-scope";
import { notificationService } from "@/lib/notification-service";
import { exportOrdersToPrimeCSV, exportOrdersToWaseetXLSX } from "@/lib/export-utils";
import { toast, dismissToast } from "@/hooks/use-toast";

import { ErrorBoundary } from "@scheniders/ui/error-boundary";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
interface GlobalSearchFieldProps {
    filters: { searchQuery?: string; searchIncludesArchive?: boolean; dateFrom?: string; dateTo?: string };
    setFilters: React.Dispatch<React.SetStateAction<{ searchQuery?: string; searchIncludesArchive?: boolean; dateFrom?: string; dateTo?: string }>>;
    inputClassName?: string;
    onScannerOpen?: () => void;
    /** Optional sub-filters toggle rendered next to the scanner button. When wired, it shows/hides the TYPE+PRODUCTS rows in the sticky filter bar. */
    subFiltersOpen?: boolean;
    onToggleSubFilters?: () => void;
}

const GlobalSearchField = React.memo(function GlobalSearchField({ filters, setFilters, inputClassName = "w-full pl-10 pr-12 py-2.5 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all", onScannerOpen, subFiltersOpen, onToggleSubFilters }: GlobalSearchFieldProps) {
    const localSearchQuery = useOrderStore((s) => s.localSearchQuery);
    const setLocalSearchQuery = useOrderStore((s) => s.setLocalSearchQuery);
    const debouncedSearchQuery = useDebounce(localSearchQuery, 300);
    const { t } = useLanguage();

    // Track the previous search state to know when user starts/clears a search
    const prevSearchRef = React.useRef<string>("");

    useEffect(() => {
        const prevSearch = prevSearchRef.current;
        // Normalize scanned/pasted QR ("QR:{id}|PHONE:..") down to the order id; plain text passes through.
        const newSearch = extractScannedOrderId(debouncedSearchQuery);

        if (newSearch === (filters.searchQuery || "")) return; // No change needed

        if (newSearch && !prevSearch) {
            // User STARTED searching — clear date range so all orders are searchable
            setFilters((prev) => ({
                ...prev,
                searchQuery: newSearch,
                dateFrom: undefined,
                dateTo: undefined,
            }));
        } else if (!newSearch && prevSearch) {
            // User CLEARED search — restore today's date range
            const todayStr = (() => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            })();
            setFilters((prev) => ({
                ...prev,
                searchQuery: undefined,
                dateFrom: todayStr,
                dateTo: todayStr,
            }));
        } else {
            // Search query changed but not starting/stopping — just update searchQuery
            setFilters((prev) => ({ ...prev, searchQuery: newSearch || undefined }));
        }

        prevSearchRef.current = newSearch;
    }, [debouncedSearchQuery, setFilters, filters.searchQuery]);

    return (
        <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-subtle)]" />
            <input
                type="text"
                placeholder={t ? t("orders.searchPlaceholder") : "Search orders..."}
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                className={inputClassName}
            />
            {/* Sub-filters toggle — sits to the left of the scanner so the user
                can show/hide the TYPE + PRODUCTS rows without leaving the search bar. */}
            {onToggleSubFilters && (
                <button
                    onClick={onToggleSubFilters}
                    title={subFiltersOpen ? "Hide sub-filters" : "Show sub-filters"}
                    aria-label={subFiltersOpen ? "Hide sub-filters" : "Show sub-filters"}
                    aria-pressed={!!subFiltersOpen}
                    className={cn(
                        "absolute top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all",
                        subFiltersOpen
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200"
                            : "text-[var(--foreground-subtle)] hover:text-foreground hover:bg-[var(--pastel-yellow)]/30",
                        // Shift left of the scanner: scanner sits at right-9 (when query) or right-2; place this 9 left of that.
                        localSearchQuery ? "right-[4.5rem]" : "right-11"
                    )}
                >
                    {subFiltersOpen ? (
                        <ChevronsDownUp className="w-4 h-4" />
                    ) : (
                        <ChevronsUpDown className="w-4 h-4" />
                    )}
                </button>
            )}
            {/* Scanner button — shifts left when archive button is also visible */}
            {onScannerOpen && (
                <button
                    onClick={onScannerOpen}
                    title="Scan barcode"
                    className={cn(
                        "absolute top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all text-[var(--foreground-subtle)] hover:text-foreground hover:bg-[var(--pastel-yellow)]/30",
                        localSearchQuery ? "right-9" : "right-2"
                    )}
                >
                    <ScanBarcode className="w-4 h-4" />
                </button>
            )}
            {localSearchQuery && (
                <button
                    onClick={() => setFilters((prev) => ({ ...prev, searchIncludesArchive: !prev.searchIncludesArchive }))}
                    className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all flex items-center gap-1",
                        filters.searchIncludesArchive
                            ? "bg-orange-100 text-orange-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                            : "text-muted-foreground hover:bg-amber-100/40"
                    )}
                    title="Include Archive in Search"
                >
                    <Archive className="w-3.5 h-3.5" />
                    {filters.searchIncludesArchive && <span className="text-[10px] sm:hidden font-bold pr-1">{t("orders.filter.archivedIncluded")}</span>}
                </button>
            )}
        </div>
    );
});

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

    const {

        orders,
        filteredOrders: hookFilteredOrders,
        loading,
        error,
        updateOrderStatus,
        updateOrder,
        createOrder,
        createReturnOrder,
        createReplacementOrder,
        isBlacklisted,
        getBlacklistEntry,
        addToBlacklist,
        removeFromBlacklist,
        stats,
        availableCities,
        availableProducts,
        availableProductsInView,
        filters,
        setFilters,
        clearFilters,
        bulkUpdateStatus,
        bulkArchive,
        bulkUnarchive,
        bulkDelete,
        createBatch,
        filterPresets,
        saveFilterPreset,
        loadFilterPreset,
        deleteFilterPreset,
        getOrderTimeline,
        hasDuplicates,
        getCustomerHistory,
        getCustomerOrderCount,
        mergeOrders,
        fetchOrders: refreshOrders,
        getOrderNotes,
        // Pin & Clone
        togglePin,
        toggleReviewed,
        markAsVerifiedCustomer,
        cloneOrder,
        deleteOrder,
        // Archive
        archivedOrders,
        fetchArchivedOrders,
        getCustomerArchivedCount,
        // Undo
        undoLastAction,
        canUndo,
        // Check order ID
        checkOrderIdExists,
        // Duplicate management
        getCustomerOrders,
        dismissDuplicate,
        statusCounts,
        ordersAreComplete,
        // Message templates
        messageTemplates,
    } = useOrdersContext();

    // Apply ?status= query param from dashboard card clicks (one-time on mount)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const statusParam = params.get('status');
        if (statusParam) {
            setFilters(prev => ({ ...prev, status: statusParam as 'new' | 'confirmed' | 'rejected' | 'all' }));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // run once on mount

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
        showPresets, setShowPresets,
        newPresetName, setNewPresetName,
        groupBy, setGroupBy,
        filterDuplicatesOnly, setFilterDuplicatesOnly,
        sortConfig, sortConfigs, toggleSort,
        columnFilters, setColumnFilters,
        openFilterColumn, setOpenFilterColumn,
        activePresetId, setActivePresetId,
        // Modals
        isModalOpen, setIsModalOpen,
        selectedOrder, setSelectedOrder,
        isCreateModalOpen, setIsCreateModalOpen,
        showDuplicateModal, setShowDuplicateModal,
        duplicateOrder, setDuplicateOrder,
        cancelDialogOpen, setCancelDialogOpen,
        orderToCancel, setOrderToCancel,
        rejectDialogOpen, setRejectDialogOpen,
        orderToReject, setOrderToReject,
        templatePanelOpen, setTemplatePanelOpen,
        orderForTemplate, setOrderForTemplate,
        setIsImportModalOpen,
        isExportModalOpen, setIsExportModalOpen,
        splitOrderDialog, setSplitOrderDialog,
        screenshotOrder, setScreenshotOrder,
        showDatePicker, setShowDatePicker,
        datePickerPos, setDatePickerPos,
        // Selection
        selectedOrders, setSelectedOrders,
        showArchived, setShowArchived,
        loadingId, setLoadingId,
        // Transient
        isFilterPanelAnimating, setIsFilterPanelAnimating,
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


    // Removed Batch Risk Assessment as risk data is now joined at DB level
    const riskLoading = false; // Always false since data is already loaded

    // Defer heavy list inputs to prevent main-thread blocking during concurrent renders
    const defHookFilteredOrders = React.useDeferredValue(hookFilteredOrders);
    const defColumnFilters = React.useDeferredValue(debouncedColumnFilters);
    const defFilterDuplicatesOnly = React.useDeferredValue(filterDuplicatesOnly);
    const defRiskLevel = React.useDeferredValue(filters.riskLevel);
    const defSortConfig = React.useDeferredValue(sortConfig);
    const defSortConfigs = React.useDeferredValue(sortConfigs);

    // Sort hook's filtered orders
    // Advanced Filtering & Sorting
    const filteredOrders = useMemo(() => {
        let result = [...defHookFilteredOrders];

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

        // 1.2. Apply Risk/Flagged Filter
        if (defRiskLevel) {
            if (defRiskLevel === 'flagged') {
                // "Flagged" = data quality issues OR rejected orders
                result = result.filter(o => isOrderFlagged(o) || o.status === 'rejected');
            } else {
                // Other risk levels use the embedded database risk data
                result = result.filter((o) => o.risk_data?.level === defRiskLevel);
            }
        }

        // 1.5. Apply Duplicates-Only Filter
        if (defFilterDuplicatesOnly) {
            result = result.filter(o => getCustomerOrderCount(o.phone) > 1);
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

        result.sort((a, b) => {
            // Priority: Pinned first
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;

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
    }, [defHookFilteredOrders, defSortConfig, defSortConfigs, defColumnFilters, defFilterDuplicatesOnly, getCustomerOrderCount, defRiskLevel]);

    const defOrders = React.useDeferredValue(orders);

    // Calculate flagged orders count for "Needs Attention" card (data quality issues + rejected orders)
    const flaggedCount = useMemo(() => {
        return defHookFilteredOrders.filter(o => isOrderFlagged(o) || o.status === 'rejected').length;
    }, [defHookFilteredOrders]);

    // Calculate global risk count for the key filter button (all orders)
    const totalRiskCount = useMemo(() => {
        if (!defOrders) return 0;
        return defOrders.filter(o => isOrderFlagged(o) || o.status === 'rejected').length;
    }, [defOrders]);

    // Scroll to top when filters change to prevent empty list illusion
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [filters, filterDuplicatesOnly]);

    const handleStatusUpdate = async (orderId: string, status: Order["status"], reason?: string, reasonId?: string) => {
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

    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    const withProcessing = async (
        action: () => Promise<{ success: boolean; error?: string } | undefined>,
        fallbackMsg: string,
        successMsg: string,
        onSuccess?: () => void
    ) => {
        if (isBulkProcessing) return;
        setIsBulkProcessing(true);
        const pt = t("orders.processing");
        const loadingMsg = (pt && pt !== "orders.processing") ? pt : fallbackMsg;
        const toastId = toast.loading(loadingMsg);
        try {
            const result = await action();
            dismissToast(toastId);
            if (result?.success || result === undefined) {
                toast.success(successMsg);
                if (onSuccess) onSuccess();
            } else {
                toast.error(t("toast.updateFailed"), result?.error || "Unknown error");
            }
        } catch (error) {
            dismissToast(toastId);
            toast.error(t("toast.updateFailed"), String(error));
        } finally {
            setIsBulkProcessing(false);
        }
    };

    // Handle bulk actions
    /**
     * ARCH-1: nine bulk handlers were byte-identical apart from the status, and
     * three of them shared one message — bulk "deliver" and bulk "reject" both
     * told the operator the orders had been *confirmed*. One factory removes the
     * duplication and makes the message follow the status it actually applied.
     */
    const makeBulkStatusHandler = (status: Order["status"]) => async () => {
        const ids = Array.from(selectedOrders);
        withProcessing(
            () => bulkUpdateStatus(ids, status),
            `Updating ${ids.length} orders...`,
            t("toast.statusUpdatedDescCount")
                .replace("{count}", String(ids.length))
                .replace("{status}", getStatusLabel(status)),
            () => setSelectedOrders(new Set())
        );
    };

    const handleBulkConfirm = makeBulkStatusHandler("confirmed");
    const handleBulkDeliver = makeBulkStatusHandler("delivered");
    const handleBulkReject = makeBulkStatusHandler("rejected");

    const handleBulkArchive = async () => {
        if (isBulkProcessing) return;
        const ids = Array.from(selectedOrders);
        setIsBulkProcessing(true);
        const pt = t("orders.processing");
        const loadingMsg = (pt && pt !== "orders.processing") ? pt : `Archiving ${ids.length} orders...`;
        const toastId = toast.loading(loadingMsg);
        try {
            const result = await bulkArchive(ids);
            dismissToast(toastId);
            if (result?.success || result === undefined) {
                setSelectedOrders(new Set());
                toast({
                    title: t("toast.ordersArchived"),
                    description: t("toast.ordersArchivedDesc").replace("{count}", String(ids.length)),
                    variant: "success",
                    action: {
                        label: t("toast.undo") || "Undo",
                        onClick: async () => {
                            const undoRes = await bulkUnarchive(ids);
                            if (undoRes.success) {
                                toast.success(t("toast.ordersRestored") || "Restored", t("toast.ordersRestoredDesc") || "Orders returned to the active list");
                            } else {
                                toast.error(t("toast.updateFailed"), undoRes.error);
                            }
                        }
                    }
                });
            }
            else if (result?.error) toast.error(t("toast.archiveFailed"), result.error);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    // Delete confirmation dialog state
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteCountdown, setDeleteCountdown] = useState(5);
    const [isDeleting, setIsDeleting] = useState(false);
    // Ship export confirmation dialog state
    const [shipConfirmOpen, setShipConfirmOpen] = useState(false);
    const [shipConfirmCompany, setShipConfirmCompany] = useState<'prime' | 'waseet'>('prime');
    const [shipConfirmKey, setShipConfirmKey] = useState(0);
    // Post-export: prompt to move newly-exported orders from Confirmed → In Transit
    const [moveTransitOpen, setMoveTransitOpen] = useState(false);
    const [pendingTransitIds, setPendingTransitIds] = useState<string[]>([]);
    const [pendingTransitPrevStatuses, setPendingTransitPrevStatuses] = useState<{ id: string; status: string }[]>([]);
    const [showMapPanel, setShowMapPanel] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (deleteConfirmOpen && deleteCountdown > 0) {
            timer = setTimeout(() => setDeleteCountdown(prev => prev - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [deleteConfirmOpen, deleteCountdown]);

    const handleBulkDelete = async () => {
        setDeleteCountdown(5);
        setDeleteConfirmOpen(true);
    };

    const executeDelete = async () => {
        setIsDeleting(true);
        const ids = Array.from(selectedOrders);
        const toastId = toast.loading(`Deleting ${ids.length} orders...`);
        const result = await bulkDelete(ids);
        dismissToast(toastId);
        setIsDeleting(false);
        setDeleteConfirmOpen(false);
        setDeleteCountdown(5);

        if (!result.success && (!result.count || result.count === 0)) {
            toast.error(t("toast.deleteFailed"), result.error || t("toast.deleteFailedDesc"));
            return;
        }

        const deletedCount = result.count || 0;
        if (deletedCount < ids.length) {
            const deletedIdSet = new Set(result.deletedIds || []);
            setSelectedOrders(new Set(ids.filter(id => !deletedIdSet.has(id))));

            toast.warning(
                `Partially deleted`,
                `${deletedCount} of ${ids.length} orders were deleted. Remaining orders stayed selected.`
            );
            return;
        }

        toast.success(t("toast.ordersDeleted"), t("toast.ordersDeletedDesc").replace("{count}", String(deletedCount)));
        setSelectedOrders(new Set());
    };

    // Additional bulk status handlers
    // Additional bulk status handlers
    const handleBulkNew = makeBulkStatusHandler("new");
    const handleBulkContacted = makeBulkStatusHandler("contacted");
    const handleBulkInTransit = makeBulkStatusHandler("in_transit");
    const handleBulkCompleted = makeBulkStatusHandler("completed");
    const handleBulkNoResponse = makeBulkStatusHandler("no_response");

    const handleShipExport = async (company: 'prime' | 'waseet') => {
        // Shipping with nothing selected means "everything matching my filter".
        // That is only true while the cached list IS the complete filtered set;
        // against a windowed list it would hand the courier whichever orders
        // happened to be loaded. Refuse rather than dispatch the wrong set.
        if (!canShipWithoutSelection({ selectedCount: selectedOrders.size, ordersAreComplete })) {
            toast.warning(
                "Select the orders to ship",
                "Only part of this filter is loaded, so \"all visible\" would not be all of them.",
            );
            return;
        }

        const ids = selectedOrders.size > 0
            ? Array.from(selectedOrders)
            : filteredOrders.map(o => o.id);

        if (ids.length === 0) {
            toast.warning("No orders selected", "Select orders before exporting");
            return;
        }

        let ordersToExport: Order[] = [];
        if (selectedOrders.size > 0) {
            ordersToExport = orders.filter(o => selectedOrders.has(o.id));
        } else {
            ordersToExport = filteredOrders;
        }

        const companyLabel = company === 'prime' ? 'Prime' : 'Al-Waseet';

        try {
            // Generate the file before recording the batch. The batch row used to
            // be inserted first, so an export that threw left a committed row
            // claiming a shipment that never left.
            if (company === 'prime') {
                await exportOrdersToPrimeCSV(ids, ordersToExport);
            } else {
                await exportOrdersToWaseetXLSX(ids, ordersToExport);
            }

            const batchName = `${companyLabel} Export ${new Date().toLocaleDateString('en-GB')}`;
            const { success: batchSuccess, error: batchError } = await createBatch(
                batchName,
                ids,
                company,
                "invoice"
            );

            // Capture previous statuses for undo capability
            const previousStatuses = ordersToExport.map(o => ({ id: o.id, status: o.status }));
            setSelectedOrders(new Set());

            if (batchSuccess) {
                toast.success(
                    "Export successful",
                    `${ids.length} orders exported via ${companyLabel}`,
                );
            } else {
                // The file is already in the operator's hands, so this is not an
                // export failure — say exactly what did and did not happen.
                reportOrderError(new Error(batchError || "Failed to create export batch"), {
                    operation: "orders-ship-export-batch-record",
                    extra: { company, orderCount: ids.length },
                });
                toast.warning(
                    "Exported, but not recorded",
                    `${ids.length} orders were exported via ${companyLabel}. The batch record could not be saved.`,
                );
            }

            // Prompt to move the exported orders to In Transit
            setPendingTransitIds(ids);
            setPendingTransitPrevStatuses(previousStatuses);
            setMoveTransitOpen(true);
        } catch (err) {
            toast.error(
                "Export failed",
                err instanceof Error ? err.message : "Could not complete the export process"
            );
        }
    };

    const handleConfirmMoveToTransit = async () => {
        const ids = pendingTransitIds;
        const previousStatuses = pendingTransitPrevStatuses;
        if (ids.length === 0) return;

        await bulkUpdateStatus(ids, "in_transit");
        toast({
            title: `${ids.length} orders moved to In Transit`,
            description: "Click undo to restore previous statuses",
            variant: "success",
            duration: 20000,
            action: {
                label: "Undo",
                onClick: async () => {
                    const byStatus = new Map<string, string[]>();
                    previousStatuses.forEach(({ id, status }) => {
                        const group = byStatus.get(status) || [];
                        group.push(id);
                        byStatus.set(status, group);
                    });
                    for (const [status, orderIds] of byStatus) {
                        await bulkUpdateStatus(orderIds, status as Order["status"]);
                    }
                    toast.success("Undone", `${ids.length} orders restored to their previous statuses`);
                }
            }
        });
        setPendingTransitIds([]);
        setPendingTransitPrevStatuses([]);
    };

    // Defer heavy array processing for analytics to keep UI responsive
    const deferredFilteredOrders = React.useDeferredValue(filteredOrders);

    // Calculate duplicate phone map for ghost detection
    const phoneCounts = useMemo(() => {
        const counts = new Map<string, number>();
        deferredFilteredOrders.forEach(o => {
            if (o.phone && !o.is_return) {
                const normalized = o.phone.replace(/\s/g, '');
                counts.set(normalized, (counts.get(normalized) || 0) + 1);
            }
        });
        return counts;
    }, [deferredFilteredOrders]);

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
    const hasActiveFilters = !!(filters.dateFrom || filters.dateTo || filters.city || filters.product || filters.priority);

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

    const isInitialLoading = !isMounted || loading;

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
                                                        <span className="font-bold text-lg text-foreground">{filteredOrders.length}</span>
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
                                                    <GlobalSearchField filters={filters} setFilters={setFilters} onScannerOpen={() => setIsScannerOpen(true)} />
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
                                                                    <span className="text-2xl font-black text-foreground dark:text-white">
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
                                            <AnimatePresence initial={false}>
                                                {analyticsLevel >= 1 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.3, ease: EASE_PANEL }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="space-y-4 pb-6">
                                                            {/* Main Stats Grid */}

                                                            <ErrorBoundary name="Analytics Dashboard">
                                                                {/* Main Stats Grid */}
                                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                                                    {/* New Orders - Premium Card */}
                                                                    <div className="relative overflow-hidden rounded-2xl orders-analytics-card bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-100 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                                                                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity duration-300">
                                                                            <Sparkles className="w-16 h-16 text-rose-500 rotate-12 group-hover:scale-110 transition-transform duration-500" />
                                                                        </div>
                                                                        <div className="p-5 relative z-10">
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <div className="p-1.5 rounded-lg bg-rose-100 text-rose-600">
                                                                                    <Sparkles className="w-4 h-4" />
                                                                                </div>
                                                                                <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">{t("orders.status.new")}</span>
                                                                            </div>
                                                                            <div className="flex items-baseline gap-1">
                                                                                <h3 className="text-3xl font-bold text-rose-900 dark:text-white">{statusCounts.new || 0}</h3>
                                                                                <span className="text-sm font-medium text-rose-600/80">orders</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Contacted - Premium Card */}
                                                                    <div className="relative overflow-hidden rounded-2xl orders-analytics-card bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-100 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                                                                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity duration-300">
                                                                            <PhoneCall className="w-16 h-16 text-amber-500 rotate-12 group-hover:scale-110 transition-transform duration-500" />
                                                                        </div>
                                                                        <div className="p-5 relative z-10">
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-600">
                                                                                    <PhoneCall className="w-4 h-4" />
                                                                                </div>
                                                                                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">{t("orders.status.contacted")}</span>
                                                                            </div>
                                                                            <div className="flex items-baseline gap-1">
                                                                                <h3 className="text-3xl font-bold text-amber-900 dark:text-white">{statusCounts.contacted || 0}</h3>
                                                                                <span className="text-sm font-medium text-amber-600/80">active</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Confirmed - Premium Card */}
                                                                    <div className="relative overflow-hidden rounded-2xl orders-analytics-card bg-gradient-to-br from-violet-50 to-purple-100/50 border border-violet-100 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                                                                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity duration-300">
                                                                            <CheckCircle2 className="w-16 h-16 text-violet-500 rotate-12 group-hover:scale-110 transition-transform duration-500" />
                                                                        </div>
                                                                        <div className="p-5 relative z-10">
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <div className="p-1.5 rounded-lg bg-violet-100 text-violet-600">
                                                                                    <CheckCircle2 className="w-4 h-4" />
                                                                                </div>
                                                                                <span className="text-xs font-bold text-violet-600 uppercase tracking-wider">{t("orders.status.confirmed")}</span>
                                                                            </div>
                                                                            <div className="flex items-baseline gap-1">
                                                                                <h3 className="text-3xl font-bold text-violet-900 dark:text-white">{statusCounts.confirmed || 0}</h3>
                                                                                <span className="text-sm font-medium text-violet-600/80">ready</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* In Transit - Premium Card */}
                                                                    <div className="relative overflow-hidden rounded-2xl orders-analytics-card bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-100 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                                                                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity duration-300">
                                                                            <Truck className="w-16 h-16 text-orange-500 -rotate-12 group-hover:scale-110 group-hover:translate-x-2 transition-transform duration-500" />
                                                                        </div>
                                                                        <div className="p-5 relative z-10">
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <div className="p-1.5 rounded-lg bg-orange-100 text-orange-600">
                                                                                    <Truck className="w-4 h-4" />
                                                                                </div>
                                                                                <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">{t("orders.status.inTransit")}</span>
                                                                            </div>
                                                                            <div className="flex items-baseline gap-1">
                                                                                <h3 className="text-3xl font-bold text-orange-900 dark:text-white">{statusCounts.in_transit || 0}</h3>
                                                                                <span className="text-sm font-medium text-orange-600/80">shipped</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Conversion Rate - Premium Card */}
                                                                    <div className="relative overflow-hidden rounded-2xl orders-analytics-card bg-white/60 backdrop-blur-md border border-white/40 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group ring-1 ring-black/5">
                                                                        <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
                                                                            <TrendingUp className="w-16 h-16 text-emerald-500 -rotate-12 group-hover:scale-110 transition-transform duration-500" />
                                                                        </div>
                                                                        <div className="p-5 relative z-10">
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600">
                                                                                    <TrendingUp className="w-4 h-4" />
                                                                                </div>
                                                                                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{t("orders.stats.conversion")}</span>
                                                                            </div>
                                                                            <div className="flex items-end gap-2">
                                                                                <h3 className="text-3xl font-bold text-foreground dark:text-white">{stats.conversionRate.toFixed(1)}%</h3>
                                                                            </div>
                                                                            {/* Animated Progress Bar */}
                                                                            <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                                                                                <div
                                                                                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-1000 ease-out relative"
                                                                                    style={{ width: `${stats.conversionRate}%` }}
                                                                                >
                                                                                    <div className="absolute inset-0 bg-white/30 w-full animate-[shimmer_2s_infinite]" />
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Revenue Trends & Velocity Metrics Row (only at level 2) */}
                                                                {analyticsLevel >= 2 && (
                                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                        {/* Operational Velocity */}
                                                                        <div className="pastel-card p-5 relative overflow-hidden group">
                                                                            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                                                                <Activity className="w-16 h-16 text-blue-500 rotate-12" />
                                                                            </div>
                                                                            <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">{t("orders.stats.operationalVelocity")}</h4>
                                                                            <div className="space-y-4 relative z-10">
                                                                                <div className="flex justify-between items-center">
                                                                                    <span className="text-sm text-foreground/70">{t("orders.stats.confirmSpeed")}</span>
                                                                                    <span className="font-bold text-foreground">{stats.velocityMetrics.avgNewToConfirmed}</span>
                                                                                </div>
                                                                                <div className="flex justify-between items-center">
                                                                                    <span className="text-sm text-foreground/70">{t("orders.stats.deliverySpeed")}</span>
                                                                                    <span className="font-bold text-foreground">{stats.velocityMetrics.avgConfirmedToDelivered}</span>
                                                                                </div>
                                                                                <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100">
                                                                                    <span className="text-sm text-foreground/70">{t("orders.stats.peakHour")}</span>
                                                                                    <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{stats.peakTime}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Needs Attention */}
                                                                        <div className="pastel-card p-5 relative overflow-hidden group">
                                                                            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                                                                <AlertTriangle className="w-16 h-16 text-red-500 -rotate-12" />
                                                                            </div>
                                                                            <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">{t("orders.stats.needsAttention")}</h4>
                                                                            <div className="space-y-4 relative z-10">
                                                                                <div className="flex justify-between items-center group/item hover:bg-rose-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, riskLevel: 'flagged' })}>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <ShieldCheck className="w-4 h-4 text-rose-600" />
                                                                                        <span className="text-sm text-foreground/70">{t("orders.stats.flagged")}</span>
                                                                                    </div>
                                                                                    <span className="font-bold text-rose-600">{flaggedCount}</span>
                                                                                </div>
                                                                                <div className="flex justify-between items-center group/item hover:bg-red-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, priority: 'urgent' })}>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                                                                        <span className="text-sm text-foreground/70">{t("orders.stats.urgent")}</span>
                                                                                    </div>
                                                                                    <span className="font-bold text-red-600">{stats.urgentOrders}</span>
                                                                                </div>
                                                                                <div className="flex justify-between items-center group/item hover:bg-orange-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, status: 'no_response' })}>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="w-2 h-2 rounded-full bg-orange-400" />
                                                                                        <span className="text-sm text-foreground/70">{t("orders.stats.noResponse")}</span>
                                                                                    </div>
                                                                                    <span className="font-bold text-orange-600">{stats.noResponseOrders}</span>
                                                                                </div>
                                                                                <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100 group/item hover:bg-yellow-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, status: 'return_pending' })}>
                                                                                    <span className="text-sm text-foreground/70">{t("orders.stats.returnsPending")}</span>
                                                                                    <span className="font-bold text-yellow-600">{stats.returnPendingOrders}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Business Pulse */}
                                                                        <div className="pastel-card p-5 relative overflow-hidden group">
                                                                            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                                                                <BarChart3 className="w-16 h-16 text-emerald-500 rotate-6" />
                                                                            </div>
                                                                            <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">{t("orders.stats.businessPulse")}</h4>
                                                                            <div className="space-y-4 relative z-10">
                                                                                <div className="flex justify-between items-center">
                                                                                    <span className="text-sm text-foreground/70">{t("orders.stats.revenue")}</span>
                                                                                    <span className="font-bold text-emerald-600">{formatIQD(stats.todayRevenue)}</span>
                                                                                </div>
                                                                                <div className="flex justify-between items-center">
                                                                                    <span className="text-sm text-foreground/70">{t("orders.stats.ordersCount")}</span>
                                                                                    <span className="font-bold text-foreground">{stats.todayOrders}</span>
                                                                                </div>
                                                                                <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100">
                                                                                    <span className="text-sm text-foreground/70">{t("orders.stats.avgOrderValue")}</span>
                                                                                    <span className="font-bold text-foreground">{formatIQD(stats.averageOrderValue)}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </ErrorBoundary>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

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
                                            <AnimatePresence initial={false}>
                                                {showSearchBar && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.3, ease: EASE_PANEL }}
                                                        onAnimationStart={() => setIsFilterPanelAnimating(true)}
                                                        onAnimationComplete={() => setIsFilterPanelAnimating(false)}
                                                        className={cn(
                                                            isFilterPanelAnimating ? "overflow-hidden" : "overflow-visible"
                                                        )}
                                                    >
                                                        <div className="pastel-card p-6 space-y-4 orders-search-panel">
                                                            <div className="flex flex-col lg:flex-row gap-4">
                                                                <GlobalSearchField
                                                                    filters={filters}
                                                                    setFilters={setFilters}
                                                                    onScannerOpen={() => setIsScannerOpen(true)}
                                                                    subFiltersOpen={showSubFilters}
                                                                    onToggleSubFilters={toggleSubFilters}
                                                                    inputClassName="w-full pl-12 pr-14 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition-all dark:focus:ring-[rgba(0,255,255,0.4)] dark:focus:border-[rgba(0,255,255,0.5)] dark:focus:shadow-[0_0_15px_rgba(0,255,255,0.1)]"
                                                                />
                                                                {/* Sort dropdown removed in favor of column sorting */}
                                                            </div>

                                                            {!isMobile && (
                                                                <StickyFilterBar
                                                                    filters={filters}
                                                                    setFilters={setFilters}
                                                                    statusCounts={statusCounts}
                                                                    productsInView={availableProductsInView}
                                                                    totalRiskCount={totalRiskCount}
                                                                    showFilters={showFilters}
                                                                    setShowFilters={setShowFilters}
                                                                    hasActiveFilters={hasActiveFilters}
                                                                    groupBy={groupBy}
                                                                    setGroupBy={setGroupBy}
                                                                    filterDuplicatesOnly={filterDuplicatesOnly}
                                                                    setFilterDuplicatesOnly={setFilterDuplicatesOnly}
                                                                    showSubFilters={showSubFilters}
                                                                    isMobile={false}
                                                                />
                                                            )}

                                                            {/* Advanced Filters Panel */}
                                                            <AnimatePresence>
                                                                {showFilters && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, height: 0 }}
                                                                        animate={{ opacity: 1, height: "auto" }}
                                                                        exit={{ opacity: 0, height: 0 }}
                                                                        className="overflow-hidden"
                                                                    >
                                                                        <div className="pt-4 border-t border-[var(--card-border)] space-y-4">
                                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                                                {/* City Filter */}
                                                                                <div>
                                                                                    <label className="text-xs text-muted font-medium block mb-1.5">{t("orders.filter.city")}</label>
                                                                                    <div className="relative">
                                                                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                                                        <select
                                                                                            value={filters.city || ""}
                                                                                            onChange={(e) => setFilters({ ...filters, city: e.target.value || undefined })}
                                                                                            className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all appearance-none cursor-pointer"
                                                                                        >
                                                                                            <option value="">{t("orders.filter.allCities")}</option>
                                                                                            {availableCities.map((city) => (
                                                                                                <option key={city} value={city}>{city}</option>
                                                                                            ))}
                                                                                        </select>
                                                                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                                                                    </div>
                                                                                </div>

                                                                                {/* Product Filter */}
                                                                                <div>
                                                                                    <label className="text-xs text-muted font-medium block mb-1.5">{t("orders.filter.product")}</label>
                                                                                    <div className="relative">
                                                                                        <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                                                        <select
                                                                                            value={filters.product || ""}
                                                                                            onChange={(e) => setFilters({ ...filters, product: e.target.value || undefined })}
                                                                                            className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all appearance-none cursor-pointer"
                                                                                        >
                                                                                            <option value="">{t("orders.filter.allProducts")}</option>
                                                                                            {availableProducts.map((product) => (
                                                                                                <option key={product} value={product}>{product}</option>
                                                                                            ))}
                                                                                        </select>
                                                                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                                                                    </div>
                                                                                </div>

                                                                                {/* Payment Status Filter */}
                                                                                <div>
                                                                                    <label className="text-xs text-muted font-medium block mb-1.5">{t("orders.filter.payment")}</label>
                                                                                    <div className="relative">
                                                                                        <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                                                        <select
                                                                                            value={filters.paymentStatus || ""}
                                                                                            onChange={(e) => setFilters({ ...filters, paymentStatus: (e.target.value as PaymentStatus) || undefined })}
                                                                                            className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all appearance-none cursor-pointer"
                                                                                        >
                                                                                            <option value="">{t("orders.filter.allPayments")}</option>
                                                                                            <option value="cod">{t("orders.filter.paymentCoD")}</option>
                                                                                            <option value="prepaid">{t("orders.filter.paymentPrepaid")}</option>
                                                                                            <option value="pending">{t("orders.filter.paymentPending")}</option>
                                                                                            <option value="partial">{t("orders.filter.paymentPartial")}</option>
                                                                                        </select>
                                                                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            {/* Filter Actions Row */}
                                                                            <div className="flex flex-wrap items-center gap-3">
                                                                                {/* Clear Filters Button */}
                                                                                {hasActiveFilters && (
                                                                                    <button
                                                                                        onClick={clearFilters}
                                                                                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all"
                                                                                    >
                                                                                        <X className="w-3.5 h-3.5" />
                                                                                        Clear all filters
                                                                                    </button>
                                                                                )}

                                                                                {/* Toggle Presets */}
                                                                                <button
                                                                                    onClick={() => setShowPresets(!showPresets)}
                                                                                    className={cn(
                                                                                        "flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all",
                                                                                        showPresets || filterPresets.length > 0
                                                                                            ? "text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                                                                            : "text-muted hover:text-foreground hover:bg-gray-50"
                                                                                    )}
                                                                                >
                                                                                    <Bookmark className="w-3.5 h-3.5" />
                                                                                    Presets {filterPresets.length > 0 && `(${filterPresets.length})`}
                                                                                </button>
                                                                            </div>

                                                                            {/* Filter Presets Panel */}
                                                                            <AnimatePresence>
                                                                                {showPresets && (
                                                                                    <motion.div
                                                                                        initial={{ opacity: 0, height: 0 }}
                                                                                        animate={{ opacity: 1, height: "auto" }}
                                                                                        exit={{ opacity: 0, height: 0 }}
                                                                                        className="overflow-hidden"
                                                                                    >
                                                                                        <div className="pt-3 border-t border-dashed border-[var(--card-border)] space-y-3">
                                                                                            {/* Save Current Filter */}
                                                                                            {hasActiveFilters && (
                                                                                                <div className="flex gap-2">
                                                                                                    <input
                                                                                                        type="text"
                                                                                                        placeholder="Name this filter..."
                                                                                                        value={newPresetName}
                                                                                                        onChange={(e) => setNewPresetName(e.target.value)}
                                                                                                        className="flex-1 px-3 py-2 text-sm bg-white border border-[var(--card-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                                                                                                    />
                                                                                                    <button
                                                                                                        onClick={() => {
                                                                                                            if (newPresetName.trim()) {
                                                                                                                saveFilterPreset(newPresetName.trim());
                                                                                                                setNewPresetName("");
                                                                                                            }
                                                                                                        }}
                                                                                                        disabled={!newPresetName.trim()}
                                                                                                        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all disabled:opacity-50"
                                                                                                    >
                                                                                                        <Save className="w-3.5 h-3.5" />
                                                                                                        Save
                                                                                                    </button>
                                                                                                </div>
                                                                                            )}

                                                                                            {/* Saved Presets List */}
                                                                                            {filterPresets.length > 0 ? (
                                                                                                <div className="flex flex-wrap gap-2">
                                                                                                    {filterPresets.map((preset) => (
                                                                                                        <div
                                                                                                            key={preset.id}
                                                                                                            className="flex items-center gap-1 pl-3 pr-1 py-1.5 bg-purple-50 border border-purple-100 rounded-lg group"
                                                                                                        >
                                                                                                            <button
                                                                                                                onClick={() => loadFilterPreset(preset.id)}
                                                                                                                className="text-sm text-purple-700 hover:text-purple-900 font-medium"
                                                                                                            >
                                                                                                                {preset.name}
                                                                                                            </button>
                                                                                                            <button
                                                                                                                onClick={() => deleteFilterPreset(preset.id)}
                                                                                                                className="p-1 text-purple-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"
                                                                                                            >
                                                                                                                <Trash2 className="w-3 h-3" />
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            ) : (
                                                                                                <p className="text-xs text-muted">{t("orders.filter.noSavedFilters")}</p>
                                                                                            )}
                                                                                        </div>
                                                                                    </motion.div>
                                                                                )}
                                                                            </AnimatePresence>
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>

                                                            <AnimatePresence>
                                                                {selectedOrders.size > 0 && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, height: 0 }}
                                                                        animate={{ opacity: 1, height: "auto" }}
                                                                        exit={{ opacity: 0, height: 0 }}
                                                                        className={cn("flex items-center gap-3 pt-4 border-t border-[var(--card-border)] overflow-x-auto scrollbar-hide", isBulkProcessing && "pointer-events-none opacity-50")}
                                                                    >
                                                                        <span className="text-sm text-muted whitespace-nowrap">{selectedOrders.size} {t("orders.selected")}</span>

                                                                        {/* Primary Actions */}
                                                                        <button
                                                                            onClick={handleBulkConfirm}
                                                                            className="px-3 py-1.5 rounded-lg bg-[var(--pastel-green)] text-green-900 text-sm font-medium hover:bg-[var(--pastel-green-light)] transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.bulk.confirm")}
                                                                        </button>
                                                                        <button
                                                                            onClick={handleBulkDeliver}
                                                                            className="px-3 py-1.5 rounded-lg bg-[var(--pastel-purple)] text-purple-900 text-sm font-medium hover:bg-[var(--pastel-purple-light)] transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.bulk.deliver")}
                                                                        </button>
                                                                        <button
                                                                            onClick={handleBulkReject}
                                                                            className="px-3 py-1.5 rounded-lg bg-[var(--pastel-pink)] text-rose-900 text-sm font-medium hover:bg-[var(--pastel-pink-light)] transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.bulk.reject")}
                                                                        </button>
                                                                        <button
                                                                            onClick={handleBulkArchive}
                                                                            className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300 transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.bulk.archive")}
                                                                        </button>

                                                                        {/* WhatsApp Bulk Send */}
                                                                        <button
                                                                            onClick={() => setTemplatePanelOpen(true)}
                                                                            className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 transition-all whitespace-nowrap flex items-center gap-1.5"
                                                                        >
                                                                            <MessageCircle className="w-4 h-4" />
                                                                            {t("orders.bulk.sendTemplate") || "إرسال رسالة واتساب"}
                                                                        </button>

                                                                        {/* Divider */}
                                                                        <div className="h-6 w-px bg-[var(--card-border)] flex-shrink-0" />

                                                                        {/* Status Change Buttons */}
                                                                        <button
                                                                            onClick={handleBulkNew}
                                                                            className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-sm font-medium hover:bg-blue-200 transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.bulk.new")}
                                                                        </button>
                                                                        <button
                                                                            onClick={handleBulkContacted}
                                                                            className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-sm font-medium hover:bg-amber-200 transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.bulk.contacted")}
                                                                        </button>
                                                                        <button
                                                                            onClick={handleBulkInTransit}
                                                                            className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-sm font-medium hover:bg-orange-200 transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.bulk.inTransit")}
                                                                        </button>
                                                                        <button
                                                                            onClick={handleBulkCompleted}
                                                                            className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.bulk.completed")}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                const ids = Array.from(selectedOrders);
                                                                                withProcessing(
                                                                                    () => bulkUpdateStatus(ids, "suspended"),
                                                                                    `Updating ${ids.length} orders...`,
                                                                                    t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "Suspended"),
                                                                                    () => setSelectedOrders(new Set())
                                                                                );
                                                                            }}
                                                                            className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-sm font-medium hover:bg-orange-200 transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.bulk.suspended")}
                                                                        </button>
                                                                        <button
                                                                            onClick={handleBulkNoResponse}
                                                                            className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300 transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.status.noResponse")}
                                                                        </button>

                                                                        {/* Divider */}
                                                                        <div className="h-6 w-px bg-[var(--card-border)] flex-shrink-0" />

                                                                        {/* Destructive Action */}
                                                                        <button
                                                                            onClick={handleBulkDelete}
                                                                            className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition-all whitespace-nowrap"
                                                                        >
                                                                            {t("orders.bulk.delete")}
                                                                        </button>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

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

                                    {/* Workflow Mode */}
                                    {workflowMode ? (
                                        <WorkflowTabs
                                            orders={filteredOrders}
                                            onStatusUpdate={updateOrderStatus}
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
                                                    {displayedOrders.length === 0 ? (
                                                        <EmptyState
                                                            type={isFirstRun ? "no-orders" : (filters.status && ['new', 'contacted', 'confirmed', 'delivered', 'rejected'].includes(filters.status) ? filters.status : "all") as "new" | "contacted" | "confirmed" | "delivered" | "rejected" | "all"}
                                                            searchQuery={filters.searchQuery}
                                                            hasFilters={emptyStateHasFilters}
                                                        />
                                                    ) : compactView >= 1 && compactGrid ? (
                                                        /* Grid layout for compact views */
                                                        <div className={cn(
                                                            "grid gap-2 grid-deferred-cells",
                                                            compactView === 2
                                                                ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                                                                : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                                                        )}>
                                                            {displayedOrders.map((order) => {
                                                                const customerOrders = getCustomerHistory(order.phone);
                                                                const orderCount = getCustomerOrderCount(order.phone, order.order_id);
                                                                const previousOrder = !order.is_return ? (customerOrders.find(o => o.id !== order.id) || null) : null;

                                                                return (
                                                                    <SwipeableOrderCard
                                                                        key={order.id}
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
                                                                        hasDuplicates={hasDuplicates(order.id)}
                                                                        getCustomerOrderCount={(phone: string) => getCustomerOrderCount(phone, order.order_id)}
                                                                        onTogglePin={(id: string) => togglePin(id)}
                                                                        onClone={(o: Order) => cloneOrder(o.id)}
                                                                        onScreenshot={() => setScreenshotOrder(order)}
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
                                                                        gridMode={true}
                                                                        onOpenTemplatePanel={(o: Order) => {
                                                                            setOrderForTemplate(o);
                                                                            setTemplatePanelOpen(true);
                                                                        }}
                                                                        messageTemplates={workflowTemplates}
                                                                        isSelected={selectedOrders.has(order.id)}
                                                                        onToggleSelection={toggleOrderSelection}
                                                                    />
                                                                );
                                                            })}
                                                        </div>
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
                                                    phoneCounts={phoneCounts}
                                                    setDuplicateOrder={setDuplicateOrder}
                                                    setShowDuplicateModal={setShowDuplicateModal}
                                                    modePrice={modePrice}
                                                    updateOrderStatus={updateOrderStatus}
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

                    {/* Modals */}
                    {/*
                        Merge, do not replace. `selectedOrder` is the full row fetched by
                        handleViewDetails; the list row carries fewer columns but fresher
                        values, so layering it on top keeps both. Replacing dropped fields
                        the list view never selects — scheduled_date, is_replacement,
                        delivered_at, refund_status and others — and wasted the full fetch.
                    */}
                    <OrderDetailsModal
                        order={selectedOrder
                            ? { ...selectedOrder, ...(orders.find((o: Order) => o.id === selectedOrder.id) ?? {}) }
                            : null}
                        open={isModalOpen}
                        onClose={() => {
                            setIsModalOpen(false);
                            setSelectedOrder(null);
                        }}
                        onUpdate={updateOrder}
                        onStatusUpdate={updateOrderStatus}
                        onGetTimeline={getOrderTimeline}
                        onGetNotes={getOrderNotes}
                        onDelete={deleteOrder}
                        onCreateReturn={createReturnOrder}
                        onCreateReplacement={createReplacementOrder}
                        checkOrderIdExists={checkOrderIdExists}
                        onOpenTemplatePanel={(o) => {
                            setOrderForTemplate(o);
                            setTemplatePanelOpen(true);
                        }}
                        messageTemplates={workflowTemplates}
                    />
                    <CreateOrderModal
                        open={isCreateModalOpen}
                        onClose={() => setIsCreateModalOpen(false)}
                        onCreate={createOrder}
                        checkOrderIdExists={checkOrderIdExists}
                        getBlacklistEntry={getBlacklistEntry}
                    />

                    {isMounted && (
                        <ReturnsCockpitModal
                            open={isReturnsOpen}
                            onClose={() => setIsReturnsOpen(false)}
                            onOpenOrder={(order) => {
                                setSelectedOrder(order);
                                setIsModalOpen(true);
                                setIsReturnsOpen(false);
                            }}
                        />
                    )}

                    {isMounted && (
                        <BarcodeScanner
                            isOpen={isScannerOpen}
                            onClose={() => setIsScannerOpen(false)}
                            onScan={(code) => {
                                // Push the scanned code into the search; GlobalSearchField will
                                // normalize "QR:{id}|PHONE:..." → order id before applying.
                                useOrderStore.getState().setLocalSearchQuery(code);
                                setIsScannerOpen(false);
                            }}
                        />
                    )}

                    {/* Duplicate Comparison Modal */}
                    {
                        duplicateOrder && (
                            <DuplicateComparisonModal
                                open={showDuplicateModal}
                                onClose={() => {
                                    setShowDuplicateModal(false);
                                    setDuplicateOrder(null);
                                }}
                                currentOrder={duplicateOrder}
                                duplicateOrders={orders.filter(o =>
                                    o.id !== duplicateOrder.id &&
                                    normalizePhoneForSearch(o.phone) === normalizePhoneForSearch(duplicateOrder.phone) &&
                                    !o.is_return
                                )}
                                onMerge={async (targetId, sourceId) => {
                                    const result = await mergeOrders(targetId, sourceId);
                                    return result;
                                }}
                                onMarkAsSameCustomer={(orderId) => {
                                    // Mark this customer as verified returning customer
                                    markAsVerifiedCustomer(orderId);
                                    setShowDuplicateModal(false);
                                    setDuplicateOrder(null);
                                }}
                                onCancelOrder={async (orderId) => {
                                    const result = await updateOrderStatus(orderId, "cancelled", "Cancelled via duplicate comparison");
                                    return result;
                                }}
                                onViewOrder={(order) => {
                                    setShowDuplicateModal(false);
                                    setDuplicateOrder(null);
                                    setSelectedOrder(order);
                                    setIsModalOpen(true);
                                }}
                                onDismissDuplicate={async (phone, notes) => {
                                    await dismissDuplicate(phone, notes);
                                }}
                                onFilterDuplicates={() => {
                                    setFilterDuplicatesOnly(true);
                                }}
                                isBlacklisted={isBlacklisted}
                                getCustomerOrders={getCustomerOrders}
                            />
                        )
                    }

                    {/* Split Order Dialog */}
                    {splitOrderDialog.open && splitOrderDialog.order && (
                        <SplitOrderDialog
                            order={splitOrderDialog.order}
                            open={splitOrderDialog.open}
                            onClose={() => setSplitOrderDialog({ open: false, order: null })}
                            onConfirm={handleSplitOrder}
                        />
                    )}

                    {/* WhatsApp Template Panel */}
                    {(orderForTemplate || (templatePanelOpen && selectedOrders.size > 0)) && (
                        <WhatsAppTemplatePanel
                            open={templatePanelOpen}
                            onClose={() => {
                                setTemplatePanelOpen(false);
                                setOrderForTemplate(null);
                            }}
                            order={orderForTemplate || undefined}
                            bulkOrders={!orderForTemplate ? displayedOrders.filter(o => selectedOrders.has(o.id)) : undefined}
                            templates={workflowTemplates}
                        />
                    )}

                    <FloatingActionBar
                        selectedCount={selectedOrders.size}
                        onConfirm={handleBulkConfirm}
                        onReject={handleBulkReject}
                        onArchive={handleBulkArchive}
                        onDelete={handleBulkDelete}
                        disabled={isBulkProcessing}
                    />


                    {/* Bulk Processing Overlay */}
                    <AnimatePresence>
                        {isBulkProcessing && (
                            <motion.div
                                initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                                animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
                                exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                                className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/20 pointer-events-none"
                            >
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    className="bg-white/90 dark:bg-black/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/50 dark:border-white/10 flex flex-col items-center gap-6"
                                >
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
                                        <div className="relative bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                                            <svg className="w-10 h-10 text-blue-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    </div>
                                    <div className="text-center space-y-1">
                                        <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                            {t("orders.processing") !== "orders.processing" ? t("orders.processing") : "Processing..."}
                                        </h3>
                                        <p className="text-sm font-medium text-muted-foreground">
                                            Please wait while we update your orders
                                        </p>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Scroll to Top Button */}
                    <ScrollToTopButton />

                    {/* Monthly Backup Reminder */}
                    <BackupPrompt />

                    {/* Order Confirmation Screenshot Modal */}
                    <AnimatePresence>
                        {screenshotOrder && (
                            <OrderConfirmationCard
                                order={screenshotOrder}
                                onClose={() => setScreenshotOrder(null)}
                            />
                        )}
                    </AnimatePresence>


                    {/* Export Report Modal */}
                    <ExportReportModal
                        open={isExportModalOpen}
                        onClose={() => setIsExportModalOpen(false)}
                        filteredOrders={filteredOrders}
                        selectedOrderIds={selectedOrders}
                        currentDateFrom={filters.dateFrom}
                        currentDateTo={filters.dateTo}
                    />

                    {/* Cancellation Reason Dialog */}
                    <CancellationReasonDialog
                        open={cancelDialogOpen}
                        onClose={() => {
                            setCancelDialogOpen(false);
                            setOrderToCancel(null);
                        }}
                        onConfirm={async (reason, reasonId) => {
                            if (orderToCancel) {
                                await handleStatusUpdate(orderToCancel.id, "cancelled", reason, reasonId);
                            }
                        }}
                        customerName={orderToCancel?.customer_name}
                        orderId={orderToCancel?.sequence_number ? String(orderToCancel.sequence_number) : orderToCancel?.order_id}
                        type="cancel"
                    />

                    {/* Rejection Reason Dialog */}
                    <CancellationReasonDialog
                        open={rejectDialogOpen}
                        onClose={() => {
                            setRejectDialogOpen(false);
                            setOrderToReject(null);
                        }}
                        onConfirm={async (reason, reasonId) => {
                            if (orderToReject) {
                                await handleStatusUpdate(orderToReject.id, "rejected", reason, reasonId);
                            }
                        }}
                        customerName={orderToReject?.customer_name}
                        orderId={orderToReject?.sequence_number ? String(orderToReject.sequence_number) : orderToReject?.order_id}
                        type="reject"
                    />

                    {/* Delete Confirmation Dialog */}
                    <Dialog open={deleteConfirmOpen} onOpenChange={(open) => {
                        if (!isDeleting) {
                            setDeleteConfirmOpen(open);
                            if (!open) setDeleteCountdown(5);
                        }
                    }}>
                        <DialogContent className="md:max-w-md" aria-describedby="delete-confirm-desc">
                            <DialogHeader>
                                <DialogTitle className="text-red-600">
                                    {t("orders.deleteConfirm.title")}
                                </DialogTitle>
                                <DialogDescription id="delete-confirm-desc">
                                    {t("orders.deleteConfirm.description").replace("{count}", String(selectedOrders.size))}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-2">
                                <div className="max-h-48 overflow-y-auto p-3 bg-rose-50 rounded-xl border border-rose-100">
                                    <ul className="space-y-2">
                                        {Array.from(selectedOrders).map(id => {
                                            const order = orders.find(o => o.id === id);
                                            return order ? (
                                                <li key={id} className="text-sm text-rose-900 flex justify-between items-center bg-white/50 p-2 rounded-lg border border-rose-100/50">
                                                    <span className="font-medium truncate max-w-[200px]">{order.customer_name}</span>
                                                    <span className="text-rose-600 font-mono text-xs font-bold px-2 py-0.5 bg-rose-100 rounded-md">#{getBaseOrderId(order.order_id)}</span>
                                                </li>
                                            ) : null;
                                        })}
                                    </ul>
                                </div>
                            </div>
                            <DialogFooter>
                                <button
                                    onClick={() => {
                                        setDeleteConfirmOpen(false);
                                        setDeleteCountdown(5);
                                    }}
                                    disabled={isDeleting}
                                    className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                                >
                                    {t("common.cancel")}
                                </button>
                                <button
                                    onClick={executeDelete}
                                    disabled={deleteCountdown > 0 || isDeleting}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2",
                                        deleteCountdown > 0
                                            ? "bg-red-200 text-red-400 cursor-not-allowed"
                                            : "bg-red-600 text-white hover:bg-red-700"
                                    )}
                                >
                                    {deleteCountdown > 0 ? t("orderDetail.waitDelete").replace("{n}", String(deleteCountdown)) : isDeleting ? t("common.deleting") : t("orders.deleteConfirm.button").replace("{count}", String(selectedOrders.size))}
                                </button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Ship Export Confirmation Dialog */}
                    <ShipExportConfirmationDialog
                        key={shipConfirmKey}
                        open={shipConfirmOpen}
                        onOpenChange={setShipConfirmOpen}
                        company={shipConfirmCompany}
                        orders={selectedOrders.size > 0
                            ? orders.filter(o => selectedOrders.has(o.id))
                            : filteredOrders
                        }
                        currentTab={filters.status || 'all'}
                        hasSelection={selectedOrders.size > 0}
                        ordersAreComplete={ordersAreComplete}
                        onConfirmExport={() => handleShipExport(shipConfirmCompany)}
                    />

                    {/* Post-export: prompt to move exported orders to In Transit */}
                    <MoveToTransitDialog
                        open={moveTransitOpen}
                        onOpenChange={setMoveTransitOpen}
                        count={pendingTransitIds.length}
                        onConfirm={handleConfirmMoveToTransit}
                    />

                </motion.div>
            )}
        </AnimatePresence>
    );
}
