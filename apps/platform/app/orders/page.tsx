"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { useShallow } from "zustand/react/shallow";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useDebounce } from "@/hooks/use-debounce";
import { Order, PaymentStatus } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { isOrderFlagged } from "@/lib/data-quality-utils";
import { SwipeableOrderCard } from "@/components/dashboard/swipeable-order-card";
import { OrderCardSkeleton } from "@/components/dashboard/order-card-skeleton";
import { OrdersLoader } from "@/components/ui/orders-loader";
import { OrderAssignment, mockAssignments } from "@/lib/team-types";
import { useBatchRiskAssessment } from "@/hooks/use-risk-assessment";
const OrderDetailsModal = dynamic(
    () => import("@/components/orders/order-details-modal").then(mod => ({ default: mod.OrderDetailsModal })),
    { loading: () => null, ssr: false }
);
const CreateOrderModal = dynamic(
    () => import("@/components/orders/create-order-modal").then(mod => ({ default: mod.CreateOrderModal })),
    { loading: () => null, ssr: false }
);
// Dynamic imports for other heavy components
const FloatingActionBar = dynamic(
    () => import("@/components/orders/floating-action-bar").then(mod => ({ default: mod.FloatingActionBar })),
    { ssr: false }
);
const WorkflowTabs = dynamic(
    () => import("@/components/orders/workflow-tabs").then(mod => ({ default: mod.WorkflowTabs })),
    { ssr: false }
);
const DuplicateComparisonModal = dynamic(
    () => import("@/components/orders/duplicate-comparison-modal").then(mod => ({ default: mod.DuplicateComparisonModal })),
    { loading: () => null, ssr: false }
);
const ExportReportModal = dynamic(
    () => import("@/components/orders/export-report-modal").then(mod => ({ default: mod.ExportReportModal })),
    { loading: () => null, ssr: false }
);
const WhatsAppTemplatePanel = dynamic(
    () => import("@/components/orders/whatsapp-template-panel").then(mod => ({ default: mod.WhatsAppTemplatePanel })),
    { loading: () => null, ssr: false }
);
const SplitOrderDialog = dynamic(
    () => import("@/components/orders/split-order-dialog").then(mod => ({ default: mod.SplitOrderDialog })),
    { loading: () => null, ssr: false }
);
const VirtualizedOrderList = dynamic(
    () => import("@/components/orders/virtualized-order-list").then(mod => ({ default: mod.VirtualizedOrderList })),
    { ssr: false }
);
const DateRangePicker = dynamic(
    () => import("@/components/ui/date-range-picker").then(mod => ({ default: mod.DateRangePicker })),
    { ssr: false }
);
import { EmptyState } from "@/components/ui/empty-states";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
const SavedViewsTabs = dynamic(
    () => import("@/components/orders/saved-views-tabs").then(mod => ({ default: mod.SavedViewsTabs })),
    { ssr: false }
);
const OrderConfirmationCard = dynamic(
    () => import("@/components/orders/order-confirmation-card").then(mod => ({ default: mod.OrderConfirmationCard })),
    { ssr: false }
);
const CancellationReasonDialog = dynamic(
    () => import("@/components/orders/cancellation-reason-dialog").then(mod => ({ default: mod.CancellationReasonDialog })),
    { loading: () => null, ssr: false }
);
const StickyFilterBar = dynamic(
    () => import("@/components/orders/sticky-filter-bar").then(mod => ({ default: mod.StickyFilterBar })),
    { ssr: false }
);
const VirtualizedOrderTable = dynamic(
    () => import("@/components/orders/virtualized-order-table").then(mod => ({ default: mod.VirtualizedOrderTable })),
    { loading: () => null, ssr: false }
);
const ScrollToTopButton = dynamic(
    () => import("@/components/ui/scroll-to-top-button").then(mod => ({ default: mod.ScrollToTopButton })),
    { ssr: false }
);
const BackupPrompt = dynamic(
    () => import("@/components/vault/backup-prompt").then(mod => ({ default: mod.BackupPrompt })),
    { ssr: false }
);
import { useIsMobile } from "@/hooks/use-mobile";
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
    PanelRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { notificationService } from "@/lib/notification-service";
import { mockAssignmentRules } from "@/lib/team-types";
import { exportOrdersToPrimeCSV } from "@/lib/export-utils";
import { toast } from "@/hooks/use-toast";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
const GlobalSearchField = React.memo(function GlobalSearchField({ filters, setFilters, inputClassName = "w-full pl-10 pr-12 py-2.5 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all" }: any) {
    const localSearchQuery = useOrderStore((s: any) => s.localSearchQuery);
    const setLocalSearchQuery = useOrderStore((s: any) => s.setLocalSearchQuery);
    const debouncedSearchQuery = useDebounce(localSearchQuery, 300);
    const { t } = useLanguage();

    useEffect(() => {
        if (debouncedSearchQuery !== (filters.searchQuery || "")) {
            setFilters((prev: any) => ({ ...prev, searchQuery: debouncedSearchQuery || undefined }));
        }
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
            {localSearchQuery && (
                <button
                    onClick={() => setFilters((prev: any) => ({ ...prev, searchIncludesArchive: !prev.searchIncludesArchive }))}
                    className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all flex items-center gap-1",
                        filters.searchIncludesArchive
                            ? "bg-orange-100 text-orange-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                            : "text-muted-foreground hover:bg-amber-100/40"
                    )}
                    title="Include Archive in Search"
                >
                    <Archive className="w-3.5 h-3.5" />
                    {filters.searchIncludesArchive && <span className="text-[10px] sm:hidden font-bold pr-1">Archived Included</span>}
                </button>
            )}
        </div>
    );
});

