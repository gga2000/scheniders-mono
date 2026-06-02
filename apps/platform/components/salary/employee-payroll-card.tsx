"use client";

import { useState } from "react";
import {
    CheckCircle, Settings, TrendingDown, AlertCircle, Star,
    Calendar, X, TriangleAlert, History, EyeOff, ChevronDown,
    ChevronUp, Undo2, TrendingUp, ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { EmployeePayrollData, PayrollRecord } from "@/types/salary";
import { AddAdvanceModal } from "./add-advance-modal";
import { AddPenaltyModal } from "./add-penalty-modal";
import { AddBonusModal } from "./add-bonus-modal";
import { SalaryConfigForm } from "./salary-config-form";
import { OrderBreakdownModal } from "./order-breakdown-modal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

function fmtDate(d: string | null | undefined, fmt = "MMM d") {
    if (!d) return "";
    try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), fmt); } catch { return d; }
}

// ─── Avatar with name-based gradient ─────────────────────────────────────────

const AVATAR_GRADIENTS = [
    "from-indigo-500 to-purple-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-amber-500 to-orange-500",
    "from-blue-500 to-cyan-600",
    "from-violet-500 to-fuchsia-600",
    "from-teal-500 to-green-600",
    "from-orange-500 to-red-500",
];

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
    const initials = name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2) || "?";
    const gradient = AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];

    if (avatarUrl) {
        return <img src={avatarUrl} alt={name} className="w-10 h-10 rounded-xl object-cover shrink-0" />;
    }
    return (
        <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shrink-0", gradient)}>
            {initials}
        </div>
    );
}

// ─── Compact line item ────────────────────────────────────────────────────────

