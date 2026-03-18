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
}

export function PrimaryResultCard({
    title,
    amount,
    margin,
    isPositive,
    description,
    delay = 0.2,
}: PrimaryResultCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.3, ease: "easeOut" }}
            className={cn(
                "p-5 rounded-2xl backdrop-blur-md border-2 shadow-lg",
                isPositive
                    ? "bg-gradient-to-br from-emerald-50/80 to-green-50/80 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-300 dark:border-emerald-700/50 shadow-emerald-500/20"
                    : "bg-gradient-to-br from-rose-50/80 to-red-50/80 dark:from-rose-900/20 dark:to-red-900/20 border-rose-300 dark:border-rose-700/50 shadow-rose-500/20"
            )}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    {isPositive ? (
                        <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 ring-2 ring-emerald-200 dark:ring-emerald-800/40">
                            <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                    ) : (
                        <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-900/30 ring-2 ring-rose-200 dark:ring-rose-800/40">
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
                        {formatIQD(Math.abs(amount))}
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
                    <div className="h-3 bg-gray-200 dark:bg-gray-700/50 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(Math.abs(margin), 100)}%` }}
                            transition={{ delay: delay + 0.4, duration: 1, ease: "easeOut" }}
                            className={cn("h-full rounded-full")}
                            style={{
                                background: isPositive
                                    ? "linear-gradient(90deg, #10B981, #059669)"
                                    : "linear-gradient(90deg, #F43F5E, #E11D48)"
                            }}
                        />
                    </div>
                </div>
            )}
        </motion.div>
    );
}
