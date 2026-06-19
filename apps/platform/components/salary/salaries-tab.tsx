"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings2, Clock, History, TrendingDown, AlertCircle, CheckCircle, RefreshCw, Download, FileSpreadsheet, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";

import { useSalaries, type OrderAttributionMode, type EmployeePeriodOverrides } from "@/hooks/use-salaries";
import { useSalaryConfig } from "@/hooks/use-salary-config";
import { useSalaryDeductions } from "@/hooks/use-salary-deductions";
import { usePayroll } from "@/hooks/use-payroll";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { downloadPayslipBlob, generatePayslipPDF } from "@/lib/payroll-pdf-generator";
import { exportCurrentPeriodCSV } from "@/lib/payroll-csv-export";
import { generatePayrollSummaryPDF, downloadSummaryBlob } from "@/lib/payroll-summary-pdf";

import { SalaryOverviewCards } from "./salary-overview-cards";
import { OrderQualityStrip } from "./order-quality-strip";
import { PayrollPeriodSelector, type PeriodMode } from "./payroll-period-selector";
import { EmployeePayrollCard } from "./employee-payroll-card";
import { PayrollHistoryTable } from "./payroll-history-table";
import { SalaryDeductionsTab } from "./salary-deductions-tab";
import { RoleDefaultsModal } from "./role-defaults-modal";
import { PayslipPreviewModal } from "./payslip-preview-modal";

import type { EmployeePayrollData } from "@/types/salary";

type SubTab = "current" | "history" | "advances" | "penalties";

function today() {
    return format(new Date(), "yyyy-MM-dd");
}

function thirtyDaysAgo() {
    return format(subDays(new Date(), 30), "yyyy-MM-dd");
}

type PaymentMethod = "cash" | "zain_cash" | "qi_card";

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
    { value: "cash", label: "Cash", icon: "💵" },
    { value: "zain_cash", label: "ZainCash", icon: "📱" },
    { value: "qi_card", label: "Qi Card", icon: "💳" },
];

