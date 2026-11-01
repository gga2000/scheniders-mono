"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    FileText,
    FileSpreadsheet,
    Download,
    CheckCircle2,
    Calendar,
    ListFilter,
    MousePointerClick,
    Loader2,
    ChevronRight,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Order } from "@/lib/supabase";
import { generatePDFReport } from "@/lib/pdf-report-generator";
import { generateExcelReport } from "@/lib/excel-report-generator";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";

// ============================================
// TYPES
// ============================================

interface ExportReportModalProps {
    open: boolean;
    onClose: () => void;
    filteredOrders: Order[];
    selectedOrderIds: Set<string>;
    currentDateFrom?: string;
    currentDateTo?: string;
}

type ExportFormat = "pdf" | "excel";
type ExportScope = "selected" | "current_view" | "today" | "this_week" | "this_month" | "all";
type ReportType = "order_list" | "summary";

// ============================================
// HELPERS
// ============================================

function getTodayRange(): { from: string; to: string } {
    const now = new Date();
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return { from: d, to: d };
}

function getThisWeekRange(): { from: string; to: string } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    // Start from Saturday (Iraqi week start)
    const satOffset = dayOfWeek >= 6 ? dayOfWeek - 6 : dayOfWeek + 1;
    const start = new Date(now);
    start.setDate(now.getDate() - satOffset);
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: fmt(start), to: fmt(now) };
}

function getThisMonthRange(): { from: string; to: string } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: fmt(start), to: fmt(now) };
}


// ============================================
// COMPONENT
// ============================================

