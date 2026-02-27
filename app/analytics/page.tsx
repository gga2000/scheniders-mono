"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import {
    DollarSign,
    Plus,
    Download,
    FileText,
    FileSpreadsheet,
    Printer,
    TrendingUp,
    Clock,
    PieChart,
    BarChart3,
    X,
    Target,
    Users,
    Wallet,
} from "lucide-react";

// Hooks
import { useFinances, DateRange } from "@/hooks/use-finances";
import { useExpenses } from "@/hooks/use-expenses";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useOrderProfits } from "@/hooks/use-order-profits";

// Core components (always needed)
import { DateRangePicker } from "@/components/ui/date-range-picker";

// Dynamic imports for heavy components - reduces initial bundle by ~50KB
const RevenueCards = dynamic(
    () => import("@/components/finances/stat-cards").then(mod => ({ default: mod.RevenueCards })),
    { loading: () => <div className="skeleton h-32 rounded-2xl" /> }
);
const ProfitCards = dynamic(
    () => import("@/components/finances/stat-cards").then(mod => ({ default: mod.ProfitCards })),
    { loading: () => <div className="skeleton h-32 rounded-2xl" /> }
);
const RevenueChart = dynamic(
    () => import("@/components/finances/revenue-chart").then(mod => ({ default: mod.RevenueChart })),
    { loading: () => <div className="skeleton h-64 rounded-2xl" /> }
);
const ExpenseBreakdown = dynamic(
    () => import("@/components/finances/expense-breakdown").then(mod => ({ default: mod.ExpenseBreakdown })),
    { loading: () => <div className="skeleton h-48 rounded-2xl" /> }
);
const PeakHoursChart = dynamic(
    () => import("@/components/finances/peak-hours-chart").then(mod => ({ default: mod.PeakHoursChart })),
    { loading: () => <div className="skeleton h-48 rounded-2xl" /> }
);
const ExpenseList = dynamic(
    () => import("@/components/finances/expense-list").then(mod => ({ default: mod.ExpenseList })),
    { loading: () => <div className="skeleton h-64 rounded-2xl" /> }
);
const ExpenseFormModal = dynamic(
    () => import("@/components/finances/expense-form-modal").then(mod => ({ default: mod.ExpenseFormModal })),
    { ssr: false }
);
const RejectionReasonsChart = dynamic(
    () => import("@/components/analytics/rejection-reasons-chart").then(mod => ({ default: mod.RejectionReasonsChart })),
    { loading: () => <div className="skeleton h-32 rounded-2xl" /> }
);
const PeriodComparisonCard = dynamic(
    () => import("@/components/finances/period-comparison").then(mod => ({ default: mod.PeriodComparisonCard })),
    { loading: () => <div className="skeleton h-48 rounded-2xl" /> }
);
const ProfitBreakdownTable = dynamic(
    () => import("@/components/analytics/profit-breakdown-table").then(mod => ({ default: mod.ProfitBreakdownTable })),
    { loading: () => <div className="skeleton h-64 rounded-2xl" /> }
);
const CostCompositionChart = dynamic(
    () => import("@/components/analytics/cost-composition-chart").then(mod => ({ default: mod.CostCompositionChart })),
    { loading: () => <div className="skeleton h-48 rounded-2xl" /> }
);
const CustomerAnalyticsCard = dynamic(
    () => import("@/components/analytics/customer-analytics-card").then(mod => ({ default: mod.CustomerAnalyticsCard })),
    { loading: () => <div className="skeleton h-64 rounded-2xl" /> }
);
const ProfitSummaryCards = dynamic(
    () => import("@/components/analytics/profit-summary-cards").then(mod => ({ default: mod.ProfitSummaryCards })),
    { loading: () => <div className="skeleton h-48 rounded-2xl" /> }
);
const MarketingExpenseModal = dynamic(
    () => import("@/components/analytics/marketing-expense-modal").then(mod => ({ default: mod.MarketingExpenseModal })),
    { ssr: false }
);
const PipelineSummaryCard = dynamic(
    () => import("@/components/analytics/pipeline-summary-card").then(mod => ({ default: mod.PipelineSummaryCard })),
    { loading: () => <div className="skeleton h-48 rounded-2xl" /> }
);
const OverviewCards = dynamic(
    () => import("@/components/analytics/overview-cards").then(mod => ({ default: mod.OverviewCards })),
    { loading: () => <div className="skeleton h-32 rounded-2xl" /> }
);