export default function OrdersPage() {
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
        isBlacklisted,
        stats,
        availableCities,
        availableProducts,
        filters,
        setFilters,
        clearFilters,
        bulkUpdateStatus,
        bulkArchive,
        bulkUnarchive,
        bulkDelete,
        exportOrders,
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
        addOrderNote,
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
        // Message templates
        messageTemplates,
    } = useOrdersContext();

    // Get products for Excel import matching
    useProductsCrud();
    const isMobile = useIsMobile();
    const { t } = useLanguage();

    // ── Zustand Store (replaces ~35 useState calls) ──
    const {
        // View preferences
        viewMode, setViewMode,
        compactView, setCompactView,
        compactGrid, setCompactGrid,
        actionDock, setActionDock,
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
        sortConfig, toggleSort,
        columnFilters, setColumnFilters,
        openFilterColumn, setOpenFilterColumn,
        activePresetId, setActivePresetId,
        localSearchQuery, setLocalSearchQuery,
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
    } = useOrderStore();

    // Sync local search input when filters.searchQuery is cleared externally (e.g. "clear filters" button)
    useEffect(() => {
        if (!filters.searchQuery) {
            useOrderStore.getState().setLocalSearchQuery("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.searchQuery]);

    const debouncedColumnFilters = useDebounce(columnFilters, 300);

    // Domain state (stays local — not UI state)
    const [assignments, setAssignments] = useState<OrderAssignment[]>(mockAssignments);
    const { splitOrder } = useOrdersContext();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleSplitOrder = async (keptItems: any[], returnedItems: any[]) => {
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

    const handleAssignDuty = useCallback((orderId: string, duty: 'confirmation' | 'fulfillment', employeeId: string) => {
        setAssignments(prev => {
            const filtered = prev.filter(a => !(a.order_id === orderId && a.duty === duty));
            return [...filtered, {
                id: crypto.randomUUID(),
                order_id: orderId,
                employee_id: employeeId,
                duty,
                assigned_at: new Date().toISOString(),
                status: 'pending'
            }];
        });
        toast.success(`Assigned to ${duty}`);
    }, []);

    // Evaluate Auto-Assignments when orders change or load (Optimized: Web Worker)
    useEffect(() => {
        if (!orders || orders.length === 0) return;

        // Run off-main-thread to avoid blocking React rendering
        const worker = new Worker('/workers/assignment-worker.js');

        worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'ASSIGNMENTS_RESULT' && payload.length > 0) {
                setAssignments(prev => [...prev, ...payload]);
            }
            worker.terminate();
        };

        worker.postMessage({
            type: 'EVALUATE_ASSIGNMENTS',
            payload: {
                orders,
                rules: mockAssignmentRules,
                currentAssignments: assignments
            }
        });

        return () => worker.terminate();
    }, [orders, assignments]);

    // Get workflow templates for the template panel
    const workflowTemplates = useMemo(() =>
        messageTemplates.filter(t =>
            t.template_type === 'confirmation' ||
            t.template_type === 'reminder' ||
            t.template_type === 'discount'
        ),
        [messageTemplates]
    );

    // Helper for filter icon color
    const getFilterIconClass = (key: string) => {
        const isActive = columnFilters[key] !== undefined && columnFilters[key] !== '';
        return isActive ? "text-blue-600 opacity-100" : "text-muted opacity-0 group-hover:opacity-100";
    };

    // Refs for date picker positioning (not state — stays local)
    const dateButtonRef = useRef<HTMLButtonElement>(null);
    const datePickerRef = useRef<HTMLDivElement>(null);

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


    // Batch Risk Assessment
    const { getRiskLevel, getAssessment, loading: riskLoading } = useBatchRiskAssessment(hookFilteredOrders);

    // Defer heavy list inputs to prevent main-thread blocking during concurrent renders
    const defHookFilteredOrders = React.useDeferredValue(hookFilteredOrders);
    const defColumnFilters = React.useDeferredValue(debouncedColumnFilters);
    const defFilterDuplicatesOnly = React.useDeferredValue(filterDuplicatesOnly);
    const defRiskLevel = React.useDeferredValue(filters.riskLevel);
    const defSortConfig = React.useDeferredValue(sortConfig);

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
                // Also search in notes if searching globally
                if (key === 'all') {
                    // Optimized global search - join fields once per order vs checking all
                    const searchStr = `${o.customer_name} ${o.phone} ${o.city} ${o.order_id} ${o.sequence_number} ${o.notes || ''}`.toLowerCase();
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
            } else if (!riskLoading) {
                // Other risk levels use the fraud detector
                result = result.filter(o => getRiskLevel(o.phone) === defRiskLevel);
            }
        }

        // 1.5. Apply Duplicates-Only Filter
        if (defFilterDuplicatesOnly) {
            result = result.filter(o => getCustomerOrderCount(o.phone) > 1);
        }

        // 2. Sort
        result.sort((a, b) => {
            // Priority: Pinned first
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;

            if (defSortConfig) {
                let aVal: unknown = a[defSortConfig.key as keyof Order];
                let bVal: unknown = b[defSortConfig.key as keyof Order];

                // Handle special keys
                if (defSortConfig.key === 'amount') { aVal = Number(a.price); bVal = Number(b.price); }
                if (defSortConfig.key === 'order_id') { aVal = a.sequence_number || a.order_id; bVal = b.sequence_number || b.order_id; }
                if (defSortConfig.key === 'created_at') { aVal = new Date(a.created_at).getTime(); bVal = new Date(b.created_at).getTime(); }

                if (aVal != null && bVal != null && aVal < bVal) return defSortConfig.direction === 'asc' ? -1 : 1;
                if (aVal != null && bVal != null && aVal > bVal) return defSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            }

            // Default sort: Newest first
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        return result;
    }, [defHookFilteredOrders, defSortConfig, defColumnFilters, defFilterDuplicatesOnly, getCustomerOrderCount, defRiskLevel, getRiskLevel, riskLoading]);

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

    // Count orders needing attention (⚠️ in notes, missing products, etc.)
    const needsReviewCount = useMemo(() => {
        return defOrders.filter(o => {
            if (o.notes && o.notes.includes('⚠️')) return true;
            if ((!o.items || o.items.length === 0) && o.customer_name !== 'Manual Order') return true;
            if (o.customer_name?.startsWith('Customer ') && o.customer_name !== 'Customer') return true;
            return false;
        }).length;
    }, [defOrders]);

    // Scroll to top when filters change to prevent empty list illusion
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [filters, filterDuplicatesOnly]);

    const handleStatusUpdate = async (orderId: string, status: Order["status"], reason?: string) => {
        setLoadingId(orderId);
        try {
            const result = await updateOrderStatus(orderId, status, reason);
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

    const selectAll = useCallback(() => {
        const store = useOrderStore.getState();
        if (store.selectedOrders.size === filteredOrders.length) {
            store.clearSelection();
        } else {
            store.selectAll(filteredOrders.map(o => o.id));
        }
    }, [filteredOrders]);

    // Handle bulk actions
    const handleBulkConfirm = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "confirmed");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.ordersConfirmed"), t("toast.ordersConfirmedDesc").replace("{count}", String(ids.length)));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkDeliver = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "delivered");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.ordersDelivered"), t("toast.ordersConfirmedDesc").replace("{count}", String(ids.length)));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkReject = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "rejected");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.ordersRejected"), t("toast.ordersConfirmedDesc").replace("{count}", String(ids.length)));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkArchive = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkArchive(ids);
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) {
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
    };

    // Delete confirmation dialog state
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    const handleBulkDelete = async () => {
        setDeleteConfirmText("");
        setDeleteConfirmOpen(true);
    };

    const executeDelete = async () => {
        setIsDeleting(true);
        const ids = Array.from(selectedOrders);
        const result = await bulkDelete(ids);
        setIsDeleting(false);
        setDeleteConfirmOpen(false);
        setDeleteConfirmText("");

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
    const handleBulkNew = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "new");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "New"));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkContacted = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "contacted");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "Contacted"));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkInTransit = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "in_transit");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "In Transit"));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkCompleted = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "completed");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "Completed"));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkNoResponse = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "no_response");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "No Response"));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleExport = () => {
        const ids = selectedOrders.size > 0
            ? Array.from(selectedOrders)
            : filteredOrders.map(o => o.id);

        if (ids.length === 0) {
            toast.warning(t("toast.noOrders"), t("toast.noOrdersDesc"));
            return;
        }

        try {
            exportOrders(ids, "xlsx");
            toast.success(t("toast.exportSuccessful"), t("toast.exportSuccessfulDesc").replace("{count}", String(ids.length)));
        } catch (error) {
            toast.error(t("toast.exportFailed"), t("toast.exportFailedDesc"));
        }
    };

    const handlePrimeExport = async () => {
        const ids = selectedOrders.size > 0
            ? Array.from(selectedOrders)
            : filteredOrders.map(o => o.id);

        if (ids.length === 0) {
            toast.warning("No orders selected", "Select orders before exporting");
            return;
        }

        // We need the full order objects for the export
        let ordersToExport: Order[] = [];
        if (selectedOrders.size > 0) {
            // Find selected orders in the full list
            ordersToExport = orders.filter(o => selectedOrders.has(o.id));
        } else {
            // Use current filtered view
            ordersToExport = filteredOrders;
        }

        try {
            // 1. Create a batch for history
            const batchName = `Prime Export ${new Date().toLocaleDateString('en-GB')}`;
            const { success: batchSuccess, error: batchError } = await createBatch(
                batchName,
                ids,
                "prime",
                "invoice" // Prime is essentially an invoice export
            );

            if (batchSuccess) {
                // 2. Download the file
                await exportOrdersToPrimeCSV(ids, ordersToExport);

                // 3. Update status to In Transit
                await bulkUpdateStatus(ids, "in_transit");

                // Clear selection
                setSelectedOrders(new Set());

                toast.success(
                    "Export successful",
                    `${ids.length} orders exported → In Transit`
                );
            } else {
                throw new Error(batchError || "Failed to create export batch");
            }
        } catch (err) {
            toast.error(
                "Export failed",
                err instanceof Error ? err.message : "Could not complete the export process"
            );
        }
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
        console.log(`[OrdersPage] CONTENT (${orders?.length || 0} orders) at ${Math.round(performance.now() - pageMountTime.current)}ms`);
    } else if (loading && !hasLoggedContent.current && pageMountTime.current !== null) {
        console.log(`[OrdersPage] SKELETON at ${Math.round(performance.now() - pageMountTime.current)}ms`);
    }

    const isInitialLoading = !isMounted || loading;

    return (
        <AnimatePresence mode="wait">
            {isInitialLoading ? (
                <motion.div
                    key="skeleton"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                    <OrdersLoader />
                </motion.div>
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
                    initial={{ opacity: 0, y: 10, scale: 0.995 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="min-h-screen p-4 md:p-6 lg:p-8 orders-page">
                        <div className="space-y-4 md:space-y-6">
                            {/* Collapsed Toolbar Bar - Minimal floating header when collapsed */}
                            <AnimatePresence>
                                {toolbarCollapsed && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        transition={{ duration: 0.3, ease: "easeOut" }}
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
                                                <GlobalSearchField filters={filters} setFilters={setFilters} />
                                            </div>

                                            {/* Right: Quick actions + Expand */}
                                            <div className="flex items-center gap-2">
                                                {/* New Order Button */}
                                                <button
                                                    onClick={() => setIsCreateModalOpen(true)}
                                                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--button-success)] text-white shadow-sm hover:bg-[var(--button-success-hover)] transition-all text-sm font-semibold"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                    <span className="hidden sm:inline">New</span>
                                                </button>

                                                {/* Expand Button */}
                                                <button
                                                    onClick={toggleToolbarCollapse}
                                                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-muted hover:text-foreground hover:bg-[var(--card-bg)] transition-all text-sm font-medium"
                                                    title="Expand toolbar (⌘\\)"
                                                >
                                                    <Maximize2 className="w-4 h-4" />
                                                    <span className="hidden lg:inline">Expand</span>
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Full Header - Hidden when collapsed */}
                            <AnimatePresence>
                                {!toolbarCollapsed && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.3, ease: "easeOut" }}
                                        onAnimationStart={() => setIsHeaderAnimating(true)}
                                        onAnimationComplete={() => setIsHeaderAnimating(false)}
                                        className={cn(
                                            isHeaderAnimating ? "overflow-hidden" : "overflow-visible"
                                        )}
                                    >
                                        {/* Page Header - Premium State-of-the-Art Design */}
                                        <motion.div
                                            initial={{ opacity: 0, y: -20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
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

                                            {/* Row 2: Control Groups - Premium Glass Cards */}
                                            <div className="flex items-start gap-4 overflow-x-auto pb-6 scrollbar-hide -mx-4 px-4 md:mx-0 md:pl-2 md:pr-24 pt-2">

                                                {/* View Group */}


                                                {/* View Group */}
                                                <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0 min-w-min">
                                                    <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.view")}</span>
                                                    <div className="flex items-center gap-2">
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

                                                        <div className="w-px h-8 bg-black/5 mx-1 orders-toolbar-divider" />
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

                                                        <div className="w-px h-8 bg-black/5 mx-1 orders-toolbar-divider" />

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

                                                        {/* Action Dock Toggle */}
                                                        {!workflowMode && (viewMode === "cards" || viewMode === "list") && (
                                                            <button
                                                                onClick={() => {
                                                                    const newVal = !actionDock;
                                                                    setActionDock(newVal);
                                                                    localStorage.setItem("ordersActionDock", String(newVal));
                                                                }}
                                                                className={cn(
                                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                                    actionDock
                                                                        ? "bg-purple-100 text-purple-700 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                                        : "text-muted-foreground hover:bg-lime-50 dark:hover:bg-[#EFFF00]/10 hover:text-foreground dark:hover:bg-white/5"
                                                                )}
                                                                title={actionDock ? "Disable Action Dock" : "Enable Action Dock"}
                                                            >
                                                                <PanelRight className="w-4 h-4" />
                                                            </button>
                                                        )}

                                                        <div className="w-px h-8 bg-black/5 mx-1 orders-toolbar-divider" />

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
                                                    <div className="flex items-center gap-2">
                                                        {/* Date Picker */}
                                                        <div>
                                                            <button
                                                                ref={dateButtonRef}
                                                                onClick={() => setShowDatePicker(!showDatePicker)}
                                                                className={cn(
                                                                    "px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 border",
                                                                    (filters.dateFrom || filters.dateTo)
                                                                        ? "bg-lime-50 dark:bg-[#EFFF00]/5 border-lime-400 dark:border-[#EFFF00]/40 text-foreground shadow-sm"
                                                                        : "border-[var(--card-border)] dark:border-white/10 text-muted-foreground hover:bg-lime-50 dark:hover:bg-[#EFFF00]/10 hover:text-foreground hover:border-lime-400/40 dark:hover:border-[#EFFF00]/40"
                                                                )}
                                                            >
                                                                <CalendarDays className={cn(
                                                                    "w-4 h-4 transition-colors",
                                                                    (filters.dateFrom || filters.dateTo) ? "text-lime-600 dark:text-[#EFFF00]" : "text-muted-foreground group-hover:text-foreground"
                                                                )} />
                                                                <span className="hidden lg:inline">
                                                                    {(() => {
                                                                        if (!filters.dateFrom) return "All Orders";
                                                                        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                                                        const now = new Date();
                                                                        const todayStr = fmt(now);
                                                                        const df = filters.dateFrom;
                                                                        const dt = filters.dateTo || df;
                                                                        // Check presets: wider ranges first to avoid shadowing
                                                                        // Past Year
                                                                        const yearAgo = new Date(); yearAgo.setFullYear(now.getFullYear() - 1);
                                                                        if (df === fmt(yearAgo) && dt === todayStr) return "Past Year";
                                                                        // Last 30 Days
                                                                        const d30 = new Date(); d30.setDate(now.getDate() - 30);
                                                                        if (df === fmt(d30) && dt === todayStr) return "Last 30 Days";
                                                                        // Last 7 Days
                                                                        const d7 = new Date(); d7.setDate(now.getDate() - 7);
                                                                        if (df === fmt(d7) && dt === todayStr) return "Last 7 Days";
                                                                        // This Month
                                                                        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                                                                        if (df === fmt(monthStart) && dt === todayStr) return "This Month";
                                                                        // This Week
                                                                        const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
                                                                        if (df === fmt(weekStart) && dt === todayStr) return "This Week";
                                                                        // Yesterday
                                                                        const yest = new Date(); yest.setDate(yest.getDate() - 1);
                                                                        const yesterdayStr = fmt(yest);
                                                                        if (df === yesterdayStr && dt === yesterdayStr) return "Yesterday";
                                                                        // Today
                                                                        if (df === todayStr && dt === todayStr) return "Today";
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
                                                                        onDateChange={(from, to) => {
                                                                            setFilters({ ...filters, dateFrom: from, dateTo: to });
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

                                                        <div className="w-px h-8 bg-black/5 mx-1 orders-toolbar-divider" />

                                                        {/* Archive Toggle */}
                                                        <button
                                                            onClick={async () => {
                                                                if (!showArchived && archivedOrders.length === 0) {
                                                                    await fetchArchivedOrders();
                                                                }
                                                                setShowArchived(!showArchived);
                                                            }}
                                                            className={cn(
                                                                "px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 border",
                                                                showArchived
                                                                    ? "bg-orange-100/50 text-orange-700 border-orange-200/50 shadow-sm"
                                                                    : "border-transparent text-muted-foreground hover:bg-amber-100/40 hover:text-foreground"
                                                            )}
                                                        >
                                                            <Archive className="w-4 h-4" />
                                                            <span className="hidden xl:inline">{showArchived ? t("orders.archived") : t("orders.archive")}</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Tools Group - NEW */}
                                                <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0">
                                                    <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.tools")}</span>
                                                    <div className="flex items-center gap-2">
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

                                                        {/* Undo Button */}
                                                        <AnimatePresence>
                                                            {canUndo && (
                                                                <motion.button
                                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    exit={{ opacity: 0, scale: 0.8 }}
                                                                    onClick={async () => { await undoLastAction(); }}
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
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setIsImportModalOpen(true)}
                                                            className="p-2.5 rounded-xl text-muted-foreground hover:bg-amber-200/60 hover:text-foreground transition-all duration-300"
                                                            title="Import"
                                                        >
                                                            <Upload className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setIsExportModalOpen(true)}
                                                            className="p-2.5 rounded-xl text-muted-foreground hover:bg-amber-200/60 hover:text-foreground transition-all duration-300"
                                                            title="Export"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={handlePrimeExport}
                                                            className="p-2.5 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 shadow-lg shadow-slate-900/20 transition-all duration-300 flex items-center gap-2"
                                                            title="Ship"
                                                        >
                                                            <Truck className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Action Group - Moved to End */}
                                                <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0 min-w-min">
                                                    <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.actions")}</span>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setIsCreateModalOpen(true)}
                                                            className="group relative px-4 py-2.5 rounded-xl bg-foreground text-background hover:bg-foreground/90 dark:bg-[var(--primary)] dark:text-[var(--primary-fg)] dark:hover:bg-[var(--primary)] dark:shadow-[0_0_15px_rgba(239,255,0,0.3)] dark:hover:shadow-[0_0_20px_rgba(239,255,0,0.5)] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                                                        >
                                                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                                            <div className="relative flex items-center gap-2 font-bold text-sm">
                                                                <Plus className="w-4 h-4" />
                                                                <span className="whitespace-nowrap hidden lg:inline">{t("orders.newOrder")}</span>
                                                                <span className="whitespace-nowrap lg:hidden">{t("orders.newOrderShort")}</span>
                                                            </div>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>

                                        {/* Saved Views Tabs */}
                                        {/* Old Saved Views Location Removed */}

                                        {/* Collapsible Analytics Panel */}
                                        <AnimatePresence>
                                            {analyticsLevel >= 1 && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    transition={{ duration: 0.3 }}
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
                                                                            <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">New</span>
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
                                                                            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Contacted</span>
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
                                                                            <span className="text-xs font-bold text-violet-600 uppercase tracking-wider">Confirmed</span>
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
                                                                            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">Transit</span>
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
                                                                            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Conversion</span>
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
                                                                        <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">Operational Velocity</h4>
                                                                        <div className="space-y-4 relative z-10">
                                                                            <div className="flex justify-between items-center">
                                                                                <span className="text-sm text-foreground/70">Confirm Speed</span>
                                                                                <span className="font-bold text-foreground">{stats.velocityMetrics.avgNewToConfirmed}</span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center">
                                                                                <span className="text-sm text-foreground/70">Delivery Speed</span>
                                                                                <span className="font-bold text-foreground">{stats.velocityMetrics.avgConfirmedToDelivered}</span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100">
                                                                                <span className="text-sm text-foreground/70">Peak Hour</span>
                                                                                <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{stats.peakTime}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Needs Attention */}
                                                                    <div className="pastel-card p-5 relative overflow-hidden group">
                                                                        <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                                                            <AlertTriangle className="w-16 h-16 text-red-500 -rotate-12" />
                                                                        </div>
                                                                        <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">Needs Attention</h4>
                                                                        <div className="space-y-4 relative z-10">
                                                                            <div className="flex justify-between items-center group/item hover:bg-rose-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, riskLevel: 'flagged' })}>
                                                                                <div className="flex items-center gap-2">
                                                                                    <ShieldCheck className="w-4 h-4 text-rose-600" />
                                                                                    <span className="text-sm text-foreground/70">Flagged</span>
                                                                                </div>
                                                                                <span className="font-bold text-rose-600">{flaggedCount}</span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center group/item hover:bg-red-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, priority: 'urgent' })}>
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                                                                    <span className="text-sm text-foreground/70">Urgent</span>
                                                                                </div>
                                                                                <span className="font-bold text-red-600">{stats.urgentOrders}</span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center group/item hover:bg-orange-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, status: 'no_response' })}>
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="w-2 h-2 rounded-full bg-orange-400" />
                                                                                    <span className="text-sm text-foreground/70">No Response</span>
                                                                                </div>
                                                                                <span className="font-bold text-orange-600">{stats.noResponseOrders}</span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100 group/item hover:bg-yellow-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, status: 'return_pending' })}>
                                                                                <span className="text-sm text-foreground/70">Returns Pending</span>
                                                                                <span className="font-bold text-yellow-600">{stats.returnPendingOrders}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Business Pulse */}
                                                                    <div className="pastel-card p-5 relative overflow-hidden group">
                                                                        <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                                                            <BarChart3 className="w-16 h-16 text-emerald-500 rotate-6" />
                                                                        </div>
                                                                        <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">Business Pulse (Today)</h4>
                                                                        <div className="space-y-4 relative z-10">
                                                                            <div className="flex justify-between items-center">
                                                                                <span className="text-sm text-foreground/70">Revenue</span>
                                                                                <span className="font-bold text-emerald-600">{formatIQD(stats.todayRevenue)}</span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center">
                                                                                <span className="text-sm text-foreground/70">Orders</span>
                                                                                <span className="font-bold text-foreground">{stats.todayOrders}</span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100">
                                                                                <span className="text-sm text-foreground/70">Avg. Order Value</span>
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

                                        {/* Filters & Search Bar */}
                                        <AnimatePresence>
                                            {showSearchBar && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    transition={{ duration: 0.3 }}
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
                                                                inputClassName="w-full pl-12 pr-14 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition-all dark:focus:ring-[rgba(0,255,255,0.4)] dark:focus:border-[rgba(0,255,255,0.5)] dark:focus:shadow-[0_0_15px_rgba(0,255,255,0.1)]"
                                                            />
                                                            {/* Sort dropdown removed in favor of column sorting */}
                                                        </div>

                                                        {!isMobile && (
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
                                                                                <label className="text-xs text-muted font-medium block mb-1.5">City</label>
                                                                                <div className="relative">
                                                                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                                                    <select
                                                                                        value={filters.city || ""}
                                                                                        onChange={(e) => setFilters({ ...filters, city: e.target.value || undefined })}
                                                                                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all appearance-none cursor-pointer"
                                                                                    >
                                                                                        <option value="">All Cities</option>
                                                                                        {availableCities.map((city) => (
                                                                                            <option key={city} value={city}>{city}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                                                                </div>
                                                                            </div>

                                                                            {/* Product Filter */}
                                                                            <div>
                                                                                <label className="text-xs text-muted font-medium block mb-1.5">Product</label>
                                                                                <div className="relative">
                                                                                    <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                                                    <select
                                                                                        value={filters.product || ""}
                                                                                        onChange={(e) => setFilters({ ...filters, product: e.target.value || undefined })}
                                                                                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all appearance-none cursor-pointer"
                                                                                    >
                                                                                        <option value="">All Products</option>
                                                                                        {availableProducts.map((product) => (
                                                                                            <option key={product} value={product}>{product}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                                                                </div>
                                                                            </div>

                                                                            {/* Payment Status Filter */}
                                                                            <div>
                                                                                <label className="text-xs text-muted font-medium block mb-1.5">Payment</label>
                                                                                <div className="relative">
                                                                                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                                                    <select
                                                                                        value={filters.paymentStatus || ""}
                                                                                        onChange={(e) => setFilters({ ...filters, paymentStatus: (e.target.value as PaymentStatus) || undefined })}
                                                                                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all appearance-none cursor-pointer"
                                                                                    >
                                                                                        <option value="">All Payments</option>
                                                                                        <option value="cod">Cash on Delivery</option>
                                                                                        <option value="prepaid">Prepaid (Digital)</option>
                                                                                        <option value="pending">Pending</option>
                                                                                        <option value="partial">Partial</option>
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
                                                                                            <p className="text-xs text-muted">No saved filters. Apply filters then save them here.</p>
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
                                                                    className="flex items-center gap-3 pt-4 border-t border-[var(--card-border)] overflow-x-auto scrollbar-hide"
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
                                                                            selectedOrders.forEach(id => updateOrderStatus(id, "suspended", "Bulk action"));
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
                                                isMobile={true}
                                            />
                                        )}

                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Orders List */}
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
                                        onViewDetails={(order) => {
                                            setSelectedOrder(order);
                                            setIsModalOpen(true);
                                        }}
                                        isBlacklisted={isBlacklisted}
                                        messageTemplates={messageTemplates}
                                    />
                                ) : (
                                    <>
                                        {/* Cards View */}
                                        {(viewMode === "cards" || viewMode === "list") && (
                                            <>
                                                {displayedOrders.length === 0 ? (
                                                    <EmptyState
                                                        type={(filters.status as any) || "all"}
                                                        searchQuery={filters.searchQuery}
                                                        hasFilters={!!(filters.dateFrom || filters.dateTo || filters.city || filters.product || filters.priority)}
                                                    />
                                                ) : compactView >= 1 && compactGrid ? (
                                                    /* Grid layout for compact views */
                                                    <div className={cn(
                                                        "grid gap-2",
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
                                                                    onViewDetails={(o: any) => {
                                                                        setSelectedOrder(o);
                                                                        setIsModalOpen(true);
                                                                    }}
                                                                    onSplit={() => setSplitOrderDialog({ open: true, order })}
                                                                    isBlacklisted={isBlacklisted(order.phone)}
                                                                    riskLevel={getRiskLevel(order.phone)}
                                                                    riskAssessment={getAssessment(order.phone)}
                                                                    customerOrderCount={orderCount}
                                                                    archivedOrderCount={getCustomerArchivedCount(order.phone)}
                                                                    previousOrder={previousOrder}
                                                                    onMergeWithPrevious={async (keepId: string, archiveId: string) => {
                                                                        await mergeOrders(keepId, archiveId);
                                                                    }}
                                                                    onShowDuplicates={(o: any) => {
                                                                        setDuplicateOrder(o);
                                                                        setShowDuplicateModal(true);
                                                                    }}
                                                                    hasDuplicates={hasDuplicates(order.id)}
                                                                    getCustomerOrderCount={(phone: string) => getCustomerOrderCount(phone, order.order_id)}
                                                                    onTogglePin={(id: string) => togglePin(id)}
                                                                    onClone={(o: any) => cloneOrder(o)}
                                                                    onScreenshot={() => setScreenshotOrder(order)}
                                                                    onCancelWithReason={(o: any) => {
                                                                        setOrderToCancel(o);
                                                                        setCancelDialogOpen(true);
                                                                    }}
                                                                    onRejectWithReason={(o: any) => {
                                                                        setOrderToReject(o);
                                                                        setRejectDialogOpen(true);
                                                                    }}
                                                                    onToggleReviewed={toggleReviewed}
                                                                    returnOrderInfo={getReturnOrderInfo(order.id)}
                                                                    originalOrderInfo={getOriginalOrderInfo(order.original_order_id)}
                                                                    compact={compactView}
                                                                    actionDock={actionDock}
                                                                    gridMode={true}
                                                                    onOpenTemplatePanel={(o: any) => {
                                                                        setOrderForTemplate(o);
                                                                        setTemplatePanelOpen(true);
                                                                    }}
                                                                    messageTemplates={workflowTemplates}
                                                                    isSelected={selectedOrders.has(order.id)}
                                                                    onToggleSelection={toggleOrderSelection}
                                                                    assignments={assignments.filter(a => a.order_id === order.id)}
                                                                    onAssignDuty={handleAssignDuty}
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
                                                        onViewDetails={(o) => {
                                                            setSelectedOrder(o);
                                                            setIsModalOpen(true);
                                                        }}
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
                                                        getRiskAssessment={getAssessment}
                                                        getCustomerOrderCount={getCustomerOrderCount}
                                                        getCustomerArchivedCount={getCustomerArchivedCount}
                                                        getCustomerHistory={getCustomerHistory}
                                                        getReturnOrderInfo={getReturnOrderInfo}
                                                        getOriginalOrderInfo={getOriginalOrderInfo}
                                                        compactView={compactView}
                                                        actionDock={actionDock}
                                                        getRiskLevel={getRiskLevel}
                                                        hasDuplicates={hasDuplicates}
                                                        onSplitOrder={(order) => setSplitOrderDialog({ open: true, order })}
                                                        assignments={assignments}
                                                        onAssignDuty={handleAssignDuty}
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
                                                                        onViewDetails={(o) => {
                                                                            setSelectedOrder(o);
                                                                            setIsModalOpen(true);
                                                                        }}
                                                                        onSplit={() => setSplitOrderDialog({ open: true, order })}
                                                                        isBlacklisted={isBlacklisted(order.phone)}
                                                                        riskLevel={getRiskLevel(order.phone)}
                                                                        riskAssessment={getAssessment(order.phone)}
                                                                        customerOrderCount={orderCount}
                                                                        archivedOrderCount={getCustomerArchivedCount(order.phone)}
                                                                        previousOrder={previousOrder}
                                                                        onMergeWithPrevious={async (keepId: string, archiveId: string) => {
                                                                            await mergeOrders(keepId, archiveId);
                                                                        }}
                                                                        onShowDuplicates={(o: any) => {
                                                                            setDuplicateOrder(o);
                                                                            setShowDuplicateModal(true);
                                                                        }}
                                                                        onTogglePin={togglePin}
                                                                        onCloneOrder={cloneOrder}
                                                                        onScreenshot={setScreenshotOrder}
                                                                        onCancelWithReason={(o: any) => {
                                                                            setOrderToCancel(o);
                                                                            setCancelDialogOpen(true);
                                                                        }}
                                                                        onRejectWithReason={(o: any) => {
                                                                            setOrderToReject(o);
                                                                            setRejectDialogOpen(true);
                                                                        }}
                                                                        onToggleReviewed={toggleReviewed}
                                                                        returnOrderInfo={getReturnOrderInfo(order.id)}
                                                                        originalOrderInfo={getOriginalOrderInfo(order.original_order_id)}
                                                                        compact={compactView}
                                                                        actionDock={actionDock}
                                                                        isVirtualized={false}
                                                                        onOpenTemplatePanel={(o: any) => {
                                                                            setOrderForTemplate(o);
                                                                            setTemplatePanelOpen(true);
                                                                        }}
                                                                        messageTemplates={workflowTemplates}
                                                                        isSelected={selectedOrders.has(order.id)}
                                                                        onToggleSelection={toggleOrderSelection}
                                                                        assignments={assignments.filter(a => a.order_id === order.id)}
                                                                        onAssignDuty={handleAssignDuty}
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
                                                setSelectedOrder={setSelectedOrder}
                                                setIsModalOpen={setIsModalOpen}
                                                phoneCounts={phoneCounts}
                                                setDuplicateOrder={setDuplicateOrder}
                                                setShowDuplicateModal={setShowDuplicateModal}
                                                modePrice={modePrice}
                                                updateOrderStatus={updateOrderStatus}
                                                getRiskLevel={getRiskLevel}
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
                        </div >

                        {/* Modals */}
                        <OrderDetailsModal
                            order={selectedOrder}
                            open={isModalOpen}
                            onClose={() => {
                                setIsModalOpen(false);
                                setSelectedOrder(null);
                            }}
                            onUpdate={updateOrder}
                            onStatusUpdate={updateOrderStatus}
                            onGetTimeline={getOrderTimeline}
                            onGetNotes={getOrderNotes}
                            onAddNote={addOrderNote}
                            onDelete={deleteOrder}
                            onCreateReturn={createReturnOrder}
                            checkOrderIdExists={checkOrderIdExists}
                            assignments={selectedOrder ? assignments.filter(a => a.order_id === selectedOrder.id) : []}
                            onAssignDuty={handleAssignDuty}
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
                        />

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
                        {orderForTemplate && (
                            <WhatsAppTemplatePanel
                                open={templatePanelOpen}
                                onClose={() => {
                                    setTemplatePanelOpen(false);
                                    setOrderForTemplate(null);
                                }}
                                order={orderForTemplate}
                                templates={workflowTemplates}
                            />
                        )}

                        <FloatingActionBar
                            selectedCount={selectedOrders.size}
                            onConfirm={handleBulkConfirm}
                            onReject={handleBulkReject}
                            onArchive={handleBulkArchive}
                            onDelete={handleBulkDelete}
                        />


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
                            allOrders={orders}
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
                            onConfirm={async (reason) => {
                                if (orderToCancel) {
                                    await handleStatusUpdate(orderToCancel.id, "cancelled", reason);
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
                            onConfirm={async (reason) => {
                                if (orderToReject) {
                                    await handleStatusUpdate(orderToReject.id, "rejected", reason);
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
                                if (!open) setDeleteConfirmText("");
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
                                <div className="py-4">
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        {t("orders.deleteConfirm.label")}
                                    </label>
                                    <input
                                        type="text"
                                        value={deleteConfirmText}
                                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                                        placeholder="DELETE"
                                        className="w-full px-3 py-2 border border-[var(--card-border)] rounded-xl bg-[var(--background)] text-foreground focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                        autoFocus
                                        disabled={isDeleting}
                                    />
                                </div>
                                <DialogFooter>
                                    <button
                                        onClick={() => {
                                            setDeleteConfirmOpen(false);
                                            setDeleteConfirmText("");
                                        }}
                                        disabled={isDeleting}
                                        className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                                    >
                                        {t("common.cancel")}
                                    </button>
                                    <button
                                        onClick={executeDelete}
                                        disabled={deleteConfirmText !== "DELETE" || isDeleting}
                                        className={cn(
                                            "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                            deleteConfirmText === "DELETE" && !isDeleting
                                                ? "bg-red-600 text-white hover:bg-red-700"
                                                : "bg-red-200 text-red-400 cursor-not-allowed"
                                        )}
                                    >
                                        {isDeleting ? t("common.deleting") : t("orders.deleteConfirm.button").replace("{count}", String(selectedOrders.size))}
                                    </button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                    </div >
                </motion.div>
            )}
        </AnimatePresence>
    );
}
