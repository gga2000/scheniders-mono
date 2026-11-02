"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";

interface FinancialMetricRowProps {
    icon: LucideIcon;
    label: string;
    amount: number;
    colorTheme: "emerald" | "blue" | "rose" | "green" | "amber" | "slate";
    showPercentage?: boolean;
    percentageValue?: number;
    delay?: number;
    subtitle?: string;
}

type Theme = FinancialMetricRowProps["colorTheme"];

/** Icon chip and bar colour per theme; the amount only takes colour for money in (green) or out (red). */
const THEME: Record<Theme, { chip: string; bar: string; text: string }> = {
    emerald: { chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
    green: { chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
    blue: { chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400", bar: "bg-blue-500", text: "text-foreground" },
    rose: { chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400", bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
    amber: { chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400", bar: "bg-amber-500", text: "text-foreground" },
    slate: { chip: "bg-slate-500/10 text-slate-600 dark:text-slate-400", bar: "bg-slate-400", text: "text-foreground" },
};

export function FinancialMetricRow({
    icon: Icon,
    label,
    amount,
    colorTheme,
    showPercentage,
    percentageValue,
    delay = 0,
    subtitle,
}: FinancialMetricRowProps) {
    const colors = THEME[colorTheme];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.3, ease: "easeOut" }}
            className={cn(
                "flex flex-col p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]"
            )}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className={cn("w-7 h-7 shrink-0 rounded-lg flex items-center justify-center", colors.chip)}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <div>
                        <span className="text-sm font-medium text-foreground">{label}</span>
                        {subtitle && (
                            <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-semibold tabular-nums", colors.text)}>
                        {formatIQD(amount)}
                    </span>
                    {showPercentage && percentageValue !== undefined && (
                        <span className="text-[11px] text-muted tabular-nums">
                            {percentageValue.toFixed(1)}%
                        </span>
                    )}
                </div>
            </div>

            {/* Visual Progress Bar for Percentage */}
            {showPercentage && percentageValue !== undefined && (
                <div className="mt-2">
                    <div className="h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(Math.abs(percentageValue), 100)}%` }}
                            transition={{ delay: delay + 0.3, duration: 0.8, ease: "easeOut" }}
                            className={cn("h-full rounded-full", percentageValue >= 0 ? colors.bar : "bg-rose-500")}
                        />
                    </div>
                </div>
            )}
        </motion.div>
    );
}
