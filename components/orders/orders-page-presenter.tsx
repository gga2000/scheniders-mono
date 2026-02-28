
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderBulkActions } from "@/hooks/use-order-bulk-actions";

import { useProductsCrud } from "@/hooks/use-products-crud";
import { useDebounce } from "@/hooks/use-debounce";
import { Order, PaymentStatus } from "@/lib/supabase";
import { validatePhoneDetailed, normalizePhoneForSearch } from "@/lib/order-utils";
import { isOrderFlagged } from "@/lib/data-quality-utils";
import { OrderCard } from "@/components/dashboard/order-card";
import { SwipeableOrderCard } from "@/components/dashboard/swipeable-order-card";
import { OrderCardSkeleton } from "@/components/dashboard/order-card-skeleton";
import { OrderAssignment, mockAssignments } from "@/lib/team-types";
import { useBatchRiskAssessment } from "@/hooks/use-risk-assessment";
import { RiskBadge } from "@/components/orders/risk-badge";
const OrderDetailsModal = dynamic(
    () => import("@/components/orders/order-details-modal").then(mod => ({ default: mod.OrderDetailsModal })),
    { ssr: false }
);
const CreateOrderModal = dynamic(
    () => import("@/components/orders/create-order-modal").then(mod => ({ default: mod.CreateOrderModal })),
    { ssr: false }
);
// Dynamic imports for other heavy components
import { FloatingActionBar } from "@/components/orders/floating-action-bar";
import { WorkflowTabs } from "@/components/orders/workflow-tabs";
const DuplicateComparisonModal = dynamic(
    () => import("@/components/orders/duplicate-comparison-modal").then(mod => ({ default: mod.DuplicateComparisonModal })),
    { ssr: false }
);
const ImportOrdersModal = dynamic(
    () => import("@/components/orders/import-orders-modal").then(mod => ({ default: mod.ImportOrdersModal })),
    { ssr: false }
);
const ExportReportModal = dynamic(
    () => import("@/components/orders/export-report-modal").then(mod => ({ default: mod.ExportReportModal })),
    { ssr: false }
);
const WhatsAppTemplatePanel = dynamic(
    () => import("@/components/orders/whatsapp-template-panel").then(mod => ({ default: mod.WhatsAppTemplatePanel })),
    { ssr: false }
);
const SplitOrderDialog = dynamic(
    () => import("@/components/orders/split-order-dialog").then(mod => ({ default: mod.SplitOrderDialog })),
    { ssr: false }
);
const VirtualizedOrderList = dynamic(
    () => import("@/components/orders/virtualized-order-list").then(mod => ({ default: mod.VirtualizedOrderList })),
    { ssr: false }
);

import { DateRangePicker } from "@/components/ui/date-range-picker";
import { EmptyState } from "@/components/ui/empty-states";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
import { SavedViewsTabs } from "@/components/orders/saved-views-tabs";
import { OrderConfirmationCard } from "@/components/orders/order-confirmation-card";
import { CancellationReasonDialog } from "@/components/orders/cancellation-reason-dialog";
import { StickyFilterBar } from "@/components/orders/sticky-filter-bar";
import { VirtualizedOrderTable } from "@/components/orders/virtualized-order-table";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { BackupPrompt } from "@/components/vault/backup-prompt";
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
    Calendar,
    CalendarDays,
    Filter,
    X,
    BarChart3,
    ChevronUp,
    Bookmark,
    Save,
    Trash2,
    LayoutGrid,
    Table,
    Columns,
    Bell,
    BellOff,
    List,
    GitBranch,
    Eye,
    EyeOff,
    SlidersHorizontal,
    LayoutList,
    Layers,
    Rows3,
    Archive,
    RotateCcw,
    TrendingUp,
    TrendingDown,
    ArrowUp,
    ArrowDown,
    Filter as FilterIcon,
    Pin,
    CopyPlus,
    Check,
    ShieldCheck,
    Minimize2,
    Maximize2,
    Command,
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
import { evaluateAutoAssignments } from "@/lib/assignment-engine";
import { mockAssignmentRules } from "@/lib/team-types";
import { exportOrdersToPrimeCSV } from "@/lib/export-utils";
import { toast } from "@/hooks/use-toast";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { useLanguage } from "@/hooks/use-language";