// Confirm dialog component
function ConfirmPayrollDialog({
    isOpen,
    data,
    onConfirm,
    onClose,
    onPreview,
}: {
    isOpen: boolean;
    data: EmployeePayrollData | null;
    onConfirm: (notes: string, paymentMethod: PaymentMethod) => void;
    onClose: () => void;
    onPreview?: () => void;
}) {
    const [notes, setNotes] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

    if (!isOpen || !data) return null;

    function fmtIQD(n: number) {
        return new Intl.NumberFormat("en-IQ").format(Math.round(n));
    }

    const { calculation } = data;
    const name = data.employee.displayName || data.employee.email.split("@")[0];

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative z-10 w-full max-w-md bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4"
                >
                    <div className="p-6 border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">Confirm Payroll</h2>
                                <p className="text-xs text-muted">{name}</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        {/* Breakdown summary */}
                        <div className="bg-[var(--background)] rounded-xl p-4 space-y-2">
                            {[
                                { label: "Base Salary", value: calculation.baseSalary, sign: "" },
                                { label: `Order Bonus (${calculation.completedOrdersCount} payable)`, value: calculation.orderBonus, sign: "+" },
                                { label: "Performance Bonuses", value: calculation.performanceBonusesTotal, sign: "+" },
                                { label: "Absence Deduction", value: calculation.absenceDeduction, sign: "−" },
                                { label: "Advances", value: calculation.advancesTotal, sign: "−" },
                                { label: "Penalties", value: calculation.penaltiesTotal, sign: "−" },
                            ]
                                .filter(item => item.value > 0)
                                .map(item => (
                                    <div key={item.label} className="flex justify-between text-sm">
                                        <span className="text-muted">{item.label}</span>
                                        <span className="font-medium text-foreground tabular-nums">
                                            {item.sign}{fmtIQD(item.value)} IQD
                                        </span>
                                    </div>
                                ))}
                            <div className="border-t border-[var(--card-border)] pt-2 flex justify-between">
                                <span className="font-semibold text-foreground">Net Payable</span>
                                <span className="font-bold text-emerald-600 tabular-nums">
                                    {fmtIQD(calculation.netSalary)} IQD
                                </span>
                            </div>
                            {calculation.orderBreakdown.replacements + calculation.orderBreakdown.refunds > 0 && (
                                <p className="text-xs text-muted pt-1 border-t border-[var(--card-border)]">
                                    {calculation.orderBreakdown.completedTotal} completed ·{" "}
                                    {calculation.orderBreakdown.replacements} replacement
                                    {calculation.orderBreakdown.replacements !== 1 ? "s" : ""} and{" "}
                                    {calculation.orderBreakdown.refunds} refund
                                    {calculation.orderBreakdown.refunds !== 1 ? "s" : ""} excluded from the bonus.
                                </p>
                            )}
                        </div>

                        {/* Payment method */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Payment Method</label>
                            <div className="flex gap-2">
                                {PAYMENT_METHODS.map(m => (
                                    <button
                                        key={m.value}
                                        onClick={() => setPaymentMethod(m.value)}
                                        className={cn(
                                            "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all",
                                            paymentMethod === m.value
                                                ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                                : "bg-[var(--background)] text-muted border-[var(--card-border)] hover:text-foreground"
                                        )}
                                    >
                                        <span className="text-base">{m.icon}</span>
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Notes (optional)</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Any additional notes..."
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                            />
                        </div>

                        <p className="text-xs text-muted bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                            This will lock the payroll record and mark all pending advances, penalties, and bonuses as applied. This cannot be undone.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-3 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                Cancel
                            </button>
                            {onPreview && (
                                <button
                                    onClick={onPreview}
                                    className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] text-foreground rounded-xl font-medium hover:border-[var(--ink)] transition-all flex items-center justify-center gap-2"
                                >
                                    <Eye className="w-4 h-4" />
                                    Preview
                                </button>
                            )}
                            <button
                                onClick={() => onConfirm(notes, paymentMethod)}
                                className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-4 h-4" />
                                Confirm & Lock
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

export function SalariesTab() {
    const { user } = useAuth();
    const [periodMode, setPeriodMode] = useState<PeriodMode>("since_last");
    const [customStart, setCustomStart] = useState(thirtyDaysAgo);
    const [customEnd, setCustomEnd] = useState(today);
    const [activeSubTab, setActiveSubTab] = useState<SubTab>("current");
    const [roleDefaultsOpen, setRoleDefaultsOpen] = useState(false);
    const [attributionMode, setAttributionMode] = useState<OrderAttributionMode>("all");
    const [payingEmployeeId, setPayingEmployeeId] = useState<string | null>(null);
    const [confirmData, setConfirmData] = useState<EmployeePayrollData | null>(null);
    const [periodOverrides, setPeriodOverrides] = useState<EmployeePeriodOverrides>(new Map());
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState<"name" | "net_desc" | "net_asc" | "last_paid">("name");
    const [bulkPayOpen, setBulkPayOpen] = useState(false);
    const [bulkPayProgress, setBulkPayProgress] = useState<{ done: number; total: number } | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [previewMeta, setPreviewMeta] = useState({ name: "", periodEnd: "" });
    const [hiddenEmployeeIds, setHiddenEmployeeIds] = useState<Set<string>>(() => {
        if (typeof window === "undefined") return new Set();
        try {
            const stored = localStorage.getItem("salary_hidden_employees");
            return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
        } catch { return new Set(); }
    });
    const [showHidden, setShowHidden] = useState(false);

    const { roleSalaryDefaults, upsertRoleDefault, upsertEmployeeConfig, refresh: refreshConfigs } = useSalaryConfig();
    const {
        advances,
        penalties,
        bonuses,
        addAdvance,
        deleteAdvance,
        addPenalty,
        deletePenalty,
        addBonus,
        deleteBonus,
        refresh: refreshDeductions,
    } = useSalaryDeductions();

    const { runPayroll, getLastPayrollDates, payrollHistory, fetchAllHistory } = usePayroll();

    // Clear per-employee overrides when the global period changes so the new period takes effect
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPeriodOverrides(new Map());
    }, [periodMode, customStart, customEnd]);

    // Compute effective period
    const { periodStart, periodEnd } = useMemo(() => {
        if (periodMode === "custom") {
            return { periodStart: customStart, periodEnd: customEnd };
        }
        // "since_last" — will be overridden per-employee, but for the global hook we use a wide range
        // The actual per-employee "since last" is shown on the card
        // For the data fetch, use last 90 days as default when in "since_last" mode
        return {
            periodStart: format(subDays(new Date(), 90), "yyyy-MM-dd"),
            periodEnd: today(),
        };
    }, [periodMode, customStart, customEnd]);

    const { employeePayrollData, isLoading, totalDue, totalPendingAdvances, totalPendingPenalties, periodBreakdown, lastPayrollDates, refresh: refreshSalaries } = useSalaries(periodStart, periodEnd, attributionMode, periodOverrides, periodMode);

    const effectiveEmployeeData = useMemo(() => {
        let list = [...employeePayrollData];
        if (!showHidden) {
            list = list.filter(d => !hiddenEmployeeIds.has(d.employee.id));
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(d => {
                const name = (d.employee.displayName || d.employee.email).toLowerCase();
                return name.includes(q) || d.employee.role.toLowerCase().includes(q);
            });
        }
        list.sort((a, b) => {
            if (sortBy === "net_desc") return b.calculation.netSalary - a.calculation.netSalary;
            if (sortBy === "net_asc") return a.calculation.netSalary - b.calculation.netSalary;
            if (sortBy === "last_paid") {
                const da = a.lastPayrollDate ?? "0000-00-00";
                const db = b.lastPayrollDate ?? "0000-00-00";
                return db.localeCompare(da);
            }
            // default: name
            const na = (a.employee.displayName || a.employee.email).toLowerCase();
            const nb = (b.employee.displayName || b.employee.email).toLowerCase();
            return na.localeCompare(nb);
        });
        return list;
    }, [employeePayrollData, search, sortBy, showHidden, hiddenEmployeeIds]);

    // Build employee name map for history/deductions tabs
    const employeeNames = useMemo(() => {
        const map = new Map<string, string>();
        for (const d of employeePayrollData) {
            map.set(d.employee.id, d.employee.displayName || d.employee.email.split("@")[0]);
        }
        return map;
    }, [employeePayrollData]);

    const handleRefreshAll = useCallback(() => {
        refreshSalaries();
        refreshDeductions();
        refreshConfigs();
        fetchAllHistory();
    }, [refreshSalaries, refreshDeductions, refreshConfigs, fetchAllHistory]);

    const handleHideEmployee = useCallback((employeeId: string) => {
        setHiddenEmployeeIds(prev => {
            const next = new Set(prev);
            next.add(employeeId);
            try { localStorage.setItem("salary_hidden_employees", JSON.stringify([...next])); } catch {}
            return next;
        });
    }, []);

    const handleUnhideEmployee = useCallback((employeeId: string) => {
        setHiddenEmployeeIds(prev => {
            const next = new Set(prev);
            next.delete(employeeId);
            try { localStorage.setItem("salary_hidden_employees", JSON.stringify([...next])); } catch {}
            return next;
        });
    }, []);

    useEffect(() => { fetchAllHistory(); }, [fetchAllHistory]);

    const handleMarkAsPaid = useCallback((data: EmployeePayrollData) => {
        setConfirmData(data);
    }, []);

    const handlePreviewPayslip = useCallback(async () => {
        if (!confirmData) return;
        const emp = confirmData.employee;
        const calc = confirmData.calculation;
        const override = periodOverrides.get(emp.id);
        let pStart = override?.start ?? periodStart;
        let pEnd = override?.end ?? periodEnd;
        if (!override && periodMode === "since_last") {
            const lastDate = lastPayrollDates.get(emp.id);
            pStart = lastDate
                ? format(new Date(new Date(lastDate).getTime() + 86400000), "yyyy-MM-dd")
                : format(subDays(new Date(), 90), "yyyy-MM-dd");
            pEnd = format(new Date(), "yyyy-MM-dd");
        }
        const blob = await generatePayslipPDF({
            record: {
                id: "preview-" + Date.now(),
                employee_id: emp.id,
                period_start: pStart,
                period_end: pEnd,
                base_salary: calc.baseSalary,
                completed_orders_count: calc.completedOrdersCount,
                order_bonus: calc.orderBonus,
                performance_bonuses_total: calc.performanceBonusesTotal,
                advances_deducted: calc.advancesTotal,
                penalties_deducted: calc.penaltiesTotal,
                absence_days: calc.absenceDays,
                absence_deduction: calc.absenceDeduction,
                gross_salary: calc.grossSalary,
                net_salary: calc.netSalary,
                status: "paid",
                paid_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
            },
            employeeName: emp.displayName || emp.email.split("@")[0],
            employeeEmail: emp.email,
            employeeRole: emp.role,
            perOrderBonus: confirmData.effectiveRate.perOrderBonus,
            orderBreakdown: calc.orderBreakdown,
            orderStatusBreakdown: calc.orderStatusBreakdown,
        });
        const name = emp.displayName || emp.email.split("@")[0];
        setPreviewBlob(blob);
        setPreviewMeta({ name, periodEnd: pEnd });
        setPreviewOpen(true);
    }, [confirmData, periodOverrides, periodStart, periodEnd, periodMode, lastPayrollDates]);

    const handleConfirmPayroll = useCallback(
        async (notes: string, paymentMethod: PaymentMethod) => {
            if (!confirmData || !user?.id) return;
            setPayingEmployeeId(confirmData.employee.id);

            // Effective period: per-employee override takes priority, then since_last, then global
            const override = periodOverrides.get(confirmData.employee.id);
            let pStart = override?.start ?? periodStart;
            let pEnd = override?.end ?? periodEnd;

            if (!override && periodMode === "since_last") {
                const lastDate = lastPayrollDates.get(confirmData.employee.id);
                if (lastDate) {
                    pStart = format(new Date(new Date(lastDate).getTime() + 86400000), "yyyy-MM-dd");
                } else {
                    pStart = format(subDays(new Date(), 90), "yyyy-MM-dd");
                }
                pEnd = today();
            }

            const calc = {
                ...confirmData.calculation,
                periodStart: pStart,
                periodEnd: pEnd,
            };

            const emp = confirmData.employee;
            const payslipMeta = {
                employeeName: emp.displayName || emp.email.split("@")[0],
                employeeEmail: emp.email,
                employeeRole: emp.role,
                perOrderBonus: confirmData.effectiveRate.perOrderBonus,
            };

            const { error, record, deductionWarnings } = await runPayroll(calc, user.id, notes || undefined, payslipMeta, paymentMethod);
            setConfirmData(null);
            setPayingEmployeeId(null);
            handleRefreshAll();

            if (error) {
                toast({ title: "Payroll failed", description: error, variant: "error" });
            } else {
                if (deductionWarnings?.length) {
                    toast({
                        title: "Payroll saved — deduction sync issue",
                        description: `Some deductions may not have been marked applied. Please verify in the Advances/Penalties tabs. (${deductionWarnings.join("; ")})`,
                        variant: "warning",
                        duration: 12000,
                    });
                }
                toast({
                    title: `Payroll locked — ${payslipMeta.employeeName}`,
                    description: `${new Intl.NumberFormat("en-IQ").format(Math.round(calc.netSalary))} IQD paid`,
                    variant: "success",
                    duration: 10000,
                    action: record?.pdf_url ? {
                        label: "Download PDF",
                        onClick: async () => {
                            const blob = await fetch(record!.pdf_url!).then(r => r.blob());
                            downloadPayslipBlob(blob, payslipMeta.employeeName, calc.periodEnd);
                        },
                    } : undefined,
                });
            }
        },
        [confirmData, user, runPayroll, handleRefreshAll, periodMode, periodStart, periodEnd, lastPayrollDates, periodOverrides]
    );

    const handleBulkPayAll = useCallback(
        async (paymentMethod: PaymentMethod) => {
            if (!user?.id) return;
            const eligible = effectiveEmployeeData.filter(
                d => d.calculation.netSalary > 0 && !d.overlappingPayroll?.fullyCovered
            );
            setBulkPayProgress({ done: 0, total: eligible.length });
            setBulkPayOpen(false);
            const failedNames: string[] = [];

            for (let i = 0; i < eligible.length; i++) {
                const data = eligible[i];
                const emp = data.employee;
                const override = periodOverrides.get(emp.id);
                let pStart = override?.start ?? periodStart;
                let pEnd = override?.end ?? periodEnd;

                if (!override && periodMode === "since_last") {
                    const lastDate = lastPayrollDates.get(emp.id);
                    if (lastDate) {
                        pStart = format(new Date(new Date(lastDate).getTime() + 86400000), "yyyy-MM-dd");
                    } else {
                        pStart = format(subDays(new Date(), 90), "yyyy-MM-dd");
                    }
                    pEnd = today();
                }

                const calc = { ...data.calculation, periodStart: pStart, periodEnd: pEnd };
                const payslipMeta = {
                    employeeName: emp.displayName || emp.email.split("@")[0],
                    employeeEmail: emp.email,
                    employeeRole: emp.role,
                    perOrderBonus: data.effectiveRate.perOrderBonus,
                };
                const { error: runErr } = await runPayroll(calc, user.id, undefined, payslipMeta, paymentMethod);
                if (runErr) failedNames.push(emp.displayName || emp.email.split("@")[0]);
                setBulkPayProgress({ done: i + 1, total: eligible.length });
            }

            setBulkPayProgress(null);
            handleRefreshAll();

            if (failedNames.length > 0) {
                toast({
                    title: `${failedNames.length} payroll${failedNames.length !== 1 ? "s" : ""} failed`,
                    description: `Could not process: ${failedNames.join(", ")}`,
                    variant: "error",
                    duration: 12000,
                });
            }
            const successCount = eligible.length - failedNames.length;
            if (successCount > 0) {
                toast({
                    title: `Bulk payroll complete`,
                    description: `${successCount} employee${successCount !== 1 ? "s" : ""} paid`,
                    variant: "success",
                });
            }
        },
        [user, effectiveEmployeeData, periodOverrides, periodStart, periodEnd, periodMode, lastPayrollDates, runPayroll, handleRefreshAll]
    );

    const subTabs: { key: SubTab; label: string; icon: React.ElementType }[] = [
        { key: "current", label: "Current Period", icon: Clock },
        { key: "history", label: "Payroll History", icon: History },
        { key: "advances", label: "Advances", icon: TrendingDown },
        { key: "penalties", label: "Penalties & Bonuses", icon: AlertCircle },
    ];

    return (
        <div className="space-y-3">
            {/* ── Row 1: Command bar ── */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Period mode toggle */}
                <div className="flex bg-[var(--card-bg)] rounded-xl p-0.5 border border-[var(--card-border)]">
                    <button
                        onClick={() => setPeriodMode("since_last")}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                            periodMode === "since_last" ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                        )}
                    >
                        <Clock className="w-3 h-3" />
                        Since Last Payroll
                    </button>
                    <button
                        onClick={() => setPeriodMode("custom")}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                            periodMode === "custom" ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                        )}
                    >
                        <Settings2 className="w-3 h-3" />
                        Custom Range
                    </button>
                </div>

                {/* Date inputs — only in custom mode */}
                {periodMode === "custom" && (
                    <>
                        <input
                            type="date"
                            value={customStart}
                            onChange={e => { setCustomStart(e.target.value); }}
                            className="px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/30"
                        />
                        <span className="text-muted text-xs">→</span>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={e => { setCustomEnd(e.target.value); }}
                            className="px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/30"
                        />
                    </>
                )}

                {/* Resolved date range label */}
                {periodStart && periodEnd && (
                    <span className="text-xs text-muted px-2 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl whitespace-nowrap">
                        {periodStart} — {periodEnd}
                    </span>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Attribution toggle */}
                <div className="flex bg-[var(--card-bg)] rounded-xl p-0.5 border border-[var(--card-border)]" title="How orders are attributed">
                    <button
                        onClick={() => setAttributionMode("all")}
                        className={cn("px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all", attributionMode === "all" ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground")}
                    >
                        All Orders
                    </button>
                    <button
                        onClick={() => setAttributionMode("last_touched")}
                        className={cn("px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all", attributionMode === "last_touched" ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground")}
                    >
                        By Attribution
                    </button>
                </div>

                <button onClick={handleRefreshAll} className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] text-muted hover:text-foreground transition-colors" title="Refresh">
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setRoleDefaultsOpen(true)} className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] text-muted hover:text-foreground transition-colors" title="Role Defaults">
                    <Settings2 className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => setBulkPayOpen(true)}
                    disabled={effectiveEmployeeData.filter(d => d.calculation.netSalary > 0 && !d.overlappingPayroll?.fullyCovered).length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-medium hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-emerald-500/20"
                >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Pay All
                </button>
            </div>

            {/* Bulk pay progress bar */}
            {bulkPayProgress && (
                <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            Processing payroll… {bulkPayProgress.done} / {bulkPayProgress.total}
                        </span>
                        <span className="text-xs text-emerald-600">{Math.round((bulkPayProgress.done / bulkPayProgress.total) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-emerald-200 dark:bg-emerald-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${(bulkPayProgress.done / bulkPayProgress.total) * 100}%` }} />
                    </div>
                </div>
            )}

            {/* ── Row 2: Inline stats strip ── */}
            <SalaryOverviewCards
                totalDue={totalDue}
                employeeCount={effectiveEmployeeData.length}
                totalPendingAdvances={totalPendingAdvances}
                totalPendingPenalties={totalPendingPenalties}
            />

            {/* ── Row 2b: Order-quality strip (business-wide, selected period) ── */}
            <OrderQualityStrip breakdown={periodBreakdown} />

            {/* ── Row 3: Sub-tabs + tools ── */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Sub-tabs */}
                <div className="flex bg-[var(--card-bg)] rounded-xl p-0.5 border border-[var(--card-border)] overflow-x-auto">
                    {subTabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveSubTab(tab.key)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                                    activeSubTab === tab.key ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                                )}
                            >
                                <Icon className="w-3 h-3" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Tools — only on Current Period tab */}
                {activeSubTab === "current" && (
                    <>
                        <div className="flex-1" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search…"
                            className="w-40 px-3 py-1.5 text-xs bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20 transition-all"
                        />
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as typeof sortBy)}
                            className="px-2.5 py-1.5 text-xs bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none cursor-pointer"
                        >
                            <option value="name">Sort: Name</option>
                            <option value="net_desc">Highest Pay</option>
                            <option value="net_asc">Lowest Pay</option>
                            <option value="last_paid">Last Paid</option>
                        </select>
                        <button
                            onClick={() => exportCurrentPeriodCSV(effectiveEmployeeData, periodStart, periodEnd)}
                            disabled={effectiveEmployeeData.length === 0}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-muted hover:text-foreground transition-colors disabled:opacity-40"
                            title="Export to CSV"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            CSV
                        </button>
                        <button
                            onClick={async () => {
                                const blob = await generatePayrollSummaryPDF(effectiveEmployeeData, periodStart, periodEnd, undefined, periodBreakdown);
                                downloadSummaryBlob(blob, periodStart, periodEnd);
                            }}
                            disabled={effectiveEmployeeData.length === 0}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-muted hover:text-foreground transition-colors disabled:opacity-40"
                            title="Download Summary PDF"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Summary PDF
                        </button>
                        {hiddenEmployeeIds.size > 0 && (
                            <button
                                onClick={() => setShowHidden(v => !v)}
                                className={cn(
                                    "flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl border transition-colors",
                                    showHidden
                                        ? "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-600"
                                        : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:text-foreground"
                                )}
                            >
                                {showHidden ? "Hide hidden" : `+${hiddenEmployeeIds.size} hidden`}
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Tab content */}
            {activeSubTab === "current" && (
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-64 skeleton rounded-2xl" />
                            ))}
                        </div>
                    ) : effectiveEmployeeData.length === 0 ? (
                        <div className="text-center py-16 text-muted">
                            <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                            <p className="font-medium">No active employees found</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {effectiveEmployeeData.map((data, i) => (
                                <EmployeePayrollCard
                                    key={data.employee.id}
                                    index={i}
                                    data={data}
                                    globalPeriodStart={periodStart}
                                    globalPeriodEnd={periodEnd}
                                    onAddAdvance={async (id, amount, reason) => { await addAdvance(id, amount, reason); }}
                                    onAddPenalty={async (id, amount, reason) => { await addPenalty(id, amount, reason); }}
                                    onAddBonus={async (id, amount, reason) => { await addBonus(id, amount, reason); }}
                                    onMarkAsPaid={handleMarkAsPaid}
                                    onUpdateConfig={async (empId, config) => {
                                        await upsertEmployeeConfig(empId, config);
                                        refreshSalaries();
                                    }}
                                    onPeriodOverride={(empId, start, end) => {
                                        setPeriodOverrides(prev => {
                                            const next = new Map(prev);
                                            next.set(empId, { start, end });
                                            return next;
                                        });
                                    }}
                                    onClearPeriodOverride={(empId) => {
                                        setPeriodOverrides(prev => {
                                            const next = new Map(prev);
                                            next.delete(empId);
                                            return next;
                                        });
                                    }}
                                    hasOverride={periodOverrides.has(data.employee.id)}
                                    isPayingOut={payingEmployeeId === data.employee.id}
                                    onHide={handleHideEmployee}
                                    recentPayments={payrollHistory.filter(r => r.employee_id === data.employee.id && r.status === "paid")}
                                />
                            ))}
                            {/* Unhide chips — shown when showHidden is on */}
                            {showHidden && hiddenEmployeeIds.size > 0 && (
                                <div className="col-span-full flex flex-wrap gap-2 pt-2 border-t border-[var(--card-border)]">
                                    <span className="text-xs text-muted self-center">Hidden:</span>
                                    {[...hiddenEmployeeIds].map(id => {
                                        const emp = employeePayrollData.find(d => d.employee.id === id);
                                        const name = emp?.employee.displayName || emp?.employee.email.split("@")[0] || id;
                                        return (
                                            <button
                                                key={id}
                                                onClick={() => handleUnhideEmployee(id)}
                                                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[var(--background)] border border-dashed border-[var(--card-border)] rounded-full text-muted hover:text-foreground hover:border-[var(--ink)] transition-colors"
                                            >
                                                <Eye className="w-3 h-3" />
                                                {name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeSubTab === "history" && (
                <PayrollHistoryTable employeeNames={employeeNames} />
            )}

            {activeSubTab === "advances" && (
                <SalaryDeductionsTab
                    type="advances"
                    advances={advances}
                    penalties={penalties}
                    bonuses={bonuses}
                    employeeNames={employeeNames}
                    onDeleteAdvance={async (id) => { await deleteAdvance(id); refreshSalaries(); }}
                    onDeletePenalty={async (id) => { await deletePenalty(id); refreshSalaries(); }}
                    onDeleteBonus={async (id) => { await deleteBonus(id); refreshSalaries(); }}
                />
            )}

            {activeSubTab === "penalties" && (
                <SalaryDeductionsTab
                    type="penalties"
                    advances={advances}
                    penalties={penalties}
                    bonuses={bonuses}
                    employeeNames={employeeNames}
                    onDeleteAdvance={async (id) => { await deleteAdvance(id); refreshSalaries(); }}
                    onDeletePenalty={async (id) => { await deletePenalty(id); refreshSalaries(); }}
                    onDeleteBonus={async (id) => { await deleteBonus(id); refreshSalaries(); }}
                />
            )}

            {/* Role defaults modal */}
            <RoleDefaultsModal
                isOpen={roleDefaultsOpen}
                onClose={() => setRoleDefaultsOpen(false)}
                roleDefaults={roleSalaryDefaults}
                onSave={async (role, config) => {
                    await upsertRoleDefault(role, config);
                    refreshSalaries();
                }}
            />

            {/* Confirm payroll dialog */}
            <ConfirmPayrollDialog
                isOpen={!!confirmData}
                data={confirmData}
                onConfirm={handleConfirmPayroll}
                onClose={() => setConfirmData(null)}
                onPreview={handlePreviewPayslip}
            />

            {/* Payslip preview modal */}
            <PayslipPreviewModal
                isOpen={previewOpen}
                onClose={() => setPreviewOpen(false)}
                source={previewBlob}
                employeeName={previewMeta.name}
                periodEnd={previewMeta.periodEnd}
            />

            {/* Bulk Pay All dialog */}
            <BulkPayAllDialog
                isOpen={bulkPayOpen}
                employees={effectiveEmployeeData.filter(d => d.calculation.netSalary > 0 && !d.overlappingPayroll?.fullyCovered)}
                onConfirm={handleBulkPayAll}
                onClose={() => setBulkPayOpen(false)}
            />
        </div>
    );
}

function BulkPayAllDialog({
    isOpen,
    employees,
    onConfirm,
    onClose,
}: {
    isOpen: boolean;
    employees: EmployeePayrollData[];
    onConfirm: (paymentMethod: PaymentMethod) => void;
    onClose: () => void;
}) {
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

    if (!isOpen) return null;

    const total = employees.reduce((s, d) => s + d.calculation.netSalary, 0);

    function fmtIQD(n: number) {
        return new Intl.NumberFormat("en-IQ").format(Math.round(n));
    }

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative z-10 w-full max-w-lg bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4 max-h-[85vh] flex flex-col"
                >
                    <div className="p-6 border-b border-[var(--card-border)] shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">Pay All Employees</h2>
                                <p className="text-xs text-muted">{employees.length} employees · {fmtIQD(total)} IQD total</p>
                            </div>
                        </div>
                    </div>

                    {/* Employee list */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-2">
                        {employees.map(d => {
                            const name = d.employee.displayName || d.employee.email.split("@")[0];
                            return (
                                <div key={d.employee.id} className="flex items-center justify-between p-3 bg-[var(--background)] rounded-xl text-sm">
                                    <div>
                                        <p className="font-medium text-foreground">{name}</p>
                                        <p className="text-xs text-muted capitalize">{d.employee.role}</p>
                                    </div>
                                    <p className="font-semibold text-foreground tabular-nums">{fmtIQD(d.calculation.netSalary)} IQD</p>
                                </div>
                            );
                        })}
                    </div>

                    <div className="p-6 border-t border-[var(--card-border)] space-y-4 shrink-0">
                        {/* Payment method */}
                        <div>
                            <p className="text-sm font-medium text-foreground mb-2">Payment Method</p>
                            <div className="flex gap-2">
                                {PAYMENT_METHODS.map(m => (
                                    <button
                                        key={m.value}
                                        onClick={() => setPaymentMethod(m.value)}
                                        className={cn(
                                            "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all",
                                            paymentMethod === m.value
                                                ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                                : "bg-[var(--background)] text-muted border-[var(--card-border)] hover:text-foreground"
                                        )}
                                    >
                                        <span className="text-base">{m.icon}</span>
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <p className="text-xs text-muted bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                            This will lock payroll records for all {employees.length} employees and generate payslips. This cannot be undone.
                        </p>

                        <div className="flex gap-3">
                            <button onClick={onClose} className="flex-1 px-4 py-3 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={() => onConfirm(paymentMethod)}
                                className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-4 h-4" />
                                Pay {employees.length} Employees
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
