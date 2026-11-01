"use client";

import { useOrderCostSnapshots } from "@/hooks/use-order-cost-snapshots";
import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
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
    BarChart3,
    X,
    Target,
    Users,
    Wallet,
    ListChecks,
    Truck,
    Sparkles,
    Receipt,
    MoreHorizontal,
} from "lucide-react";

// Hooks
import { useFinances, DateRange } from "@/hooks/use-finances";
import { useExpenses } from "@/hooks/use-expenses";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useOrderProfits } from "@/hooks/use-order-profits";
import { useFinancialEpoch, EraMode } from "@/hooks/use-financial-epoch";
import { useUserPreferences } from "@/hooks/use-user-preferences";

// Core components (always needed)
import { DateRangePicker } from "@scheniders/ui/date-range-picker";
import { PageSkeleton } from "@scheniders/ui/skeletons";


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
const BalanceSummaryCard = dynamic(
    () => import("@/components/analytics/balance-summary-card").then(mod => ({ default: mod.BalanceSummaryCard })),
    { loading: () => <div className="skeleton h-48 rounded-2xl" /> }
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
const OrderFunnelCard = dynamic(
    () => import("@/components/analytics/order-funnel-card").then(mod => ({ default: mod.OrderFunnelCard })),
    { loading: () => <div className="skeleton h-48 rounded-2xl" /> }
);
const OverviewCards = dynamic(
    () => import("@/components/analytics/overview-cards").then(mod => ({ default: mod.OverviewCards })),
    { loading: () => <div className="skeleton h-32 rounded-2xl" /> }
);
const EpochBanner = dynamic(
    () => import("@/components/analytics/epoch-banner").then(mod => ({ default: mod.EpochBanner })),
    { loading: () => <div className="skeleton h-20 rounded-2xl" /> }
);
const DataQualityBadge = dynamic(
    () => import("@/components/analytics/data-quality-badge").then(mod => ({ default: mod.DataQualityBadge })),
    { ssr: false }
);
const DeliveryImportModal = dynamic(
    () => import("@/components/delivery-import/delivery-import-modal").then(mod => ({ default: mod.DeliveryImportModal })),
    { ssr: false }
);
const DeliveryHistory = dynamic(
    () => import("@/components/delivery-import/delivery-history").then(mod => ({ default: mod.DeliveryHistory })),
    { loading: () => <div className="skeleton h-64 rounded-2xl" />, ssr: false }
);
const IraqMap = dynamic(
    () => import("@/components/shared/iraq-map").then(mod => ({ default: mod.IraqMap })),
    { loading: () => <div className="skeleton h-64 rounded-2xl" />, ssr: false }
);
// Utils
import { exportFinancesToCSV, exportFinancesToExcel, printFinancialReport } from "@/lib/finance-export";
import { Expense } from "@/types/expense";
import { ExpenseFormData } from "@/components/finances/expense-form-modal";
import { cn } from "@/lib/utils";

type ActiveTab = "profit" | "customers" | "expenses" | "overview";

export default function AnalyticsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[var(--background)]">
                <PageSkeleton />
            </div>
        }>
            <AnalyticsContent />
        </Suspense>
    );
}