export interface OrdersPagePresenterProps {
    orders: any[];
    filteredOrders: any[];
    displayedOrders: any[];
    archivedOrders: any[];
    assignments: any[];
    loading: boolean;
    error: Error | null;
    availableCities: string[];
    availableProducts: string[];
    statusCounts: Record<string, number>;
    phoneCounts: Map<string, number>;
    groupedOrders: Record<string, any[]>;
    stats: any;
    totalRiskCount: number;
    flaggedCount: number;
    workflowTemplates: any[];
    messageTemplates: any[];

    isMobile: boolean;
    realtimeVersion: number;
    metricsVersion: number;
    activePresetId: string | null;
    setActivePresetId: (id: string | null) => void;

    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    selectedOrder: any | null;
    setSelectedOrder: (order: any | null) => void;
    isCreateModalOpen: boolean;
    setIsCreateModalOpen: (open: boolean) => void;
    workflowMode: boolean;
    toggleWorkflowMode: () => void;
    setWorkflowMode: (mode: boolean) => void;
    viewMode: "list" | "cards" | "table";
    setViewMode: (mode: "cards" | "table") => void;
    compactView: 0 | 1 | 2;
    setCompactView: (val: 0 | 1 | 2) => void;
    compactGrid: boolean;
    setCompactGrid: (val: boolean) => void;
    actionDock: boolean;
    setActionDock: (val: boolean) => void;
    showFilters: boolean;
    setShowFilters: (open: boolean) => void;
    showSearchBar: boolean;
    setShowSearchBar: (open: boolean) => void;
    isFilterPanelAnimating: boolean;
    setIsFilterPanelAnimating: (val: boolean) => void;
    toolbarCollapsed: boolean;
    setToolbarCollapsed: (val: boolean) => void;
    isHeaderAnimating: boolean;
    setIsHeaderAnimating: (val: boolean) => void;
    showArchived: boolean;
    setShowArchived: (val: boolean) => void;
    analyticsLevel: 0 | 1 | 2;
    setAnalyticsLevel: (val: 0 | 1 | 2) => void;
    notificationsEnabled: boolean;
    setNotificationsEnabled: (val: boolean) => void;
    soundEnabled: boolean;
    setSoundEnabled: (val: boolean) => void;
    showDuplicateModal: boolean;
    setShowDuplicateModal: (val: boolean) => void;
    duplicateOrder: any | null;
    setDuplicateOrder: (order: any | null) => void;
    showDatePicker: boolean;
    setShowDatePicker: (val: boolean) => void;
    datePickerPos: { top: number; left: number };
    setDatePickerPos: (pos: { top: number; left: number }) => void;
    dateButtonRef: React.RefObject<HTMLButtonElement>;
    datePickerRef: React.RefObject<HTMLDivElement>;
    isExportModalOpen: boolean;
    setIsExportModalOpen: (val: boolean) => void;
    isImportModalOpen: boolean;
    setIsImportModalOpen: (val: boolean) => void;
    templatePanelOpen: boolean;
    setTemplatePanelOpen: (val: boolean) => void;
    orderForTemplate: any | null;
    setOrderForTemplate: (order: any | null) => void;
    splitOrderDialog: { open: boolean, order: any | null };
    setSplitOrderDialog: (val: { open: boolean, order: any | null }) => void;
    screenshotOrder: any | null;
    setScreenshotOrder: (order: any | null) => void;
    cancelDialogOpen: boolean;
    setCancelDialogOpen: (val: boolean) => void;
    orderToCancel: any | null;
    setOrderToCancel: (order: any | null) => void;
    rejectDialogOpen: boolean;
    setRejectDialogOpen: (val: boolean) => void;
    orderToReject: any | null;
    setOrderToReject: (order: any | null) => void;

