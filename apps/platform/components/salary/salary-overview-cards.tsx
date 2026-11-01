"use client";

import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { OrderBreakdown } from "@/types/salary";

function fmtNumber(n: number) {
    return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function Figure({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
    const body = (
        <>
            <span className="block text-xs text-muted mb-1.5">{label}</span>
            <span className="flex items-center gap-1 text-base font-semibold text-foreground tabular-nums">
                <bdi>{value}</bdi>
                {onClick && <ChevronRight className="w-3.5 h-3.5 text-muted opacity-50 group-hover/fig:opacity-100 transition-opacity" aria-hidden="true" />}
            </span>
        </>
    );
    const cls = "px-5 py-4 text-left";
    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={cn(cls, "group/fig hover:bg-[var(--background)] transition-colors")}>
                {body}
            </button>
        );
    }
    return <div className={cls}>{body}</div>;
}

interface SalaryOverviewCardsProps {
    totalDue: number;
    employeeCount: number;
    totalPendingAdvances: number;
    totalPendingPenalties: number;
    /** Business-wide completed orders in the selected period. */
    breakdown: OrderBreakdown;
    onAdvancesClick?: () => void;
    onPenaltiesClick?: () => void;
}

/**
 * One summary strip for /salaries: what is owed (money) on the left, and the period's
 * completed orders (what order pay is counted from) on the right. No decorative icons.
 */
export function SalaryOverviewCards({
    totalDue,
    employeeCount,
    totalPendingAdvances,
    totalPendingPenalties,
    breakdown,
    onAdvancesClick,
    onPenaltiesClick,
}: SalaryOverviewCardsProps) {
    const reduce = useReducedMotion();
    const { t } = useLanguage();
    const iqd = t("common.iqd");
    const hasOrders = breakdown.completedTotal > 0;
    const qualityPct = Math.round(breakdown.qualityScore * 100);
    const qualityTone = !hasOrders
        ? "text-muted"
        : qualityPct >= 90 ? "text-emerald-700 dark:text-emerald-400"
        : qualityPct >= 70 ? "text-amber-700 dark:text-amber-400"
        : "text-rose-700 dark:text-rose-400";

    const orderFigures = [
        { label: t("payroll.strip.payable"), value: breakdown.genuine },
        { label: t("payroll.breakdown.replacements"), value: breakdown.replacements },
        { label: t("payroll.strip.refunds"), value: breakdown.refunds },
    ];

    return (
        <motion.section
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            aria-label={t("payroll.overview.label")}
            className="flex items-stretch bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden divide-x divide-[var(--card-border)]"
        >
            <div className="px-5 py-4 min-w-[240px]">
                <p className="text-xs text-muted mb-1">{t("payroll.overview.totalDue")}</p>
                <p className="text-2xl font-bold text-foreground tabular-nums tracking-tight leading-tight">
                    <bdi>{fmtNumber(totalDue)} <span className="text-sm font-medium text-muted">{iqd}</span></bdi>
                </p>
                <p className="text-xs text-muted mt-1">{t("payroll.overview.membersCount", { count: fmtNumber(employeeCount) })}</p>
            </div>
            <Figure label={t("payroll.overview.advances")} value={`${fmtNumber(totalPendingAdvances)} ${iqd}`} onClick={onAdvancesClick} />
            <Figure label={t("payroll.overview.penalties")} value={`${fmtNumber(totalPendingPenalties)} ${iqd}`} onClick={onPenaltiesClick} />

            <div className="flex-1 px-5 py-4 min-w-0">
                <p className="text-xs text-muted mb-1.5">
                    {t("payroll.overview.ordersTitle", { count: fmtNumber(breakdown.completedTotal) })}
                </p>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    {orderFigures.map((f) => (
                        <p key={f.label} className="text-sm text-muted">
                            <span className="text-base font-semibold text-foreground tabular-nums me-1.5">{fmtNumber(f.value)}</span>
                            {f.label}
                        </p>
                    ))}
                    <p className="text-sm text-muted">
                        <span className={cn("text-base font-semibold tabular-nums me-1.5", qualityTone)}>{hasOrders ? `${qualityPct}%` : "—"}</span>
                        {t("payroll.breakdown.quality")}
                    </p>
                </div>
            </div>
        </motion.section>
    );
}
