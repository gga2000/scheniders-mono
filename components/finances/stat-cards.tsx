"use client";

import { motion } from "framer-motion";
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    ShoppingCart,
    CheckCircle,
    Clock,
    XCircle,
    Calculator,
} from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { RevenueStats, ProfitStats, PeriodComparison } from "@/hooks/use-finances";

interface RevenueCardsProps {
    stats: RevenueStats;
    comparison?: PeriodComparison | null;
}

interface ProfitCardsProps {
    stats: ProfitStats;
    revenue: number;
}

function ChangeIndicator({ value, percent }: { value: number; percent: number }) {
    const isPositive = value >= 0;

    return (
        <div className={`flex items-center gap-1 text-xs ${isPositive ? "text-green-600" : "text-rose-600"}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{isPositive ? "+" : ""}{percent.toFixed(1)}%</span>
        </div>
    );
}

export function RevenueCards({ stats, comparison }: RevenueCardsProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total Revenue */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="pastel-card pastel-card-green p-5"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-green-700" />
                    </div>
                    {comparison && (
                        <ChangeIndicator
                            value={comparison.revenueChange}
                            percent={comparison.revenueChangePercent}
                        />
                    )}
                </div>
                <p className="text-2xl font-bold text-green-900">{formatIQD(stats.totalRevenue)}</p>
                <p className="text-sm text-green-700 mt-1">Total Revenue</p>
            </motion.div>

            {/* Delivered Revenue */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="pastel-card pastel-card-mint p-5"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-teal-700" />
                    </div>
                </div>
                <p className="text-2xl font-bold text-teal-900">{formatIQD(stats.deliveredRevenue)}</p>
                <p className="text-sm text-teal-700 mt-1">Delivered ({stats.deliveredCount})</p>
            </motion.div>

            {/* Pending Revenue */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="pastel-card pastel-card-yellow p-5"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-amber-700" />
                    </div>
                </div>
                <p className="text-2xl font-bold text-amber-900">{formatIQD(stats.pendingRevenue)}</p>
                <p className="text-sm text-amber-700 mt-1">Pending Orders</p>
            </motion.div>

            {/* Average Order Value */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="pastel-card pastel-card-blue p-5"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <ShoppingCart className="w-5 h-5 text-blue-700" />
                    </div>
                </div>
                <p className="text-2xl font-bold text-blue-900">{formatIQD(stats.averageOrderValue)}</p>
                <p className="text-sm text-blue-700 mt-1">Avg Order Value</p>
            </motion.div>
        </div>
    );
}

export function ProfitCards({ stats, revenue }: ProfitCardsProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Gross Profit */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="pastel-card p-5"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-green-700" />
                    </div>
                </div>
                <p className="text-2xl font-bold text-foreground">{formatIQD(stats.grossProfit)}</p>
                <p className="text-sm text-muted mt-1">Gross Profit</p>
            </motion.div>

            {/* Total Expenses */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="pastel-card pastel-card-pink p-5"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <XCircle className="w-5 h-5 text-rose-700" />
                    </div>
                </div>
                <p className="text-2xl font-bold text-rose-900">{formatIQD(stats.totalExpenses)}</p>
                <p className="text-sm text-rose-700 mt-1">Total Expenses</p>
            </motion.div>

            {/* Net Profit */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className={`pastel-card p-5 ${stats.netProfit >= 0 ? "pastel-card-green" : "pastel-card-pink"}`}
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <Calculator className="w-5 h-5" />
                    </div>
                </div>
                <p className={`text-2xl font-bold ${stats.netProfit >= 0 ? "text-green-900" : "text-rose-900"}`}>
                    {formatIQD(stats.netProfit)}
                </p>
                <p className={`text-sm mt-1 ${stats.netProfit >= 0 ? "text-green-700" : "text-rose-700"}`}>
                    Net Profit
                </p>
            </motion.div>

            {/* Profit Margin */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="pastel-card p-5"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.profitMargin >= 20 ? "bg-[var(--pastel-green)]" :
                            stats.profitMargin >= 0 ? "bg-[var(--pastel-yellow)]" : "bg-[var(--pastel-pink)]"
                        }`}>
                        <TrendingUp className="w-5 h-5" />
                    </div>
                </div>
                <p className="text-2xl font-bold text-foreground">{stats.profitMargin.toFixed(1)}%</p>
                <p className="text-sm text-muted mt-1">Profit Margin</p>
            </motion.div>
        </div>
    );
}