    filters: any;
    setFilters: (filters: any | ((prev: any) => any)) => void;
    localSearchQuery: string;
    setLocalSearchQuery: (q: string) => void;
    clearFilters: () => void;
    hasActiveFilters: boolean;
    filterPresets: any[];
    showPresets: boolean;
    setShowPresets: (val: boolean) => void;
    newPresetName: string;
    setNewPresetName: (name: string) => void;
    saveFilterPreset: (name: string) => any;
    loadFilterPreset: (id: string) => void;
    deleteFilterPreset: (id: string) => void;
    groupBy: "none" | "status" | "city" | "verified";
    setGroupBy: (val: "none" | "status" | "city" | "verified") => void;
    filterDuplicatesOnly: boolean;
    setFilterDuplicatesOnly: (val: boolean) => void;
    columnFilters: Record<string, string>;
    setColumnFilters: (filters: Record<string, string>) => void;
    openFilterColumn: string | null;
    setOpenFilterColumn: (val: string | null) => void;

    sortConfig: { key: string; direction: "asc" | "desc" } | null;
    toggleSort: (key: string) => void;

    loadingId: string | null;
    selectedOrders: Set<string>;
    selectAll: () => void;
    toggleOrderSelection: (orderId: string) => void;
    handleBulkConfirm: () => void;
    handleBulkDeliver: () => void;
    handleBulkReject: () => void;
    handleBulkArchive: () => void;
    handleBulkDelete: () => void;
    handleBulkNew: () => void;
    handleBulkContacted: () => void;
    handleBulkInTransit: () => void;
    handleBulkCompleted: () => void;
    handleBulkNoResponse: () => void;
    handlePrimeExport: () => void;
    handleManualSync: () => void;
    handleStatusUpdate: (orderId: string, newStatus: string, reason?: string) => Promise<boolean>;
    undoLastAction: () => Promise<void>;
    canUndo: boolean;
    isSyncing: boolean;
    fetchArchivedOrders: () => Promise<void>;
    updateOrderStatus: (orderId: string, status: string, notes?: string) => Promise<{ success: boolean; error?: any; }>;
    updateOrder: (orderId: string, updates: Partial<any>) => Promise<{ success: boolean; error?: any; }>;
    createOrder: (orderData: Partial<any>) => Promise<{ success: boolean; data?: any; error?: any; }>;
    deleteOrder: (orderId: string) => Promise<{ success: boolean; error?: any; }>;
    cloneOrder: (order: any) => Promise<{ success: boolean; error?: any; }>;
    togglePin: (orderId: string) => Promise<{ success: boolean; error?: any; }>;
    getOrderTimeline: (orderId: string) => Promise<any[]>;
    getOrderNotes: (orderId: string) => Promise<any[]>;
    addOrderNote: (orderId: string, noteText: string) => Promise<{ success: boolean; error?: any; }>;
    checkOrderIdExists: (orderId: string) => Promise<boolean>;
    handleSplitOrder: (keptItems: any[], returnedItems: any[]) => Promise<void>;
    createReturnOrder: (orderId: string, data: { return_amount: number; reason: string; deductDeliveryFee?: boolean }) => Promise<{ success: boolean; error?: string }>;
    mergeOrders: (targetId: string, sourceId: string) => Promise<{ success: boolean; error?: any; }>;
    markAsVerifiedCustomer: (orderId: string) => Promise<{ success: boolean; error?: any; }>;
    dismissDuplicate: (phone: string, notes?: string) => Promise<{ success: boolean; error?: any; }>;
    handleAssignDuty: (orderId: string, duty: any, employeeId: string) => void;
    toggleReviewed: (orderId: string) => Promise<{ success: boolean; error?: any; }>;