function CompactLineItem({
    label,
    value,
    type,
    bold = false,
}: {
    label: string;
    value: number;
    type: "positive" | "negative" | "neutral" | "total";
    bold?: boolean;
}) {
    return (
        <div className={cn("flex items-center justify-between py-0.5 text-xs", bold && "font-semibold")}>
            <span className={cn(type === "total" ? "text-foreground" : "text-muted")}>{label}</span>
            <span className={cn(
                "tabular-nums",
                type === "positive" && "text-emerald-600 dark:text-emerald-400",
                type === "negative" && "text-rose-600 dark:text-rose-400",
                type === "neutral" && "text-foreground",
                type === "total" && "text-foreground font-bold",
            )}>
                {type === "positive" ? "+" : type === "negative" ? "−" : ""}
                {fmtIQD(value)} IQD
            </span>
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EmployeePayrollCardProps {
    data: EmployeePayrollData;
    globalPeriodStart: string;
    globalPeriodEnd: string;
    onAddAdvance: (employeeId: string, amount: number, reason?: string) => Promise<void>;
    onAddPenalty: (employeeId: string, amount: number, reason: string) => Promise<void>;
    onAddBonus: (employeeId: string, amount: number, reason?: string) => Promise<void>;
    onMarkAsPaid: (data: EmployeePayrollData) => void;
    onUpdateConfig: (
        employeeId: string,
        config: { base_monthly_salary: number; per_order_bonus: number; use_role_defaults: boolean }
    ) => Promise<void>;
    onPeriodOverride: (employeeId: string, start: string, end: string) => void;
    onClearPeriodOverride: (employeeId: string) => void;
    onHide: (employeeId: string) => void;
    hasOverride: boolean;
    isPayingOut?: boolean;
    recentPayments?: PayrollRecord[];
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EmployeePayrollCard({
    data,
    globalPeriodStart,
    globalPeriodEnd,
    onAddAdvance,
    onAddPenalty,
    onAddBonus,
    onMarkAsPaid,
    onUpdateConfig,
    onPeriodOverride,
    onClearPeriodOverride,
    onHide,
    hasOverride,
    isPayingOut = false,
    recentPayments = [],
}: EmployeePayrollCardProps) {
    const { employee, calculation, effectiveRate, overlappingPayroll } = data;
    const breakdown = calculation.orderBreakdown;
    const qualityPct = Math.round(breakdown.qualityScore * 100);

    const [detailsExpanded, setDetailsExpanded] = useState(false);
    const [breakdownOpen, setBreakdownOpen] = useState(false);
    const [advanceOpen, setAdvanceOpen] = useState(false);
    const [penaltyOpen, setPenaltyOpen] = useState(false);
    const [bonusOpen, setBonusOpen] = useState(false);
    const [configOpen, setConfigOpen] = useState(false);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [draftStart, setDraftStart] = useState(calculation.periodStart);
    const [draftEnd, setDraftEnd] = useState(calculation.periodEnd);
    const [confirmVoid, setConfirmVoid] = useState(false);

    const displayName = employee.displayName || employee.email.split("@")[0];
    const isFullyCovered = overlappingPayroll?.fullyCovered === true;
    const isPartialOverlap = !!overlappingPayroll && !isFullyCovered;
    const isOverpaid = calculation.netSalary > effectiveRate.baseMonthlySalary * 2 && effectiveRate.baseMonthlySalary > 0;

    // Trend vs last payment (#25)
    const lastPayment = recentPayments[0] ?? null;
    const trendPct = lastPayment && lastPayment.net_salary > 0
        ? Math.round(((calculation.netSalary - lastPayment.net_salary) / lastPayment.net_salary) * 100)
        : null;

    // Sparkline data (#7)
    const sparkData = [...recentPayments].slice(0, 6).reverse().map(p => ({ v: p.net_salary }));

    // Details badge count
    const pendingCount =
        calculation.pendingAdvances.length +
        calculation.pendingPenalties.length +
        calculation.pendingBonuses.length;

    return (
        <>
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden hover:border-[var(--ink)]/20 transition-all flex flex-col">

                {/* ── A. Header ── */}
                <div className="p-4 flex items-start gap-3">
                    <Avatar name={displayName} avatarUrl={employee.avatarUrl} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                                <p className="font-semibold text-foreground truncate leading-tight">{displayName}</p>
                                <p className="text-xs text-muted capitalize leading-tight">{employee.role}</p>
                                <p className="text-xs text-muted mt-0.5 tabular-nums">
                                    {fmtDate(calculation.periodStart, "MMM d")} — {fmtDate(calculation.periodEnd, "MMM d, yyyy")}
                                </p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                    onClick={() => setConfigOpen(true)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors"
                                    title="Configure salary"
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => onHide(employee.id)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-rose-500 transition-colors"
                                    title="Hide from view"
                                >
                                    <EyeOff className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── B. Stats badges row ── */}
                <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
                    {/* Orders (payable) — click to open the breakdown */}
                    <button
                        onClick={() => setBreakdownOpen(true)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:ring-1 hover:ring-emerald-400 transition-all"
                        title="View order breakdown"
                    >
                        <CheckCircle className="w-3 h-3" />
                        {calculation.completedOrdersCount} payable
                        {breakdown.completedTotal !== calculation.completedOrdersCount && (
                            <span className="opacity-60">/ {breakdown.completedTotal}</span>
                        )}
                    </button>

                    {/* Quality score */}
                    {breakdown.completedTotal > 0 && (
                        <span
                            className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                                qualityPct >= 90 && "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400",
                                qualityPct >= 70 && qualityPct < 90 && "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400",
                                qualityPct < 70 && "bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400",
                            )}
                            title="Clean delivery rate — payable ÷ completed"
                        >
                            {qualityPct}% quality
                        </span>
                    )}

                    {/* Period pill (always shows actual dates — #13) */}
                    <button
                        onClick={() => { setDraftStart(calculation.periodStart); setDraftEnd(calculation.periodEnd); setCalendarOpen(v => !v); }}
                        className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
                            hasOverride
                                ? "bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400"
                                : "bg-[var(--background)] text-muted hover:text-foreground border border-[var(--card-border)]"
                        )}
                        title="Set custom period"
                    >
                        <Calendar className="w-3 h-3" />
                        {calculation.periodStart} → {calculation.periodEnd}
                    </button>
                    {hasOverride && (
                        <button
                            onClick={() => onClearPeriodOverride(employee.id)}
                            className="p-0.5 rounded-full text-muted hover:text-rose-500 transition-colors"
                            title="Reset to global period"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}

                    {/* Trend badge (#25) */}
                    {trendPct !== null && (
                        <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                            trendPct > 0 && "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400",
                            trendPct < 0 && "bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400",
                            trendPct === 0 && "bg-[var(--background)] text-muted border border-[var(--card-border)]",
                        )}>
                            {trendPct > 0 ? <TrendingUp className="w-3 h-3" /> : trendPct < 0 ? <TrendingDown className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                            {trendPct > 0 ? `+${trendPct}%` : trendPct < 0 ? `${trendPct}%` : "Same"}
                        </span>
                    )}
                </div>

                {/* ── C. Guard banners (partial + overpay only) ── */}
                {isPartialOverlap && overlappingPayroll && (
                    <div className="mx-4 mb-3 flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                        <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>
                            <span className="font-semibold">Partial overlap</span>
                            {" — paid "}
                            {fmtDate(overlappingPayroll.period_start)} → {fmtDate(overlappingPayroll.period_end)}.
                            {" Consider using a custom period for the remainder."}
                        </span>
                    </div>
                )}
                {isOverpaid && (
                    <div className="mx-4 mb-3 flex items-center gap-2 p-2.5 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-xl text-xs text-yellow-700 dark:text-yellow-400">
                        <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
                        <span><span className="font-semibold">Unusually high</span> — net is more than 2× base salary. Double-check before confirming.</span>
                    </div>
                )}

                {/* ── D. Inline period picker ── */}
                {calendarOpen && (
                    <div className="mx-4 mb-3 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)] space-y-2">
                        <p className="text-xs font-medium text-muted">Custom Period</p>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={draftStart}
                                onChange={e => setDraftStart(e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-xs text-foreground focus:outline-none"
                            />
                            <span className="text-muted text-xs">→</span>
                            <input
                                type="date"
                                value={draftEnd}
                                onChange={e => setDraftEnd(e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-xs text-foreground focus:outline-none"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { onClearPeriodOverride(employee.id); setCalendarOpen(false); }}
                                className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-muted hover:text-foreground transition-colors"
                            >
                                Reset
                            </button>
                            <button
                                onClick={() => { onPeriodOverride(employee.id, draftStart, draftEnd); setCalendarOpen(false); }}
                                disabled={!draftStart || !draftEnd || draftStart > draftEnd}
                                className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-[var(--ink)] text-white hover:opacity-90 transition-all disabled:opacity-40"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                )}

                {/* ── E. Salary breakdown + sparkline (always visible) ── */}
                <div className="mx-4 mb-3 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)] flex gap-3">
                    {/* Left: breakdown */}
                    <div className="flex-1 min-w-0 space-y-0">
                        <CompactLineItem label="Base Salary" value={calculation.baseSalary} type="neutral" />
                        {calculation.orderBonus > 0 && (
                            <CompactLineItem
                                label={`Orders (${calculation.completedOrdersCount}×${fmtIQD(effectiveRate.perOrderBonus)})`}
                                value={calculation.orderBonus}
                                type="positive"
                            />
                        )}
                        {breakdown.completedTotal > 0 && (
                            <button
                                onClick={() => setBreakdownOpen(true)}
                                className="w-full text-left space-y-0 group"
                                title="View order breakdown"
                            >
                                <div className="flex items-center justify-between py-0.5 text-xs">
                                    <span className="text-muted group-hover:text-foreground transition-colors">Replacements (excluded)</span>
                                    <span className={cn("tabular-nums", breakdown.replacements > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted")}>
                                        {breakdown.replacements}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between py-0.5 text-xs">
                                    <span className="text-muted group-hover:text-foreground transition-colors">Refunds / returns (excluded)</span>
                                    <span className={cn("tabular-nums", breakdown.refunds > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted")}>
                                        {breakdown.refunds}
                                    </span>
                                </div>
                            </button>
                        )}
                        {calculation.performanceBonusesTotal > 0 && (
                            <CompactLineItem
                                label={`Bonuses (${calculation.pendingBonuses.length})`}
                                value={calculation.performanceBonusesTotal}
                                type="positive"
                            />
                        )}
                        <div className="border-t border-[var(--card-border)] my-1" />
                        <CompactLineItem label="Gross" value={calculation.grossSalary} type="total" bold />
                        {calculation.advancesTotal > 0 && (
                            <CompactLineItem
                                label={`Advances (${calculation.pendingAdvances.length})`}
                                value={calculation.advancesTotal}
                                type="negative"
                            />
                        )}
                        {calculation.penaltiesTotal > 0 && (
                            <CompactLineItem
                                label={`Penalties (${calculation.pendingPenalties.length})`}
                                value={calculation.penaltiesTotal}
                                type="negative"
                            />
                        )}
                    </div>

                    {/* Right: sparkline (#7) — only if ≥2 payments */}
                    {sparkData.length >= 2 && (
                        <div className="w-16 h-12 shrink-0 self-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                                    <Area
                                        type="monotone"
                                        dataKey="v"
                                        stroke="#10b981"
                                        fill="#10b98120"
                                        strokeWidth={1.5}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* ── F. Net payable + fully-paid state ── */}
                <div className="px-4 py-3 border-t border-[var(--card-border)] mt-auto">
                    {isFullyCovered && overlappingPayroll ? (
                        /* Fully-paid state (#12) */
                        <>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            Paid
                                        </span>
                                        <span className="text-xs text-muted">
                                            {fmtDate(overlappingPayroll.paid_at, "MMM d, yyyy")} · {fmtIQD(overlappingPayroll.net_salary)} IQD
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted mt-1">
                                        {fmtDate(overlappingPayroll.period_start)} — {fmtDate(overlappingPayroll.period_end)}
                                    </p>
                                </div>
                                {!confirmVoid ? (
                                    <button
                                        onClick={() => setConfirmVoid(true)}
                                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-muted hover:text-rose-500 transition-colors"
                                        title="Void this payment"
                                    >
                                        <Undo2 className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-rose-600 font-medium">Void?</span>
                                        <button
                                            onClick={() => { /* void is handled via payroll history table; close confirm */ setConfirmVoid(false); }}
                                            className="px-2 py-1 text-xs bg-[var(--background)] border border-[var(--card-border)] text-muted rounded-lg hover:text-foreground transition-colors"
                                        >
                                            No
                                        </button>
                                        <button
                                            onClick={() => setConfirmVoid(false)}
                                            className="px-2 py-1 text-xs bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
                                        >
                                            Yes
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        /* Normal state */
                        <>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-muted">Net Payable</p>
                                    <p className="text-lg font-bold text-foreground tabular-nums">{fmtIQD(calculation.netSalary)} IQD</p>
                                </div>
                                <button
                                    onClick={() => onMarkAsPaid(data)}
                                    disabled={isPayingOut || calculation.netSalary === 0}
                                    title={calculation.netSalary === 0 ? "No amount to pay" : undefined}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                                        "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/20",
                                        "disabled:opacity-40 disabled:cursor-not-allowed"
                                    )}
                                >
                                    {isPayingOut ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4" />
                                            Mark Paid
                                        </>
                                    )}
                                </button>
                            </div>
                            {/* Last paid (#24) */}
                            {lastPayment && (
                                <p className="text-xs text-muted mt-1">
                                    Last paid: {fmtDate(lastPayment.paid_at)} · {fmtIQD(lastPayment.net_salary)} IQD
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* ── G+H. Action buttons + Details toggle ── */}
                <div className="px-4 py-3 border-t border-[var(--card-border)] flex gap-2">
                    <button
                        onClick={() => setAdvanceOpen(true)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                    >
                        <TrendingDown className="w-3 h-3" />
                        Advance
                    </button>
                    <button
                        onClick={() => setPenaltyOpen(true)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
                    >
                        <AlertCircle className="w-3 h-3" />
                        Penalty
                    </button>
                    <button
                        onClick={() => setBonusOpen(true)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                    >
                        <Star className="w-3 h-3" />
                        Bonus
                    </button>
                    <button
                        onClick={() => setDetailsExpanded(v => !v)}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors",
                            detailsExpanded
                                ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                : "bg-[var(--background)] border-[var(--card-border)] text-muted hover:text-foreground"
                        )}
                    >
                        <History className="w-3 h-3" />
                        {pendingCount > 0 || recentPayments.length > 0 ? `Details (${pendingCount + recentPayments.length})` : "Details"}
                        {detailsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                </div>

                {/* ── G. Details panel (expandable) ── */}
                {detailsExpanded && (
                    <div className="border-t border-[var(--card-border)] px-4 py-3 space-y-3">
                        {/* Returned after payment (advisory) */}
                        {data.returnedAfterPayment.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                    <Undo2 className="w-3 h-3" />
                                    Returned after payment ({data.returnedAfterPayment.length})
                                </p>
                                <p className="text-xs text-muted mb-1">
                                    Returns inside an already-paid period — review only, no automatic deduction.
                                </p>
                                <button
                                    onClick={() => setBreakdownOpen(true)}
                                    className="text-xs text-muted hover:text-foreground underline decoration-dotted transition-colors"
                                >
                                    View list
                                </button>
                            </div>
                        )}

                        {/* Pending advances */}
                        {calculation.pendingAdvances.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Pending Advances</p>
                                <div className="space-y-1">
                                    {calculation.pendingAdvances.map(a => (
                                        <div key={a.id} className="flex items-center justify-between text-xs">
                                            <span className="text-muted truncate">{a.reason || "No reason"} · {fmtDate(a.created_at)}</span>
                                            <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums shrink-0 ml-2">−{fmtIQD(a.amount)} IQD</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Pending penalties */}
                        {calculation.pendingPenalties.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Pending Penalties</p>
                                <div className="space-y-1">
                                    {calculation.pendingPenalties.map(p => (
                                        <div key={p.id} className="flex items-center justify-between text-xs">
                                            <span className="text-muted truncate">{p.reason || "No reason"} · {fmtDate(p.created_at)}</span>
                                            <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums shrink-0 ml-2">−{fmtIQD(p.amount)} IQD</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Pending bonuses */}
                        {calculation.pendingBonuses.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Pending Bonuses</p>
                                <div className="space-y-1">
                                    {calculation.pendingBonuses.map(b => (
                                        <div key={b.id} className="flex items-center justify-between text-xs">
                                            <span className="text-muted truncate">{b.reason || "No reason"} · {fmtDate(b.created_at)}</span>
                                            <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums shrink-0 ml-2">+{fmtIQD(b.amount)} IQD</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Recent payments with notes (#8) */}
                        {recentPayments.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Recent Payments</p>
                                <div className="space-y-1.5">
                                    {recentPayments.slice(0, 5).map(p => (
                                        <div key={p.id} className="flex items-start justify-between py-1.5 border-b border-[var(--card-border)] last:border-0 gap-2">
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium text-foreground">
                                                    {fmtDate(p.period_start)} → {fmtDate(p.period_end)}
                                                </p>
                                                <p className="text-xs text-muted">
                                                    {p.completed_orders_count} orders · paid {fmtDate(p.paid_at ?? p.period_end)}
                                                </p>
                                                {p.notes && (
                                                    <p className="text-xs text-muted italic mt-0.5">&ldquo;{p.notes}&rdquo;</p>
                                                )}
                                            </div>
                                            <p className="text-xs font-semibold text-emerald-600 tabular-nums shrink-0">{fmtIQD(p.net_salary)} IQD</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {pendingCount === 0 && recentPayments.length === 0 && breakdown.completedTotal === 0 && data.returnedAfterPayment.length === 0 && (
                            <p className="text-xs text-muted text-center py-2">No pending items or payment history.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Modals */}
            <AddAdvanceModal
                isOpen={advanceOpen}
                onClose={() => setAdvanceOpen(false)}
                employeeName={displayName}
                onSubmit={(amount, reason) => onAddAdvance(employee.id, amount, reason)}
            />
            <AddPenaltyModal
                isOpen={penaltyOpen}
                onClose={() => setPenaltyOpen(false)}
                employeeName={displayName}
                onSubmit={(amount, reason) => onAddPenalty(employee.id, amount, reason)}
            />
            <AddBonusModal
                isOpen={bonusOpen}
                onClose={() => setBonusOpen(false)}
                employeeName={displayName}
                onSubmit={(amount, reason) => onAddBonus(employee.id, amount, reason)}
            />
            <SalaryConfigForm
                isOpen={configOpen}
                onClose={() => setConfigOpen(false)}
                employeeName={displayName}
                employeeId={employee.id}
                currentRate={effectiveRate}
                onSubmit={config => onUpdateConfig(employee.id, config)}
            />
            <OrderBreakdownModal
                isOpen={breakdownOpen}
                onClose={() => setBreakdownOpen(false)}
                employeeName={displayName}
                periodLabel={`${calculation.periodStart} → ${calculation.periodEnd}`}
                breakdown={breakdown}
                orderDetails={data.orderDetails}
                returnedAfterPayment={data.returnedAfterPayment}
                perOrderBonus={effectiveRate.perOrderBonus}
            />
        </>
    );
}
