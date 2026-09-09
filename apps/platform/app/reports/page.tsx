"use client";

import { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { FileBarChart, Download, FileSpreadsheet, Printer, RefreshCw, Filter, CalendarDays, TrendingUp, TrendingDown, DollarSign, Package } from "lucide-react";
import { useOrdersList } from "@/components/providers/orders-provider";
import { useReportsMetrics, useDateRangePresets, DateRange } from "@/hooks/use-reports-metrics";
import { useEmployeeMetrics } from "@/hooks/use-employee-metrics";
import { useBatchAnalytics } from "@/hooks/use-batch-analytics";
import { PageSkeleton } from "@scheniders/ui/skeletons";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { exportReportsToCSV, exportReportsToExcel, printOperationalReport } from "@/lib/reports-export";
import { calculateSourcePerformance, calculatePeriodComparison } from "@/lib/analytics/source-metrics";
import { calculateReturnAnalytics } from "@/lib/analytics/reports-calculations";
import { CustomDatePicker } from "@/components/reports/custom-date-picker";

// Dynamic imports for components
const KPICards = dynamic(
    () => import("@/components/reports/kpi-cards").then(mod => ({ default: mod.KPICards })),
    { loading: () => <div className="h-32 animate-pulse bg-white/5 rounded-3xl" /> }
);

const StatusFlowDiagram = dynamic(
    () => import("@/components/reports/status-flow-diagram").then(mod => ({ default: mod.StatusFlowDiagram })),
    { loading: () => <div className="h-[450px] animate-pulse bg-white/5 rounded-3xl" /> }
);

const ContactHeatmap = dynamic(
    () => import("@/components/reports/contact-heatmap").then(mod => ({ default: mod.ContactHeatmap })),
    { loading: () => <div className="h-96 animate-pulse bg-white/5 rounded-3xl" /> }
);

const CityPerformance = dynamic(
    () => import("@/components/reports/city-performance").then(mod => ({ default: mod.CityPerformance })),
    { loading: () => <div className="h-96 animate-pulse bg-white/5 rounded-3xl" /> }
);

const TimeAnalysis = dynamic(
    () => import("@/components/reports/time-analysis").then(mod => ({ default: mod.TimeAnalysis })),
    { loading: () => <div className="h-96 animate-pulse bg-white/5 rounded-3xl" /> }
);

const RejectionBreakdown = dynamic(
    () => import("@/components/reports/rejection-breakdown").then(mod => ({ default: mod.RejectionBreakdown })),
    { loading: () => <div className="h-96 animate-pulse bg-white/5 rounded-3xl" /> }
);

const ReturnBreakdown = dynamic(
    () => import("@/components/reports/return-breakdown").then(mod => ({ default: mod.ReturnBreakdown })),
    { loading: () => <div className="h-96 animate-pulse bg-white/5 rounded-3xl" /> }
);

const AttentionFlagsSummary = dynamic(
    () => import("@/components/reports/attention-flags-summary").then(mod => ({ default: mod.AttentionFlagsSummary })),
    { loading: () => <div className="h-32 animate-pulse bg-white/5 rounded-3xl" /> }
);

const SourcePerformance = dynamic(
    () => import("@/components/reports/source-performance").then(mod => ({ default: mod.SourcePerformance })),
    { loading: () => <div className="h-64 animate-pulse bg-white/5 rounded-3xl" /> }
);

const PeriodComparison = dynamic(
    () => import("@/components/reports/period-comparison").then(mod => ({ default: mod.PeriodComparison })),
    { loading: () => <div className="h-48 animate-pulse bg-white/5 rounded-3xl" /> }
);

const TrueEmployeePerformance = dynamic(
    () => import("@/components/reports/true-employee-performance").then(mod => ({ default: mod.TrueEmployeePerformance })),
    { loading: () => <div className="h-64 animate-pulse bg-white/5 rounded-3xl" /> }
);

const BatchAnalytics = dynamic(
    () => import("@/components/reports/batch-analytics").then(mod => ({ default: mod.BatchAnalytics })),
    { loading: () => <div className="h-64 animate-pulse bg-white/5 rounded-3xl" /> }
);

type PresetKey = 'today' | 'thisWeek' | 'thisMonth' | 'last7Days' | 'last30Days';

const presetLabels: Record<PresetKey, string> = {
    today: 'Today',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    last7Days: 'Last 7 Days',
    last30Days: 'Last 30 Days',
};

export default function ReportsPage() {
    const { orders, loading, error } = useOrdersList();
    const presets = useDateRangePresets();
    const [dateRange, setDateRange] = useState<DateRange>(presets.last30Days);

    const metrics = useReportsMetrics(orders, dateRange);

    // Calculate employee performance and period comparison
    const sourceMetrics = useMemo(() =>
        calculateSourcePerformance(orders, dateRange),
        [orders, dateRange]
    );

    const periodComparison = useMemo(() =>
        calculatePeriodComparison(orders, dateRange),
        [orders, dateRange]
    );

    // Calculate return analytics
    const returnAnalytics = useMemo(() =>
        calculateReturnAnalytics(orders),
        [orders]
    );

    // Use real employee metrics from activity_logs
    const {
        employees: realEmployeeMetrics,
        loading: employeeLoading,
        error: employeeError,
        refresh: refreshEmployeeMetrics
    } = useEmployeeMetrics(dateRange);

    // Batch analytics
    const {
        batches: batchData,
        summary: batchSummary,
        loading: batchLoading,
        error: batchError,
        refresh: refreshBatchAnalytics
    } = useBatchAnalytics(dateRange);

    // Date presets for custom picker
    const datePresets = useMemo(() => [
        { key: 'today', label: 'Today', range: presets.today },
        { key: 'thisWeek', label: 'This Week', range: presets.thisWeek },
        { key: 'thisMonth', label: 'This Month', range: presets.thisMonth },
        { key: 'last7Days', label: 'Last 7 Days', range: presets.last7Days },
        { key: 'last30Days', label: 'Last 30 Days', range: presets.last30Days },
    ], [presets]);

    const formatDateRange = (range: DateRange) => {
        const from = range.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const to = range.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${from} - ${to}`;
    };

    // Export handlers
    const getExportData = useCallback(() => {
        if (!metrics) return null;
        return {
            dateRange,
            kpis: metrics.kpis,
            statusFlow: metrics.statusFlow,
            contactAttempts: metrics.contactAttempts,
            cityPerformance: metrics.cityPerformance,
            rejectionReasons: metrics.rejectionReasons,
            timeAnalysis: metrics.timeAnalysis,
            attentionFlags: metrics.attentionFlags,
        };
    }, [metrics, dateRange]);

    const handleExportCSV = useCallback(() => {
        const data = getExportData();
        if (data) exportReportsToCSV(data);
    }, [getExportData]);

    const handleExportExcel = useCallback(() => {
        const data = getExportData();
        if (data) exportReportsToExcel(data);
    }, [getExportData]);

    const handlePrint = useCallback(() => {
        const data = getExportData();
        if (data) printOperationalReport(data);
    }, [getExportData]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--background)]">
                <PageSkeleton />
            </div>
        );
    }

    const { t } = useLanguage();

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <div className="pastel-card pastel-card-pink p-8 max-w-md text-center">
                    <h2 className="text-xl font-bold text-rose-900 mb-2">{t("reports.errorTitle")}</h2>
                    <p className="text-rose-700">{error}</p>
                </div>
            </div>
        );
    }

    if (!metrics) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <div className="text-center pastel-card p-12">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mx-auto mb-6">
                        <FileBarChart className="w-10 h-10 text-indigo-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">{t("reports.noData")}</h2>
                    <p className="text-muted">{t("reports.noDataDesc")}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6 md:p-8 bg-[var(--background)]">
            <div className="max-w-[1920px] mx-auto space-y-8">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
                >
                    <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                            <FileBarChart className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
                                {t("reports.title")}
                            </h1>
                            <p className="text-muted mt-1 text-lg">
                                {t("reports.subtitle")}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Custom Date Range Picker */}
                        <CustomDatePicker
                            dateRange={dateRange}
                            onChange={setDateRange}
                            presets={datePresets}
                        />

                        {/* Export Buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleExportExcel}
                                className="pastel-card w-11 h-11 rounded-xl flex items-center justify-center text-muted hover:text-foreground hover:shadow-md transition-all"
                                title="Export to Excel"
                            >
                                <FileSpreadsheet className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handlePrint}
                                className="pastel-card w-11 h-11 rounded-xl flex items-center justify-center text-muted hover:text-foreground hover:shadow-md transition-all"
                                title="Print Report"
                            >
                                <Printer className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleExportCSV}
                                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium text-sm shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:scale-[1.02] transition-all"
                            >
                                <Download className="w-4 h-4" />
                                <span>Export</span>
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* Attention Flags (if any) */}
                {metrics.attentionFlags.length > 0 && (
                    <AttentionFlagsSummary data={metrics.attentionFlags} />
                )}

                {/* KPI Cards Row */}
                <KPICards metrics={metrics.kpis} />

                {/* Status Flow */}
                <StatusFlowDiagram data={metrics.statusFlow} />

                {/* Three Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                        <ContactHeatmap data={metrics.contactAttempts} />
                    </div>
                    <div className="lg:col-span-1">
                        <TimeAnalysis data={metrics.timeAnalysis} />
                    </div>
                    <div className="lg:col-span-1">
                        <RejectionBreakdown data={metrics.rejectionReasons} />
                    </div>
                </div>

                {/* Returns & Rejections Analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ReturnBreakdown data={returnAnalytics} />
                </div>

                {/* City Performance (Full Width) */}
                <CityPerformance data={metrics.cityPerformance} />

                {/* Period Comparison */}
                <PeriodComparison data={periodComparison} currentRange={dateRange} />

                {/* Two Column Layout: True Employee Performance + Source Performance */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <TrueEmployeePerformance
                        data={realEmployeeMetrics}
                        loading={employeeLoading}
                        error={employeeError}
                        onRefresh={refreshEmployeeMetrics}
                    />
                    <SourcePerformance data={sourceMetrics} />
                </div>

                {/* Batch Analytics (Full Width) */}
                <BatchAnalytics
                    batches={batchData}
                    summary={batchSummary}
                    loading={batchLoading}
                    error={batchError}
                    onRefresh={refreshBatchAnalytics}
                />

            </div>
        </div>
    );
}
