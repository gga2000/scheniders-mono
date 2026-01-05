"use client";

import { useState } from "react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useCustomers, CustomerFilters, Customer } from "@/hooks/use-customers";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Users,
    Phone,
    MapPin,
    MessageCircle,
    ChevronRight,
    ChevronDown,
    Crown,
    Star,
    User,
    ShoppingBag,
    TrendingUp,
    Download,
    FileText,
    FileSpreadsheet,
    Printer,
    BarChart3,
    RefreshCw,
    AlertTriangle,
} from "lucide-react";
import { formatIQD, formatDate, generateWhatsAppLink } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Components
import { CustomerGrowthChart } from "@/components/customers/customer-growth-chart";
import { GeoDistributionChart } from "@/components/customers/geo-distribution-chart";
import { TopSpendersList } from "@/components/customers/top-spenders-list";
import { CustomerDetailModal } from "@/components/customers/customer-detail-modal";
import { AdvancedFilters } from "@/components/customers/advanced-filters";

// Export utilities
import { exportCustomersToCSV, exportCustomersToExcel, printCustomerReport } from "@/lib/customer-export";

export default function CustomersPage() {
    const [filters, setFilters] = useState<CustomerFilters>({
        status: "all",
        sortBy: "lastOrder",
        sortOrder: "desc",
    });
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);

    // Apply search to filters
    const activeFilters = { ...filters, search: searchQuery };

    // Single source of truth for orders - prevents duplicate subscriptions
    const { orders, loading: ordersLoading, error } = useOrdersContext();

    const {
        customers,
        allCustomers,
        stats,
        geoDistribution,
        topSpenders,
        customerGrowth,
        uniqueCities,
        uniqueProducts,
        loading: customersLoading,
    } = useCustomers(orders, activeFilters);

    const loading = ordersLoading || customersLoading;

    const handleViewCustomer = (customer: Customer) => {
        setSelectedCustomer(customer);
        setIsDetailModalOpen(true);
    };

    const handleExport = (type: "csv" | "excel" | "print") => {
        const reportData = {
            customers,
            stats,
            geoDistribution,
            topSpenders,
        };

        switch (type) {
            case "csv":
                exportCustomersToCSV(reportData);
                break;
            case "excel":
                exportCustomersToExcel(reportData);
                break;
            case "print":
                printCustomerReport(reportData);
                break;
        }
        setExportMenuOpen(false);
    };

    const getStatusIcon = (status: Customer["status"]) => {
        switch (status) {
            case "vip": return <Crown className="w-4 h-4" />;
            case "regular": return <Star className="w-4 h-4" />;
            default: return <User className="w-4 h-4" />;
        }
    };

    const getStatusColor = (status: Customer["status"]) => {
        switch (status) {
            case "vip": return "bg-[var(--pastel-yellow)] text-amber-900";
            case "regular": return "bg-[var(--pastel-green)] text-green-900";
            default: return "bg-[var(--pastel-mint)] text-teal-900";
        }
    };

    const statusFilterOptions = [
        { id: "all", label: "All", count: allCustomers.length },
        { id: "vip", label: "VIP", count: stats.vipCustomers, icon: Crown },
        { id: "regular", label: "Regular", count: stats.regularCustomers, icon: Star },
        { id: "new", label: "New", count: stats.newCustomers, icon: User },
    ];

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-[var(--pastel-yellow)] border-t-transparent animate-spin"></div>
                    <p className="text-muted font-medium">Loading customers...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="pastel-card pastel-card-pink p-8 text-center">
                    <h2 className="text-xl font-bold text-rose-900 mb-2">Error Loading Customers</h2>
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
                                <Users className="w-8 h-8" />
                                Customers
                            </h1>
                            <p className="text-muted mt-2 text-lg">
                                {stats.total} customers • {formatIQD(stats.totalRevenue)} total revenue
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Analytics Toggle */}
                            <button
                                onClick={() => setShowAnalytics(!showAnalytics)}
                                className={cn(
                                    "px-4 py-3 rounded-2xl border transition-all shadow-sm flex items-center gap-2",
                                    showAnalytics
                                        ? "bg-[var(--foreground)] text-white border-transparent"
                                        : "bg-[var(--card-bg)] border-[var(--card-border)] text-foreground hover:bg-[var(--background)]"
                                )}
                            >
                                <BarChart3 className="w-4 h-4" />
                                <span className="hidden sm:inline">Analytics</span>
                            </button>

                            {/* Export Menu */}
                            <div className="relative">
                                <button
                                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                                    className="px-4 py-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-foreground hover:bg-[var(--background)] transition-all shadow-sm flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="hidden sm:inline">Export</span>
                                </button>

                                <AnimatePresence>
                                    {exportMenuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute right-0 top-full mt-2 z-50 bg-[var(--card-bg)] rounded-xl shadow-lg border border-[var(--card-border)] overflow-hidden min-w-[160px]"
                                        >
                                            <button
                                                onClick={() => handleExport("csv")}
                                                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-[var(--background)] transition-colors"
                                            >
                                                <FileText className="w-4 h-4" />
                                                Export CSV
                                            </button>
                                            <button
                                                onClick={() => handleExport("excel")}
                                                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-[var(--background)] transition-colors"
                                            >
                                                <FileSpreadsheet className="w-4 h-4" />
                                                Export Excel
                                            </button>
                                            <button
                                                onClick={() => handleExport("print")}
                                                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-[var(--background)] transition-colors"
                                            >
                                                <Printer className="w-4 h-4" />
                                                Print Report
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>

                    {/* Stats Cards */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                        className="grid grid-cols-2 md:grid-cols-5 gap-4"
                    >
                        <div className="pastel-card pastel-card-yellow p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-amber-700" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-amber-900">{stats.total}</p>
                                    <p className="text-xs text-amber-700">Total Customers</p>
                                </div>
                            </div>
                        </div>
                        <div className="pastel-card pastel-card-green p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                                    <Crown className="w-5 h-5 text-green-700" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-green-900">{stats.vipCustomers}</p>
                                    <p className="text-xs text-green-700">VIP Customers</p>
                                </div>
                            </div>
                        </div>
                        <div className="pastel-card pastel-card-mint p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                                    <ShoppingBag className="w-5 h-5 text-teal-700" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-teal-900">{formatIQD(stats.averageOrderValue)}</p>
                                    <p className="text-xs text-teal-700">Avg Order Value</p>
                                </div>
                            </div>
                        </div>
                        <div className="pastel-card pastel-card-blue p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                                    <RefreshCw className="w-5 h-5 text-blue-700" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-blue-900">{stats.retentionRate.toFixed(1)}%</p>
                                    <p className="text-xs text-blue-700">Retention Rate</p>
                                </div>
                            </div>
                        </div>
                        <div className="pastel-card pastel-card-pink p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5 text-rose-700" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-rose-900">{formatIQD(stats.totalRevenue)}</p>
                                    <p className="text-xs text-rose-700">Total Revenue</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Analytics Section */}
                    <AnimatePresence>
                        {showAnalytics && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden"
                            >
                                <div className="pastel-card p-5">
                                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                        Customer Growth
                                    </h3>
                                    <CustomerGrowthChart data={customerGrowth} />
                                </div>
                                <div className="pastel-card p-5">
                                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                        Geographic Distribution
                                    </h3>
                                    <GeoDistributionChart data={geoDistribution} />
                                </div>
                                <div className="pastel-card p-5">
                                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                        Top Spenders
                                    </h3>
                                    <TopSpendersList customers={topSpenders} onViewCustomer={handleViewCustomer} />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Filters & Search Bar */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="pastel-card p-6 space-y-4"
                    >
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--foreground-subtle)]" />
                                <input
                                    type="text"
                                    placeholder="Search by name, phone, or city..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition-all"
                                />
                            </div>
                            <AdvancedFilters
                                filters={filters}
                                onChange={setFilters}
                                cities={uniqueCities}
                                products={uniqueProducts}
                            />
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {statusFilterOptions.map((option) => {
                                const Icon = option.icon;
                                return (
                                    <button
                                        key={option.id}
                                        onClick={() => setFilters({ ...filters, status: option.id as CustomerFilters["status"] })}
                                        className={cn(
                                            "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2",
                                            filters.status === option.id
                                                ? "bg-[var(--foreground)] text-white shadow-md"
                                                : "bg-[var(--background)] text-[var(--foreground-muted)] hover:bg-[var(--card-border)] border border-[var(--card-border)]"
                                        )}
                                    >
                                        {Icon && <Icon className="w-4 h-4" />}
                                        {option.label}
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-xs font-bold",
                                            filters.status === option.id
                                                ? "bg-white/20 text-white"
                                                : "bg-[var(--card-border)] text-muted"
                                        )}>
                                            {option.count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>

                    {/* Customer List */}
                    <StaggerContainer className="space-y-3">
                        {customers.length === 0 ? (
                            <div className="pastel-card p-12 text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background)] flex items-center justify-center">
                                    <Users className="h-8 w-8 text-[var(--foreground-subtle)]" />
                                </div>
                                <p className="text-lg font-medium text-foreground mb-1">No customers found</p>
                                <p className="text-sm text-muted">Try adjusting your search or filters</p>
                            </div>
                        ) : (
                            customers.map((customer) => (
                                <StaggerItem key={customer.id}>
                                    <motion.div className="group" initial={false}>
                                        <div className="bg-[var(--card-bg)] rounded-[20px] shadow-[var(--card-shadow)] overflow-hidden hover:shadow-[var(--card-shadow-hover)] transition-all">
                                            {/* Main Row */}
                                            <div className="flex items-center p-4 gap-4">
                                                {/* Status Badge */}
                                                <div className={cn(
                                                    "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer",
                                                    getStatusColor(customer.status)
                                                )} onClick={() => handleViewCustomer(customer)}>
                                                    {getStatusIcon(customer.status)}
                                                </div>

                                                {/* Customer Info */}
                                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleViewCustomer(customer)}>
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-foreground text-base truncate">
                                                            {customer.name}
                                                        </p>
                                                        {customer.isBlacklisted && (
                                                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 text-sm text-muted mt-1">
                                                        <span className="flex items-center gap-1 font-mono">
                                                            <Phone className="w-3 h-3" />
                                                            {customer.phone}
                                                        </span>
                                                        {customer.city && (
                                                            <span className="flex items-center gap-1">
                                                                <MapPin className="w-3 h-3" />
                                                                {customer.city}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Stats */}
                                                <div className="hidden md:flex items-center gap-8">
                                                    <div className="text-center">
                                                        <p className="text-lg font-bold text-foreground">{customer.totalOrders}</p>
                                                        <p className="text-xs text-muted">Orders</p>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-lg font-bold text-foreground">{formatIQD(customer.totalSpent)}</p>
                                                        <p className="text-xs text-muted">Total Spent</p>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-sm font-medium text-foreground">{formatDate(customer.lastOrderDate)}</p>
                                                        <p className="text-xs text-muted">Last Order</p>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const link = generateWhatsAppLink(
                                                                customer.phone,
                                                                `مرحباً ${customer.name}`
                                                            );
                                                            window.open(link, "_blank");
                                                        }}
                                                        className="w-10 h-10 rounded-xl bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all shadow-md shadow-green-500/20 flex items-center justify-center"
                                                        title="Chat on WhatsApp"
                                                    >
                                                        <MessageCircle className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setExpandedCustomer(
                                                            expandedCustomer === customer.id ? null : customer.id
                                                        )}
                                                        className="w-10 h-10 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all flex items-center justify-center"
                                                    >
                                                        {expandedCustomer === customer.id ? (
                                                            <ChevronDown className="w-4 h-4" />
                                                        ) : (
                                                            <ChevronRight className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expanded Order History */}
                                            <AnimatePresence>
                                                {expandedCustomer === customer.id && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-4 pb-4 pt-2 border-t border-[var(--card-border)]">
                                                            <p className="text-sm font-semibold text-foreground mb-3">Order History</p>
                                                            <div className="space-y-2">
                                                                {customer.orders.slice(0, 5).map((order) => (
                                                                    <div
                                                                        key={order.id}
                                                                        className="flex items-center justify-between p-3 bg-[var(--background)] rounded-xl"
                                                                    >
                                                                        <div>
                                                                            <p className="text-sm font-medium text-foreground">
                                                                                #{order.order_id}
                                                                            </p>
                                                                            <p className="text-xs text-muted">
                                                                                {formatDate(order.created_at)}
                                                                            </p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-sm font-bold text-foreground">
                                                                                {formatIQD(Number(order.price))}
                                                                            </p>
                                                                            <p className="text-xs text-muted capitalize">
                                                                                {order.status}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {customer.orders.length > 5 && (
                                                                    <button
                                                                        onClick={() => handleViewCustomer(customer)}
                                                                        className="w-full text-xs text-[var(--foreground)] hover:underline text-center py-2"
                                                                    >
                                                                        View all {customer.orders.length} orders
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                </StaggerItem>
                            ))
                        )}
                    </StaggerContainer>
                </div>
            </div>

            {/* Customer Detail Modal */}
            <CustomerDetailModal
                customer={selectedCustomer}
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
            />
        </PageTransition>
    );
}
