"use client";

import { useState, useEffect, useMemo, Fragment, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useDebounce } from "@/hooks/use-debounce";
import { Order, PaymentStatus } from "@/lib/supabase";
import { validatePhoneDetailed } from "@/lib/order-utils";
import { isOrderFlagged } from "@/lib/data-quality-utils";
import { OrderCard } from "@/components/dashboard/order-card";
import { SwipeableOrderCard } from "@/components/dashboard/swipeable-order-card";
import { OrderCardSkeleton } from "@/components/dashboard/order-card-skeleton";
// This was a thought trace, not the actual replacement content yet. I need to view OrderCard first.
// But I can add the imports to Page.tsx now.
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
const KanbanBoard = dynamic(
    () => import("@/components/orders/kanban-board").then(mod => ({ default: mod.KanbanBoard })),
    { loading: () => <div className="skeleton w-full h-96 rounded-2xl" />, ssr: false }
);
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
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { notificationService } from "@/lib/notification-service";
import { exportOrdersToPrimeCSV } from "@/lib/export-utils";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { useLanguage } from "@/hooks/use-language";

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
    } = useOrdersContext();

    // Get products for Excel import matching
    const { products } = useProductsCrud();
    const isMobile = useIsMobile();
    const { t } = useLanguage();
    const [isFilterPanelAnimating, setIsFilterPanelAnimating] = useState(false);
    const [isHeaderAnimating, setIsHeaderAnimating] = useState(false);

    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    const debouncedColumnFilters = useDebounce(columnFilters, 300);

    // Debounce global search to prevent typing latency
    const [localSearchQuery, setLocalSearchQuery] = useState(filters.searchQuery || "");
    const debouncedSearchQuery = useDebounce(localSearchQuery, 300);

    useEffect(() => {
        if (debouncedSearchQuery !== (filters.searchQuery || "")) {
            setFilters(prev => ({ ...prev, searchQuery: debouncedSearchQuery || undefined }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearchQuery, setFilters]);

    useEffect(() => {
        if (!filters.searchQuery && localSearchQuery) {
            setLocalSearchQuery("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.searchQuery]);

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
    // State for split order dialog
    const [splitOrderDialog, setSplitOrderDialog] = useState<{ open: boolean; order: Order | null }>({
        open: false,
        order: null
    });
    const { splitOrder } = useOrdersContext();

    const handleSplitOrder = async (keptItems: any[], returnedItems: any[]) => {
        if (!splitOrderDialog.order) return;

        // Show loading state could be nice here if dialog supported it
        const result = await splitOrder(splitOrderDialog.order.id, keptItems, returnedItems);

        if (result.success) {
            setSplitOrderDialog({ open: false, order: null });

            // Force data refresh to show new orders
            await refreshOrders();

            notificationService.showNotification({
                title: t("common.success"),
                body: "Order has been split successfully. Return order created."
            });
        } else {
            notificationService.showNotification({
                title: t("common.error"),
                body: result.error || t("orderDetail.splitError")
            });
        }
    };

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
    const dateButtonRef = useRef<HTMLButtonElement>(null);
    const datePickerRef = useRef<HTMLDivElement>(null);
    const [datePickerPos, setDatePickerPos] = useState({ top: 0, left: 0 });

    // Update date picker position when opened
    useEffect(() => {
        if (showDatePicker && dateButtonRef.current) {
            const rect = dateButtonRef.current.getBoundingClientRect();
            setDatePickerPos({ top: rect.bottom + 8, left: rect.left });
        }
    }, [showDatePicker]);

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
    }, [showDatePicker]);
    const [notificationsEnabled, setNotificationsEnabled] = useState(
        typeof window !== "undefined" && notificationService.isEnabled()
    );

    // Toolbar collapse state - maximizes workspace for order cards
    const [toolbarCollapsed, setToolbarCollapsed] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("ordersToolbarCollapsed") === "true";
        }
        return false;
    });

    // Toggle toolbar collapse
    const toggleToolbarCollapse = () => {
        const newValue = !toolbarCollapsed;
        setToolbarCollapsed(newValue);
        localStorage.setItem("ordersToolbarCollapsed", String(newValue));
    };

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
    }, [toolbarCollapsed]);


    // Batch Risk Assessment
    const { getRiskLevel, getAssessment, loading: riskLoading } = useBatchRiskAssessment(hookFilteredOrders);

    // Sort hook's filtered orders
    // Advanced Filtering & Sorting
    const filteredOrders = useMemo(() => {
        let result = [...hookFilteredOrders];

        // 1. Apply Column Filters
        Object.entries(debouncedColumnFilters).forEach(([key, value]) => {
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
        if (filters.riskLevel) {
            if (filters.riskLevel === 'flagged') {
                // "Flagged" = data quality issues OR rejected orders
                // Uses the shared isOrderFlagged helper which matches the red/yellow dots on cards
                result = result.filter(o => isOrderFlagged(o) || o.status === 'rejected');
            } else if (!riskLoading) {
                // Other risk levels use the fraud detector (only filter after assessments load)
                result = result.filter(o => getRiskLevel(o.phone) === filters.riskLevel);
            }
        }

        // 1.5. Apply Duplicates-Only Filter
        if (filterDuplicatesOnly) {
            result = result.filter(o => getCustomerOrderCount(o.phone) > 1);
        }

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
    }, [hookFilteredOrders, sortConfig, debouncedColumnFilters, filterDuplicatesOnly, getCustomerOrderCount, realtimeVersion, filters.riskLevel, getRiskLevel, riskLoading]);



    // Calculate flagged orders count for "Needs Attention" card (data quality issues + rejected orders)
    // Calculate flagged orders count for "Needs Attention" card (data quality issues + rejected orders)
    const flaggedCount = useMemo(() => {
        return hookFilteredOrders.filter(o => isOrderFlagged(o) || o.status === 'rejected').length;
    }, [hookFilteredOrders]);

    // Calculate global risk count for the key filter button (all orders)
    const totalRiskCount = useMemo(() => {
        if (!orders) return 0;
        return orders.filter(o => isOrderFlagged(o) || o.status === 'rejected').length;
    }, [orders]);

    // Scroll to top when filters change to prevent empty list illusion
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [filters, filterDuplicatesOnly]);

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
        const result = await bulkDelete(ids);

        if (!result.success && (!result.count || result.count === 0)) {
            alert(result.error || "Could not delete selected orders.");
            return;
        }

        const deletedCount = result.count || 0;
        if (deletedCount < ids.length) {
            const deletedIdSet = new Set(result.deletedIds || []);
            setSelectedOrders(new Set(ids.filter(id => !deletedIdSet.has(id))));

            alert(`${deletedCount} of ${ids.length} orders were deleted. The remaining orders stayed selected.`);
            return;
        }

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

                notificationService.showNotification({
                    title: "Export Successful",
                    body: `${ids.length} orders exported and moved to In Transit`,
                });
            } else {
                throw new Error(batchError || "Failed to create export batch");
            }
        } catch (err) {
            console.error("Prime export error:", err);
            notificationService.showNotification({
                title: "Export Failed",
                body: err instanceof Error ? err.message : "Could not complete the export process",
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
    const needsReviewCount = useMemo(() => {
        return orders.filter(o => {
            // Only count if has warning flags in notes (actual issues)
            if (o.notes && o.notes.includes('⚠️')) return true;
            // Or if items are truly empty (not just manual orders)
            if ((!o.items || o.items.length === 0) && o.customer_name !== 'Manual Order') return true;
            // Or if customer name is placeholder like "Customer XXXXX"
            if (o.customer_name?.startsWith('Customer ') && o.customer_name !== 'Customer') return true;
            return false;
        }).length;
    }, [orders]);



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
            <div className="min-h-screen p-4 md:p-6 lg:p-8 orders-page">
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
                    <h2 className="text-xl font-bold text-rose-900 mb-2">{t("orders.errorTitle")}</h2>
                    <p className="text-rose-700">{error}</p>
                </div>
            </div>
        );
    }

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
                                                className="w-full pl-10 pr-4 py-2.5 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                            />
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
                                                <div className="p-2 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30">
                                                    <Package className="w-4 h-4" />
                                                </div>
                                                <div className="flex flex-col leading-none">
                                                    <div className="flex items-baseline gap-1.5">
                                                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70">
                                                            {filteredOrders.length}
                                                        </span>
                                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("orders.title")}</span>
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
                                                                ? "bg-white text-foreground shadow-sm dark:bg-[var(--ink)] dark:text-[var(--ink-contrast)] dark:shadow-black/20"
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
                                                                ? "bg-white text-foreground shadow-sm dark:bg-[var(--ink)] dark:text-[var(--ink-contrast)] dark:shadow-black/20"
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
                                                    { mode: "kanban" as const, icon: Columns, label: "Kanban" },
                                                ].map((v) => (
                                                    <button
                                                        key={v.mode}
                                                        onClick={() => setViewMode(v.mode)}
                                                        title={v.label}
                                                        className={cn(
                                                            "p-2.5 rounded-xl transition-all duration-300",
                                                            viewMode === v.mode
                                                                ? "bg-white text-foreground shadow-sm dark:bg-[var(--ink)] dark:text-[var(--ink-contrast)] dark:shadow-black/20 ring-1 ring-black/5"
                                                                : "text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-[#243551]/80"
                                                        )}
                                                    >
                                                        <v.icon className="w-4 h-4" />
                                                    </button>
                                                ))}

                                                {/* Compact Toggle */}
                                                {!workflowMode && viewMode === "cards" && (
                                                    <button
                                                        onClick={() => {
                                                            const newValue = !compactView;
                                                            setCompactView(newValue);
                                                            localStorage.setItem("ordersCompactView", String(newValue));
                                                        }}
                                                        className={cn(
                                                            "p-2.5 rounded-xl transition-all duration-300",
                                                            compactView
                                                                ? "bg-purple-100 text-purple-600 shadow-sm"
                                                                : "text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-[#243551]/80"
                                                        )}
                                                        title={compactView ? "Compact View Active" : "Switch to Compact"}
                                                    >
                                                        {compactView ? <LayoutList className="w-4 h-4" /> : <Rows3 className="w-4 h-4" />}
                                                    </button>
                                                )}

                                                <div className="w-px h-8 bg-black/5 mx-1 orders-toolbar-divider" />

                                                {/* Collapse Toolbar */}
                                                <button
                                                    onClick={toggleToolbarCollapse}
                                                    className="p-2.5 rounded-xl text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-[#243551]/80 transition-all duration-300 hover:rotate-90 active:scale-95"
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
                                                            "px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 border",
                                                            (filters.dateFrom || filters.dateTo)
                                                                ? "bg-amber-100/50 border-amber-200/50 text-amber-700 shadow-sm"
                                                                : "bg-white/50 border-transparent hover:bg-white/80 text-muted-foreground hover:text-foreground dark:bg-[#1b263a]/70 dark:border-[#354764]/60 dark:hover:bg-[#243551] dark:text-[var(--foreground-muted)] dark:hover:text-[var(--foreground)]"
                                                        )}
                                                    >
                                                        <CalendarDays className="w-4 h-4" />
                                                        <span className="hidden lg:inline">
                                                            {filters.dateFrom
                                                                ? `${new Date(filters.dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                                                : t("orders.dateRange")}
                                                        </span>
                                                    </button>
                                                    {showDatePicker && createPortal(
                                                        <div
                                                            ref={datePickerRef}
                                                            className="fixed z-[9999] p-2 bg-white/80 backdrop-blur-xl shadow-2xl rounded-3xl border border-white/20 ring-1 ring-black/5 orders-date-popover"
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
                                                            ? "bg-blue-100 text-blue-600 shadow-sm"
                                                            : "text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-[#243551]/80"
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
                                                        "px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2",
                                                        showArchived
                                                            ? "bg-orange-100/50 text-orange-700 shadow-sm"
                                                            : "text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-[#243551]/80"
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
                                                            ? "bg-green-100 text-green-600 shadow-sm"
                                                            : "text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-[#243551]/80"
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
                                                            ? "bg-indigo-100 text-indigo-600 shadow-sm"
                                                            : "text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-[#243551]/80"
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
                                                    className="p-2.5 rounded-xl text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-[#243551]/80 transition-all duration-300"
                                                    title="Import"
                                                >
                                                    <Upload className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={handleExport}
                                                    className="p-2.5 rounded-xl text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-[#243551]/80 transition-all duration-300"
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
                                                    className="group relative px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                                                >
                                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                                    <div className="relative flex items-center gap-2 font-semibold text-sm">
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
                                                                    <h3 className="text-3xl font-bold text-rose-900">{statusCounts.new || 0}</h3>
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
                                                                    <h3 className="text-3xl font-bold text-amber-900">{statusCounts.contacted || 0}</h3>
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
                                                                    <h3 className="text-3xl font-bold text-violet-900">{statusCounts.confirmed || 0}</h3>
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
                                                                    <h3 className="text-3xl font-bold text-orange-900">{statusCounts.in_transit || 0}</h3>
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
                                                                    <h3 className="text-3xl font-bold text-foreground">{stats.conversionRate.toFixed(1)}%</h3>
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
                                                        totalRiskCount={totalRiskCount}
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
                                {viewMode === "cards" && (
                                    <>
                                        {displayedOrders.length === 0 ? (
                                            <EmptyState
                                                type={(filters.status as any) || "all"}
                                                searchQuery={filters.searchQuery}
                                                hasFilters={!!(filters.dateFrom || filters.dateTo || filters.city || filters.product || filters.priority)}
                                            />
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
                                                getCustomerArchivedCount={(phone) => 0}
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
                                                getCustomerHistory={getCustomerHistory}
                                                getReturnOrderInfo={getReturnOrderInfo}
                                                getOriginalOrderInfo={getOriginalOrderInfo}
                                                compactView={(compactView ? 1 : 0) as 0 | 1 | 2}
                                                getRiskLevel={getRiskLevel}
                                                onSplitOrder={(order) => setSplitOrderDialog({ open: true, order })}
                                            />
                                        ) : (
                                            /* Use animated list for <50 orders */
                                            <StaggerContainer key={`orders-list-${realtimeVersion}`} className="space-y-3">
                                                {displayedOrders.map((order) => {
                                                    const customerOrders = getCustomerHistory(order.phone);
                                                    const orderCount = getCustomerOrderCount(order.phone, order.order_id);
                                                    const previousOrder = customerOrders.find(o => o.id !== order.id) || null;

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
                                                                onOpenTemplatePanel={(o: any) => {
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
                                                                                    <span className="font-medium text-sm text-foreground">
                                                                                        {order.customer_name}
                                                                                    </span>
                                                                                    {getRiskLevel(order.phone) && (getRiskLevel(order.phone) === 'high' || getRiskLevel(order.phone) === 'blocked' || getRiskLevel(order.phone) === 'medium') && (
                                                                                        <RiskBadge level={getRiskLevel(order.phone)} showLabel={false} />
                                                                                    )}
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
                                                                                    order.source === "shop" && "bg-amber-100 text-amber-700",
                                                                                    !order.source && "bg-gray-100 text-gray-500",
                                                                                )}>
                                                                                    {order.source === "lightfunnels" ? "LF" :
                                                                                        order.source === "delivery_import" ? "DLV" :
                                                                                            order.source === "whatsapp" ? "WA" :
                                                                                                order.source === "shop" ? "محل" : "—"}
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
                                            <span>{t("orders.showingOf").replace("{shown}", String(displayedOrders.length)).replace("{total}", String(filteredOrders.length))}</span>
                                            <span>{t("orders.total")} <strong className="text-emerald-600">{formatIQD(displayedOrders.reduce((sum, o) => sum + Math.abs(Number(o.price)), 0))}</strong></span>
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
                </div >

                {/* Modals */}
                < OrderDetailsModal
                    order={selectedOrder}
                    open={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedOrder(null);
                    }
                    }
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

                <FloatingActionBar
                    selectedCount={selectedOrders.size}
                    onConfirm={handleBulkConfirm}
                    onReject={handleBulkReject}
                    onArchive={handleBulkArchive}
                    onDelete={handleBulkDelete}
                />


                {/* Scroll to Top Button */}
                <ScrollToTopButton />

                {/* Order Confirmation Screenshot Modal */}
                <AnimatePresence>
                    {screenshotOrder && (
                        <OrderConfirmationCard
                            order={screenshotOrder}
                            onClose={() => setScreenshotOrder(null)}
                        />
                    )}
                </AnimatePresence>
            </div >
        </PageTransition >
    );
}
