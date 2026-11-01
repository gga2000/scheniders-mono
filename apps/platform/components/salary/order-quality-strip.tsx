"use client";

import { CheckCircle, RefreshCw, Undo2, Gauge, Package } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { OrderBreakdown } from "@/types/salary";

interface OrderQualityStripProps {
    breakdown: OrderBreakdown;
    periodLabel?: string;
}

/** Business-wide completed-order quality summary for the selected period. */
export function OrderQualityStrip({ breakdown }: OrderQualityStripProps) {
    const { t } = useLanguage();
    const reduce = useReducedMotion();
    const qualityPct = Math.round(breakdown.qualityScore * 100);
    const qualityTone =
        breakdown.completedTotal === 0 ? "text-muted"
        : qualityPct >= 90 ? "text-emerald-600 dark:text-emerald-400"
        : qualityPct >= 70 ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";

    return (
        <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: reduce ? 0 : 0.05 }}
            className="flex items-stretch flex-wrap sm:flex-nowrap bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden divide-x divide-[var(--card-border)]"
        >
            <Cell Icon={Package} label={t("payroll.strip.completed")} value={breakdown.completedTotal} />
            <Cell Icon={CheckCircle} label={t("payroll.strip.payable")} value={breakdown.genuine} />
            <Cell Icon={RefreshCw} label={t("payroll.breakdown.replacements")} value={breakdown.replacements} />
            <Cell Icon={Undo2} label={t("payroll.strip.refunds")} value={breakdown.refunds} />
            <div className="flex items-center gap-2.5 px-4 py-3">
                <div className="w-7 h-7 rounded-lg bg-[var(--background)] flex items-center justify-center shrink-0">
                    <Gauge className="w-4 h-4 text-muted" aria-hidden="true" />
                </div>
                <div>
                    <p className="text-xs text-muted leading-none mb-1.5">{t("payroll.breakdown.quality")}</p>
                    <p className={cn("text-sm font-bold tabular-nums tracking-tight", qualityTone)}>
                        {breakdown.completedTotal > 0 ? `${qualityPct}%` : "—"}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}

function Cell({ Icon, label, value }: { Icon: React.ElementType; label: string; value: number }) {
    return (
        <div className="flex items-center gap-2.5 px-4 py-3 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[var(--background)]">
                <Icon className="w-4 h-4 text-muted" aria-hidden="true" />
            </div>
            <div className="min-w-0">
                <p className="text-xs text-muted leading-none mb-1.5">{label}</p>
                <p className="text-sm font-bold text-foreground tabular-nums truncate tracking-tight">{new Intl.NumberFormat("en-IQ").format(value)}</p>
            </div>
        </div>
    );
}
