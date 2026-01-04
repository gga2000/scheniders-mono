"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { Order, PaymentStatus } from "@/lib/supabase";
import { validatePhoneDetailed } from "@/lib/order-utils";
import { OrderCard } from "@/components/dashboard/order-card";
import { SwipeableOrderCard } from "@/components/dashboard/swipeable-order-card";
import { OrderCardSkeleton } from "@/components/dashboard/order-card-skeleton";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { KanbanBoard } from "@/components/orders/kanban-board";
import { FloatingActionBar } from "@/components/orders/floating-action-bar";
import { WorkflowTabs } from "@/components/orders/workflow-tabs";
import { DuplicateComparisonModal } from "@/components/orders/duplicate-comparison-modal";
import { ImportOrdersModal } from "@/components/orders/import-orders-modal";
import { WhatsAppTemplatePanel } from "@/components/orders/whatsapp-template-panel";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { EmptyState } from "@/components/ui/empty-states";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
import { SavedViewsTabs } from "@/components/orders/saved-views-tabs";
import { OrderConfirmationCard } from "@/components/orders/order-confirmation-card";
import { CancellationReasonDialog } from "@/components/orders/cancellation-reason-dialog";
import { StickyFilterBar } from "@/components/orders/sticky-filter-bar";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { notificationService } from "@/lib/notification-service";
import { exportOrdersToPrimeCSV } from "@/lib/export-utils";

