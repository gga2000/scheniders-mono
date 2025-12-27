"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
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
} from "lucide-react";

// Hooks
import { useFinances, DateRange } from "@/hooks/use-finances";
import { useExpenses } from "@/hooks/use-expenses";

// Components
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { RevenueCards, ProfitCards } from "@/components/finances/stat-cards";
import { RevenueChart } from "@/components/finances/revenue-chart";
import { ExpenseBreakdown } from "@/components/finances/expense-breakdown";
import { PeakHoursChart } from "@/components/finances/peak-hours-chart";
import { ExpenseList } from "@/components/finances/expense-list";
import { ExpenseFormModal, ExpenseFormData } from "@/components/finances/expense-form-modal";
import { RejectionReasonsChart } from "@/components/analytics/rejection-reasons-chart";
import { PeriodComparisonCard } from "@/components/finances/period-comparison";

// Utils
import { exportFinancesToCSV, exportFinancesToExcel, printFinancialReport } from "@/lib/finance-export";
import { Expense } from "@/lib/expense-types";

type ActiveTab = "overview" | "expenses";

export default function AnalyticsPage() {
    // Date range state
    const today = new Date().toISOString().split("T")[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split("T")[0];

    const [dateRange, setDateRange] = useState<DateRange>({
        startDate: today,
        endDate: today,
    });

    const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
    const [expenseModalMode, setExpenseModalMode] = useState<"add" | "edit">("add");
    const [exportMenuOpen, setExportMenuOpen] = useState(false);

    // Data hooks
    const {
        revenueStats,
        profitStats,
        dailyData,
        hourlyData,
        expensesByCategory,
        comparePeriods,
        rejectionStats,
    } = useFinances(dateRange);

    const {
        expenses,
        addExpense,
        updateExpense,
        deleteExpense,
    } = useExpenses({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
    });

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

    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--pastel-blue)] flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-blue-700" />
                        </div>
                        Analytics
                    </h1>
                    <p className="text-muted mt-1">Track revenue, expenses, and order performance</p>
                </div>

                <div className="flex items-center gap-3">
                    <DateRangePicker
                        dateFrom={dateRange.startDate}
                        dateTo={dateRange.endDate}
                        onDateChange={(start, end) => setDateRange({ startDate: start || "", endDate: end || "" })}
                    />

                    {/* Export Menu */}
                    <div className="relative">
                        <button
                            onClick={() => setExportMenuOpen(!exportMenuOpen)}
                            className="flex items-center gap-2 px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground hover:border-[var(--foreground)] transition-all"
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
                        className="flex items-center gap-2 px-4 py-3 bg-[var(--foreground)] text-white rounded-xl font-medium hover:opacity-90 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden md:inline">Add Expense</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-[var(--card-bg)] rounded-xl p-1 mb-6 w-fit border border-[var(--card-border)]">
                <button
                    onClick={() => setActiveTab("overview")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "overview"
                        ? "bg-[var(--foreground)] text-white"
                        : "text-muted hover:text-foreground"
                        }`}
                >
                    <BarChart3 className="w-4 h-4" />
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab("expenses")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "expenses"
                        ? "bg-[var(--foreground)] text-white"
                        : "text-muted hover:text-foreground"
                        }`}
                >
                    <PieChart className="w-4 h-4" />
                    Expenses
                </button>
            </div>

            {/* Content */}
            {activeTab === "overview" ? (
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
        </div>
    );
}
