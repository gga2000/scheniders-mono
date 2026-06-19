"use client";

import { useState, useEffect, useRef } from "react";
import {
    CheckCircle, Settings, TrendingDown, AlertCircle, Star,
    Calendar, X, TriangleAlert, History, EyeOff, ChevronDown,
    ChevronUp, Undo2, TrendingUp,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
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

/**
 * Eased count-up for the hero amount. Animates 0→value on first mount and, when the
 * value later changes, continues smoothly from the *currently displayed* number (not
 * the last committed target) so an interrupting refresh never snaps backward. Honors
 * prefers-reduced-motion by snapping straight to the value.
 */
function useCountUp(target: number, durationMs = 550) {
    const reduce = useReducedMotion();
    const [value, setValue] = useState(reduce ? target : 0);
    const valueRef = useRef(value);
    useEffect(() => {
        const from = valueRef.current;
        const to = target;
        let raf = 0;
        // Snap (reduced-motion, or value unchanged): defer through rAF so we never setState
        // synchronously inside the effect body.
        if (reduce || from === to) {
            valueRef.current = to;
            raf = requestAnimationFrame(() => setValue(to));
            return () => cancelAnimationFrame(raf);
        }
        const start = performance.now();
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / durationMs);
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            const v = from + (to - from) * eased;
            valueRef.current = v;
            setValue(v);
            if (t < 1) {
                raf = requestAnimationFrame(tick);
            } else {
                valueRef.current = to;
                setValue(to);
            }
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, reduce, durationMs]);
    return value;
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
        return <img src={avatarUrl} alt={name} className="w-11 h-11 rounded-xl object-cover shrink-0 ring-1 ring-[var(--card-border)]" />;
    }
    return (
        <div role="img" aria-label={name} className={cn("w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shrink-0", gradient)}>
            <span aria-hidden="true">{initials}</span>
        </div>
    );
}

