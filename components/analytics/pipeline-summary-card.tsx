"use client";

import { motion } from "framer-motion";
import {
    TrendingUp,
    Package,
    Truck,
    DollarSign,
    Target,
    ArrowRight,
} from "lucide-react";
import { PipelineSummary } from "@/lib/expense-types";
import { cn } from "@/lib/utils";

interface PipelineSummaryCardProps {
    pipeline: PipelineSummary;
}

function formatIQD(value: number): string {
    return new Intl.NumberFormat("en-IQ").format(Math.round(value));
}

export function PipelineSummaryCard({ pipeline }: PipelineSummaryCardProps) {
    const {
        orderCount,
        confirmedCount,
        inTransitCount,
        potentialRevenue,
        projectedProfit,
        projectedProfitMargin,
        estimatedCosts,
        avgOrderValue,
    } = pipeline;

    return (
        <div className="h-full p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
                        <Target className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Pipeline</h3>
                        <p className="text-xs text-muted">Orders awaiting delivery</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--background)] border border-[var(--card-border)] text-muted text-sm font-medium">
                    <Package className="w-4 h-4" />
                    {orderCount} orders
                </div>
            </div>

            {/* Order Status Breakdown */}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30"
                >
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs text-muted uppercase tracking-wider">Confirmed</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-600">{confirmedCount}</p>
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30"
                >
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-xs text-muted uppercase tracking-wider">In Transit</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-600">{inTransitCount}</p>
                </motion.div>
            </div>

            {/* Financial Projections */}
            <div className="space-y-2 mb-5">
                {/* Potential Revenue */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30">
                    <div className="flex items-center gap-3">
                        <DollarSign className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium text-foreground">Potential Revenue</span>
                    </div>
                    <span className="font-semibold text-emerald-600">
                        IQD {formatIQD(potentialRevenue)}
                    </span>
                </div>

                {/* Estimated Costs */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800/30">
                    <div className="flex items-center gap-3">
                        <Truck className="w-4 h-4 text-rose-500" />
                        <span className="text-sm font-medium text-foreground">Estimated Costs</span>
                    </div>
                    <span className="font-semibold text-rose-600">
                        IQD {formatIQD(estimatedCosts)}
                    </span>
                </div>
            </div>

            {/* Divider with Arrow */}
            <div className="flex items-center justify-center py-2">
                <ArrowRight className="w-4 h-4 text-muted rotate-90" />
            </div>

            {/* Projected Profit */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={cn(
                    "p-4 rounded-xl border-2",
                    projectedProfit >= 0
                        ? "bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-300 dark:from-emerald-900/20 dark:to-green-900/20 dark:border-emerald-700"
                        : "bg-gradient-to-r from-rose-50 to-red-50 border-rose-300 dark:from-rose-900/20 dark:to-red-900/20 dark:border-rose-700"
                )}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <TrendingUp className={cn(
                            "w-6 h-6",
                            projectedProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                        )} />
                        <div>
                            <p className="text-sm font-semibold text-foreground">Projected Profit</p>
                            <p className="text-xs text-muted">If all orders deliver</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className={cn(
                            "text-2xl font-bold",
                            projectedProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}>
                            IQD {formatIQD(projectedProfit)}
                        </p>
                        <p className="text-xs text-muted">
                            {projectedProfitMargin.toFixed(1)}% margin
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Footer Stats */}
            <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Avg Order Value</span>
                    <span className="font-medium text-foreground">IQD {formatIQD(avgOrderValue)}</span>
                </div>
            </div>
        </div>
    );
}