// Utils
import { exportFinancesToCSV, exportFinancesToExcel, printFinancialReport } from "@/lib/finance-export";
import { Expense } from "@/lib/expense-types";
import { ExpenseFormData } from "@/components/finances/expense-form-modal";
import { cn } from "@/lib/utils";

type ActiveTab = "overview" | "profit" | "customers" | "expenses";

export default function AnalyticsPage() {
    // Date range state - default to all orders (empty = no filter)
    const [dateRange, setDateRange] = useState<DateRange>({
        startDate: "",
        endDate: "",
    });

    const [activeTab, setActiveTab] = useState<ActiveTab>("profit");
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isMarketingModalOpen, setIsMarketingModalOpen] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
    const [expenseModalMode, setExpenseModalMode] = useState<"add" | "edit">("add");
    const [exportMenuOpen, setExportMenuOpen] = useState(false);

    // Data hooks - single source of truth for orders and products
    const { orders } = useOrdersContext();
    const { products } = useProductsCrud();

    // useFinances now receives orders and products as props (no duplicate fetching)
    const {
        revenueStats,
        profitStats,
        dailyData,
        hourlyData,
        expensesByCategory,
        comparePeriods,
        rejectionStats,
        filteredOrders,
    } = useFinances(orders, products, dateRange);

    const {
        expenses,
        addExpense,
        updateExpense,
        deleteExpense,
    } = useExpenses({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
    });

    // Calculate marketing cost from expenses in period
    const marketingCost = useMemo(() => {
        return expenses
            .filter(e => e.category === "marketing")
            .reduce((sum, e) => sum + e.amount, 0);
    }, [expenses]);

    // Filter orders by date range for profit calculations
    const ordersInRange = useMemo(() => {
        // If no date range selected, return all orders
        if (!dateRange.startDate || !dateRange.endDate) {
            return orders;
        }
        return orders.filter(order => {
            const orderDate = new Date(order.created_at).toISOString().split("T")[0];
            return orderDate >= dateRange.startDate && orderDate <= dateRange.endDate;
        });
    }, [orders, dateRange]);

    // Use order profits hook
    const {
        orderCostBreakdowns,
        profitSummary,
        customerAnalytics,
        productProfitAnalysis,
        pipelineSummary,
    } = useOrderProfits(ordersInRange, products, marketingCost);

    // Period comparison
    const periodComparison = useMemo(() => {
        return comparePeriods(dateRange);
    }, [comparePeriods, dateRange]);

    // Handlers
    const handleAddExpense = () => {
        setSelectedExpense(null);
        setExpenseModalMode("add");
        setIsExpenseModalOpen(true);
    };

    const handleEditExpense = (expense: Expense) => {
        setSelectedExpense(expense);
        setExpenseModalMode("edit");
        setIsExpenseModalOpen(true);
    };

    const handleExpenseSubmit = async (data: ExpenseFormData) => {
        if (expenseModalMode === "add") {
            await addExpense(data);
        } else if (selectedExpense) {
            await updateExpense(selectedExpense.id, data);
        }
    };

    const handleDeleteExpense = async (id: string) => {
        if (confirm("Are you sure you want to delete this expense?")) {
            await deleteExpense(id);
        }
    };

    const handleAddMarketingExpense = async (data: { amount: number; notes?: string; date: string }) => {
        await addExpense({
            amount: data.amount,
            category: "marketing",
            expense_date: data.date,
            notes: data.notes,
        });
    };

    const handleExport = (type: "csv" | "excel" | "print") => {
        const reportData = {
            dateRange: { start: dateRange.startDate, end: dateRange.endDate },
            revenue: revenueStats,
            profit: profitStats,
            expenses,
            expensesByCategory,
        };

        switch (type) {
            case "csv":
                exportFinancesToCSV(reportData);
                break;
            case "excel":
                exportFinancesToExcel(reportData);
                break;
            case "print":
                printFinancialReport(reportData);
                break;
        }
        setExportMenuOpen(false);
    };

    const tabs = [
        { id: "profit" as const, label: "Profit Analysis", icon: TrendingUp },
        { id: "customers" as const, label: "Customers", icon: Users },
        { id: "overview" as const, label: "Overview", icon: BarChart3 },
        { id: "expenses" as const, label: "Expenses", icon: PieChart },
    ];

    const { t } = useLanguage();

    return (
        <div className="min-h-screen bg-[var(--background)] pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <Wallet className="w-5 h-5 text-white" />
                        </div>
                        Analytics & Finances
                    </h1>
                    <p className="text-muted mt-1">{t("analytics.subtitle")}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <DateRangePicker
                        dateFrom={dateRange.startDate}
                        dateTo={dateRange.endDate}
                        onDateChange={(start, end) => setDateRange({ startDate: start || "", endDate: end || "" })}
                    />

                    {/* Marketing Expense Button */}
                    <button
                        onClick={() => setIsMarketingModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-all shadow-lg shadow-violet-500/20"
                    >
                        <Target className="w-4 h-4" />
                        <span className="hidden md:inline">Marketing</span>
                    </button>

                    {/* Export Menu */}
                    <div className="relative">
                        <button
                            onClick={() => setExportMenuOpen(!exportMenuOpen)}
                            className="flex items-center gap-2 px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground hover:border-[var(--ink)] transition-all"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden md:inline">Export</span>
                        </button>

                        {exportMenuOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
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
                    </div>

                    <button
                        onClick={handleAddExpense}
                        className="flex items-center gap-2 px-4 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden md:inline">Add Expense</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-[var(--card-bg)] rounded-xl p-1 mb-6 w-fit border border-[var(--card-border)] overflow-x-auto">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                                activeTab === tab.id
                                    ? "bg-[var(--ink)] text-white"
                                    : "text-muted hover:text-foreground"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            {activeTab === "profit" ? (
                <div className="space-y-6">
                    {/* Overview Cards - Full Width at Top */}
                    <OverviewCards profitSummary={profitSummary} pipelineSummary={pipelineSummary} />

                    {/* Two Column Grid: Cost Breakdown + Pipeline */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Realized Profit Breakdown */}
                        <div className="flex flex-col">
                            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-green-600" />
                                Realized Profit
                                <span className="text-xs font-normal text-muted">(Delivered + Completed)</span>
                            </h2>
                            <ProfitSummaryCards summary={profitSummary} />
                        </div>

                        {/* Pipeline Summary */}
                        <div className="flex flex-col">
                            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <Target className="w-5 h-5 text-indigo-600" />
                                Pipeline
                                <span className="text-xs font-normal text-muted">(Confirmed + In Transit)</span>
                            </h2>
                            <PipelineSummaryCard pipeline={pipelineSummary} />
                        </div>
                    </div>

                    {/* Cost Composition */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                Cost Composition
                            </h3>
                            <CostCompositionChart summary={profitSummary} />
                        </div>

                        {/* Product Profit Analysis */}
                        <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                Product Profitability
                            </h3>
                            <div className="space-y-2 max-h-80 overflow-y-auto">
                                {productProfitAnalysis.slice(0, 10).map((product, index) => (
                                    <div
                                        key={product.name}
                                        className="flex items-center justify-between p-3 rounded-xl bg-[var(--background)] hover:bg-[var(--card-border)] transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={cn(
                                                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                                                index === 0 ? "bg-amber-100 text-amber-700" :
                                                    index === 1 ? "bg-gray-200 text-gray-700" :
                                                        index === 2 ? "bg-orange-100 text-orange-700" :
                                                            "bg-[var(--card-bg)] text-muted"
                                            )}>
                                                {index + 1}
                                            </span>
                                            <div>
                                                <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                                                    {product.name}
                                                </p>
                                                <p className="text-xs text-muted">{product.sold} sold</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={cn(
                                                "font-semibold",
                                                product.profit >= 0 ? "text-green-600" : "text-rose-600"
                                            )}>
                                                {new Intl.NumberFormat("en-IQ").format(product.profit)} IQD
                                            </p>
                                            <p className="text-xs text-muted">
                                                {product.revenue > 0
                                                    ? ((product.profit / product.revenue) * 100).toFixed(1)
                                                    : 0}% margin
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {productProfitAnalysis.length === 0 && (
                                    <p className="text-center text-muted py-8">No product data available</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Order Breakdown Table */}
                    <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                            Per-Order Profit Breakdown
                        </h3>
                        <ProfitBreakdownTable breakdowns={orderCostBreakdowns} />
                    </div>
                </div>
            ) : activeTab === "customers" ? (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-blue-600" />
                            Customer Analytics
                        </h2>
                        <CustomerAnalyticsCard analytics={customerAnalytics} />
                    </div>
                </div>
            ) : activeTab === "overview" ? (
                <div className="space-y-6">
                    {/* Revenue Cards */}
                    <div>
                        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-green-600" />
                            Revenue
                        </h2>
                        <RevenueCards stats={revenueStats} comparison={periodComparison} />
                    </div>

                    {/* Profit Cards */}
                    <div>
                        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-blue-600" />
                            Profit
                        </h2>
                        <ProfitCards stats={profitStats} revenue={revenueStats.deliveredRevenue} />
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Revenue Trend */}
                        <div className="lg:col-span-2 p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                Revenue & Profit Trend
                            </h3>
                            <RevenueChart data={dailyData} showProfit />
                        </div>

                        {/* Period Comparison */}
                        {periodComparison && (
                            <div>
                                <PeriodComparisonCard comparison={periodComparison} />
                            </div>
                        )}
                    </div>

                    {/* Bottom Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Expense Breakdown */}
                        <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                Expense Breakdown
                            </h3>
                            <ExpenseBreakdown data={expensesByCategory} />
                        </div>

                        {/* Peak Hours */}
                        <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Peak Sales Hours
                            </h3>
                            <PeakHoursChart data={hourlyData} />
                        </div>
                    </div>

                    {/* Rejection Analytics */}
                    <div className="grid grid-cols-1 gap-6">
                        <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                                <X className="w-4 h-4" />
                                Rejection Analysis
                            </h3>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-1 space-y-4">
                                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/20">
                                        <p className="text-sm text-rose-600 font-medium">Total Rejected</p>
                                        <p className="text-2xl font-bold text-rose-700">{rejectionStats.totalRejected}</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/20">
                                        <p className="text-sm text-orange-600 font-medium">Rejection Rate</p>
                                        <p className="text-2xl font-bold text-orange-700">{rejectionStats.rejectionRate.toFixed(1)}%</p>
                                        <p className="text-xs text-orange-600 mt-1">of attempted deliveries</p>
                                    </div>
                                </div>
                                <div className="lg:col-span-2">
                                    <h4 className="text-xs font-semibold text-muted mb-2">Top Reasons</h4>
                                    <RejectionReasonsChart data={rejectionStats.byReason} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                    <ExpenseList
                        expenses={expenses}
                        onEdit={handleEditExpense}
                        onDelete={handleDeleteExpense}
                    />
                </div>
            )}

            {/* Expense Form Modal */}
            <ExpenseFormModal
                isOpen={isExpenseModalOpen}
                onClose={() => setIsExpenseModalOpen(false)}
                onSubmit={handleExpenseSubmit}
                expense={selectedExpense}
                mode={expenseModalMode}
            />

            {/* Marketing Expense Modal */}
            <MarketingExpenseModal
                isOpen={isMarketingModalOpen}
                onClose={() => setIsMarketingModalOpen(false)}
                onSubmit={handleAddMarketingExpense}
                dateRange={dateRange}
            />
        </div>
    );
}
