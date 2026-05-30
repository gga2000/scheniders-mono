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

const colorClasses = {
    emerald: {
        bg: "bg-emerald-50 dark:bg-emerald-900/20",
        border: "border-emerald-200 dark:border-emerald-800/40",
        icon: "text-emerald-600",
        text: "text-emerald-700 dark:text-emerald-400",
    },
    green: {
        bg: "bg-green-50 dark:bg-green-900/20",
        border: "border-green-200 dark:border-green-800/40",
        icon: "text-green-600",
        text: "text-green-700 dark:text-green-400",
    },
    blue: {
        bg: "bg-blue-50 dark:bg-blue-900/20",
        border: "border-blue-200 dark:border-blue-800/40",
        icon: "text-blue-600",
        text: "text-blue-700 dark:text-blue-400",
    },
    rose: {
        bg: "bg-rose-50 dark:bg-rose-900/20",
        border: "border-rose-200 dark:border-rose-800/40",
        icon: "text-rose-600",
        text: "text-rose-700 dark:text-rose-400",
    },
    amber: {
        bg: "bg-amber-50 dark:bg-amber-900/20",
        border: "border-amber-200 dark:border-amber-800/40",
        icon: "text-amber-600",
        text: "text-amber-700 dark:text-amber-400",
    },
    slate: {
        bg: "bg-slate-50 dark:bg-slate-800/15",
        border: "border-slate-200 dark:border-slate-700/35",
        icon: "text-slate-600",
        text: "text-slate-700 dark:text-slate-400",
    },
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
    const colors = colorClasses[colorTheme];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.3, ease: "easeOut" }}
            className={cn(
                "flex flex-col p-3 rounded-xl backdrop-blur-sm border",
                colors.bg,
                colors.border
            )}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className={cn("p-1.5 rounded-lg", colors.bg)}>
                        <Icon className={cn("w-4 h-4", colors.icon)} />
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
                    <div className="h-1.5 bg-gray-200 dark:bg-gray-700/50 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(Math.abs(percentageValue), 100)}%` }}
                            transition={{ delay: delay + 0.3, duration: 0.8, ease: "easeOut" }}
                            className={cn("h-full rounded-full")}
                            style={{
                                background: percentageValue >= 0
                                    ? `linear-gradient(90deg, ${colors.icon === "text-emerald-600" || colors.icon === "text-green-600" ? "#10B981" : "#3B82F6"}, ${colors.icon === "text-emerald-600" || colors.icon === "text-green-600" ? "#059669" : "#2563EB"})`
                                    : `linear-gradient(90deg, #F43F5E, #E11D48)`
                            }}
                        />
                    </div>
                </div>
            )}
        </motion.div>
    );
}