// ─── Compact ledger line item ────────────────────────────────────────────────
// The currency unit is anchored to subtotal/total rows + the hero, not every line,
// so the digit column scans cleanly and `IQD` marks the figures that matter.

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
    const showUnit = bold || type === "total";
    return (
        <div className={cn("flex items-center justify-between gap-2 py-[3px] text-xs", bold && "font-semibold")}>
            <span className={cn("truncate", type === "total" ? "text-foreground" : "text-muted")}>{label}</span>
            <span className={cn(
                "tabular-nums shrink-0",
                type === "positive" && "text-emerald-600 dark:text-emerald-400",
                type === "negative" && "text-rose-600 dark:text-rose-400",
                type === "neutral" && "text-foreground",
                type === "total" && "text-foreground font-bold",
            )}>
                {type === "positive" ? "+" : type === "negative" ? "−" : ""}
                {fmtIQD(value)}
                {showUnit && <span className="text-[10px] text-muted font-normal ml-0.5">IQD</span>}
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
    /** Stagger index for the entrance animation (optional). */
    index?: number;
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
    index = 0,
}: EmployeePayrollCardProps) {
    const reduce = useReducedMotion();
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

    // Payroll math shown as a single running ledger: earnings → deductions → Net.
    // The order bonus is computed on EVERY completed order (the pre-deduction figure), then
    // replacements and refunds are subtracted — which nets to the genuine-only bonus that is
    // actually paid. This only reframes how the same total is presented; Net stays
    // calculation.netSalary, so nobody's pay changes.
    const perOrderBonus = effectiveRate.perOrderBonus;
    const ordersGross = breakdown.completedTotal * perOrderBonus;
    const replacementDeduction = breakdown.replacements * perOrderBonus;
    const refundDeduction = breakdown.refunds * perOrderBonus;
    const preDeductions =
        calculation.baseSalary + ordersGross + calculation.performanceBonusesTotal;
    // Count of non-zero earning lines — a "Before deductions" subtotal is only worth showing
    // when it sums more than one (otherwise it just repeats the single earning line above it).
    const earningLines =
        (calculation.baseSalary > 0 ? 1 : 0) +
        (ordersGross > 0 ? 1 : 0) +
        (calculation.performanceBonusesTotal > 0 ? 1 : 0);
    const hasEarnings = earningLines > 0;
    const hasAnyDeduction =
        replacementDeduction > 0 || refundDeduction > 0 ||
        calculation.absenceDeduction > 0 || calculation.advancesTotal > 0 ||
        calculation.penaltiesTotal > 0;
    // True signed result of the ledger. Net is clamped at 0 (use-salaries), so when this is
    // negative the displayed lines can't sum to the 0 hero — surface the gap instead of hiding it.
    const rawNet =
        preDeductions - replacementDeduction - refundDeduction -
        calculation.absenceDeduction - calculation.advancesTotal - calculation.penaltiesTotal;
    const overDeducted = rawNet < -0.5;

    // Hero count-up
    const animatedNet = useCountUp(calculation.netSalary);

    // Trend vs last payment (#25) — advisory; periods may differ in length, so it's demoted + tooltipped.
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
    const detailsId = `payroll-details-${employee.id}`;

    return (
        <>
            <motion.div
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : Math.min(index * 0.05, 0.4) }}
                whileHover={reduce ? undefined : { y: -3 }}
                className="group bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden hover:border-[var(--ink)]/25 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)] dark:hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)] transition-[box-shadow,border-color] flex flex-col"
            >

                {/* ── A. Header — identity ── */}
                <div className="p-4 pb-3 flex items-start gap-3">
                    <div className="relative shrink-0">
                        <Avatar name={displayName} avatarUrl={employee.avatarUrl} />
                        {employee.isActive && (
                            <span
                                role="img"
                                aria-label="Active"
                                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-[var(--card-bg)]"
                            />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="font-semibold text-foreground truncate leading-tight">{displayName}</p>
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-muted bg-[var(--background)]">
                                    {employee.role}
                                </span>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 opacity-50 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button
                                    onClick={() => setConfigOpen(true)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors"
                                    aria-label="Configure salary"
                                    title="Configure salary"
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => onHide(employee.id)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-rose-500 transition-colors"
                                    aria-label="Hide from view"
                                    title="Hide from view"
                                >
                                    <EyeOff className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── B. Quality meter + period + trend ── */}
                <div className="px-4 pb-3 space-y-2.5">
                    {breakdown.completedTotal > 0 && (
                        <button
                            onClick={() => setBreakdownOpen(true)}
                            className="w-full block rounded-lg -mx-1 px-1 py-0.5 hover:bg-[var(--background)] transition-colors"
                            aria-label={`${calculation.completedOrdersCount} of ${breakdown.completedTotal} orders payable, ${qualityPct}% quality — open order breakdown`}
                            title="Payable ÷ completed — click for the order breakdown"
                        >
                            <div className="flex items-baseline justify-between mb-1.5">
                                <span className="text-xs font-medium text-foreground tabular-nums">
                                    {calculation.completedOrdersCount}
                                    <span className="text-muted font-normal"> / {breakdown.completedTotal} payable</span>
                                </span>
                                <span className={cn(
                                    "text-xs font-semibold tabular-nums",
                                    qualityPct >= 90 ? "text-emerald-600 dark:text-emerald-400"
                                        : qualityPct >= 70 ? "text-amber-700 dark:text-amber-400"
                                            : "text-rose-600 dark:text-rose-400",
                                )}>
                                    {qualityPct}% quality
                                </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[var(--card-border)] overflow-hidden">
                                <motion.div
                                    initial={reduce ? false : { width: 0 }}
                                    animate={{ width: `${Math.max(2, qualityPct)}%` }}
                                    transition={{ duration: 0.6, ease: "easeOut", delay: reduce ? 0 : 0.15 }}
                                    className={cn(
                                        "h-full rounded-full",
                                        qualityPct >= 90 ? "bg-emerald-500"
                                            : qualityPct >= 70 ? "bg-amber-500"
                                                : "bg-rose-500",
                                    )}
                                />
                            </div>
                        </button>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Period pill — single friendly format, opens the picker (#13) */}
                        <button
                            onClick={() => { setDraftStart(calculation.periodStart); setDraftEnd(calculation.periodEnd); setCalendarOpen(v => !v); }}
                            aria-expanded={calendarOpen}
                            className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors tabular-nums",
                                hasOverride
                                    ? "bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400"
                                    : "bg-[var(--background)] text-muted hover:text-foreground border border-[var(--card-border)]"
                            )}
                            title="Set a custom period"
                        >
                            <Calendar className="w-3 h-3" />
                            {fmtDate(calculation.periodStart, "MMM d")} – {fmtDate(calculation.periodEnd, "MMM d")}
                        </button>
                        {hasOverride && (
                            <button
                                onClick={() => onClearPeriodOverride(employee.id)}
                                className="p-1 rounded-full text-muted hover:text-rose-500 transition-colors"
                                aria-label="Reset to global period"
                                title="Reset to global period"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}

                        {/* Trend badge — advisory, demoted (periods may differ in length) */}
                        {trendPct !== null && trendPct !== 0 && (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium tabular-nums",
                                    trendPct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                                )}
                                title="Change in net vs your last payout — periods may differ in length"
                            >
                                {trendPct > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                <span className="sr-only">Net vs last payout: </span>
                                {trendPct > 0 ? `+${trendPct}%` : `${trendPct}%`}
                            </span>
                        )}
                    </div>
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
                    <div className="mx-4 mb-3 flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400">
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
                                aria-label="Period start"
                                className="flex-1 px-2 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-xs text-foreground focus:outline-none"
                            />
                            <span className="text-muted text-xs">→</span>
                            <input
                                type="date"
                                value={draftEnd}
                                onChange={e => setDraftEnd(e.target.value)}
                                aria-label="Period end"
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

                {/* ── E. Money panel — ledger resolving to the Net hero + pay action ── */}
                <div className="mx-4 mb-3 mt-auto rounded-xl border border-[var(--card-border)] bg-[var(--background)] overflow-hidden">
                    {/* Ledger: earnings → deductions (one running ledger) */}
                    <div className="p-3 pb-2.5 flex gap-3">
                        <div className="flex-1 min-w-0 space-y-0">
                            {/* Earnings */}
                            {calculation.baseSalary > 0 && (
                                <CompactLineItem label="Base Salary" value={calculation.baseSalary} type="neutral" />
                            )}
                            {ordersGross > 0 && (
                                <CompactLineItem
                                    label={`Orders (${breakdown.completedTotal}×${fmtIQD(perOrderBonus)})`}
                                    value={ordersGross}
                                    type="positive"
                                />
                            )}
                            {calculation.performanceBonusesTotal > 0 && (
                                <CompactLineItem
                                    label={`Bonuses (${calculation.pendingBonuses.length})`}
                                    value={calculation.performanceBonusesTotal}
                                    type="positive"
                                />
                            )}
                            {!hasEarnings && (
                                <p className="text-xs text-muted py-0.5">No earnings this period</p>
                            )}

                            {/* Before-deductions subtotal — only when it sums 2+ earning lines */}
                            {earningLines >= 2 && (
                                <>
                                    <div className="border-t border-[var(--card-border)] my-1" />
                                    <CompactLineItem label="Before deductions" value={preDeductions} type="total" bold />
                                </>
                            )}

                            {/* Deductions (replacements/refunds are clickable → order breakdown) */}
                            {hasAnyDeduction && (
                                <>
                                    {earningLines < 2 && <div className="border-t border-[var(--card-border)] my-1" />}
                                    {breakdown.replacements > 0 && (
                                        <button
                                            onClick={() => setBreakdownOpen(true)}
                                            className="w-full text-left hover:opacity-80 transition-opacity"
                                            aria-label={`Replacements: ${breakdown.replacements} orders, ${fmtIQD(replacementDeduction)} IQD excluded — open list`}
                                            title="Replacement orders — re-ships, not new sales. Click for the order list."
                                        >
                                            <CompactLineItem
                                                label={`Replacements (${breakdown.replacements})`}
                                                value={replacementDeduction}
                                                type="negative"
                                            />
                                        </button>
                                    )}
                                    {breakdown.refunds > 0 && (
                                        <button
                                            onClick={() => setBreakdownOpen(true)}
                                            className="w-full text-left hover:opacity-80 transition-opacity"
                                            aria-label={`Refunds and returns: ${breakdown.refunds} orders, ${fmtIQD(refundDeduction)} IQD excluded — open list`}
                                            title="Refunded / returned orders — the sale came back. Click for the order list."
                                        >
                                            <CompactLineItem
                                                label={`Refunds / returns (${breakdown.refunds})`}
                                                value={refundDeduction}
                                                type="negative"
                                            />
                                        </button>
                                    )}
                                    {calculation.absenceDeduction > 0 && (
                                        <CompactLineItem
                                            label={`Absence (${calculation.absenceDays}d)`}
                                            value={calculation.absenceDeduction}
                                            type="negative"
                                        />
                                    )}
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
                                </>
                            )}
                        </div>

                        {/* Sparkline (#7) — only if ≥2 payments */}
                        {sparkData.length >= 2 && (
                            <div className="w-16 h-12 shrink-0 self-center" role="img" aria-label="Recent net payouts trend">
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

                    {/* Hero Net + pay action (or fully-paid state) */}
                    <div className="px-3 py-3 border-t border-[var(--card-border)] bg-[var(--card-bg)]">
                        {isFullyCovered && overlappingPayroll ? (
                            /* Fully-paid state (#12) */
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            Paid
                                        </span>
                                        <span className="text-xs text-muted tabular-nums">
                                            {fmtDate(overlappingPayroll.paid_at, "MMM d, yyyy")} · {fmtIQD(overlappingPayroll.net_salary)} IQD
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted mt-1 tabular-nums">
                                        {fmtDate(overlappingPayroll.period_start)} — {fmtDate(overlappingPayroll.period_end)}
                                    </p>
                                </div>
                                {!confirmVoid ? (
                                    <button
                                        onClick={() => setConfirmVoid(true)}
                                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-muted hover:text-rose-500 transition-colors"
                                        aria-label="Void this payment"
                                        title="Void this payment"
                                    >
                                        <Undo2 className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">Void?</span>
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
                        ) : (
                            /* The hero: Net Payable shown once, large + animated */
                            <>
                                <div className="flex items-end justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Net Payable</p>
                                        <p className="text-[26px] font-bold text-foreground tabular-nums tracking-tight leading-none mt-1">
                                            {fmtIQD(animatedNet)}
                                            <span className="text-sm font-medium text-muted ml-1">IQD</span>
                                        </p>
                                        {overDeducted && (
                                            <p
                                                className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 tabular-nums"
                                                title="Deductions exceeded earnings; Net is floored at 0. The remainder is not carried into the next period automatically."
                                            >
                                                Capped at 0 · −{fmtIQD(-rawNet)} IQD not deducted
                                            </p>
                                        )}
                                    </div>
                                    <motion.button
                                        whileTap={reduce ? undefined : { scale: 0.95 }}
                                        onClick={() => onMarkAsPaid(data)}
                                        disabled={isPayingOut || calculation.netSalary === 0}
                                        title={calculation.netSalary === 0 ? "No amount to pay" : undefined}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all shrink-0",
                                            "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/25",
                                            "disabled:opacity-50 disabled:cursor-not-allowed"
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
                                    </motion.button>
                                </div>
                                {calculation.netSalary === 0 && !overDeducted && (
                                    <p className="text-xs text-muted mt-2">Nothing to pay this period.</p>
                                )}
                                {lastPayment && (
                                    <p className="text-xs text-muted mt-2 tabular-nums">
                                        Last paid: {fmtDate(lastPayment.paid_at)} · {fmtIQD(lastPayment.net_salary)} IQD
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* ── F. Action buttons + Details toggle ── */}
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
                        aria-expanded={detailsExpanded}
                        aria-controls={detailsId}
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
                    <motion.div
                        id={detailsId}
                        initial={reduce ? false : { opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="border-t border-[var(--card-border)] px-4 py-3 space-y-3"
                    >
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
                                                <p className="text-xs font-medium text-foreground tabular-nums">
                                                    {fmtDate(p.period_start)} → {fmtDate(p.period_end)}
                                                </p>
                                                <p className="text-xs text-muted tabular-nums">
                                                    {p.completed_orders_count} orders · paid {fmtDate(p.paid_at ?? p.period_end)}
                                                </p>
                                                {p.notes && (
                                                    <p className="text-xs text-muted italic mt-0.5">&ldquo;{p.notes}&rdquo;</p>
                                                )}
                                            </div>
                                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">{fmtIQD(p.net_salary)} IQD</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {pendingCount === 0 && recentPayments.length === 0 && breakdown.completedTotal === 0 && data.returnedAfterPayment.length === 0 && (
                            <p className="text-xs text-muted text-center py-2">No pending items or payment history.</p>
                        )}
                    </motion.div>
                )}
            </motion.div>

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
