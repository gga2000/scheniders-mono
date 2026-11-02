"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";

interface PrimaryResultCardProps {
    title: string;
    amount: number;
    margin?: number;
    isPositive: boolean;
    description: string;
    delay?: number;
    /** Shown instead of the amount formatted as IQD, for results that are not money (a rate). */
    valueText?: string;
}

export function PrimaryResultCard({
    title,
    amount,
    margin,
    isPositive,
    description,
    delay = 0.2,
    valueText,
}: PrimaryResultCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.3, ease: "easeOut" }}
            className={cn(
                "p-5 rounded-2xl border bg-[var(--card-bg)]",
                isPositive ? "border-emerald-500/40" : "border-rose-500/40"
            )}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    {isPositive ? (
                        <div className="p-2.5 rounded-xl bg-emerald-500/10">
                            <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                    ) : (
                        <div className="p-2.5 rounded-xl bg-rose-500/10">
                            <TrendingDown className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                        </div>
                    )}
                    <div>
                        <p className="text-sm font-semibold text-foreground">{title}</p>
                        <p className="text-xs text-muted">{description}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p
                        className={cn(
                            "text-2xl font-bold tabular-nums",
                            isPositive
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                        )}
                    >
                        {valueText ?? formatIQD(Math.abs(amount))}
                    </p>
                </div>
            </div>

            {/* Visual Progress Bar for Margin */}
            {margin !== undefined && (
                <div className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted">Profit Margin</span>
                        <span className={cn(
                            "text-xs font-semibold tabular-nums",
                            isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        )}>
                            {margin.toFixed(1)}%
                        </span>
                    </div>
                    <div className="h-2 bg-[var(--background)] rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(Math.abs(margin), 100)}%` }}
                            transition={{ delay: delay + 0.4, duration: 1, ease: "easeOut" }}
                            className={cn("h-full rounded-full", isPositive ? "bg-emerald-500" : "bg-rose-500")}
                        />
                    </div>
                </div>
            )}
        </motion.div>
    );
}