    getCustomerHistory: (phone: string) => any[];
    getCustomerOrderCount: (phone: string, currentOrderId: string) => number;
    getCustomerArchivedCount: (phone: string) => number;
    getRiskLevel: (phone: string) => "high" | "medium" | "low";
    getAssessment: (phone: string) => any;
    isBlacklisted: (phone: string) => boolean;
    hasDuplicates: (orderId: string) => boolean;
    getReturnOrderInfo: (id: string) => any;
    getOriginalOrderInfo: (originalOrderId?: string) => any;
    getCustomerOrders: (phone: string) => any[];
    modePrice: number;
    normalizePhoneForSearch: (phone: string) => string;
}

export function OrdersPagePresenter(props: OrdersPagePresenterProps) {
    const { t } = useLanguage();
    const {
        orders, filteredOrders, displayedOrders, archivedOrders, assignments, loading, error, availableCities, availableProducts,
        statusCounts, phoneCounts, groupedOrders, stats, totalRiskCount, flaggedCount, workflowTemplates, messageTemplates,
        isMobile, realtimeVersion, metricsVersion, activePresetId, setActivePresetId, isModalOpen, setIsModalOpen,
        selectedOrder, setSelectedOrder, isCreateModalOpen, setIsCreateModalOpen, workflowMode, toggleWorkflowMode, setWorkflowMode,
        viewMode, setViewMode, compactView, setCompactView, compactGrid, setCompactGrid, actionDock, setActionDock, showFilters,
        setShowFilters, showSearchBar, setShowSearchBar, isFilterPanelAnimating, setIsFilterPanelAnimating, toolbarCollapsed,
        setToolbarCollapsed, isHeaderAnimating, setIsHeaderAnimating, showArchived, setShowArchived, analyticsLevel, setAnalyticsLevel,
        notificationsEnabled, setNotificationsEnabled, soundEnabled, setSoundEnabled, showDuplicateModal, setShowDuplicateModal,
        duplicateOrder, setDuplicateOrder, showDatePicker, setShowDatePicker, datePickerPos, setDatePickerPos, dateButtonRef,
        datePickerRef, isExportModalOpen, setIsExportModalOpen, isImportModalOpen, setIsImportModalOpen, templatePanelOpen,
        setTemplatePanelOpen, orderForTemplate, setOrderForTemplate, splitOrderDialog, setSplitOrderDialog, screenshotOrder,
        setScreenshotOrder, cancelDialogOpen, setCancelDialogOpen, orderToCancel, setOrderToCancel, rejectDialogOpen, setRejectDialogOpen,
        orderToReject, setOrderToReject, filters, setFilters, localSearchQuery, setLocalSearchQuery, clearFilters, hasActiveFilters,
        filterPresets, showPresets, setShowPresets, newPresetName, setNewPresetName, saveFilterPreset, loadFilterPreset, deleteFilterPreset,
        groupBy, setGroupBy, filterDuplicatesOnly, setFilterDuplicatesOnly, columnFilters, setColumnFilters, openFilterColumn, setOpenFilterColumn,
        sortConfig, toggleSort, loadingId, selectedOrders, selectAll, toggleOrderSelection, handleBulkConfirm, handleBulkDeliver,
        handleBulkReject, handleBulkArchive, handleBulkDelete, handleBulkNew, handleBulkContacted, handleBulkInTransit, handleBulkCompleted,
        handleBulkNoResponse, handlePrimeExport, handleManualSync, handleStatusUpdate, undoLastAction, canUndo, isSyncing, fetchArchivedOrders,
        updateOrderStatus, updateOrder, createOrder, deleteOrder, cloneOrder, togglePin, getOrderTimeline, getOrderNotes, addOrderNote,
        checkOrderIdExists, handleSplitOrder, createReturnOrder, mergeOrders, markAsVerifiedCustomer, dismissDuplicate, handleAssignDuty,
        toggleReviewed, getCustomerHistory, getCustomerOrderCount, getCustomerArchivedCount, getRiskLevel, getAssessment, isBlacklisted,
        hasDuplicates, getReturnOrderInfo, getOriginalOrderInfo, getCustomerOrders, modePrice, normalizePhoneForSearch
    } = props;

    const toggleToolbarCollapse = React.useCallback(() => {
        setToolbarCollapsed(!toolbarCollapsed);
        localStorage.setItem("ordersToolbarCollapsed", String(!toolbarCollapsed));
    }, [toolbarCollapsed, setToolbarCollapsed]);


    return (
        <PageTransition>
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
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-subtle)]" />
                                            <input
                                                type="text"
                                                placeholder="Search orders..."
                                                value={localSearchQuery}
                                                onChange={(e) => setLocalSearchQuery(e.target.value)}
                                                className="w-full pl-10 pr-12 py-2.5 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                            />
                                            {localSearchQuery && (
                                                <button
                                                    onClick={() => setFilters((prev: any) => ({ ...prev, searchIncludesArchive: !prev.searchIncludesArchive }))}
                                                    className={cn(
                                                        "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all",
                                                        filters.searchIncludesArchive
                                                            ? "bg-orange-100 text-orange-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                            : "text-muted-foreground hover:bg-amber-100/40"
                                                    )}
                                                    title="Include Archive in Search"
                                                >
                                                    <Archive className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
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
                                                            viewMode === v.mode
                                                                ? "bg-white text-foreground shadow-sm dark:bg-[var(--primary)] dark:text-black dark:shadow-[0_0_8px_rgba(239,255,0,0.2)] ring-1 ring-black/5"
                                                                : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        <v.icon className="w-4 h-4" />
                                                    </button>
                                                ))}

                                                {/* Compact Toggle */}
                                                {!workflowMode && viewMode === "cards" && (
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
                                                {!workflowMode && viewMode === "cards" && compactView >= 1 && (
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
                                                                : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                        )}
                                                        title={compactGrid ? "Grid View" : "Switch to Grid"}
                                                    >
                                                        <LayoutGrid className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {/* Action Dock Toggle */}
                                                {!workflowMode && viewMode === "cards" && (
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
                                                                : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
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
                                        <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-sm orders-toolbar-group flex-shrink-0">
                                            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.filter")}</span>
                                            <div className="flex items-center gap-2">
                                                {/* Date Picker */}
                                                <div>
                                                    <button
                                                        ref={dateButtonRef}
                                                        onClick={() => setShowDatePicker(!showDatePicker)}
                                                        className={cn(
                                                            "px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 border",
                                                            (filters.dateFrom || filters.dateTo)
                                                                ? "bg-[var(--pastel-yellow)] border-[var(--primary)]/30 text-amber-900 shadow-sm dark:bg-[#EFFF00]/20 dark:border-[#EFFF00]/40 dark:text-[#EFFF00]"
                                                                : "border-white/10 text-muted-foreground hover:bg-[var(--pastel-yellow)] hover:border-[var(--primary)]/20 hover:text-foreground dark:hover:bg-[#EFFF00]/10 dark:hover:text-[#EFFF00] dark:border-white/10"
                                                        )}
                                                    >
                                                        <CalendarDays className="w-4 h-4" />
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
                                                            className="fixed z-[9999] p-2 bg-[var(--card-bg)] dark:bg-[#1a1a2e] backdrop-blur-xl shadow-2xl rounded-3xl border border-[var(--card-border)] dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5 orders-date-popover"
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
                                                            className="p-2.5 rounded-xl bg-amber-100/50 text-amber-700 hover:bg-amber-100 transition-all shadow-sm"
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
                                                    <div className="relative flex-1">
                                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--foreground-subtle)]" />
                                                        <input
                                                            type="text"
                                                            placeholder={t("orders.searchPlaceholder")}
                                                            value={localSearchQuery}
                                                            onChange={(e) => setLocalSearchQuery(e.target.value)}
                                                            className="w-full pl-12 pr-14 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition-all dark:focus:ring-[rgba(0,255,255,0.4)] dark:focus:border-[rgba(0,255,255,0.5)] dark:focus:shadow-[0_0_15px_rgba(0,255,255,0.1)]"
                                                        />
                                                        {localSearchQuery && (
                                                            <button
                                                                onClick={() => setFilters((prev: any) => ({ ...prev, searchIncludesArchive: !prev.searchIncludesArchive }))}
                                                                className={cn(
                                                                    "absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all flex items-center gap-2",
                                                                    filters.searchIncludesArchive
                                                                        ? "bg-orange-100 text-orange-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                                        : "text-muted-foreground hover:bg-amber-100/40"
                                                                )}
                                                                title="Include Archive in Search"
                                                            >
                                                                <Archive className="w-4 h-4" />
                                                                {!isMobile && <span className="text-xs font-bold uppercase tracking-wider">Archive</span>}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {/* Sort dropdown removed in favor of column sorting */}
                                                </div>

                                                {!isMobile && compactView < 1 ? (
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
                                                ) : null}

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
                            <ErrorBoundary name="Workflow Tabs">
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
                            </ErrorBoundary>
                        ) : (
                            <>
                                {/* List and Cards Views share the exact same logic except for the innermost wrapper */}
                                {(viewMode === "list" || viewMode === "cards") && (
                                    <ErrorBoundary name="Order List/Cards View">
                                        <div className="w-full flex flex-col">
                                            {/* Top bulk actions sticky header */}
                                            {selectedOrders.size > 0 && actionDock}

                                            {/* Filters & Actions for List View */}
                                            {compactView < 1 ? (
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
                                            ) : (
                                                /* Compact mode - just show search block */
                                                <div className="flex flex-col sm:flex-row gap-2 w-full max-w-lg mb-4">
                                                    <div className="relative group w-full sm:w-80">
                                                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-brand-primary" />
                                                        <input
                                                            autoComplete="off"
                                                            type="text"
                                                            placeholder="البحث برقم الهاتف أو اسم العميل..."
                                                            value={filters.searchQuery || ''}
                                                            onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                                                            className="w-full text-sm pl-4 pr-10 py-2 sm:py-2.5 rounded-full border border-border/50 bg-background/50 hover:bg-background/80 focus:bg-background focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all duration-300"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {displayedOrders.length === 0 ? (
                                                <EmptyState
                                                    type={(filters.status as any) || "all"}
                                                    searchQuery={filters.searchQuery}
                                                    hasFilters={!!(filters.dateFrom || filters.dateTo || filters.city || filters.product || filters.priority)}
                                                />
                                            ) : viewMode === "cards" && compactView >= 1 && compactGrid ? (
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
                                                                    const result = await mergeOrders(keepId, archiveId);
                                                                    if (!result.success) console.error('Merge failed:', result.error);
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
                                            ) : displayedOrders.length >= 50 ? (
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
                                                        const result = await mergeOrders(keepId, archiveId);
                                                        if (!result.success) {
                                                            console.error('Merge failed:', result.error);
                                                        }
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
                                                <StaggerContainer key={`orders-list-${realtimeVersion}`} className="space-y-3">
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
                                                                        const result = await mergeOrders(keepId, archiveId);
                                                                        if (!result.success) {
                                                                            console.error('Merge failed:', result.error);
                                                                        }
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
                                        </div>
                                    </ErrorBoundary>
                                )}

                                {/* Table View */}
                                {viewMode === "table" && (
                                    <ErrorBoundary name="Order Table View">
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
                                    </ErrorBoundary>
                                )}
                            </>
                        )}
                    </div>
                </div>
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
                {
                    splitOrderDialog.open && splitOrderDialog.order && (
                        <SplitOrderDialog
                            order={splitOrderDialog.order}
                            open={splitOrderDialog.open}
                            onClose={() => setSplitOrderDialog({ open: false, order: null })}
                            onConfirm={handleSplitOrder}
                        />
                    )
                }

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

            </div >
        </PageTransition>
    );
}
