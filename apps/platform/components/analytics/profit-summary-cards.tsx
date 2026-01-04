"use client";

import { motion } from "framer-motion";
import {
    TrendingUp,
    TrendingDown,
    Package,
    ArrowRight,
    CheckCircle2,
} from "lucide-react";
import { ProfitSummary } from "@/lib/expense-types";
import { cn } from "@/lib/utils";

interface ProfitSummaryCardsProps {
    summary: ProfitSummary;
}

function formatIQD(value: number): string {
    return new Intl.NumberFormat("en-IQ").format(Math.round(value));
}

export function ProfitSummaryCards({ summary }: ProfitSummaryCardsProps) {
    const isNetProfitable = summary.netProfit >= 0;

    return (
        <div className="h-full p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Cost Breakdown</h3>
                        <p className="text-xs text-muted">Delivered orders analysis</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--background)] border border-[var(--card-border)] text-muted text-sm font-medium">
                    <Package className="w-4 h-4" />
                    {summary.orderCount} orders
                </div>
            </div>

            {/* Cost Breakdown List */}
            <div className="space-y-2 mb-5">
                {/* Product Cost */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        <span className="text-sm font-medium text-foreground">Product Cost</span>
                    </div>
                    <div className="text-right">
                        <span className="font-semibold text-amber-600">IQD {formatIQD(summary.totalProductCost)}</span>
                        <span className="text-xs text-muted ml-2">
                            {summary.totalRevenue > 0
                                ? ((summary.totalProductCost / summary.totalRevenue) * 100).toFixed(1) + "%"
                                : "0%"}
                        </span>
                    </div>
                </div>

                {/* Delivery Cost */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                        <span className="text-sm font-medium text-foreground">Delivery</span>
                    </div>
                    <span className="font-semibold text-blue-600">IQD {formatIQD(summary.totalDeliveryCost)}</span>
                </div>

                {/* Packaging Cost */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-800/30">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                        <span className="text-sm font-medium text-foreground">Packaging</span>
                    </div>
                    <span className="font-semibold text-violet-600">IQD {formatIQD(summary.totalPackagingCost)}</span>
                </div>

                {/* Sample Vials & Perfume */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-pink-50 dark:bg-pink-900/10 border border-pink-100 dark:border-pink-800/30">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                        <span className="text-sm font-medium text-foreground">Samples (Vials + Perfume)</span>
                    </div>
                    <span className="font-semibold text-pink-600">
                        IQD {formatIQD(summary.totalVialCost + summary.totalSamplePerfumeCost)}
                    </span>
                </div>

                {/* Sweets */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/30">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                        <span className="text-sm font-medium text-foreground">Sweets</span>
                    </div>
                    <span className="font-semibold text-orange-600">IQD {formatIQD(summary.totalSweetsCost)}</span>
                </div>

                {/* Marketing (if any) */}
                {summary.marketingCost > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50 dark:bg-purple-900/10 border-2 border-purple-200 dark:border-purple-800/50">
                        <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">Marketing</span>
                        </div>
                        <span className="font-bold text-purple-700 dark:text-purple-300">
                            IQD {formatIQD(summary.marketingCost)}
                        </span>
                    </div>
                )}
            </div>

            {/* Divider */}
            <div className="flex items-center justify-center py-2">
                <ArrowRight className="w-4 h-4 text-muted rotate-90" />
            </div>

            {/* Profit Result */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={cn(
                    "p-4 rounded-xl border-2",
                    isNetProfitable
                        ? "bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-300 dark:from-emerald-900/20 dark:to-green-900/20 dark:border-emerald-700"
                        : "bg-gradient-to-r from-rose-50 to-red-50 border-rose-300 dark:from-rose-900/20 dark:to-red-900/20 dark:border-rose-700"
                )}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {isNetProfitable ? (
                            <TrendingUp className="w-6 h-6 text-emerald-600" />
                        ) : (
                            <TrendingDown className="w-6 h-6 text-rose-600" />
                        )}
                        <div>
                            <p className="text-sm font-semibold text-foreground">Net Profit</p>
                            <p className="text-xs text-muted">Revenue - All Costs</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className={cn(
                            "text-2xl font-bold",
                            isNetProfitable ? "text-emerald-600" : "text-rose-600"
                        )}>
                            IQD {formatIQD(summary.netProfit)}
                        </p>
                        <p className="text-xs text-muted">
                            {summary.netProfitMargin.toFixed(1)}% margin
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