function AnalyticsContent() {
    // Date range state - default to all orders (empty = no filter)
    const [dateRange, setDateRange] = useState<DateRange>({
        startDate: "",
        endDate: "",
    });

    const searchParams = useSearchParams();
    const router = useRouter();
    const activeTab = (searchParams?.get("tab") as ActiveTab) || "profit";
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isMarketingModalOpen, setIsMarketingModalOpen] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
    const [expenseModalMode, setExpenseModalMode] = useState<"add" | "edit">("add");
    const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
    const [isDeliveryImportOpen, setIsDeliveryImportOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const actionsMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMounted(true);
    }, []);

    // Close actions menu on Escape or outside click
    useEffect(() => {
        if (!actionsMenuOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setActionsMenuOpen(false);
        };
        const onClick = (e: MouseEvent) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
                setActionsMenuOpen(false);
            }
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("mousedown", onClick);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onClick);
        };
    }, [actionsMenuOpen]);

    // =============================================
    // FINANCIAL EPOCH
    // =============================================
    const {
        epochDate,
        isEpochSet,
        streakDays,
        currentMilestone,
        nextMilestone,
        milestoneProgress,
        getEraDateRange,
        setEpochDate,
        isUpdating: isEpochUpdating,
        loading: isEpochLoading,
    } = useFinancialEpoch();

    const { getPreference, setPreference } = useUserPreferences();

    // Era mode — persisted in localStorage
    const [eraMode, setEraMode] = useState<EraMode>(() => {
        if (typeof window === "undefined") return "clean";
        try {
            const stored = getPreference<EraMode>("financialEraMode");
            return stored || "clean";
        } catch {
            return "clean";
        }
    });

    const handleEraModeChange = useCallback((mode: EraMode) => {
        setEraMode(mode);
        setPreference("financialEraMode", mode);
        // When switching era modes, clear any custom date range so era filtering takes effect
        setDateRange({ startDate: "", endDate: "" });
    }, [setPreference]);

    const handleSetEpoch = useCallback(async (date: string) => {
        await setEpochDate(date);
        // Auto-switch to clean era and clear date range
        setEraMode("clean");
        setPreference("financialEraMode", "clean");
        setDateRange({ startDate: "", endDate: "" });
    }, [setEpochDate, setPreference]);

    // Banner visibility
    const [showFinancialEra, setShowFinancialEra] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        try {
            const stored = getPreference<boolean>("showFinancialEra");
            return stored === null ? false : stored;
        } catch {
            return false;
        }
    });

    const handleToggleFinancialEra = useCallback(() => {
        const newValue = !showFinancialEra;
        setShowFinancialEra(newValue);
        setPreference("showFinancialEra", newValue);
    }, [showFinancialEra, setPreference]);

    // Data hooks - single source of truth for orders and products
    const { orders } = useOrdersContext();
    const { products } = useProductsCrud();

    // =============================================
    // EFFECTIVE DATE RANGE (era-aware)
    // =============================================
    // If a custom date range is set, use it. Otherwise, use era-based filtering.
    const effectiveDateRange = useMemo((): DateRange => {
        if (dateRange.startDate || dateRange.endDate) {
            // Custom range takes priority
            return dateRange;
        }
        if (isEpochSet) {
            return getEraDateRange(eraMode);
        }
        return { startDate: "", endDate: "" };
    }, [dateRange, isEpochSet, eraMode, getEraDateRange]);

    const costSnapshots = useOrderCostSnapshots();

    // useFinances now receives orders and products as props (no duplicate fetching)
    const {
        revenueStats,
        profitStats,
        dailyData,
        hourlyData,
        expensesByCategory,
        comparePeriods,
        rejectionStats,
    } = useFinances(orders, products, effectiveDateRange, costSnapshots);

    const {
        expenses,
        addExpense,
        updateExpense,
        deleteExpense,
    } = useExpenses({
        startDate: effectiveDateRange.startDate,
        endDate: effectiveDateRange.endDate,
    });

    // Calculate marketing cost from expenses in period
    const marketingCost = useMemo(() => {
        return expenses
            .filter(e => e.category === "marketing")
            .reduce((sum, e) => sum + e.amount, 0);
    }, [expenses]);

    // Filter orders by date range for profit calculations
    const ordersInRange = useMemo(() => {
        // If no effective date range selected, return all orders
        if (!effectiveDateRange.startDate || !effectiveDateRange.endDate) {
            return orders;
        }
        return orders.filter(order => {
            const orderDate = new Date(order.created_at).toISOString().split("T")[0];
            return orderDate >= effectiveDateRange.startDate && orderDate <= effectiveDateRange.endDate;
        });
    }, [orders, effectiveDateRange]);

    // Use order profits hook
    const {
        orderCostBreakdowns,
        profitSummary,
        customerAnalytics,
        productProfitAnalysis,
        pipelineSummary,
        funnelSummary,
    } = useOrderProfits(ordersInRange, products, marketingCost, costSnapshots);

    // Period comparison
    const periodComparison = useMemo(() => {
        return comparePeriods(effectiveDateRange);
    }, [comparePeriods, effectiveDateRange]);

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
            dateRange: { start: effectiveDateRange.startDate, end: effectiveDateRange.endDate },
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
        setActionsMenuOpen(false);
    };

    const tabs = [
        { id: "profit" as const, label: "Profit Analysis", icon: TrendingUp },
        { id: "customers" as const, label: "Customers", icon: Users },
        { id: "expenses" as const, label: "Expenses", icon: Receipt },
        { id: "overview" as const, label: "Overview", icon: BarChart3 },
    ];

    const { t } = useLanguage();

    if (!isMounted) {
        return (
            <div className="min-h-screen bg-[var(--background)]">
                <PageSkeleton />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--background)] pb-12 px-4 md:px-8 lg:px-12">
            <div className="max-w-[1400px] mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                <Wallet className="w-5 h-5 text-white" />
                            </div>
                            {t("analytics.title")}
                        </h1>
                        <p className="text-muted mt-1">{t("analytics.subtitle")}</p>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                        <DateRangePicker
                            dateFrom={dateRange.startDate}
                            dateTo={dateRange.endDate}
                            onDateChange={(start, end) => setDateRange({ startDate: start || "", endDate: end || "" })}
                            epochDate={epochDate || undefined}
                        />

                        {/* Actions overflow menu — consolidates Era, Import Delivery, Marketing, Export */}
                        <div className="relative" ref={actionsMenuRef}>
                            <button
                                onClick={() => setActionsMenuOpen(o => !o)}
                                aria-haspopup="menu"
                                aria-expanded={actionsMenuOpen}
                                aria-label={t("analytics.actionsMenu") || "Actions"}
                                className="flex items-center gap-2 px-3 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground hover:border-[var(--ink)] transition-all"
                            >
                                <MoreHorizontal className="w-4 h-4" />
                                <span className="hidden md:inline text-sm font-medium">{t("analytics.actionsMenu") || "Actions"}</span>
                            </button>

                            <AnimatePresence>
                                {actionsMenuOpen && (
                                    <motion.div
                                        role="menu"
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute right-0 top-full mt-2 z-50 bg-[var(--card-bg)] rounded-xl shadow-xl border border-[var(--card-border)] overflow-hidden min-w-[240px] py-1"
                                    >
                                        <button
                                            role="menuitem"
                                            onClick={() => { setIsMarketingModalOpen(true); setActionsMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-[var(--background)] transition-colors"
                                        >
                                            <Target className="w-4 h-4 text-violet-600" />
                                            <span>{t("analytics.marketing")}</span>
                                        </button>
                                        <button
                                            role="menuitem"
                                            onClick={() => { setIsDeliveryImportOpen(true); setActionsMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-[var(--background)] transition-colors"
                                        >
                                            <Truck className="w-4 h-4 text-teal-600" />
                                            <span>{t("analytics.importDelivery")}</span>
                                        </button>

                                        <div className="my-1 border-t border-[var(--card-border)]" />

                                        <button
                                            role="menuitem"
                                            onClick={() => handleExport("csv")}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-[var(--background)] transition-colors"
                                        >
                                            <FileText className="w-4 h-4 text-muted" />
                                            <span>{t("analytics.exportCsv")}</span>
                                        </button>
                                        <button
                                            role="menuitem"
                                            onClick={() => handleExport("excel")}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-[var(--background)] transition-colors"
                                        >
                                            <FileSpreadsheet className="w-4 h-4 text-muted" />
                                            <span>{t("analytics.exportExcel")}</span>
                                        </button>
                                        <button
                                            role="menuitem"
                                            onClick={() => handleExport("print")}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-[var(--background)] transition-colors"
                                        >
                                            <Printer className="w-4 h-4 text-muted" />
                                            <span>{t("analytics.printReport")}</span>
                                        </button>

                                        <div className="my-1 border-t border-[var(--card-border)]" />

                                        <button
                                            role="menuitem"
                                            onClick={() => { handleToggleFinancialEra(); setActionsMenuOpen(false); }}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                                                showFinancialEra
                                                    ? "text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20"
                                                    : "text-foreground hover:bg-[var(--background)]"
                                            )}
                                        >
                                            <Sparkles className="w-4 h-4" />
                                            <span>{t("analytics.era")}</span>
                                            {showFinancialEra && (
                                                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-amber-600">On</span>
                                            )}
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Primary CTA — always visible */}
                        <button
                            onClick={handleAddExpense}
                            className="flex items-center gap-2 px-4 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden md:inline">{t("analytics.addExpense")}</span>
                        </button>
                    </div>
                </div>

                {/* Financial Epoch Banner */}
                {showFinancialEra && (
                    <div className="mb-8">
                        {isEpochLoading ? (
                            <div className="skeleton h-24 rounded-2xl border border-[var(--card-border)]" />
                        ) : (
                            <EpochBanner
                                isEpochSet={isEpochSet}
                                epochDate={epochDate}
                                streakDays={streakDays}
                                currentMilestone={currentMilestone}
                                nextMilestone={nextMilestone}
                                milestoneProgress={milestoneProgress}
                                eraMode={eraMode}
                                onEraModeChange={handleEraModeChange}
                                onSetEpoch={handleSetEpoch}
                                isUpdating={isEpochUpdating}
                            />
                        )}
                    </div>
                )}

                {/* Mobile Tabs (Desktop uses Sidebar) */}
                <div className="md:hidden flex bg-[var(--card-bg)] rounded-xl p-1 mb-6 w-fit max-w-full border border-[var(--card-border)] overflow-x-auto mt-6 scrollbar-hide">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => router.push(tab.id === "profit" ? "/analytics" : `/analytics?tab=${tab.id}`)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap relative",
                                    activeTab === tab.id
                                        ? "bg-[var(--ink)] text-white"
                                        : "text-muted hover:text-foreground"
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {t(`analytics.tabs.${tab.id}`)}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                {activeTab === "profit" ? (
                    <div className="space-y-6">
                        {/* Overview Cards - Full Width at Top */}
                        <OverviewCards profitSummary={profitSummary} pipelineSummary={pipelineSummary} />

                        {/* Data Quality Badge */}
                        {isEpochSet && eraMode !== "clean" && (
                            <DataQualityBadge eraMode={eraMode} epochDate={epochDate} />
                        )}

                        {/* Two Column Grid: Pipeline + Realized Profit */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Pipeline Summary */}
                            <div className="flex flex-col">
                                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <Target className="w-5 h-5 text-indigo-600" />
                                    {t("analytics.pipeline")}
                                    <span className="text-xs font-normal text-muted">{t("analytics.pipelineDesc")}</span>
                                </h2>
                                <PipelineSummaryCard pipeline={pipelineSummary} />
                            </div>

                            {/* Realized Profit Breakdown */}
                            <div className="flex flex-col">
                                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-green-600" />
                                    {t("analytics.realizedProfit")}
                                    <span className="text-xs font-normal text-muted">{t("analytics.realizedProfitDesc")}</span>
                                </h2>
                                <ProfitSummaryCards summary={profitSummary} />
                            </div>
                        </div>

                        {/* Order Funnel - Full Width */}
                        <div className="flex flex-col">
                            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <ListChecks className="w-5 h-5 text-teal-600" />
                                {t("analytics.orderFunnel")}
                                <span className="text-xs font-normal text-muted">{t("analytics.orderFunnelDesc")}</span>
                            </h2>
                            <OrderFunnelCard funnel={funnelSummary} />
                        </div>

                        {/* Cost Composition */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                    {t("analytics.costComposition")}
                                </h3>
                                <CostCompositionChart summary={profitSummary} />
                            </div>

                            {/* Product Profit Analysis */}
                            <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                    {t("analytics.productProfitability")}
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
                                                    <p className="text-xs text-muted">{product.sold} {t("analytics.productSold")}</p>
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
                                                        : 0}% {t("analytics.productMargin")}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                    {productProfitAnalysis.length === 0 && (
                                        <p className="text-center text-muted py-8">{t("analytics.noProductData")}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Order Breakdown Table */}
                        <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                {t("analytics.profitBreakdown")}
                            </h3>
                            <ProfitBreakdownTable breakdowns={orderCostBreakdowns} />
                        </div>
                    </div>
                ) : activeTab === "customers" ? (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <Users className="w-5 h-5 text-blue-600" />
                                {t("analytics.customerAnalytics")}
                            </h2>
                            <CustomerAnalyticsCard analytics={customerAnalytics} />
                        </div>
                    </div>
                ) : activeTab === "expenses" ? (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <Receipt className="w-5 h-5 text-indigo-600" />
                                {t("analytics.expenseRegistry")}
                            </h2>
                            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-6">
                                <ExpenseList
                                    expenses={expenses}
                                    onEdit={handleEditExpense}
                                    onDelete={handleDeleteExpense}
                                />
                            </div>
                        </div>
                    </div>
                ) : activeTab === "overview" ? (
                    <div className="space-y-6">
                        {/* Revenue Cards */}
                        <div>
                            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-green-600" />
                                {t("analytics.revenue")}
                            </h2>
                            <RevenueCards stats={revenueStats} comparison={periodComparison} />
                        </div>

                        {/* Profit Cards */}
                        <div>
                            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                                <DollarSign className="w-5 h-5 text-blue-600" />
                                {t("analytics.profit")}
                            </h2>
                            <ProfitCards stats={profitStats} revenue={revenueStats.deliveredRevenue} />
                        </div>

                        {/* Charts Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Revenue Trend */}
                            <div className="lg:col-span-2 p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                    {t("analytics.revenueTrend")}
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

                        {/* Governorate Map */}
                        <div className="h-[420px]">
                            <IraqMap orders={ordersInRange} />
                        </div>

                        {/* Bottom Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Expense Breakdown */}
                            <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                                    {t("analytics.expenseBreakdown")}
                                </h3>
                                <ExpenseBreakdown data={expensesByCategory} />
                            </div>

                            {/* Peak Hours */}
                            <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    {t("analytics.peakSales")}
                                </h3>
                                <PeakHoursChart data={hourlyData} />
                            </div>
                        </div>

                        {/* Rejection Analytics */}
                        <div className="grid grid-cols-1 gap-6">
                            <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <X className="w-4 h-4" />
                                    {t("analytics.rejectionAnalysis")}
                                </h3>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <div className="lg:col-span-1 space-y-4">
                                        <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/20">
                                            <p className="text-sm text-rose-600 font-medium">{t("analytics.totalRejected")}</p>
                                            <p className="text-2xl font-bold text-rose-700">{rejectionStats.totalRejected}</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/20">
                                            <p className="text-sm text-orange-600 font-medium">{t("analytics.rejectionRate")}</p>
                                            <p className="text-2xl font-bold text-orange-700">{rejectionStats.rejectionRate.toFixed(1)}%</p>
                                            <p className="text-xs text-orange-600 mt-1">{t("analytics.ofAttempted")}</p>
                                        </div>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <h4 className="text-xs font-semibold text-muted mb-2">{t("analytics.topReasons")}</h4>
                                        <RejectionReasonsChart data={rejectionStats.byReason} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

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

                {/* Delivery Import Modal */}
                <DeliveryImportModal
                    open={isDeliveryImportOpen}
                    onClose={() => setIsDeliveryImportOpen(false)}
                />
            </div>
        </div>
    );
}
