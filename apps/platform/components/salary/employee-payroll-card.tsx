"use client";

import { useState, useEffect, useRef } from "react";
import {
    CheckCircle, Settings, TrendingDown, AlertCircle, Star,
    Calendar, X, TriangleAlert, History, EyeOff, ChevronDown,
    ChevronUp, ChevronRight, Undo2, TrendingUp,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { format, differenceInCalendarDays, type Locale } from "date-fns";
import { ar } from "date-fns/locale";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { EmployeePayrollData, PayrollRecord } from "@/types/salary";
import type { SalaryConfigHistoryRow } from "@/hooks/use-salary-config";
import { PayrollAdjustmentModal } from "./payroll-adjustment-modal";
import { SalaryConfigForm } from "./salary-config-form";
import { OrderBreakdownModal } from "./order-breakdown-modal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

function fmtDate(d: string | null | undefined, fmt: string, locale: Locale | undefined) {
    if (!d) return "";
    try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), fmt, { locale }); } catch { return d; }
}

/** Inclusive day count of a yyyy-mm-dd period (so a 1-day period = 1). */
function daysInclusive(start: string, end: string): number {
    try { return differenceInCalendarDays(new Date(end + "T00:00:00"), new Date(start + "T00:00:00")) + 1; }
    catch { return 0; }
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

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
    // First letter of the first two words; brackets and digits ("Hassan (packing)") are skipped.
    const initials = name.split(/\s+/).map(p => p.match(/\p{L}/u)?.[0] ?? "").join("").toUpperCase().slice(0, 2) || "?";

    if (avatarUrl) {
        return <img src={avatarUrl} alt={name} className="w-11 h-11 rounded-xl object-cover shrink-0 ring-1 ring-[var(--card-border)]" />;
    }
    return (
        <div role="img" aria-label={name} className="w-11 h-11 rounded-xl bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center text-foreground font-semibold text-sm shrink-0">
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
    onClick,
    title,
    ariaLabel,
    unit,
}: {
    unit: string;
    label: string;
    value: number;
    type: "positive" | "negative" | "neutral" | "total";
    bold?: boolean;
    onClick?: () => void;
    title?: string;
    ariaLabel?: string;
}) {
    const showUnit = bold || type === "total";
    const inner = (
        <>
            <span className={cn("shrink-0", type === "total" ? "text-foreground" : "text-muted")}>{label}</span>
            {/* dotted leader ties label → amount across the gap (receipt style) */}
            <span aria-hidden className="flex-1 border-b border-dotted border-[var(--card-border)] mb-[3px] min-w-[10px]" />
            <span className={cn(
                "tabular-nums shrink-0",
                type === "positive" && "text-emerald-600 dark:text-emerald-400",
                type === "negative" && "text-rose-600 dark:text-rose-400",
                type === "neutral" && "text-foreground",
                type === "total" && "text-foreground font-bold",
            )}>
                {type === "positive" ? "+" : type === "negative" ? "−" : ""}
                {fmtIQD(value)}
                {showUnit && <span className="text-[10px] text-muted font-normal ml-0.5">{unit}</span>}
            </span>
            {/* fixed chevron slot keeps the amount column aligned across clickable + static rows */}
            <span className="w-3 shrink-0 flex items-center justify-center">
                {onClick && <ChevronRight className="w-3 h-3 text-muted opacity-50 group-hover/row:opacity-100 transition-opacity" />}
            </span>
        </>
    );
    const cls = cn("flex items-end gap-1.5 py-[3px] text-xs", bold && "font-semibold");
    if (onClick) {
        return (
            <button
                onClick={onClick}
                title={title}
                aria-label={ariaLabel}
                className={cn(cls, "w-full text-left rounded-md -mx-1 px-1 hover:bg-[var(--card-bg)] cursor-pointer group/row transition-colors")}
            >
                {inner}
            </button>
        );
    }
    return <div className={cls}>{inner}</div>;
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
    onVoidPayment: (recordId: string) => Promise<void>;
    onUpdateConfig: (
        employeeId: string,
        config: { base_monthly_salary: number; per_order_bonus: number; use_role_defaults: boolean }
    ) => Promise<void>;
    onPeriodOverride: (employeeId: string, start: string, end: string) => void;
    onClearPeriodOverride: (employeeId: string) => void;
    onHide: (employeeId: string) => void;
    /** Rate-change history for the pay settings form. */
    loadConfigHistory: (employeeId: string) => Promise<SalaryConfigHistoryRow[]>;
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
    onVoidPayment,
    onUpdateConfig,
    onPeriodOverride,
    onClearPeriodOverride,
    onHide,
    loadConfigHistory,
    hasOverride,
    isPayingOut = false,
    recentPayments = [],
    index = 0,
}: EmployeePayrollCardProps) {
    const reduce = useReducedMotion();
    const { t, language } = useLanguage();
    const iqd = t("common.iqd");
    const dateLocale = language === "ar" ? ar : undefined;
    /** Short dates in the reader's language ("d MMM" in Arabic, "MMM d" in English). */
    const fd = (d: string | null | undefined, withYear = false) =>
        fmtDate(d, language === "ar" ? (withYear ? "d MMM yyyy" : "d MMM") : (withYear ? "MMM d, yyyy" : "MMM d"), dateLocale);
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

    // Payroll math as one running ledger: earnings → deductions → Net, with the same lines
    // the payslip and payroll record use (gross = base + order bonus + bonuses). The order
    // bonus is the paid one: genuine orders only, a partly refunded order counting its kept
    // share. Replacements and refunds earn nothing, so they are listed as "not counted",
    // never as money taken off.
    const perOrderBonus = effectiveRate.perOrderBonus;
    const orderBonus = calculation.orderBonus;
    // Paid order units (fractional when a refund was partial), shown in the Orders line.
    const paidUnits = perOrderBonus > 0 ? Math.round((orderBonus / perOrderBonus) * 10) / 10 : calculation.completedOrdersCount;
    const notCounted = breakdown.replacements + breakdown.refunds;
    const preDeductions =
        calculation.baseSalary + orderBonus + calculation.performanceBonusesTotal;
    // Count of non-zero earning lines — a "Before deductions" subtotal is only worth showing
    // when it sums more than one (otherwise it just repeats the single earning line above it).
    const earningLines =
        (calculation.baseSalary > 0 ? 1 : 0) +
        (orderBonus > 0 ? 1 : 0) +
        (calculation.performanceBonusesTotal > 0 ? 1 : 0);
    const hasEarnings = earningLines > 0;
    const hasAnyDeduction =
        calculation.absenceDeduction > 0 || calculation.advancesTotal > 0 ||
        calculation.penaltiesTotal > 0;
    const totalDeductions =
        calculation.absenceDeduction + calculation.advancesTotal + calculation.penaltiesTotal;
    // The "total deducted" rollup only earns its row when it sums two or more lines.
    const deductionLines =
        (calculation.absenceDeduction > 0 ? 1 : 0) + (calculation.advancesTotal > 0 ? 1 : 0) + (calculation.penaltiesTotal > 0 ? 1 : 0);
    // True signed result of the ledger. Net is clamped at 0 (use-salaries), so when this is
    // negative the displayed lines can't sum to the 0 hero — surface the gap instead of hiding it.
    const rawNet = preDeductions - totalDeductions;
    const overDeducted = rawNet < -0.5;

    // Hero count-up
    const animatedNet = useCountUp(calculation.netSalary);

    // Trend vs last payout (#25) — normalized to a PER-DAY rate so a short "since last
    // payroll" window doesn't read as a crash against a full prior period.
    const lastPayment = recentPayments[0] ?? null;
    const trendPct = (() => {
        if (!lastPayment || lastPayment.net_salary <= 0) return null;
        const curDays = daysInclusive(calculation.periodStart, calculation.periodEnd);
        const lastDays = daysInclusive(lastPayment.period_start, lastPayment.period_end);
        if (curDays <= 0 || lastDays <= 0) return null;
        const curDaily = calculation.netSalary / curDays;
        const lastDaily = lastPayment.net_salary / lastDays;
        if (lastDaily <= 0) return null;
        return Math.round(((curDaily - lastDaily) / lastDaily) * 100);
    })();

    // "Unusually high" sanity guard. For salaried staff: net > 2× base. For commission-only
    // staff (no base to anchor) it never fired — flag when net runs well above the last payout,
    // which is where a rate/attribution misconfig would otherwise slip through to payment.
    const baseSalaryRate = effectiveRate.baseMonthlySalary;
    const lastNet = lastPayment?.net_salary ?? 0;
    const isOverpaid =
        (baseSalaryRate > 0 && calculation.netSalary > baseSalaryRate * 2) ||
        (baseSalaryRate === 0 && lastNet > 0 && calculation.netSalary > lastNet * 1.5);
    const overpaidReason = baseSalaryRate > 0
        ? t("payroll.card.overpaidBase")
        : t("payroll.card.overpaidLast");

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
                className="group bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden hover:border-[var(--ink)]/25 transition-colors flex flex-col"
            >

                {/* ── A. Header — identity ── */}
                <div className="p-4 pb-3 flex items-start gap-3">
                    <div className="relative shrink-0">
                        <Avatar name={displayName} avatarUrl={employee.avatarUrl} />
                        {employee.isActive && (
                            <span
                                role="img"
                                aria-label={t("payroll.card.active")}
                                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-[var(--card-bg)]"
                            />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="font-semibold text-foreground truncate leading-tight">{displayName}</p>
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium text-muted bg-[var(--background)]">
                                    {t(`payroll.roles.${employee.role}`, employee.role)}
                                </span>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 opacity-50 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button
                                    onClick={() => setConfigOpen(true)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors"
                                    aria-label={t("payroll.card.configure")}
                                    title={t("payroll.card.configure")}
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => onHide(employee.id)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-rose-500 transition-colors"
                                    aria-label={t("payroll.card.hide")}
                                    title={t("payroll.card.hide")}
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
                            aria-label={t("payroll.card.qualityAria", { payable: calculation.completedOrdersCount, total: breakdown.completedTotal, pct: qualityPct })}
                            title={t("payroll.card.qualityHint")}
                        >
                            <div className="flex items-baseline justify-between mb-1.5">
                                <span className="text-xs font-medium text-foreground tabular-nums">
                                    {calculation.completedOrdersCount}
                                    <span className="text-muted font-normal"> / {breakdown.completedTotal} {t("payroll.card.payable")}</span>
                                </span>
                                <span className={cn(
                                    "text-xs font-semibold tabular-nums",
                                    qualityPct >= 90 ? "text-emerald-600 dark:text-emerald-400"
                                        : qualityPct >= 70 ? "text-amber-700 dark:text-amber-400"
                                            : "text-rose-600 dark:text-rose-400",
                                )}>
                                    {qualityPct}% <span className="font-medium">{t("payroll.card.qualityWord")}</span>
                                </span>
                            </div>
                            {/* Stacked composition bar: genuine / replacements / refunds */}
                            <div className="h-1.5 rounded-full bg-[var(--card-border)] overflow-hidden flex">
                                {([
                                    { n: breakdown.genuine, cls: "bg-emerald-500", label: t("payroll.card.genuine") },
                                    { n: breakdown.replacements, cls: "bg-amber-500", label: t("payroll.card.replacements") },
                                    { n: breakdown.refunds, cls: "bg-rose-500", label: t("payroll.card.refunds") },
                                ] as const).filter(s => s.n > 0).map((s, si) => (
                                    <motion.div
                                        key={s.label}
                                        initial={reduce ? false : { width: 0 }}
                                        animate={{ width: `${(s.n / breakdown.completedTotal) * 100}%` }}
                                        transition={{ duration: 0.6, ease: "easeOut", delay: reduce ? 0 : 0.15 + si * 0.08 }}
                                        className={cn("h-full", s.cls)}
                                        title={`${s.n} ${s.label}`}
                                    />
                                ))}
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
                            title={t("payroll.card.customPeriod")}
                        >
                            <Calendar className="w-3 h-3" />
                            <bdi>{fd(calculation.periodStart)}</bdi> – <bdi>{fd(calculation.periodEnd)}</bdi>
                        </button>
                        {hasOverride && (
                            <button
                                onClick={() => onClearPeriodOverride(employee.id)}
                                className="p-1 rounded-full text-muted hover:text-rose-500 transition-colors"
                                aria-label={t("payroll.card.resetPeriod")}
                                title={t("payroll.card.resetPeriod")}
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
                                title={t("payroll.card.trendHint")}
                            >
                                {trendPct > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                <span className="sr-only">{t("payroll.card.trendSr")} </span>
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
                            <span className="font-semibold">{t("payroll.card.partialOverlap")}</span>
                            {" — "}
                            {t("payroll.card.partialOverlapBody", { from: fd(overlappingPayroll.period_start), to: fd(overlappingPayroll.period_end) })}
                        </span>
                    </div>
                )}
                {isOverpaid && (
                    <div className="mx-4 mb-3 flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                        <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
                        <span><span className="font-semibold">{t("payroll.card.unusuallyHigh")}</span> — {overpaidReason}. {t("payroll.card.doubleCheck")}</span>
                    </div>
                )}

                {/* ── D. Inline period picker ── */}
                {calendarOpen && (
                    <div className="mx-4 mb-3 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)] space-y-2">
                        <p className="text-xs font-medium text-muted">{t("payroll.card.customPeriodTitle")}</p>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={draftStart}
                                onChange={e => setDraftStart(e.target.value)}
                                aria-label={t("payroll.card.periodStart")}
                                className="flex-1 px-2 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-xs text-foreground focus:outline-none"
                            />
                            <span className="text-muted text-xs">→</span>
                            <input
                                type="date"
                                value={draftEnd}
                                onChange={e => setDraftEnd(e.target.value)}
                                aria-label={t("payroll.card.periodEnd")}
                                className="flex-1 px-2 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-xs text-foreground focus:outline-none"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { onClearPeriodOverride(employee.id); setCalendarOpen(false); }}
                                className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-muted hover:text-foreground transition-colors"
                            >
                                {t("payroll.card.reset")}
                            </button>
                            <button
                                onClick={() => { onPeriodOverride(employee.id, draftStart, draftEnd); setCalendarOpen(false); }}
                                disabled={!draftStart || !draftEnd || draftStart > draftEnd}
                                className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-[var(--ink)] text-white hover:opacity-90 transition-all disabled:opacity-40"
                            >
                                {t("payroll.card.apply")}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── E. Money panel — ledger resolving to the Net hero + pay action ── */}
                <div className="mx-4 mb-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] overflow-hidden">
                    {/* Ledger: earnings → deductions (one running ledger) */}
                    <div className="p-3 pb-2.5 flex gap-3">
                        <div className="flex-1 min-w-0 space-y-0">
                            {/* Earnings */}
                            {calculation.baseSalary > 0 && (
                                <CompactLineItem unit={iqd} label={t("payroll.line.base")} value={calculation.baseSalary} type="neutral" />
                            )}
                            {orderBonus > 0 && (
                                <CompactLineItem
                                    unit={iqd}
                                    label={t("payroll.card.ordersLine", { count: paidUnits, rate: fmtIQD(perOrderBonus) })}
                                    value={orderBonus}
                                    type="positive"
                                />
                            )}
                            {notCounted > 0 && perOrderBonus > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setBreakdownOpen(true)}
                                    title={t("payroll.card.replacementsHint")}
                                    className="flex w-full items-center gap-1 py-[3px] text-[11px] text-muted hover:text-foreground transition-colors"
                                >
                                    {t("payroll.card.notCounted", { replacements: breakdown.replacements, refunds: breakdown.refunds })}
                                    <ChevronRight className="w-3 h-3 opacity-60" aria-hidden="true" />
                                </button>
                            )}
                            {calculation.performanceBonusesTotal > 0 && (
                                <CompactLineItem
                                    unit={iqd}
                                    label={t("payroll.card.bonusesLine", { count: calculation.pendingBonuses.length })}
                                    value={calculation.performanceBonusesTotal}
                                    type="positive"
                                />
                            )}
                            {!hasEarnings && (
                                <p className="text-xs text-muted py-0.5">{t("payroll.card.noEarnings")}</p>
                            )}

                            {/* Before-deductions subtotal — only when it sums 2+ earning lines */}
                            {earningLines >= 2 && (
                                <>
                                    <div className="border-t border-[var(--card-border)] my-1" />
                                    <CompactLineItem unit={iqd} label={t("payroll.card.beforeDeductions")} value={preDeductions} type="total" bold />
                                </>
                            )}

                            {/* Deductions (replacements/refunds are clickable → order breakdown) */}
                            {hasAnyDeduction && (
                                <>
                                    {earningLines < 2 && <div className="border-t border-[var(--card-border)] my-1" />}
                                    {calculation.absenceDeduction > 0 && (
                                        <CompactLineItem
                                    unit={iqd}
                                            label={t("payroll.card.absenceLine", { days: calculation.absenceDays })}
                                            value={calculation.absenceDeduction}
                                            type="negative"
                                        />
                                    )}
                                    {calculation.advancesTotal > 0 && (
                                        <CompactLineItem
                                    unit={iqd}
                                            label={t("payroll.card.advancesLine", { count: calculation.pendingAdvances.length })}
                                            value={calculation.advancesTotal}
                                            type="negative"
                                        />
                                    )}
                                    {calculation.penaltiesTotal > 0 && (
                                        <CompactLineItem
                                    unit={iqd}
                                            label={t("payroll.card.penaltiesLine", { count: calculation.pendingPenalties.length })}
                                            value={calculation.penaltiesTotal}
                                            type="negative"
                                        />
                                    )}
                                    {/* Rollup so the red lines visibly sum and the ledger reconciles to Net */}
                                    {deductionLines >= 2 && <div className="flex items-end gap-1.5 pt-1 mt-0.5 border-t border-dashed border-[var(--card-border)] text-[11px]">
                                        <span className="text-muted shrink-0">{t("payroll.card.totalDeducted")}</span>
                                        <span aria-hidden className="flex-1 border-b border-dotted border-[var(--card-border)] mb-[3px] min-w-[10px]" />
                                        <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums shrink-0">−{fmtIQD(totalDeductions)}</span>
                                        <span className="w-3 shrink-0" />
                                    </div>}
                                </>
                            )}
                        </div>

                        {/* Sparkline (#7) — only if ≥2 payments */}
                        {sparkData.length >= 2 && (
                            <div className="w-16 h-12 shrink-0 self-center" role="img" aria-label={t("payroll.card.trendChart")}>
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
                                            {t("payroll.card.paid")}
                                        </span>
                                        <span className="text-xs text-muted tabular-nums">
                                            <bdi>{fd(overlappingPayroll.paid_at, true)}</bdi> · <bdi>{fmtIQD(overlappingPayroll.net_salary)} {iqd}</bdi>
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted mt-1 tabular-nums">
                                        <bdi>{fd(overlappingPayroll.period_start)}</bdi> – <bdi>{fd(overlappingPayroll.period_end)}</bdi>
                                    </p>
                                </div>
                                {!confirmVoid ? (
                                    <button
                                        onClick={() => setConfirmVoid(true)}
                                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-muted hover:text-rose-500 transition-colors"
                                        aria-label={t("payroll.card.void")}
                                        title={t("payroll.card.void")}
                                    >
                                        <Undo2 className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">{t("payroll.card.voidAsk")}</span>
                                        <button
                                            onClick={() => setConfirmVoid(false)}
                                            className="px-2 py-1 text-xs bg-[var(--background)] border border-[var(--card-border)] text-muted rounded-lg hover:text-foreground transition-colors"
                                        >
                                            {t("common.no")}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                await onVoidPayment(overlappingPayroll.id);
                                                setConfirmVoid(false);
                                            }}
                                            className="px-2 py-1 text-xs bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
                                        >
                                            {t("common.yes")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* The hero: Net Payable shown once, large + animated */
                            <>
                                <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{t("payroll.line.netPayable")}</p>
                                        <p className="text-[26px] font-bold text-foreground tabular-nums tracking-tight leading-none mt-1">
                                            {fmtIQD(animatedNet)}
                                            <span className="text-sm font-medium text-muted ml-1">{iqd}</span>
                                        </p>
                                        {overDeducted && (
                                            <p
                                                className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 tabular-nums"
                                                title={t("payroll.card.cappedHint")}
                                            >
                                                {t("payroll.card.capped", { amount: fmtIQD(-rawNet), currency: iqd })}
                                            </p>
                                        )}
                                    </div>
                                    <motion.button
                                        whileTap={reduce ? undefined : { scale: 0.95 }}
                                        onClick={() => onMarkAsPaid(data)}
                                        disabled={isPayingOut || calculation.netSalary === 0}
                                        title={calculation.netSalary === 0 ? t("payroll.card.nothingToPayShort") : undefined}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all shrink-0",
                                            "bg-[var(--ink)] text-white hover:opacity-90",
                                            "disabled:opacity-50 disabled:cursor-not-allowed"
                                        )}
                                    >
                                        {isPayingOut ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <CheckCircle className="w-4 h-4" />
                                                {t("payroll.card.markPaid")}
                                            </>
                                        )}
                                    </motion.button>
                                </div>
                                {calculation.inTransit.orders > 0 && (
                                    <p className="text-xs text-muted mt-2 tabular-nums" title={t("payroll.projection.hint")}>
                                        {t("payroll.projection.card", { count: calculation.inTransit.orders.toLocaleString("en-US") })}:{" "}
                                        <bdi className="font-semibold text-foreground">{fmtIQD(calculation.inTransit.projectedNet)} {iqd}</bdi>{" "}
                                        <bdi className="text-emerald-700 dark:text-emerald-400">+{fmtIQD(calculation.inTransit.extraOrderBonus)}</bdi>
                                    </p>
                                )}
                                {calculation.netSalary === 0 && !overDeducted && (
                                    <p className="text-xs text-muted mt-2">{t("payroll.card.nothingToPay")}</p>
                                )}
                                {lastPayment && (
                                    <p className="text-xs text-muted mt-2 tabular-nums">
                                        {t("payroll.card.lastPaid")} <bdi>{fd(lastPayment.paid_at)}</bdi> · <bdi>{fmtIQD(lastPayment.net_salary)} {iqd}</bdi>
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
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-medium border border-[var(--card-border)] bg-[var(--background)] text-foreground hover:border-[var(--ink)]/30 transition-colors"
                    >
                        <TrendingDown className="w-3 h-3 text-muted" aria-hidden="true" />
                        {t("payroll.card.addAdvance")}
                    </button>
                    <button
                        onClick={() => setPenaltyOpen(true)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-medium border border-[var(--card-border)] bg-[var(--background)] text-foreground hover:border-[var(--ink)]/30 transition-colors"
                    >
                        <AlertCircle className="w-3 h-3 text-muted" aria-hidden="true" />
                        {t("payroll.card.addPenalty")}
                    </button>
                    <button
                        onClick={() => setBonusOpen(true)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-medium border border-[var(--card-border)] bg-[var(--background)] text-foreground hover:border-[var(--ink)]/30 transition-colors"
                    >
                        <Star className="w-3 h-3 text-muted" aria-hidden="true" />
                        {t("payroll.card.addBonus")}
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
                        {pendingCount > 0 || recentPayments.length > 0 ? t("payroll.card.detailsCount", { count: pendingCount + recentPayments.length }) : t("payroll.card.details")}
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
                                    {t("payroll.card.returnedAfter", { count: data.returnedAfterPayment.length })}
                                </p>
                                <p className="text-xs text-muted mb-1">
                                    {t("payroll.card.returnedAfterHint")}
                                </p>
                                <button
                                    onClick={() => setBreakdownOpen(true)}
                                    className="text-xs text-muted hover:text-foreground underline decoration-dotted transition-colors"
                                >
                                    {t("payroll.card.viewList")}
                                </button>
                            </div>
                        )}

                        {/* Pending advances */}
                        {calculation.pendingAdvances.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{t("payroll.card.pendingAdvances")}</p>
                                <div className="space-y-1">
                                    {calculation.pendingAdvances.map(a => (
                                        <div key={a.id} className="flex items-center justify-between text-xs">
                                            <span className="text-muted truncate">{a.reason || t("payroll.card.noReason")} · {fd(a.created_at)}</span>
                                            <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums shrink-0 ml-2">−{fmtIQD(a.amount)} {iqd}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Pending penalties */}
                        {calculation.pendingPenalties.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{t("payroll.card.pendingPenalties")}</p>
                                <div className="space-y-1">
                                    {calculation.pendingPenalties.map(p => (
                                        <div key={p.id} className="flex items-center justify-between text-xs">
                                            <span className="text-muted truncate">{p.reason || t("payroll.card.noReason")} · {fd(p.created_at)}</span>
                                            <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums shrink-0 ml-2">−{fmtIQD(p.amount)} {iqd}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Pending bonuses */}
                        {calculation.pendingBonuses.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{t("payroll.card.pendingBonuses")}</p>
                                <div className="space-y-1">
                                    {calculation.pendingBonuses.map(b => (
                                        <div key={b.id} className="flex items-center justify-between text-xs">
                                            <span className="text-muted truncate">{b.reason || t("payroll.card.noReason")} · {fd(b.created_at)}</span>
                                            <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums shrink-0 ml-2">+{fmtIQD(b.amount)} {iqd}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Recent payments with notes (#8) */}
                        {recentPayments.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{t("payroll.card.recentPayments")}</p>
                                <div className="space-y-1.5">
                                    {recentPayments.slice(0, 5).map(p => (
                                        <div key={p.id} className="flex items-start justify-between py-1.5 border-b border-[var(--card-border)] last:border-0 gap-2">
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium text-foreground tabular-nums">
                                                    <bdi>{fd(p.period_start)}</bdi> – <bdi>{fd(p.period_end)}</bdi>
                                                </p>
                                                <p className="text-xs text-muted tabular-nums">
                                                    {t("payroll.card.paymentRow", { count: p.completed_orders_count, date: fd(p.paid_at ?? p.period_end) })}
                                                </p>
                                                {p.notes && (
                                                    <p className="text-xs text-muted italic mt-0.5">&ldquo;{p.notes}&rdquo;</p>
                                                )}
                                            </div>
                                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">{fmtIQD(p.net_salary)} {iqd}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {pendingCount === 0 && recentPayments.length === 0 && breakdown.completedTotal === 0 && data.returnedAfterPayment.length === 0 && (
                            <p className="text-xs text-muted text-center py-2">{t("payroll.card.nothingHere")}</p>
                        )}
                    </motion.div>
                )}
            </motion.div>

            {/* Modals */}
            <PayrollAdjustmentModal
                kind="advance"
                isOpen={advanceOpen}
                onClose={() => setAdvanceOpen(false)}
                employeeName={displayName}
                onSubmit={(amount, reason) => onAddAdvance(employee.id, amount, reason || undefined)}
            />
            <PayrollAdjustmentModal
                kind="penalty"
                isOpen={penaltyOpen}
                onClose={() => setPenaltyOpen(false)}
                employeeName={displayName}
                onSubmit={(amount, reason) => onAddPenalty(employee.id, amount, reason)}
            />
            <PayrollAdjustmentModal
                kind="bonus"
                isOpen={bonusOpen}
                onClose={() => setBonusOpen(false)}
                employeeName={displayName}
                onSubmit={(amount, reason) => onAddBonus(employee.id, amount, reason || undefined)}
            />
            <SalaryConfigForm
                isOpen={configOpen}
                onClose={() => setConfigOpen(false)}
                employeeName={displayName}
                employeeId={employee.id}
                currentRate={effectiveRate}
                onSubmit={config => onUpdateConfig(employee.id, config)}
                loadHistory={loadConfigHistory}
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