export default function OrdersPage() {
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
        bulkDelete,
        exportOrders,
        createBatch,
        filterPresets,
        saveFilterPreset,
        loadFilterPreset,
        deleteFilterPreset,
        getOrderTimeline,
        getOrderNotes,
        addOrderNote,
        fetchOrders: refreshOrders,
        // Duplicate detection
        getCustomerOrderCount,
        getCustomerHistory,
        mergeOrders,
        // Pin & Clone
        togglePin,
        toggleReviewed,
        markAsVerifiedCustomer,
        cloneOrder,
        deleteOrder,
        // Archive
        archivedOrders,
        fetchArchivedOrders,
        // Undo
        undoLastAction,
        getLastUndoAction,
        canUndo,
        // Check order ID
        checkOrderIdExists,
        // Duplicate management
        getCustomerOrders,
        dismissDuplicate,
        statusCounts,
        // Message templates
        messageTemplates,
        // Realtime version (forces re-renders)
        realtimeVersion,
    } = useOrders();

    // Get products for Excel import matching
    const { products } = useProductsCrud();
    const isMobile = useIsMobile();

    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    const [groupBy, setGroupBy] = useState<'none' | 'status' | 'city' | 'verified'>('none');
    const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
    const [compactView, setCompactView] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("ordersCompactView") === "true";
        }
        return false;
    });
    const [showArchived, setShowArchived] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        if (typeof window !== "undefined") {
            return notificationService.soundEnabled;
        }
        return true;
    });
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    // State for showing filters panel
    const [showFilters, setShowFilters] = useState(false);

    // State for active saved view
    const [activePresetId, setActivePresetId] = useState<string | null>(null);

    // State for screenshot modal
    const [screenshotOrder, setScreenshotOrder] = useState<Order | null>(null);
    // State for duplicate comparison modal
    const [duplicateOrder, setDuplicateOrder] = useState<Order | null>(null);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState(false);
    // State for cancellation reason dialog
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
    // State for rejection reason dialog
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [orderToReject, setOrderToReject] = useState<Order | null>(null);
    // State for WhatsApp template panel
    const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
    const [orderForTemplate, setOrderForTemplate] = useState<Order | null>(null);
    // State for import modal
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    // Get workflow templates for the template panel
    const workflowTemplates = useMemo(() =>
        messageTemplates.filter(t =>
            t.template_type === 'confirmation' ||
            t.template_type === 'reminder' ||
            t.template_type === 'discount'
        ),
        [messageTemplates]
    );

    // 3-State Sorting Helper
    const toggleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                if (current.direction === 'asc') return { key, direction: 'desc' };
                return null; // Cycle to off
            }
            return { key, direction: 'asc' };
        });
    };

    // Helper for filter icon color
    const getFilterIconClass = (key: string) => {
        const isActive = columnFilters[key] !== undefined && columnFilters[key] !== '';
        return isActive ? "text-blue-600 opacity-100" : "text-muted opacity-0 group-hover:opacity-100";
    };

    // State for color picker dropdown
    const [colorPickerOpenId, setColorPickerOpenId] = useState<string | null>(null);
    const [showSearchBar, setShowSearchBar] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("ordersShowSearchBar") !== "false";
        }
        return true;
    });
    // Two-stage analytics: 0 = all hidden, 1 = top stats shown, 2 = all shown
    const [analyticsLevel, setAnalyticsLevel] = useState<0 | 1 | 2>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("ordersAnalyticsLevel");
            return (saved ? parseInt(saved) : 0) as 0 | 1 | 2;
        }
        return 0; // Default hidden
    });
    const [showPresets, setShowPresets] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");
    const [viewMode, setViewMode] = useState<"cards" | "table" | "kanban">(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("ordersViewMode");
            if (saved === "cards" || saved === "table" || saved === "kanban") return saved;
        }
        return "cards";
    });
    const [workflowMode, setWorkflowMode] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("ordersWorkflowMode") === "true";
        }
        return false;
    });
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(
        typeof window !== "undefined" && notificationService.isEnabled()
    );

    // Toggle workflow mode
    const toggleWorkflowMode = () => {
        const newMode = !workflowMode;
        setWorkflowMode(newMode);
        localStorage.setItem("ordersWorkflowMode", String(newMode));
    };

    // Save viewMode to localStorage when it changes
    useEffect(() => {
        localStorage.setItem("ordersViewMode", viewMode);
    }, [viewMode]);



    // Sort hook's filtered orders
    // Advanced Filtering & Sorting
    const filteredOrders = useMemo(() => {
        let result = [...hookFilteredOrders];

        // 1. Apply Column Filters
        Object.entries(columnFilters).forEach(([key, value]) => {
            if (!value) return;
            const lowerValue = value.toLowerCase();
            result = result.filter(o => {
                if (key === 'customer_name') return o.customer_name?.toLowerCase().includes(lowerValue);
                if (key === 'phone') return o.phone?.includes(lowerValue) || o.secondary_phone?.includes(lowerValue);
                if (key === 'city') return o.city?.toLowerCase().includes(lowerValue);
                if (key === 'address_details') return (o.address_details?.toLowerCase().includes(lowerValue)) || (o.city?.toLowerCase().includes(lowerValue));
                if (key === 'order_id') return o.order_id?.toLowerCase().includes(lowerValue) || String(o.sequence_number).includes(lowerValue);
                return true;
            });
        });

        // 1.5. Apply Duplicates-Only Filter
        if (filterDuplicatesOnly) {
            result = result.filter(o => getCustomerOrderCount(o.phone) > 1);
        }

        // 2. Sort
        // 2. Sort
        result.sort((a, b) => {
            // Priority: Pinned first
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;

            if (sortConfig) {
                let aVal: any = a[sortConfig.key as keyof Order];
                let bVal: any = b[sortConfig.key as keyof Order];

                // Handle special keys
                if (sortConfig.key === 'amount') { aVal = Number(a.price); bVal = Number(b.price); }
                if (sortConfig.key === 'order_id') { aVal = a.sequence_number || a.order_id; bVal = b.sequence_number || b.order_id; }
                if (sortConfig.key === 'created_at') { aVal = new Date(a.created_at).getTime(); bVal = new Date(b.created_at).getTime(); }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            } else {
                // Default sort: Newest first
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
        });
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hookFilteredOrders, sortConfig, columnFilters, filterDuplicatesOnly, getCustomerOrderCount, realtimeVersion]);

    const handleStatusUpdate = async (orderId: string, status: Order["status"], reason?: string) => {
        setLoadingId(orderId);
        await updateOrderStatus(orderId, status, reason);
        setLoadingId(null);
    };

    const toggleOrderSelection = (orderId: string) => {
        const newSelected = new Set(selectedOrders);
        if (newSelected.has(orderId)) {
            newSelected.delete(orderId);
        } else {
            newSelected.add(orderId);
        }
        setSelectedOrders(newSelected);
    };

    const selectAll = () => {
        if (selectedOrders.size === filteredOrders.length) {
            setSelectedOrders(new Set());
        } else {
            setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
        }
    };

    // Handle bulk actions
    const handleBulkConfirm = async () => {
        const ids = Array.from(selectedOrders);
        await bulkUpdateStatus(ids, "confirmed");
        setSelectedOrders(new Set());
    };

    const handleBulkDeliver = async () => {
        const ids = Array.from(selectedOrders);
        await bulkUpdateStatus(ids, "delivered");
        setSelectedOrders(new Set());
    };

    const handleBulkReject = async () => {
        const ids = Array.from(selectedOrders);
        await bulkUpdateStatus(ids, "rejected");
        setSelectedOrders(new Set());
    };

    const handleBulkArchive = async () => {
        const ids = Array.from(selectedOrders);
        await bulkArchive(ids);
        setSelectedOrders(new Set());
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedOrders.size} orders? This action cannot be undone.`)) {
            return;
        }
        const ids = Array.from(selectedOrders);
        await bulkDelete(ids);
        setSelectedOrders(new Set());
    };

    // Additional bulk status handlers
    const handleBulkNew = async () => {
        const ids = Array.from(selectedOrders);
        await bulkUpdateStatus(ids, "new");
        setSelectedOrders(new Set());
    };

    const handleBulkContacted = async () => {
        const ids = Array.from(selectedOrders);
        await bulkUpdateStatus(ids, "contacted");
        setSelectedOrders(new Set());
    };

    const handleBulkInTransit = async () => {
        const ids = Array.from(selectedOrders);
        await bulkUpdateStatus(ids, "in_transit");
        setSelectedOrders(new Set());
    };

    const handleBulkCompleted = async () => {
        const ids = Array.from(selectedOrders);
        await bulkUpdateStatus(ids, "completed");
        setSelectedOrders(new Set());
    };

    const handleBulkNoResponse = async () => {
        const ids = Array.from(selectedOrders);
        await bulkUpdateStatus(ids, "no_response");
        setSelectedOrders(new Set());
    };

    const handleExport = () => {
        const ids = selectedOrders.size > 0
            ? Array.from(selectedOrders)
            : filteredOrders.map(o => o.id);
        exportOrders(ids, "xlsx");
    };

    const handlePrimeExport = async () => {
        const ids = selectedOrders.size > 0
            ? Array.from(selectedOrders)
            : filteredOrders.map(o => o.id);

        if (ids.length === 0) {
            notificationService.showNotification({
                title: "Error",
                body: "No orders selected for export",
            });
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
            const { success: batchSuccess } = await createBatch(
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

                notificationService.showNotification({
                    title: "Export Successful",
                    body: `${ids.length} orders exported and moved to In Transit`,
                });
            } else {
                throw new Error("Failed to create export batch");
            }
        } catch (err) {
            console.error("Prime export error:", err);
            notificationService.showNotification({
                title: "Export Failed",
                body: "Could not complete the export process",
            });
        }
    };

    // Calculate duplicate phone map for ghost detection
    const phoneCounts = useMemo(() => {
        const counts = new Map<string, number>();
        filteredOrders.forEach(o => {
            if (o.phone) counts.set(o.phone.replace(/\s/g, ''), (counts.get(o.phone.replace(/\s/g, '')) || 0) + 1);
        });
        return counts;
    }, [filteredOrders]);

    // Switch between regular and archived orders
    const displayedOrders = showArchived ? archivedOrders : filteredOrders;

    // Grouping Logic
    const groupedOrders = useMemo(() => {
        if (groupBy === 'none') return {};

        const groups: Record<string, Order[]> = {};
        displayedOrders.forEach(order => {
            let key = 'Other';
            if (groupBy === 'status') key = order.status;
            else if (groupBy === 'city') key = order.city || 'Unknown';
            else if (groupBy === 'verified') key = order.status === 'confirmed' ? 'Verified' : 'Other'; // 'Unverified' might be too broad

            if (!groups[key]) groups[key] = [];
            groups[key].push(order);
        });
        return groups;
    }, [displayedOrders, groupBy]);

    // Calculate mode price for deviation highlighting
    const modePrice = useMemo(() => {
        const counts: Record<number, number> = {};
        let max = 0;
        let mode = 0;
        displayedOrders.forEach(o => {
            const p = Math.abs(Number(o.price));
            if (p > 0) {
                counts[p] = (counts[p] || 0) + 1;
                if (counts[p] > max) { max = counts[p]; mode = p; }
            }
        });
        return mode;
    }, [displayedOrders]);

    // Count orders needing attention (⚠️ in notes, missing products, etc.)
    // Exclude: orders with "Manual Order" name (intentional), orders with just "[Delivery Import]" without ⚠️
    const needsReviewCount = orders.filter(o => {
        // Only count if has warning flags in notes (actual issues)
        if (o.notes && o.notes.includes('⚠️')) return true;
        // Or if items are truly empty (not just manual orders)
        if ((!o.items || o.items.length === 0) && o.customer_name !== 'Manual Order') return true;
        // Or if customer name is placeholder like "Customer XXXXX"
        if (o.customer_name?.startsWith('Customer ') && o.customer_name !== 'Customer') return true;
        return false;
    }).length;

    const filterOptions = [
        { id: "all", label: "All Orders", count: statusCounts.all },
        { id: "new", label: "New", count: statusCounts.new || 0 },
        { id: "contacted", label: "Contacted", count: statusCounts.contacted || 0 },
        { id: "confirmed", label: "Confirmed", count: statusCounts.confirmed || 0 },
        { id: "in_transit", label: "🚚 In Transit", count: statusCounts.in_transit || 0 },
        { id: "delivered", label: "Delivered", count: statusCounts.delivered || 0 },
        { id: "completed", label: "Completed", count: statusCounts.completed || 0 },
        { id: "rejected", label: "Rejected", count: statusCounts.rejected || 0 },
        { id: "no_response", label: "لم يرد", count: statusCounts.no_response || 0 },
    ];

    // Check if any advanced filters are active
    const hasActiveFilters = !!(filters.dateFrom || filters.dateTo || filters.city || filters.product || filters.priority);

    // Helper function to find return order for an original order
    const getReturnOrderInfo = (orderId: string) => {
        const returnOrder = orders.find(o => o.is_return && o.original_order_id === orderId);
        if (!returnOrder) return null;
        return {
            returnOrderId: returnOrder.order_id,
            returnSequenceNumber: returnOrder.sequence_number
        };
    };

    // Helper function to find original order info for a return order
    const getOriginalOrderInfo = (originalOrderId: string | undefined) => {
        if (!originalOrderId) return null;
        const originalOrder = orders.find(o => o.id === originalOrderId);
        if (!originalOrder) return null;
        return {
            originalOrderId: originalOrder.order_id,
            originalSequenceNumber: originalOrder.sequence_number
        };
    };

    if (loading) {
        return (
            <div className="min-h-screen p-4 md:p-6 lg:p-8">
                <div className="space-y-4">
                    {/* Skeleton header */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <div className="skeleton w-48 h-8 rounded-xl" />
                            <div className="skeleton w-24 h-4 rounded-lg" />
                        </div>
                        <div className="skeleton w-32 h-12 rounded-2xl" />
                    </div>

                    {/* Skeleton filter bar */}
                    <div className="flex gap-2 overflow-hidden">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="skeleton w-24 h-12 rounded-full flex-shrink-0" />
                        ))}
                    </div>

                    {/* Skeleton order cards */}
                    <div className="space-y-3">
                        <OrderCardSkeleton count={5} />
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="pastel-card pastel-card-pink p-8 text-center">
                    <h2 className="text-xl font-bold text-rose-900 mb-2">Error Loading Orders</h2>
                    <p className="text-rose-700">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="min-h-screen p-4 md:p-6 lg:p-8">
                <div className="space-y-4 md:space-y-6">
                    {/* Page Header - Mobile Optimized */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="space-y-4"
                    >
                        {/* Title Row */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground tracking-tight flex items-center gap-2 md:gap-3">
                                    <Package className="w-6 h-6 md:w-8 md:h-8" />
                                    <span className="hidden sm:inline">Orders Management</span>
                                    <span className="sm:hidden">Orders</span>
                                </h1>
                                <p className="text-muted mt-1 text-sm md:text-base lg:text-lg">
                                    {filteredOrders.length} orders{selectedOrders.size > 0 && ` • ${selectedOrders.size} selected`}
                                </p>
                            </div>

                            {/* Primary Actions - Hidden on mobile (FAB replaces it) */}
                            <div className="hidden sm:flex items-center gap-2">
                                <button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--button-success)] text-white shadow-lg shadow-green-500/20 hover:bg-[var(--button-success-hover)] transition-all font-semibold text-base"
                                >
                                    <Plus className="h-5 w-5" />
                                    <span>New Order</span>
                                </button>
                            </div>
                        </div>

                        {/* Controls Row - Scrollable on Mobile */}
                        <div className="flex items-center gap-2 md:gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:overflow-visible md:flex-wrap">
                            {/* Workflow Mode Toggle */}
                            <div className="flex items-center bg-[var(--background)] border border-[var(--card-border)] rounded-xl p-1 flex-shrink-0">
                                <button
                                    onClick={() => {
                                        if (workflowMode) toggleWorkflowMode();
                                    }}
                                    className={cn(
                                        "px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex items-center gap-1.5 md:gap-2",
                                        !workflowMode
                                            ? "bg-[var(--foreground)] text-white shadow-sm"
                                            : "text-muted hover:text-foreground"
                                    )}
                                >
                                    <List className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                    <span className="hidden md:inline">Simple</span>
                                </button>
                                <button
                                    onClick={() => {
                                        if (!workflowMode) toggleWorkflowMode();
                                    }}
                                    className={cn(
                                        "px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex items-center gap-1.5 md:gap-2",
                                        workflowMode
                                            ? "bg-[var(--foreground)] text-white shadow-sm"
                                            : "text-muted hover:text-foreground"
                                    )}
                                >
                                    <GitBranch className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                    <span className="hidden md:inline">Workflow</span>
                                </button>
                            </div>

                            {/* View Mode Toggle - Hidden on Mobile in Workflow Mode */}
                            {!workflowMode && (
                                <div className="hidden sm:flex items-center bg-[var(--background)] border border-[var(--card-border)] rounded-xl p-1 flex-shrink-0">
                                    {[
                                        { mode: "cards" as const, icon: LayoutGrid, label: "Cards" },
                                        { mode: "table" as const, icon: Table, label: "Table" },
                                        { mode: "kanban" as const, icon: Columns, label: "Kanban" },
                                    ].map((v) => {
                                        const Icon = v.icon;
                                        return (
                                            <button
                                                key={v.mode}
                                                onClick={() => setViewMode(v.mode)}
                                                title={v.label}
                                                className={cn(
                                                    "p-2 rounded-lg transition-all",
                                                    viewMode === v.mode
                                                        ? "bg-[var(--foreground)] text-white shadow-sm"
                                                        : "text-muted hover:text-foreground hover:bg-[var(--card-border)]"
                                                )}
                                            >
                                                <Icon className="w-4 h-4" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Date Picker */}
                            <div className="relative flex-shrink-0">
                                <button
                                    onClick={() => setShowDatePicker(!showDatePicker)}
                                    className={cn(
                                        "p-2.5 md:p-3 rounded-xl md:rounded-2xl border transition-all shadow-sm flex items-center gap-2",
                                        (filters.dateFrom || filters.dateTo)
                                            ? "bg-amber-100 border-amber-200 text-amber-700"
                                            : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                    )}
                                    title="Date Filter"
                                >
                                    <CalendarDays className="w-4 h-4" />
                                    {filters.dateFrom && (
                                        <span className="text-xs font-medium hidden lg:inline">
                                            {filters.dateFrom === filters.dateTo
                                                ? new Date(filters.dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                : `${new Date(filters.dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${filters.dateTo ? new Date(filters.dateTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...'}`
                                            }
                                        </span>
                                    )}
                                </button>

                                {/* Date Picker Dropdown Panel */}
                                {showDatePicker && (
                                    <div className="absolute left-0 top-full mt-2 z-[100] shadow-2xl rounded-3xl border border-amber-100">
                                        <DateRangePicker
                                            inline
                                            dateFrom={filters.dateFrom}
                                            dateTo={filters.dateTo}
                                            onDateChange={(from, to) => {
                                                setFilters({ ...filters, dateFrom: from, dateTo: to });
                                                setShowDatePicker(false);
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Quick Toggles - Grouped */}
                            <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
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
                                    title={notificationsEnabled ? "Notifications ON" : "Enable Notifications"}
                                    className={cn(
                                        "p-2.5 md:p-3 rounded-xl md:rounded-2xl border transition-all shadow-sm",
                                        notificationsEnabled
                                            ? "bg-green-100 border-green-200 text-green-700"
                                            : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                    )}
                                >
                                    {notificationsEnabled ? (
                                        <Bell className="w-4 h-4" />
                                    ) : (
                                        <BellOff className="w-4 h-4" />
                                    )}
                                </button>

                                {/* Undo Button */}
                                {canUndo && (
                                    <motion.button
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        onClick={async () => {
                                            const result = await undoLastAction();
                                        }}
                                        title={`Undo: ${getLastUndoAction()?.action || 'last action'}`}
                                        className="p-2.5 md:p-3 rounded-xl md:rounded-2xl border transition-all shadow-sm bg-amber-100 border-amber-200 text-amber-700 hover:bg-amber-200"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                    </motion.button>
                                )}

                                {/* Stats Toggle - Hidden on Small Mobile */}
                                <button
                                    onClick={() => {
                                        const newLevel = ((analyticsLevel + 1) % 3) as 0 | 1 | 2;
                                        setAnalyticsLevel(newLevel);
                                        localStorage.setItem("ordersAnalyticsLevel", String(newLevel));
                                    }}
                                    title={analyticsLevel === 0 ? "Show Stats" : analyticsLevel === 1 ? "Show Details" : "Hide Analytics"}
                                    className={cn(
                                        "hidden sm:flex p-2.5 md:p-3 rounded-xl md:rounded-2xl border transition-all shadow-sm items-center gap-2",
                                        analyticsLevel > 0
                                            ? "bg-blue-100 border-blue-200 text-blue-700"
                                            : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                    )}
                                >
                                    <BarChart3 className="w-4 h-4" />
                                </button>

                                {/* Filters Toggle */}
                                <button
                                    onClick={() => {
                                        const newValue = !showSearchBar;
                                        setShowSearchBar(newValue);
                                        localStorage.setItem("ordersShowSearchBar", String(newValue));
                                    }}
                                    title={showSearchBar ? "Hide Filters" : "Show Filters"}
                                    className={cn(
                                        "p-2.5 md:p-3 rounded-xl md:rounded-2xl border transition-all shadow-sm",
                                        showSearchBar
                                            ? "bg-purple-100 border-purple-200 text-purple-700"
                                            : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                    )}
                                >
                                    <SlidersHorizontal className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Secondary Actions - Hidden on Mobile */}
                            <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                                {/* Compact View Toggle */}
                                {!workflowMode && viewMode === "cards" && (
                                    <button
                                        onClick={() => {
                                            const newValue = !compactView;
                                            setCompactView(newValue);
                                            localStorage.setItem("ordersCompactView", String(newValue));
                                        }}
                                        title={compactView ? "Expanded View" : "Compact View"}
                                        className={cn(
                                            "p-3 rounded-2xl border transition-all shadow-sm",
                                            compactView
                                                ? "bg-purple-100 border-purple-200 text-purple-700"
                                                : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                        )}
                                    >
                                        {compactView ? <LayoutList className="w-4 h-4" /> : <Rows3 className="w-4 h-4" />}
                                    </button>
                                )}

                                {/* Archive Toggle */}
                                <button
                                    onClick={async () => {
                                        if (!showArchived && archivedOrders.length === 0) {
                                            await fetchArchivedOrders();
                                        }
                                        setShowArchived(!showArchived);
                                    }}
                                    title={showArchived ? "Show Active Orders" : "Show Archived Orders"}
                                    className={cn(
                                        "p-3 rounded-2xl border transition-all shadow-sm flex items-center gap-2",
                                        showArchived
                                            ? "bg-amber-100 border-amber-200 text-amber-700"
                                            : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                    )}
                                >
                                    <Archive className="w-4 h-4" />
                                    {showArchived && <span className="text-xs font-medium">Archived</span>}
                                </button>

                                {/* Import/Export */}
                                <button
                                    onClick={() => setIsImportModalOpen(true)}
                                    className="px-4 py-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-foreground hover:bg-[var(--background)] transition-all shadow-sm flex items-center gap-2"
                                >
                                    <Upload className="w-4 h-4" />
                                    <span className="hidden lg:inline">استيراد</span>
                                </button>
                                <button
                                    onClick={handleExport}
                                    className="px-4 py-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-foreground hover:bg-[var(--background)] transition-all shadow-sm flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="hidden lg:inline">Export</span>
                                </button>
                                <button
                                    onClick={handlePrimeExport}
                                    className="px-4 py-3 rounded-2xl bg-[#1e293b] text-white hover:bg-[#334155] border border-transparent transition-all shadow-sm flex items-center gap-2"
                                >
                                    <span className="hidden lg:inline">تصدير للشحن</span>
                                    <span className="lg:hidden">Prime</span>
                                </button>
                            </div>
                        </div>
                    </motion.div>

                    {/* Saved Views Tabs */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                    >
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
                    </motion.div>

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
                                <div className="space-y-4">
                                    {/* Main Stats Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                        {/* Today's Orders */}
                                        <div className="pastel-card pastel-card-yellow p-4">
                                            <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Today</p>
                                            <p className="text-2xl font-bold text-amber-900 mt-1">{stats.todayOrders}</p>
                                            <p className="text-xs text-amber-600 mt-1">orders</p>
                                        </div>

                                        {/* Total Revenue */}
                                        <div className="pastel-card pastel-card-green p-4">
                                            <p className="text-xs text-green-700 font-medium uppercase tracking-wide">Revenue</p>
                                            <p className="text-2xl font-bold text-green-900 mt-1">{formatIQD(stats.totalRevenue)}</p>
                                            <p className="text-xs text-green-600 mt-1">total</p>
                                        </div>

                                        {/* Pending (New) */}
                                        <div className="pastel-card pastel-card-pink p-4">
                                            <p className="text-xs text-rose-700 font-medium uppercase tracking-wide">Pending</p>
                                            <p className="text-2xl font-bold text-rose-900 mt-1">{statusCounts.new || 0}</p>
                                            <p className="text-xs text-rose-600 mt-1">new orders</p>
                                        </div>

                                        {/* Confirmed */}
                                        <div className="pastel-card pastel-card-purple p-4">
                                            <p className="text-xs text-purple-700 font-medium uppercase tracking-wide">Confirmed</p>
                                            <p className="text-2xl font-bold text-purple-900 mt-1">{statusCounts.confirmed || 0}</p>
                                            <p className="text-xs text-purple-600 mt-1">ready</p>
                                        </div>

                                        {/* Conversion Rate */}
                                        <div className="pastel-card p-4">
                                            <p className="text-xs text-muted font-medium uppercase tracking-wide">Conversion</p>
                                            <div className="flex items-end gap-2 mt-1">
                                                <p className="text-2xl font-bold text-foreground">{stats.conversionRate.toFixed(1)}%</p>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-1000 ease-out"
                                                    style={{ width: `${stats.conversionRate}%` }}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted mt-2">Confirmed vs Total</p>
                                        </div>

                                        {/* Average Order Value */}
                                        <div className="pastel-card p-4">
                                            <p className="text-xs text-muted font-medium uppercase tracking-wide">AVG Order</p>
                                            <p className="text-2xl font-bold text-foreground mt-1">{formatIQD(stats.averageOrderValue)}</p>
                                            <p className="text-xs text-muted mt-1">per order</p>
                                        </div>

                                        {/* Peak Time */}
                                        <div className="pastel-card pastel-bg-purple p-4">
                                            <p className="text-xs text-purple-700 font-medium uppercase tracking-wide">Peak Time</p>
                                            <p className="text-2xl font-bold text-purple-900 mt-1">{stats.peakTime}</p>
                                            <p className="text-xs text-purple-600 mt-1">busiest hour</p>
                                        </div>
                                    </div>

                                    {/* Revenue Trends & Velocity Metrics Row (only at level 2) */}
                                    {analyticsLevel >= 2 && (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {/* 7-Day Revenue Sparkline */}
                                            <div className="pastel-card p-4">
                                                <p className="text-xs text-muted font-medium uppercase tracking-wide mb-3">7-Day Revenue Trend</p>
                                                <div className="flex items-end gap-1 h-16">
                                                    {stats.revenueTrends.map((day, i) => {
                                                        const maxRevenue = Math.max(...stats.revenueTrends.map(d => d.revenue), 1);
                                                        const heightPercent = (day.revenue / maxRevenue) * 100;
                                                        return (
                                                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                                                <div
                                                                    className={cn(
                                                                        "w-full rounded-t-sm transition-all",
                                                                        i === 6 ? "bg-green-500" : "bg-green-200"
                                                                    )}
                                                                    style={{ height: `${Math.max(heightPercent, 4)}%` }}
                                                                    title={`${formatIQD(day.revenue)}`}
                                                                />
                                                                <span className="text-[10px] text-muted">{day.date}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Velocity Metrics */}
                                            <div className="pastel-card p-4">
                                                <p className="text-xs text-muted font-medium uppercase tracking-wide mb-3">Processing Speed</p>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-lg font-bold text-foreground">{stats.velocityMetrics.avgNewToConfirmed}</p>
                                                        <p className="text-xs text-muted">New → Confirmed</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold text-foreground">{stats.velocityMetrics.avgConfirmedToDelivered}</p>
                                                        <p className="text-xs text-muted">Confirmed → Delivered</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold text-teal-600">{stats.velocityMetrics.totalProcessed}</p>
                                                        <p className="text-xs text-muted">Delivered</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold text-amber-600">{stats.velocityMetrics.pendingCount}</p>
                                                        <p className="text-xs text-muted">In Pipeline</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
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
                                className="overflow-hidden"
                            >
                                <div className="pastel-card p-6 space-y-4">
                                    <div className="flex flex-col lg:flex-row gap-4">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--foreground-subtle)]" />
                                            <input
                                                type="text"
                                                placeholder="Search by name, phone, or order ID..."
                                                value={filters.searchQuery || ""}
                                                onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value || undefined })}
                                                className="w-full pl-12 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition-all"
                                            />
                                        </div>
                                        {/* Sort dropdown removed in favor of column sorting */}
                                    </div>

                                    {!isMobile && (
                                        <StickyFilterBar
                                            filters={filters}
                                            setFilters={setFilters}
                                            statusCounts={statusCounts}
                                            showFilters={showFilters}
                                            setShowFilters={setShowFilters}
                                            hasActiveFilters={hasActiveFilters}
                                            groupBy={groupBy}
                                            setGroupBy={setGroupBy}
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
                                                <span className="text-sm text-muted whitespace-nowrap">{selectedOrders.size} selected</span>

                                                {/* Primary Actions */}
                                                <button
                                                    onClick={handleBulkConfirm}
                                                    className="px-3 py-1.5 rounded-lg bg-[var(--pastel-green)] text-green-900 text-sm font-medium hover:bg-[var(--pastel-green-light)] transition-all whitespace-nowrap"
                                                >
                                                    Confirm
                                                </button>
                                                <button
                                                    onClick={handleBulkDeliver}
                                                    className="px-3 py-1.5 rounded-lg bg-[var(--pastel-purple)] text-purple-900 text-sm font-medium hover:bg-[var(--pastel-purple-light)] transition-all whitespace-nowrap"
                                                >
                                                    Deliver
                                                </button>
                                                <button
                                                    onClick={handleBulkReject}
                                                    className="px-3 py-1.5 rounded-lg bg-[var(--pastel-pink)] text-rose-900 text-sm font-medium hover:bg-[var(--pastel-pink-light)] transition-all whitespace-nowrap"
                                                >
                                                    Reject
                                                </button>
                                                <button
                                                    onClick={handleBulkArchive}
                                                    className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300 transition-all whitespace-nowrap"
                                                >
                                                    Archive
                                                </button>

                                                {/* Divider */}
                                                <div className="h-6 w-px bg-[var(--card-border)] flex-shrink-0" />

                                                {/* Status Change Buttons */}
                                                <button
                                                    onClick={handleBulkNew}
                                                    className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-sm font-medium hover:bg-blue-200 transition-all whitespace-nowrap"
                                                >
                                                    New
                                                </button>
                                                <button
                                                    onClick={handleBulkContacted}
                                                    className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-sm font-medium hover:bg-amber-200 transition-all whitespace-nowrap"
                                                >
                                                    Contacted
                                                </button>
                                                <button
                                                    onClick={handleBulkInTransit}
                                                    className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-sm font-medium hover:bg-orange-200 transition-all whitespace-nowrap"
                                                >
                                                    🚚 In Transit
                                                </button>
                                                <button
                                                    onClick={handleBulkCompleted}
                                                    className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 transition-all whitespace-nowrap"
                                                >
                                                    Completed
                                                </button>
                                                <button
                                                    onClick={handleBulkNoResponse}
                                                    className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300 transition-all whitespace-nowrap"
                                                >
                                                    لم يرد
                                                </button>

                                                {/* Divider */}
                                                <div className="h-6 w-px bg-[var(--card-border)] flex-shrink-0" />

                                                {/* Destructive Action */}
                                                <button
                                                    onClick={handleBulkDelete}
                                                    className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition-all whitespace-nowrap"
                                                >
                                                    Delete
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
                            showFilters={showFilters}
                            setShowFilters={setShowFilters}
                            hasActiveFilters={hasActiveFilters}
                            groupBy={groupBy}
                            setGroupBy={setGroupBy}
                            isMobile={true}
                        />
                    )}

                    {/* Orders List */}
                    <div className="space-y-3">
                        {/* Select All Row */}
                        <div className="flex items-center gap-3 px-2">
                            <button
                                onClick={selectAll}
                                className={cn(
                                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                                    selectedOrders.size === filteredOrders.length && filteredOrders.length > 0
                                        ? "bg-[var(--foreground)] border-[var(--foreground)] text-white"
                                        : "border-[var(--card-border)] hover:border-[var(--foreground-muted)]"
                                )}
                            >
                                {selectedOrders.size === filteredOrders.length && filteredOrders.length > 0 && (
                                    <CheckSquare className="w-3 h-3" />
                                )}
                            </button>
                            <span className="text-sm text-muted">Select all</span>

                            {/* Active Duplicates Filter Indicator */}
                            {filterDuplicatesOnly && (
                                <div className="flex items-center gap-2 ml-4 px-3 py-1.5 rounded-full bg-orange-100 border border-orange-200 text-orange-700">
                                    <span className="text-xs font-semibold">🔄 عرض المكررين فقط</span>
                                    <button
                                        onClick={() => setFilterDuplicatesOnly(false)}
                                        className="text-orange-500 hover:text-orange-700 font-bold text-xs"
                                        title="إزالة الفلتر"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}
                        </div>

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
                                {viewMode === "cards" && (
                                    <StaggerContainer key={`orders-list-${realtimeVersion}`} className="space-y-3">
                                        {displayedOrders.length === 0 ? (
                                            <EmptyState
                                                type={(filters.status as any) || "all"}
                                                searchQuery={filters.searchQuery}
                                                hasFilters={!!(filters.dateFrom || filters.dateTo || filters.city || filters.product || filters.priority)}
                                            />
                                        ) : (
                                            displayedOrders.map((order) => {
                                                const customerOrders = getCustomerHistory(order.phone);
                                                const orderCount = getCustomerOrderCount(order.phone, order.order_id);
                                                // Find previous order (not the current one)
                                                const previousOrder = customerOrders.find(o => o.id !== order.id) || null;

                                                return (
                                                    <StaggerItem key={`${order.id}-${order.updated_at || order.status}`}>
                                                        <SwipeableOrderCard
                                                            order={order}
                                                            loadingId={loadingId}
                                                            onStatusUpdate={handleStatusUpdate}
                                                            onViewDetails={(o) => {
                                                                setSelectedOrder(o);
                                                                setIsModalOpen(true);
                                                            }}
                                                            isBlacklisted={isBlacklisted(order.phone)}
                                                            customerOrderCount={orderCount}
                                                            previousOrder={previousOrder}
                                                            onMergeWithPrevious={async (keepId, archiveId) => {
                                                                const result = await mergeOrders(keepId, archiveId);
                                                                if (!result.success) {
                                                                    console.error('Merge failed:', result.error);
                                                                }
                                                            }}
                                                            onShowDuplicates={(o) => {
                                                                setDuplicateOrder(o);
                                                                setShowDuplicateModal(true);
                                                            }}
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
                                                            returnOrderInfo={getReturnOrderInfo(order.id)}
                                                            originalOrderInfo={getOriginalOrderInfo(order.original_order_id)}
                                                            compact={compactView}
                                                            onOpenTemplatePanel={(o) => {
                                                                setOrderForTemplate(o);
                                                                setTemplatePanelOpen(true);
                                                            }}
                                                            messageTemplates={workflowTemplates}
                                                            isSelected={selectedOrders.has(order.id)}
                                                            onToggleSelection={toggleOrderSelection}
                                                        />
                                                    </StaggerItem>
                                                );
                                            })
                                        )}
                                    </StaggerContainer>
                                )}

                                {/* Table View - State of the Art */}
                                {viewMode === "table" && (
                                    <div key={`table-view-${realtimeVersion}`} className="pastel-card">
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead className="bg-[var(--background)] border-b border-[var(--card-border)] sticky top-0 z-30">
                                                    <tr>
                                                        <th className="w-10 px-2 py-3 text-center text-xs font-semibold text-muted border-r border-gray-100 cursor-pointer hover:bg-gray-50"
                                                            onClick={() => toggleSort('order_id')}
                                                        >
                                                            <div className="flex flex-col items-center gap-1">
                                                                #
                                                                {sortConfig?.key === 'order_id' && (
                                                                    sortConfig.direction === 'asc' ? <ArrowUp className="w-2 h-2 text-primary" /> : <ArrowDown className="w-2 h-2 text-primary" />
                                                                )}
                                                            </div>
                                                        </th>
                                                        <th className="w-10 px-2 py-3 text-center">
                                                            <div className="flex flex-col items-center gap-1">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedOrders.size === displayedOrders.length && displayedOrders.length > 0}
                                                                    onChange={selectAll}
                                                                    className="w-4 h-4 rounded border-gray-300"
                                                                />
                                                            </div>
                                                        </th>

                                                        {/* Dynamic Headers Helper */}

                                                        {
                                                            [
                                                                { key: 'order_id', label: 'Order', width: 'w-24' },
                                                                { key: 'customer_name', label: 'Customer', width: 'min-w-[120px]' },
                                                                { key: 'phone', label: 'Phone', width: 'w-28', noSort: true },
                                                                { key: 'secondary_phone', label: 'Phone 2', width: 'w-28', noSort: true },
                                                                { key: 'city', label: 'City', width: 'w-24', filterType: 'select', options: availableCities },
                                                                { key: 'address_details', label: 'Address', width: 'min-w-[100px]' },
                                                            ].map((col: any) => (
                                                                <th
                                                                    key={col.key}
                                                                    className={cn(
                                                                        col.width,
                                                                        "px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider relative group",
                                                                        !col.noSort && "cursor-pointer hover:bg-gray-50"
                                                                    )}
                                                                    onClick={() => !col.noSort && toggleSort(col.key)}
                                                                >
                                                                    <div className="flex items-center gap-1">
                                                                        {col.label}
                                                                        {sortConfig?.key === col.key && (
                                                                            sortConfig?.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                                                                        )}
                                                                        {!col.noFilter && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setOpenFilterColumn(openFilterColumn === col.key ? null : col.key);
                                                                                }}
                                                                                className={cn("p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200", columnFilters[col.key] && "opacity-100 text-blue-600")}
                                                                            >
                                                                                <FilterIcon className="w-3 h-3" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    {/* Filter Dropdown */}
                                                                    {openFilterColumn === col.key && !col.noFilter && (
                                                                        <div
                                                                            className="absolute top-full left-0 mt-1 w-48 p-2 bg-white rounded-lg shadow-xl border border-gray-100 z-50 cursor-default"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            {col.filterType === 'select' ? (
                                                                                <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                                                                                    {/* Custom Select UI */}
                                                                                    <div
                                                                                        key="all"
                                                                                        className={cn("px-2 py-1.5 rounded cursor-pointer text-xs hover:bg-gray-50 flex items-center gap-2", !columnFilters[col.key] && "bg-blue-50 text-blue-600 font-medium")}
                                                                                        onClick={() => setColumnFilters({ ...columnFilters, [col.key]: '' })}
                                                                                    >
                                                                                        <span>All</span>
                                                                                        {!columnFilters[col.key] && <Check className="w-3 h-3 ml-auto" />}
                                                                                    </div>
                                                                                    {(col.options || []).map((opt: string) => (
                                                                                        <div
                                                                                            key={opt}
                                                                                            className={cn("px-2 py-1.5 rounded cursor-pointer text-xs hover:bg-gray-50 flex items-center gap-2", columnFilters[col.key] === opt && "bg-blue-50 text-blue-600 font-medium")}
                                                                                            onClick={() => setColumnFilters({ ...columnFilters, [col.key]: opt })}
                                                                                        >
                                                                                            <span className="truncate">{opt}</span>
                                                                                            {columnFilters[col.key] === opt && <Check className="w-3 h-3 ml-auto" />}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : (
                                                                                <input
                                                                                    autoFocus
                                                                                    type="text"
                                                                                    placeholder={`Filter ${col.label}...`}
                                                                                    className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                                    value={columnFilters[col.key] || ''}
                                                                                    onChange={(e) => setColumnFilters({ ...columnFilters, [col.key]: e.target.value })}
                                                                                />
                                                                            )}
                                                                            {columnFilters[col.key] && col.filterType !== 'select' && (
                                                                                <button
                                                                                    onClick={() => setColumnFilters({ ...columnFilters, [col.key]: '' })}
                                                                                    className="mt-1 text-[10px] text-red-500 hover:underline w-full text-left"
                                                                                >
                                                                                    Clear Filter
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </th>
                                                            ))
                                                        }

                                                        {/* Skip re-rendering known cols like Amount if mapped above, or handle specialized cols */}
                                                        < th className="min-w-[150px] px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider" >
                                                            <div className="flex items-center gap-1 group relative">
                                                                Products
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setOpenFilterColumn(openFilterColumn === 'product' ? null : 'product');
                                                                    }}
                                                                    className={cn("p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200", columnFilters['products'] && "opacity-100 text-blue-600")}
                                                                >
                                                                    <FilterIcon className="w-3 h-3" />
                                                                </button>
                                                                {openFilterColumn === 'product' && (
                                                                    <div
                                                                        className="absolute top-full left-0 mt-1 w-48 p-2 bg-white rounded-lg shadow-xl border border-gray-100 z-50 cursor-default"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                                                                            <div
                                                                                className={cn("px-2 py-1.5 rounded cursor-pointer text-xs hover:bg-gray-50 flex items-center gap-2", !filters.product && "bg-blue-50 text-blue-600 font-medium")}
                                                                                onClick={() => setFilters({ ...filters, product: undefined })}
                                                                            >
                                                                                <span>All Products</span>
                                                                                {!filters.product && <Check className="w-3 h-3 ml-auto" />}
                                                                            </div>
                                                                            {availableProducts.map((p) => (
                                                                                <div
                                                                                    key={p}
                                                                                    className={cn("px-2 py-1.5 rounded cursor-pointer text-xs hover:bg-gray-50 flex items-center gap-2", filters.product === p && "bg-blue-50 text-blue-600 font-medium")}
                                                                                    onClick={() => setFilters({ ...filters, product: p })}
                                                                                >
                                                                                    <span className="truncate">{p}</span>
                                                                                    {filters.product === p && <Check className="w-3 h-3 ml-auto" />}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        {filters.product && (
                                                                            <button
                                                                                onClick={() => setFilters({ ...filters, product: undefined })}
                                                                                className="mt-1 text-[10px] text-red-500 hover:underline w-full text-left"
                                                                            >
                                                                                Clear Filter
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </th>
                                                        {/* Amount */}
                                                        <th
                                                            className="w-24 px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-50 group"
                                                            onClick={() => toggleSort('amount')}
                                                        >
                                                            <div className="flex items-center gap-1">
                                                                Amount
                                                                {sortConfig?.key === 'amount' && (
                                                                    sortConfig?.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                                                                )}
                                                            </div>
                                                        </th>
                                                        {/* Amount handled in map logic actually? Amount needs sorting, simpler to keep in map. */}
                                                        {/* Wait, map logic above included Amount? Yes. Remove explicit Amount th below if duplicated? */}
                                                        {/* I need to be careful not to duplicate headers. 
                                                            Original headers: #, Checkbox, Order, Customer, Phone 1, Phone 2, City, Address, Products, Amount, Status.
                                                            My map covers: Order, Customer, Phone(mixed?), City, Address, Amount.
                                                            Missing: Phone 2, Products, Status.
                                                        */}
                                                        <th className="w-28 px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Status</th>

                                                        {/* Source */}
                                                        <th className="w-16 px-2 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Source</th>

                                                        {/* Date */}
                                                        <th className="w-24 px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Date</th>

                                                        {/* Row Color */}
                                                        <th className="w-10 px-2 py-3 text-center text-xs font-semibold text-muted">●</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[var(--card-border)]">
                                                    {(groupBy === 'none'
                                                        ? [['All', displayedOrders]] as [string, Order[]][]
                                                        : Object.entries(groupedOrders)
                                                    ).map(([groupName, groupOrders]) => {
                                                        const statusLabelsHeader: Record<string, string> = {
                                                            new: "جديد",
                                                            contacted: "تم الاتصال",
                                                            confirmed: "مؤكد",
                                                            in_transit: "قيد التوصيل",
                                                            delivered: "تم التسليم",
                                                            rejected: "مرفوض",
                                                            cancelled: "ملغي"
                                                        };
                                                        return (
                                                            <Fragment key={groupName}>
                                                                {groupBy !== 'none' && (
                                                                    <tr className="bg-gray-50/90 top-[45px] z-20 sticky">
                                                                        <td colSpan={100} className="px-4 py-2 font-medium text-sm text-foreground/70 border-b border-gray-100 backdrop-blur-sm">
                                                                            <div className="flex items-center gap-2">
                                                                                {groupBy === 'status' && (
                                                                                    <span className={cn("w-2 h-2 rounded-full",
                                                                                        groupName === 'new' && "bg-blue-500",
                                                                                        groupName === 'confirmed' && "bg-green-500",
                                                                                        groupName === 'cancelled' && "bg-red-500",
                                                                                        groupName === 'delivered' && "bg-gray-500",
                                                                                        groupName === 'in_transit' && "bg-amber-500",
                                                                                        groupName === 'rejected' && "bg-rose-500",
                                                                                    )} />
                                                                                )}
                                                                                {groupBy === 'status' ? (statusLabelsHeader[groupName] || groupName) : groupName}
                                                                                <span className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded-full text-muted-foreground">{groupOrders.length}</span>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                                {groupOrders.map((order, index) => {
                                                                    const isSelected = selectedOrders.has(order.id);
                                                                    const isReturn = order.is_return;
                                                                    const isPriority = order.priority === "urgent" || order.priority === "high";
                                                                    const rowColor = order.tag_color; // Use tag_color for row highlighting

                                                                    // Arabic status labels
                                                                    const statusLabels: Record<string, string> = {
                                                                        new: "جديد",
                                                                        contacted: "تم الاتصال",
                                                                        confirmed: "مؤكد",
                                                                        in_transit: "قيد التوصيل",
                                                                        delivered: "تم التسليم",
                                                                        completed: "مكتمل",
                                                                        no_response: "لم يرد",
                                                                        rejected: "مرفوض",
                                                                        cancelled: "ملغي"
                                                                    };
                                                                    // For return orders, override status label
                                                                    const displayStatus = isReturn ? "استرجاع" : statusLabels[order.status] || order.status;

                                                                    const isCancelled = order.status === "cancelled";
                                                                    const isDuplicate = phoneCounts.get(order.phone.replace(/\s/g, ''))! > 1;

                                                                    return (
                                                                        <tr
                                                                            key={`${order.id}-${order.updated_at || order.status}`}
                                                                            className={cn(
                                                                                "hover:bg-[var(--background)] transition-all group",
                                                                                isSelected && "bg-blue-50/70",
                                                                                isReturn && "bg-red-50/40",
                                                                                isPriority && !isSelected && !isReturn && "bg-amber-50/60",
                                                                                rowColor === "yellow" && "bg-yellow-50/60",
                                                                                rowColor === "green" && "bg-green-50/60",
                                                                                rowColor === "blue" && "bg-blue-50/60",
                                                                                rowColor === "pink" && "bg-pink-50/60",
                                                                                rowColor === "purple" && "bg-purple-50/60",
                                                                                isCancelled && "opacity-60 bg-gray-50"
                                                                            )}
                                                                        >
                                                                            {/* Row Number - Shows sequence or index */}
                                                                            <td className={cn(
                                                                                "px-2 py-2.5 text-center text-xs font-mono text-muted border-r border-gray-100",
                                                                                "bg-[var(--background)]",
                                                                                isCancelled && "bg-gray-50"
                                                                            )}>
                                                                                <div className="flex items-center justify-center gap-1 group/pin">
                                                                                    <span>{order.sequence_number || (index + 1)}</span>
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            togglePin(order.id);
                                                                                        }}
                                                                                        className={cn(
                                                                                            "opacity-0 group-hover/pin:opacity-100 transition-opacity",
                                                                                            order.is_pinned && "opacity-100"
                                                                                        )}
                                                                                    >
                                                                                        <Pin
                                                                                            className={cn(
                                                                                                "w-3 h-3 hover:scale-110 transition-transform",
                                                                                                order.is_pinned ? "text-primary fill-current" : "text-muted"
                                                                                            )}
                                                                                        />
                                                                                    </button>
                                                                                </div>
                                                                            </td>

                                                                            {/* Checkbox */}
                                                                            <td className={cn(
                                                                                "px-2 py-2.5 text-center border-r border-gray-100",
                                                                                isCancelled && "bg-gray-50"
                                                                            )}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isSelected}
                                                                                    onChange={() => toggleOrderSelection(order.id)}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className="w-4 h-4 rounded border-gray-300"
                                                                                />
                                                                            </td>

                                                                            {/* Order ID */}
                                                                            <td
                                                                                className={cn(
                                                                                    "px-2 py-2.5 cursor-pointer border-r border-gray-100",
                                                                                    isCancelled && "bg-gray-50"
                                                                                )}
                                                                                onClick={() => { setSelectedOrder(order); setIsModalOpen(true); }}
                                                                            >
                                                                                <span className={cn(
                                                                                    "font-mono text-sm font-bold",
                                                                                    isReturn ? "text-red-600" : "text-foreground"
                                                                                )}>
                                                                                    #{(() => {
                                                                                        const lfMatch = order.order_id.match(/LF-(\d+)-\d+$/);
                                                                                        if (lfMatch) return lfMatch[1];
                                                                                        const dlvMatch = order.order_id.match(/DLV-(\d+)$/);
                                                                                        if (dlvMatch) return dlvMatch[1];
                                                                                        return order.order_id.slice(-6);
                                                                                    })()}
                                                                                </span>
                                                                            </td>

                                                                            {/* Customer */}
                                                                            <td
                                                                                className="px-2 py-2.5 cursor-pointer"
                                                                                onClick={() => { setSelectedOrder(order); setIsModalOpen(true); }}
                                                                            >
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                                                                        {order.source === "lightfunnels" ? "LF" : "M"}
                                                                                    </div>
                                                                                    <span className="text-sm font-medium truncate max-w-[100px]" title={order.customer_name}>
                                                                                        {order.customer_name}
                                                                                    </span>
                                                                                </div>
                                                                            </td>

                                                                            {/* Phone 1 - Iraqi format with WhatsApp indicator */}
                                                                            <td className="px-2 py-2.5">
                                                                                <div className="relative inline-flex items-center gap-1 group/phone">
                                                                                    <span
                                                                                        className={cn(
                                                                                            "font-mono text-xs hover:text-green-600 transition-colors cursor-pointer",
                                                                                            !validatePhoneDetailed(order.phone).isValid ? "text-red-600 font-bold" : "text-foreground",
                                                                                            isDuplicate && "text-amber-600 font-bold"
                                                                                        )}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            const msg = `مرحباً ${order.customer_name}`;
                                                                                            window.open(`https://wa.me/964${order.phone.replace(/^0/, "")}?text=${encodeURIComponent(msg)}`, "_blank");
                                                                                        }}
                                                                                    >
                                                                                        {order.phone.replace(/^\+964/, "0").replace(/^964/, "0")}
                                                                                    </span>
                                                                                    {isDuplicate && (
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setDuplicateOrder(order);
                                                                                                setShowDuplicateModal(true);
                                                                                            }}
                                                                                            className="p-1 rounded hover:bg-amber-100 transition-colors"
                                                                                            title="View duplicate orders"
                                                                                        >
                                                                                            <CopyPlus className="w-3.5 h-3.5 text-amber-500 hover:text-amber-600" />
                                                                                        </button>
                                                                                    )}
                                                                                    {!validatePhoneDetailed(order.phone).isValid && (
                                                                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Invalid Phone" />
                                                                                    )}
                                                                                    <span className="w-2 h-2 rounded-full bg-green-500 opacity-0 group-hover/phone:opacity-100 transition-opacity" title="WhatsApp" />
                                                                                </div>
                                                                            </td>

                                                                            {/* Phone 2 - Iraqi format */}
                                                                            <td className="px-2 py-2.5">
                                                                                {order.secondary_phone ? (
                                                                                    <div
                                                                                        className="relative inline-flex items-center gap-1 cursor-pointer group/phone2"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            const msg = `مرحباً ${order.customer_name}`;
                                                                                            window.open(`https://wa.me/964${order.secondary_phone!.replace(/^0/, "")}?text=${encodeURIComponent(msg)}`, "_blank");
                                                                                        }}
                                                                                    >
                                                                                        <span className={cn(
                                                                                            "font-mono text-xs hover:text-green-600 transition-colors",
                                                                                            !validatePhoneDetailed(order.secondary_phone).isValid ? "text-red-600 font-bold" : "text-muted"
                                                                                        )}>
                                                                                            {order.secondary_phone.replace(/^\+964/, "0").replace(/^964/, "0")}
                                                                                        </span>
                                                                                        {!validatePhoneDetailed(order.secondary_phone).isValid && (
                                                                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Invalid Phone" />
                                                                                        )}
                                                                                        <span className="w-2 h-2 rounded-full bg-green-500 opacity-0 group-hover/phone2:opacity-100 transition-opacity" title="WhatsApp" />
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className="text-xs text-muted">—</span>
                                                                                )}
                                                                            </td>

                                                                            {/* City */}
                                                                            <td className="px-2 py-2.5">
                                                                                <span className="text-xs text-muted">{order.city || "—"}</span>
                                                                            </td>

                                                                            {/* Address - without city name */}
                                                                            <td className="px-2 py-2.5">
                                                                                <span className="text-xs text-muted truncate block max-w-[120px]" title={order.address_details || ""}>
                                                                                    {order.address_details ? order.address_details.replace(order.city || "", "").replace(/^[\s,-]+/, "").trim() || "—" : "—"}
                                                                                </span>
                                                                            </td>

                                                                            {/* Products - with pastel tag colors */}
                                                                            <td className="px-2 py-2.5">
                                                                                <div className="flex flex-wrap gap-1.5">
                                                                                    {order.items?.map((item, i) => {
                                                                                        // Convert hex color to pastel background
                                                                                        const bgColor = item.tag_color ? `${item.tag_color}20` : '#f3f4f6';
                                                                                        const textColor = item.tag_color || '#374151';
                                                                                        return (
                                                                                            <span
                                                                                                key={i}
                                                                                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md"
                                                                                                style={{
                                                                                                    backgroundColor: bgColor,
                                                                                                    color: textColor,
                                                                                                    border: `1px solid ${item.tag_color || '#e5e7eb'}`
                                                                                                }}
                                                                                                title={item.name}
                                                                                            >
                                                                                                {item.name} <span style={{ opacity: 0.7 }}>×{item.quantity}</span>
                                                                                            </span>
                                                                                        );
                                                                                    }) || <span className="text-xs text-muted">—</span>}
                                                                                </div>
                                                                            </td>

                                                                            {/* Amount */}
                                                                            {/* Amount */}
                                                                            <td className="px-2 py-2.5">
                                                                                <div className="flex flex-col items-start gap-0.5">
                                                                                    <div className="flex items-center gap-1">
                                                                                        <span className={cn(
                                                                                            "font-mono font-bold whitespace-nowrap",
                                                                                            isReturn ? "text-xs text-red-600" : "text-sm text-emerald-600",
                                                                                            !isReturn && Math.abs(Number(order.price)) > modePrice && modePrice > 0 && "text-amber-600",
                                                                                            !isReturn && Math.abs(Number(order.price)) < modePrice && modePrice > 0 && "text-blue-600"
                                                                                        )}>
                                                                                            {isReturn && "-"}{Math.abs(Number(order.price)).toLocaleString()} IQD
                                                                                        </span>
                                                                                        {!isReturn && Math.abs(Number(order.price)) > modePrice && modePrice > 0 && (
                                                                                            <TrendingUp className="w-3 h-3 text-amber-500" />
                                                                                        )}
                                                                                        {!isReturn && Math.abs(Number(order.price)) < modePrice && modePrice > 0 && (
                                                                                            <TrendingDown className="w-3 h-3 text-blue-500" />
                                                                                        )}
                                                                                    </div>
                                                                                    {(order.payment_status === "paid" || order.payment_status === "prepaid") && (
                                                                                        <span className="px-1.5 py-0.5 text-[9px] bg-emerald-100 text-emerald-700 rounded-md font-bold">
                                                                                            واصل
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </td>

                                                                            {/* Status - Arabic Dropdown or Return Label */}
                                                                            <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                                                                                {isReturn ? (
                                                                                    <span className="w-full px-2 py-1 text-[11px] font-bold rounded-lg bg-purple-100 text-purple-700 text-center block">
                                                                                        استرجاع
                                                                                    </span>
                                                                                ) : (
                                                                                    <select
                                                                                        value={order.status}
                                                                                        onChange={async (e) => {
                                                                                            await updateOrderStatus(order.id, e.target.value as Order["status"]);
                                                                                        }}
                                                                                        className={cn(
                                                                                            "w-full px-2 py-1 text-[11px] font-bold rounded-lg border-0 cursor-pointer appearance-none text-center",
                                                                                            order.status === "new" && "bg-orange-100 text-orange-700",
                                                                                            order.status === "contacted" && "bg-yellow-100 text-yellow-700",
                                                                                            order.status === "confirmed" && "bg-green-100 text-green-700",
                                                                                            order.status === "in_transit" && "bg-blue-100 text-blue-700",
                                                                                            order.status === "delivered" && "bg-teal-100 text-teal-700",
                                                                                            order.status === "completed" && "bg-emerald-100 text-emerald-700 shadow-[0_0_10px_rgba(16,185,129,0.4)]",
                                                                                            order.status === "no_response" && "bg-gray-100 text-gray-600",
                                                                                            order.status === "rejected" && "bg-rose-100 text-rose-700",
                                                                                            order.status === "cancelled" && "bg-red-100 text-red-700",
                                                                                        )}
                                                                                    >
                                                                                        <option value="new">جديد</option>
                                                                                        <option value="contacted">تم الاتصال</option>
                                                                                        <option value="confirmed">مؤكد</option>
                                                                                        <option value="in_transit">قيد التوصيل</option>
                                                                                        <option value="delivered">تم التسليم</option>
                                                                                        <option value="completed">مكتمل</option>
                                                                                        <option value="no_response">لم يرد</option>
                                                                                        <option value="rejected">مرفوض</option>
                                                                                        <option value="cancelled">ملغي</option>
                                                                                    </select>
                                                                                )}
                                                                            </td>

                                                                            {/* Source */}
                                                                            <td className="px-2 py-2 text-center">
                                                                                <span className={cn(
                                                                                    "px-1.5 py-0.5 text-[9px] font-bold rounded",
                                                                                    order.source === "lightfunnels" && "bg-purple-100 text-purple-700",
                                                                                    order.source === "delivery_import" && "bg-blue-100 text-blue-700",
                                                                                    order.source === "whatsapp" && "bg-green-100 text-green-700",
                                                                                    !order.source && "bg-gray-100 text-gray-500",
                                                                                )}>
                                                                                    {order.source === "lightfunnels" ? "LF" :
                                                                                        order.source === "delivery_import" ? "DLV" :
                                                                                            order.source === "whatsapp" ? "WA" : "—"}
                                                                                </span>
                                                                            </td>

                                                                            {/* Date with AM/PM */}
                                                                            <td className="px-2 py-2">
                                                                                <div className="flex flex-col items-end">
                                                                                    <span className="text-xs text-gray-700">
                                                                                        {new Date(order.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                                                                                    </span>
                                                                                    <span className="text-[10px] text-gray-400">
                                                                                        {new Date(order.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                                                                                    </span>
                                                                                </div>
                                                                            </td>

                                                                            {/* Row Color Marker - Click Dropdown */}
                                                                            <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                                                                                <div className="relative flex items-center justify-center">
                                                                                    {/* Current color dot - click to toggle */}
                                                                                    <button
                                                                                        onClick={() => setColorPickerOpenId(colorPickerOpenId === order.id ? null : order.id)}
                                                                                        className={cn(
                                                                                            "w-5 h-5 rounded-full border-2 transition-all hover:scale-110",
                                                                                            order.tag_color === "yellow" && "bg-yellow-300 border-yellow-400",
                                                                                            order.tag_color === "green" && "bg-green-300 border-green-400",
                                                                                            order.tag_color === "blue" && "bg-blue-300 border-blue-400",
                                                                                            order.tag_color === "pink" && "bg-pink-300 border-pink-400",
                                                                                            order.tag_color === "purple" && "bg-purple-300 border-purple-400",
                                                                                            !order.tag_color && "bg-gray-200 border-gray-300"
                                                                                        )}
                                                                                    />
                                                                                    {/* Dropdown on click */}
                                                                                    {colorPickerOpenId === order.id && (
                                                                                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 flex gap-1 p-1.5 bg-white rounded-lg shadow-lg border border-[var(--card-border)] z-20">
                                                                                            {["yellow", "green", "blue", "pink", "purple"].map((color) => (
                                                                                                <button
                                                                                                    key={color}
                                                                                                    onClick={async () => {
                                                                                                        const newColor = order.tag_color === color ? null : color;
                                                                                                        await updateOrder(order.id, { tag_color: newColor } as Partial<Order>);
                                                                                                        setColorPickerOpenId(null);
                                                                                                    }}
                                                                                                    className={cn(
                                                                                                        "w-4 h-4 rounded-full border transition-all hover:scale-125",
                                                                                                        color === "yellow" && "bg-yellow-300 border-yellow-400",
                                                                                                        color === "green" && "bg-green-300 border-green-400",
                                                                                                        color === "blue" && "bg-blue-300 border-blue-400",
                                                                                                        color === "pink" && "bg-pink-300 border-pink-400",
                                                                                                        color === "purple" && "bg-purple-300 border-purple-400",
                                                                                                        order.tag_color === color && "ring-2 ring-offset-1 ring-gray-400"
                                                                                                    )}
                                                                                                />
                                                                                            ))}
                                                                                            {/* Clear button */}
                                                                                            <button
                                                                                                onClick={async () => {
                                                                                                    await updateOrder(order.id, { tag_color: null } as Partial<Order>);
                                                                                                    setColorPickerOpenId(null);
                                                                                                }}
                                                                                                className="w-4 h-4 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-[8px] text-gray-500 hover:scale-125 transition-all"
                                                                                                title="إزالة"
                                                                                            >
                                                                                                ✕
                                                                                            </button>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Table Footer with Stats */}
                                        <div className="px-4 py-3 bg-[var(--background)] border-t border-[var(--card-border)] flex items-center justify-between text-xs text-muted">
                                            <span>Showing {displayedOrders.length} of {filteredOrders.length} orders</span>
                                            <span>Total: <strong className="text-emerald-600">{formatIQD(displayedOrders.reduce((sum, o) => sum + Math.abs(Number(o.price)), 0))}</strong></span>
                                        </div>
                                    </div>
                                )}

                                {/* Kanban View */}
                                {viewMode === "kanban" && (
                                    <KanbanBoard
                                        key={`kanban-view-${realtimeVersion}`}
                                        orders={filteredOrders}
                                        onStatusChange={async (orderId, newStatus) => {
                                            await updateOrderStatus(orderId, newStatus);
                                        }}
                                        onViewDetails={(order) => {
                                            setSelectedOrder(order);
                                            setIsModalOpen(true);
                                        }}
                                    />
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
                />
                <CreateOrderModal
                    open={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    onCreate={createOrder}
                    checkOrderIdExists={checkOrderIdExists}
                />

                {/* Duplicate Comparison Modal */}
                {duplicateOrder && (
                    <DuplicateComparisonModal
                        open={showDuplicateModal}
                        onClose={() => {
                            setShowDuplicateModal(false);
                            setDuplicateOrder(null);
                        }}
                        currentOrder={duplicateOrder}
                        duplicateOrders={orders.filter(o =>
                            o.id !== duplicateOrder.id &&
                            o.phone === duplicateOrder.phone
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
                )}

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
                            setOrderToCancel(null);
                        }
                    }}
                    customerName={orderToCancel?.customer_name}
                    orderId={orderToCancel?.order_id}
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
                            setOrderToReject(null);
                        }
                    }}
                    customerName={orderToReject?.customer_name}
                    orderId={orderToReject?.order_id}
                    type="reject"
                />

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
                        onContactSent={async (orderId, newCount) => {
                            // Update the order's contact_count
                            await updateOrder(orderId, { contact_count: newCount });
                        }}
                    />
                )}

                {/* Excel Import Modal */}
                <ImportOrdersModal
                    open={isImportModalOpen}
                    onClose={() => setIsImportModalOpen(false)}
                    existingOrderIds={orders.map(o => o.order_id)}
                    productCatalogue={products.map(p => ({ id: p.id, name: p.name, image_url: p.image_url, tag_color: p.tag_color }))}
                    onImport={async (ordersToImport) => {
                        let imported = 0;
                        const errors: string[] = [];

                        for (const orderData of ordersToImport) {
                            try {
                                const result = await createOrder(orderData as any);
                                if (result.success) {
                                    imported++;
                                } else {
                                    errors.push(`${orderData.order_id}: ${result.error}`);
                                }
                            } catch (error) {
                                errors.push(`${orderData.order_id}: ${error}`);
                            }
                        }

                        return { success: imported > 0, imported, errors };
                    }}
                />

                {/* Mobile Floating Action Button for New Order */}
                {isMobile && selectedOrders.size === 0 && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        onClick={() => setIsCreateModalOpen(true)}
                        className="fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-xl shadow-green-500/30 flex items-center justify-center active:scale-95 transition-transform"
                        style={{
                            bottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
                            right: 'calc(1rem + env(safe-area-inset-right))'
                        }}
                    >
                        <Plus className="w-7 h-7" />
                    </motion.button>
                )}

                <FloatingActionBar
                    selectedCount={selectedOrders.size}
                    onConfirm={handleBulkConfirm}
                    onReject={handleBulkReject}
                    onArchive={handleBulkArchive}
                    onDelete={handleBulkDelete}
                />

                {/* Order Confirmation Screenshot Modal */}
                <AnimatePresence>
                    {screenshotOrder && (
                        <OrderConfirmationCard
                            order={screenshotOrder}
                            onClose={() => setScreenshotOrder(null)}
                        />
                    )}
                </AnimatePresence>
            </div>
        </PageTransition >
    );
}
