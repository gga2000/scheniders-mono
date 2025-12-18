"use client";

import { useState } from "react";
import { useOrders } from "@/hooks/use-orders";
import { Order } from "@/lib/supabase";
import { OrderCard } from "@/components/dashboard/order-card";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { KanbanBoard } from "@/components/orders/kanban-board";
import { FloatingActionBar } from "@/components/orders/floating-action-bar";
import { WorkflowTabs } from "@/components/orders/workflow-tabs";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Plus,
    Download,
    Package,
    CheckSquare,
    ChevronDown,
    Calendar,
    MapPin,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { notificationService } from "@/lib/notification-service";

export default function OrdersPage() {
    const {
        orders,
        filteredOrders: hookFilteredOrders,
        loading,
        error,
        updateOrderStatus,
        updateOrder,
        createOrder,
        isBlacklisted,
        stats,
        availableCities,
        availableProducts,
        filters,
        setFilters,
        clearFilters,
        bulkUpdateStatus,
        bulkArchive,
        exportOrders,
        filterPresets,
        saveFilterPreset,
        loadFilterPreset,
        deleteFilterPreset,
        getOrderTimeline,
        getOrderNotes,
    } = useOrders();

    const [sortBy, setSortBy] = useState<"date" | "amount" | "status">("date");
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    const [showFilters, setShowFilters] = useState(false);
    const [showStats, setShowStats] = useState(true);
    const [showPresets, setShowPresets] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");
    const [viewMode, setViewMode] = useState<"cards" | "table" | "kanban">("cards");
    const [workflowMode, setWorkflowMode] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("ordersWorkflowMode") === "true";
        }
        return false;
    });
    const [notificationsEnabled, setNotificationsEnabled] = useState(
        typeof window !== "undefined" && notificationService.isEnabled()
    );

    // Toggle workflow mode
    const toggleWorkflowMode = () => {
        const newMode = !workflowMode;
        setWorkflowMode(newMode);
        localStorage.setItem("ordersWorkflowMode", String(newMode));
    };

    // Toggle notifications
    const toggleNotifications = async () => {
        if (notificationsEnabled) {
            setNotificationsEnabled(false);
        } else {
            const granted = await notificationService.requestPermission();
            setNotificationsEnabled(granted);
            if (granted) {
                notificationService.playBeep(); // Confirm sound
            }
        }
    };

    // Sort hook's filtered orders
    const filteredOrders = hookFilteredOrders.sort((a, b) => {
        switch (sortBy) {
            case "amount":
                return (Number(b.price) || 0) - (Number(a.price) || 0);
            case "status":
                return a.status.localeCompare(b.status);
            default:
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
    });

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

    const handleExport = () => {
        const ids = selectedOrders.size > 0
            ? Array.from(selectedOrders)
            : filteredOrders.map(o => o.id);
        exportOrders(ids, "csv");
    };

    const filterOptions = [
        { id: "all", label: "All Orders", count: orders.length },
        { id: "new", label: "New", count: stats.pendingOrders },
        { id: "contacted", label: "Contacted", count: stats.contactedOrders },
        { id: "confirmed", label: "Confirmed", count: stats.confirmedOrders },
        { id: "delivered", label: "Delivered", count: stats.deliveredOrders },
        { id: "rejected", label: "Rejected", count: stats.rejectedOrders },
    ];

    // Check if any advanced filters are active
    const hasActiveFilters = !!(filters.dateFrom || filters.dateTo || filters.city || filters.product || filters.priority);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-[var(--pastel-yellow)] border-t-transparent animate-spin"></div>
                    <p className="text-muted font-medium">Loading orders...</p>
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
            <div className="min-h-screen p-6 md:p-8">
                <div className="space-y-6">
                    {/* Page Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
                    >
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight flex items-center gap-3">
                                <Package className="w-8 h-8" />
                                Orders Management
                            </h1>
                            <p className="text-muted mt-2 text-lg">
                                {filteredOrders.length} orders • {selectedOrders.size} selected
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Workflow Mode Toggle */}
                            <div className="flex items-center bg-[var(--background)] border border-[var(--card-border)] rounded-xl p-1">
                                <button
                                    onClick={() => {
                                        if (workflowMode) toggleWorkflowMode();
                                    }}
                                    className={cn(
                                        "px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                                        !workflowMode
                                            ? "bg-[var(--foreground)] text-white shadow-sm"
                                            : "text-muted hover:text-foreground"
                                    )}
                                >
                                    📋 Simple
                                </button>
                                <button
                                    onClick={() => {
                                        if (!workflowMode) toggleWorkflowMode();
                                    }}
                                    className={cn(
                                        "px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                                        workflowMode
                                            ? "bg-[var(--foreground)] text-white shadow-sm"
                                            : "text-muted hover:text-foreground"
                                    )}
                                >
                                    🔄 Workflow
                                </button>
                            </div>

                            {/* View Mode Toggle (only show in simple mode) */}
                            {!workflowMode && (
                                <div className="flex items-center bg-[var(--background)] border border-[var(--card-border)] rounded-xl p-1">
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

                            {/* Notification Toggle */}
                            <button
                                onClick={toggleNotifications}
                                title={notificationsEnabled ? "Notifications enabled" : "Enable notifications"}
                                className={cn(
                                    "p-3 rounded-2xl border transition-all shadow-sm",
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

                            <button
                                onClick={handleExport}
                                className="px-4 py-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-foreground hover:bg-[var(--background)] transition-all shadow-sm flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                <span className="hidden sm:inline">Export</span>
                            </button>
                            <button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--button-success)] text-white shadow-lg shadow-green-500/20 hover:bg-[var(--button-success-hover)] hover:shadow-green-500/30 hover:scale-[1.02] transition-all font-semibold"
                            >
                                <Plus className="h-5 w-5" />
                                <span>New Order</span>
                            </button>
                        </div>
                    </motion.div>

                    {/* Collapsible Analytics Panel */}
                    <AnimatePresence>
                        {showStats && (
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
                                            <p className="text-2xl font-bold text-rose-900 mt-1">{stats.pendingOrders}</p>
                                            <p className="text-xs text-rose-600 mt-1">new orders</p>
                                        </div>

                                        {/* Confirmed */}
                                        <div className="pastel-card pastel-card-purple p-4">
                                            <p className="text-xs text-purple-700 font-medium uppercase tracking-wide">Confirmed</p>
                                            <p className="text-2xl font-bold text-purple-900 mt-1">{stats.confirmedOrders}</p>
                                            <p className="text-xs text-purple-600 mt-1">ready</p>
                                        </div>

                                        {/* Conversion Rate */}
                                        <div className="pastel-card p-4">
                                            <p className="text-xs text-muted font-medium uppercase tracking-wide">Conversion</p>
                                            <p className="text-2xl font-bold text-foreground mt-1">{stats.conversionRate.toFixed(1)}%</p>
                                            <p className="text-xs text-muted mt-1">success rate</p>
                                        </div>

                                        {/* Average Order Value */}
                                        <div className="pastel-card p-4">
                                            <p className="text-xs text-muted font-medium uppercase tracking-wide">AVG Order</p>
                                            <p className="text-2xl font-bold text-foreground mt-1">{formatIQD(stats.averageOrderValue)}</p>
                                            <p className="text-xs text-muted mt-1">per order</p>
                                        </div>
                                    </div>

                                    {/* Revenue Trends & Velocity Metrics Row */}
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
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Toggle Stats Button */}
                    <button
                        onClick={() => setShowStats(!showStats)}
                        className="flex items-center gap-2 px-3 py-1.5 mx-auto text-xs text-muted hover:text-foreground transition-colors"
                    >
                        <BarChart3 className="w-3.5 h-3.5" />
                        {showStats ? "Hide Analytics" : "Show Analytics"}
                        {showStats ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {/* Filters & Search Bar */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="pastel-card p-6 space-y-4"
                    >
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
                            <div className="relative">
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as "date" | "amount" | "status")}
                                    className="appearance-none px-4 py-3 pr-10 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all cursor-pointer"
                                >
                                    <option value="date">Sort by Date</option>
                                    <option value="amount">Sort by Amount</option>
                                    <option value="status">Sort by Status</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                            </div>
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {filterOptions.map((option) => (
                                <button
                                    key={option.id}
                                    onClick={() => setFilters({ ...filters, status: option.id as Order["status"] | "all" })}
                                    className={cn(
                                        "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2",
                                        filters.status === option.id || (option.id === "all" && !filters.status)
                                            ? "bg-[var(--foreground)] text-white shadow-md"
                                            : "bg-[var(--background)] text-[var(--foreground-muted)] hover:bg-[var(--card-border)] border border-[var(--card-border)]"
                                    )}
                                >
                                    {option.label}
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-xs font-bold",
                                        filters.status === option.id || (option.id === "all" && !filters.status)
                                            ? "bg-white/20 text-white"
                                            : "bg-[var(--card-border)] text-muted"
                                    )}>
                                        {option.count}
                                    </span>
                                </button>
                            ))}

                            {/* Advanced Filters Toggle */}
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={cn(
                                    "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 border",
                                    showFilters || hasActiveFilters
                                        ? "bg-blue-100 text-blue-700 border-blue-200"
                                        : "bg-[var(--background)] text-[var(--foreground-muted)] border-[var(--card-border)] hover:bg-[var(--card-border)]"
                                )}
                            >
                                <Filter className="w-3.5 h-3.5" />
                                Filters
                                {hasActiveFilters && (
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                )}
                            </button>
                        </div>

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
                                            {/* Date From */}
                                            <div>
                                                <label className="text-xs text-muted font-medium block mb-1.5">From Date</label>
                                                <div className="relative">
                                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                    <input
                                                        type="date"
                                                        value={filters.dateFrom || ""}
                                                        onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value || undefined })}
                                                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                                    />
                                                </div>
                                            </div>

                                            {/* Date To */}
                                            <div>
                                                <label className="text-xs text-muted font-medium block mb-1.5">To Date</label>
                                                <div className="relative">
                                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                    <input
                                                        type="date"
                                                        value={filters.dateTo || ""}
                                                        onChange={(e) => setFilters({ ...filters, dateTo: e.target.value || undefined })}
                                                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                                    />
                                                </div>
                                            </div>

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
                                    className="flex items-center gap-3 pt-4 border-t border-[var(--card-border)]"
                                >
                                    <span className="text-sm text-muted">{selectedOrders.size} selected</span>
                                    <button
                                        onClick={handleBulkConfirm}
                                        className="px-3 py-1.5 rounded-lg bg-[var(--pastel-green)] text-green-900 text-sm font-medium hover:bg-[var(--pastel-green-light)] transition-all"
                                    >
                                        Confirm
                                    </button>
                                    <button
                                        onClick={handleBulkDeliver}
                                        className="px-3 py-1.5 rounded-lg bg-[var(--pastel-purple)] text-purple-900 text-sm font-medium hover:bg-[var(--pastel-purple-light)] transition-all"
                                    >
                                        Deliver
                                    </button>
                                    <button
                                        onClick={handleBulkReject}
                                        className="px-3 py-1.5 rounded-lg bg-[var(--pastel-pink)] text-rose-900 text-sm font-medium hover:bg-[var(--pastel-pink-light)] transition-all"
                                    >
                                        Reject
                                    </button>
                                    <button
                                        onClick={handleBulkArchive}
                                        className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300 transition-all"
                                    >
                                        Archive
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

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
                            />
                        ) : (
                            <>
                                {/* Cards View */}
                                {viewMode === "cards" && (
                                    <StaggerContainer className="space-y-3">
                                        {filteredOrders.length === 0 ? (
                                            <div className="pastel-card p-12 text-center">
                                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background)] flex items-center justify-center">
                                                    <Package className="h-8 w-8 text-[var(--foreground-subtle)]" />
                                                </div>
                                                <p className="text-lg font-medium text-foreground mb-1">No orders found</p>
                                                <p className="text-sm text-muted">Try adjusting your search or filters</p>
                                            </div>
                                        ) : (
                                            filteredOrders.map((order) => (
                                                <StaggerItem key={order.id}>
                                                    <OrderCard
                                                        order={order}
                                                        loadingId={loadingId}
                                                        onStatusUpdate={handleStatusUpdate}
                                                        onViewDetails={(o) => {
                                                            setSelectedOrder(o);
                                                            setIsModalOpen(true);
                                                        }}
                                                        isBlacklisted={isBlacklisted(order.phone)}
                                                    />
                                                </StaggerItem>
                                            ))
                                        )}
                                    </StaggerContainer>
                                )}

                                {/* Table View */}
                                {viewMode === "table" && (
                                    <div className="pastel-card overflow-hidden">
                                        <table className="w-full">
                                            <thead className="bg-[var(--background)] border-b border-[var(--card-border)]">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Order</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Customer</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">City</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Amount</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Status</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Date</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--card-border)]">
                                                {filteredOrders.map((order) => (
                                                    <tr
                                                        key={order.id}
                                                        onClick={() => { setSelectedOrder(order); setIsModalOpen(true); }}
                                                        className="hover:bg-[var(--background)] cursor-pointer transition-colors"
                                                    >
                                                        <td className="px-4 py-3 font-mono text-sm">#{order.order_id}</td>
                                                        <td className="px-4 py-3 text-sm font-medium">{order.customer_name}</td>
                                                        <td className="px-4 py-3 text-sm text-muted">{order.city || "-"}</td>
                                                        <td className="px-4 py-3 font-mono text-sm">{formatIQD(Number(order.price))}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={cn(
                                                                "px-2 py-1 text-xs font-bold rounded-full uppercase",
                                                                order.status === "new" && "bg-orange-100 text-orange-700",
                                                                order.status === "contacted" && "bg-yellow-100 text-yellow-700",
                                                                order.status === "confirmed" && "bg-green-100 text-green-700",
                                                                order.status === "delivered" && "bg-teal-100 text-teal-700",
                                                                order.status === "rejected" && "bg-rose-100 text-rose-700",
                                                            )}>
                                                                {order.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-muted">{new Date(order.created_at).toLocaleDateString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Kanban View */}
                                {viewMode === "kanban" && (
                                    <KanbanBoard
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
                />
                <CreateOrderModal
                    open={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    onCreate={createOrder}
                />

                {/* Floating Action Bar */}
                <FloatingActionBar
                    selectedCount={selectedOrders.size}
                    onConfirm={handleBulkConfirm}
                    onReject={handleBulkReject}
                    onArchive={handleBulkArchive}
                />
            </div>
        </PageTransition>
    );
}
