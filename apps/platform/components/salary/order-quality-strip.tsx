"use client";

import { CheckCircle, RefreshCw, Undo2, Gauge, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderBreakdown } from "@/types/salary";

interface OrderQualityStripProps {
    breakdown: OrderBreakdown;
    periodLabel?: string;
}

/** Business-wide completed-order quality summary for the selected period. */
export function OrderQualityStrip({ breakdown, periodLabel }: OrderQualityStripProps) {
    const qualityPct = Math.round(breakdown.qualityScore * 100);
    const qualityTone =
        breakdown.completedTotal === 0 ? "text-muted"
        : qualityPct >= 90 ? "text-emerald-600 dark:text-emerald-400"
        : qualityPct >= 70 ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";

    return (
        <div className="flex items-center gap-0 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden divide-x divide-[var(--card-border)]">
            <Cell icon={<Package className="w-3.5 h-3.5 text-foreground" />} bg="bg-[var(--background)]" label="Completed Orders" value={breakdown.completedTotal} />
            <Cell icon={<CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />} bg="bg-emerald-100 dark:bg-emerald-900/30" label="Payable (genuine)" value={breakdown.genuine} valueCls="text-emerald-600 dark:text-emerald-400" />
            <Cell icon={<RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />} bg="bg-amber-100 dark:bg-amber-900/30" label="Replacements" value={breakdown.replacements} valueCls="text-amber-600 dark:text-amber-400" />
            <Cell icon={<Undo2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />} bg="bg-rose-100 dark:bg-rose-900/30" label="Refunds / Returns" value={breakdown.refunds} valueCls="text-rose-600 dark:text-rose-400" />
            <div className="flex items-center gap-2 px-4 py-2.5">
                <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Gauge className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <p className="text-xs text-muted leading-none mb-0.5">Quality{periodLabel ? "" : ""}</p>
                    <p className={cn("text-sm font-bold tabular-nums", qualityTone)}>
                        {breakdown.completedTotal > 0 ? `${qualityPct}%` : "—"}
                    </p>
                </div>
            </div>
        </div>
    );
}

function Cell({
    icon, bg, label, value, valueCls = "text-foreground",
}: {
    icon: React.ReactNode;
    bg: string;
    label: string;
    value: number;
    valueCls?: string;
}) {
    return (
        <div className="flex items-center gap-2 px-4 py-2.5 flex-1 min-w-0">
            <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0", bg)}>
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-xs text-muted leading-none mb-0.5">{label}</p>
                <p className={cn("text-sm font-bold tabular-nums truncate", valueCls)}>{new Intl.NumberFormat("en-IQ").format(value)}</p>
            </div>
        </div>
    );
}