export function ExportReportModal({
    open,
    onClose,
    filteredOrders,
    selectedOrderIds,
    currentDateFrom,
    currentDateTo,
}: ExportReportModalProps) {
    const { tenantId } = useAuth();
    const { t, language } = useLanguage();
    const dateLocale = language === "ar" ? "ar-IQ" : "en-US";
    const [format, setFormat] = useState<ExportFormat | null>(null);
    const [scope, setScope] = useState<ExportScope | null>(null);
    const [reportType, setReportType] = useState<ReportType>("order_list");
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationComplete, setGenerationComplete] = useState(false);

    // Step tracking
    const currentStep = useMemo(() => {
        if (!format) return 1;
        if (!scope) return 2;
        return 3;
    }, [format, scope]);

    // Scopes that mean "everything matching this range", not "whatever the page
    // has loaded". These are fetched from the server: the orders list is being
    // moved to a windowed fetch, and reading the in-memory array here would
    // silently shrink a "this month" or "all orders" export to the loaded
    // window — wrong numbers in a reporting file, with no error shown.
    const serverScopeRange = useMemo(() => {
        switch (scope) {
            case "today": return getTodayRange();
            case "this_week": return getThisWeekRange();
            case "this_month": return getThisMonthRange();
            case "all": return { from: undefined, to: undefined };
            default: return null;
        }
    }, [scope]);

    const {
        data: serverScopedOrders,
        isFetching: isFetchingScope,
        isError: scopeFetchFailed,
    } = useQuery({
        queryKey: ["orders", "export-scope", serverScopeRange?.from ?? "all", serverScopeRange?.to ?? "all"],
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return orderRepository.findForExport(tenantId, {
                dateFrom: serverScopeRange?.from,
                dateTo: serverScopeRange?.to,
            });
        },
        enabled: open && serverScopeRange !== null && !!tenantId,
        staleTime: 60_000,
    });

    // Get orders based on scope
    const scopedOrders = useMemo(() => {
        if (!scope) return [];
        switch (scope) {
            case "selected":
                return filteredOrders.filter((o) => selectedOrderIds.has(o.id));
            case "current_view":
                return filteredOrders;
            case "today":
            case "this_week":
            case "this_month":
            case "all":
                return serverScopedOrders ?? [];
            default:
                return filteredOrders;
        }
    }, [scope, filteredOrders, selectedOrderIds, serverScopedOrders]);

    // The picker advertises a count per scope. Those must describe the server's
    // data, not the loaded window, or the picker promises one number and the
    // generated file contains another.
    const { data: scopeCounts } = useQuery({
        queryKey: ["orders", "export-scope-counts"],
        queryFn: async () => {
            if (!tenantId) throw new Error("No active tenant");
            const today = getTodayRange();
            const week = getThisWeekRange();
            const month = getThisMonthRange();
            const [todayCount, weekCount, monthCount, allCount] = await Promise.all([
                orderRepository.countForExport(tenantId, { dateFrom: today.from, dateTo: today.to }),
                orderRepository.countForExport(tenantId, { dateFrom: week.from, dateTo: week.to }),
                orderRepository.countForExport(tenantId, { dateFrom: month.from, dateTo: month.to }),
                orderRepository.countForExport(tenantId, {}),
            ]);
            return { today: todayCount, this_week: weekCount, this_month: monthCount, all: allCount };
        },
        enabled: open && !!tenantId,
        staleTime: 60_000,
    });

    // Get date range for report header
    const dateRange = useMemo(() => {
        if (!scope) return { from: "", to: "" };
        switch (scope) {
            case "today":
                return getTodayRange();
            case "this_week":
                return getThisWeekRange();
            case "this_month":
                return getThisMonthRange();
            case "current_view":
                if (currentDateFrom) {
                    return { from: currentDateFrom, to: currentDateTo || currentDateFrom };
                }
                // Fallback: use min/max dates from orders
                if (filteredOrders.length > 0) {
                    const dates = filteredOrders.map((o) => o.created_at.split("T")[0]).sort();
                    return { from: dates[0], to: dates[dates.length - 1] };
                }
                return getTodayRange();
            case "selected":
            case "all":
            default:
                if (scopedOrders.length > 0) {
                    const dates = scopedOrders.map((o) => o.created_at.split("T")[0]).sort();
                    return { from: dates[0], to: dates[dates.length - 1] };
                }
                return getTodayRange();
        }
    }, [scope, currentDateFrom, currentDateTo, filteredOrders, scopedOrders]);

    // Report title
    const reportTitle = useMemo(() => {
        const scopeLabels: Record<ExportScope, string> = {
            selected: "Selected Orders Report",
            current_view: "Filtered Orders Report",
            today: "Daily Report",
            this_week: "Weekly Report",
            this_month: "Monthly Report",
            all: "Full Orders Report",
        };
        return scope ? scopeLabels[scope] : "Orders Report";
    }, [scope]);

    const handleClose = useCallback(() => {
        setFormat(null);
        setScope(null);
        setReportType("order_list");
        setIsGenerating(false);
        setGenerationComplete(false);
        onClose();
    }, [onClose]);

    const handleGenerate = useCallback(async () => {
        // Never build a file from a half-loaded scope — that would silently
        // export fewer orders than the merchant asked for.
        if (!format || !scope || isFetchingScope || scopeFetchFailed) return;
        if (scopedOrders.length === 0) return;

        setIsGenerating(true);

        try {
            if (format === "pdf") {
                await generatePDFReport({
                    title: reportTitle,
                    dateRange,
                    reportType,
                    orders: scopedOrders,
                });
            } else {
                await generateExcelReport({
                    title: reportTitle,
                    dateRange,
                    reportType,
                    orders: scopedOrders,
                });
            }

            setGenerationComplete(true);
            toast.success(t("orders.export.doneTitle"), t("orders.export.doneBody", { count: scopedOrders.length }));

            // Auto-close after a moment
            setTimeout(() => {
                handleClose();
            }, 1500);
        } catch (error) {
            console.error("Report generation failed:", error);
            toast.error(t("orders.export.failTitle"), t("orders.export.failBody"));
        } finally {
            setIsGenerating(false);
        }
    }, [format, scope, scopedOrders, reportTitle, dateRange, reportType, isFetchingScope, scopeFetchFailed, handleClose, t]);

    const handleBack = useCallback(() => {
        if (currentStep === 3) setScope(null);
        else if (currentStep === 2) setFormat(null);
    }, [currentStep]);

    if (!open) return null;

    // ============================================
    // SCOPE OPTIONS
    // ============================================
    const scopeOptions: { id: ExportScope; label: string; sublabel: string; count: number | null; icon: React.ReactNode; disabled?: boolean }[] = [
        {
            id: "selected",
            label: t("orders.export.scopeSelected"),
            sublabel: t("orders.export.scopeSelectedSub", { count: selectedOrderIds.size }),
            count: selectedOrderIds.size,
            icon: <MousePointerClick className="w-5 h-5" />,
            disabled: selectedOrderIds.size === 0,
        },
        {
            id: "current_view",
            label: t("orders.export.scopeView"),
            sublabel: t("orders.export.scopeViewSub", { count: filteredOrders.length }),
            count: filteredOrders.length,
            icon: <ListFilter className="w-5 h-5" />,
        },
        {
            id: "today",
            label: t("orders.export.scopeToday"),
            sublabel: new Date().toLocaleDateString(dateLocale, { month: "long", day: "numeric", year: "numeric" }),
            count: scopeCounts?.today ?? null,
            icon: <Calendar className="w-5 h-5" />,
        },
        {
            id: "this_week",
            label: t("orders.export.scopeWeek"),
            sublabel: t("orders.export.scopeWeekSub"),
            count: scopeCounts?.this_week ?? null,
            icon: <Calendar className="w-5 h-5" />,
        },
        {
            id: "this_month",
            label: t("orders.export.scopeMonth"),
            sublabel: new Date().toLocaleDateString(dateLocale, { month: "long", year: "numeric" }),
            count: scopeCounts?.this_month ?? null,
            icon: <Calendar className="w-5 h-5" />,
        },
        {
            id: "all",
            label: t("orders.export.scopeAll"),
            sublabel: scopeCounts ? t("orders.export.scopeAllSub", { count: scopeCounts.all }) : t("orders.export.scopeAllSubUnknown"),
            count: scopeCounts?.all ?? null,
            icon: <Sparkles className="w-5 h-5" />,
        },
    ];

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                onClick={handleClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: "spring", damping: 25, stiffness: 350 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white dark:bg-[#1a1a1a] rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/10"
                >
                    {/* Header */}
                    <div className="relative px-6 pt-6 pb-4">
                        {/* Progress indicator */}
                        <div className="flex items-center gap-2 mb-4">
                            {[1, 2, 3].map((step) => (
                                <div key={step} className="flex items-center gap-2 flex-1">
                                    <div
                                        className={cn(
                                            "h-1 rounded-full flex-1 transition-all duration-500",
                                            step <= currentStep
                                                ? "bg-gradient-to-r from-amber-400 to-orange-500 dark:from-[#EFFF00] dark:to-[#B4C000]"
                                                : "bg-gray-200 dark:bg-[#333]"
                                        )}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 dark:from-[#EFFF00] dark:to-[#B4C000] text-white dark:text-black shadow-lg">
                                    <Download className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-foreground dark:text-white">
                                        {t("orders.export.title")}
                                    </h2>
                                    <p className="text-xs text-muted-foreground dark:text-[#888]">
                                        {currentStep === 1 && t("orders.export.stepFormat")}
                                        {currentStep === 2 && t("orders.export.stepScope")}
                                        {currentStep === 3 && t("orders.export.stepReady")}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
                            >
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-6 pb-6">
                        <AnimatePresence mode="wait">
                            {/* STEP 1: Format Selection */}
                            {currentStep === 1 && (
                                <motion.div
                                    key="format"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-3"
                                >
                                    <p className="text-sm font-medium text-muted-foreground dark:text-[#aaa] mb-4">
                                        {t("orders.export.chooseFormat")}
                                    </p>

                                    <div className="grid grid-cols-2 gap-3">
                                        {/* PDF Card */}
                                        <button
                                            onClick={() => setFormat("pdf")}
                                            className={cn(
                                                "relative group p-5 rounded-2xl border-2 transition-all duration-300 text-left overflow-hidden",
                                                format === "pdf"
                                                    ? "border-red-400 bg-red-50 dark:bg-red-950/20 dark:border-red-500/50 shadow-lg shadow-red-500/10"
                                                    : "border-gray-200 dark:border-[#333] hover:border-red-300 dark:hover:border-red-500/30 hover:shadow-md"
                                            )}
                                        >
                                            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-red-100 dark:from-red-900/20 to-transparent rounded-bl-3xl opacity-60" />
                                            <div className="relative">
                                                <div className={cn(
                                                    "w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all",
                                                    format === "pdf"
                                                        ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
                                                        : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                                )}>
                                                    <FileText className="w-6 h-6" />
                                                </div>
                                                <h3 className="font-bold text-foreground dark:text-white text-base">PDF</h3>
                                                <p className="text-xs text-muted-foreground dark:text-[#888] mt-1">
                                                    {t("orders.export.pdfHint")}
                                                </p>
                                            </div>
                                        </button>

                                        {/* Excel Card */}
                                        <button
                                            onClick={() => setFormat("excel")}
                                            className={cn(
                                                "relative group p-5 rounded-2xl border-2 transition-all duration-300 text-left overflow-hidden",
                                                format === "excel"
                                                    ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                                                    : "border-gray-200 dark:border-[#333] hover:border-emerald-300 dark:hover:border-emerald-500/30 hover:shadow-md"
                                            )}
                                        >
                                            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-100 dark:from-emerald-900/20 to-transparent rounded-bl-3xl opacity-60" />
                                            <div className="relative">
                                                <div className={cn(
                                                    "w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all",
                                                    format === "excel"
                                                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                                                        : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                                )}>
                                                    <FileSpreadsheet className="w-6 h-6" />
                                                </div>
                                                <h3 className="font-bold text-foreground dark:text-white text-base">Excel</h3>
                                                <p className="text-xs text-muted-foreground dark:text-[#888] mt-1">
                                                    {t("orders.export.excelHint")}
                                                </p>
                                            </div>
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {/* STEP 2: Scope Selection */}
                            {currentStep === 2 && (
                                <motion.div
                                    key="scope"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-2"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-sm font-medium text-muted-foreground dark:text-[#aaa]">
                                            {t("orders.export.whichOrders")}
                                        </p>
                                        <button
                                            onClick={handleBack}
                                            className="text-xs text-muted-foreground hover:text-foreground dark:hover:text-white transition-colors"
                                        >
                                            {t("orders.export.back")}
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                                        {scopeOptions.map((option) => (
                                            <button
                                                key={option.id}
                                                onClick={() => !option.disabled && setScope(option.id)}
                                                disabled={option.disabled}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left group",
                                                    scope === option.id
                                                        ? "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 ring-2 ring-amber-400 dark:ring-[#EFFF00]/50"
                                                        : option.disabled
                                                            ? "bg-gray-50 dark:bg-[#222] opacity-50 cursor-not-allowed"
                                                            : "bg-gray-50 dark:bg-[#222] hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
                                                )}
                                            >
                                                <div className={cn(
                                                    "p-2 rounded-lg transition-colors",
                                                    scope === option.id
                                                        ? "bg-amber-200/50 dark:bg-[#EFFF00]/20 text-amber-700 dark:text-[#EFFF00]"
                                                        : "bg-white dark:bg-[#333] text-muted-foreground"
                                                )}>
                                                    {option.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-sm text-foreground dark:text-white">
                                                        {option.label}
                                                    </h4>
                                                    <p className="text-xs text-muted-foreground dark:text-[#888] truncate">
                                                        {option.sublabel}
                                                    </p>
                                                </div>
                                                <div className={cn(
                                                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-colors",
                                                    scope === option.id
                                                        ? "bg-amber-200 dark:bg-[#EFFF00]/30 text-amber-800 dark:text-[#EFFF00]"
                                                        : "bg-gray-200 dark:bg-[#444] text-gray-600 dark:text-[#aaa]"
                                                )}>
                                                    {option.count ?? "…"}
                                                </div>
                                                <ChevronRight className={cn(
                                                    "w-4 h-4 transition-transform text-muted-foreground",
                                                    scope === option.id ? "translate-x-0.5" : "group-hover:translate-x-0.5"
                                                )} />
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}

                            {/* STEP 3: Review & Generate */}
                            {currentStep === 3 && (
                                <motion.div
                                    key="generate"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-4"
                                >
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium text-muted-foreground dark:text-[#aaa]">
                                            {t("orders.export.review")}
                                        </p>
                                        <button
                                            onClick={handleBack}
                                            className="text-xs text-muted-foreground hover:text-foreground dark:hover:text-white transition-colors"
                                        >
                                            {t("orders.export.back")}
                                        </button>
                                    </div>

                                    {/* Summary Card */}
                                    <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#222] border border-gray-200 dark:border-[#333] space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground dark:text-[#888] uppercase tracking-wider font-bold">{t("orders.export.format")}</span>
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "p-1 rounded-md",
                                                    format === "pdf" ? "bg-red-100 dark:bg-red-900/30" : "bg-emerald-100 dark:bg-emerald-900/30"
                                                )}>
                                                    {format === "pdf"
                                                        ? <FileText className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                                                        : <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                                    }
                                                </div>
                                                <span className="text-sm font-semibold text-foreground dark:text-white">
                                                    {format === "pdf" ? t("orders.export.pdfReport") : t("orders.export.excelWorkbook")}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground dark:text-[#888] uppercase tracking-wider font-bold">{t("orders.export.scope")}</span>
                                            <span className="text-sm font-semibold text-foreground dark:text-white">
                                                {scopeOptions.find((o) => o.id === scope)?.label ?? reportTitle}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground dark:text-[#888] uppercase tracking-wider font-bold">{t("orders.export.orders")}</span>
                                            <span className="text-sm font-bold text-amber-600 dark:text-[#EFFF00]">
                                                {isFetchingScope ? t("orders.export.counting") : t("orders.export.nOrders", { count: scopedOrders.length })}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground dark:text-[#888] uppercase tracking-wider font-bold">{t("orders.export.period")}</span>
                                            <span className="text-xs text-muted-foreground dark:text-[#aaa]">
                                                {dateRange.from && new Date(dateRange.from + "T00:00:00").toLocaleDateString(dateLocale, { month: "short", day: "numeric" })}
                                                {dateRange.from !== dateRange.to && dateRange.to &&
                                                    ` — ${new Date(dateRange.to + "T00:00:00").toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" })}`
                                                }
                                            </span>
                                        </div>
                                    </div>

                                    {/* Report Type Toggle */}
                                    <div className="flex items-center gap-2 p-1 rounded-xl bg-gray-100 dark:bg-[#222]">
                                        <button
                                            onClick={() => setReportType("order_list")}
                                            className={cn(
                                                "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                                                reportType === "order_list"
                                                    ? "bg-white dark:bg-[#333] text-foreground dark:text-white shadow-sm"
                                                    : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                                            )}
                                        >
                                            {t("orders.export.orderList")}
                                        </button>
                                        <button
                                            onClick={() => setReportType("summary")}
                                            className={cn(
                                                "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                                                reportType === "summary"
                                                    ? "bg-white dark:bg-[#333] text-foreground dark:text-white shadow-sm"
                                                    : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                                            )}
                                        >
                                            {t("orders.export.summaryOnly")}
                                        </button>
                                    </div>

                                    {/* Generate Button */}
                                    <button
                                        onClick={handleGenerate}
                                        disabled={isGenerating || isFetchingScope || scopeFetchFailed || scopedOrders.length === 0}
                                        className={cn(
                                            "w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2",
                                            generationComplete
                                                ? "bg-emerald-500 text-white"
                                                : (isGenerating || isFetchingScope)
                                                    ? "bg-gray-200 dark:bg-[#333] text-muted-foreground cursor-wait"
                                                    : scopedOrders.length === 0
                                                        ? "bg-gray-200 dark:bg-[#333] text-gray-400 cursor-not-allowed"
                                                        : "bg-foreground dark:bg-[#EFFF00] text-background dark:text-black hover:opacity-90 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                                        )}
                                    >
                                        {generationComplete ? (
                                            <>
                                                <CheckCircle2 className="w-5 h-5" />
                                                {t("orders.export.downloaded")}
                                            </>
                                        ) : scopeFetchFailed ? (
                                            <>
                                                <X className="w-5 h-5" />
                                                {t("orders.export.loadFailed")}
                                            </>
                                        ) : isFetchingScope ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                {t("orders.export.loading")}
                                            </>
                                        ) : isGenerating ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                {t("orders.export.generating")}
                                            </>
                                        ) : (
                                            <>
                                                <Download className="w-5 h-5" />
                                                {t("orders.export.generate")}
                                            </>
                                        )}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
