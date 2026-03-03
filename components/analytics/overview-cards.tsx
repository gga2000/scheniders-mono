"use client";

import { motion } from "framer-motion";
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    Wallet,
    Package,
    PiggyBank,
    Target,
} from "lucide-react";
import { ProfitSummary, PipelineSummary } from "@/types/expense";
import { cn } from "@/lib/utils";

interface OverviewCardsProps {
    profitSummary: ProfitSummary;
    pipelineSummary: PipelineSummary;
}

function formatIQD(value: number): string {
    return new Intl.NumberFormat("en-IQ").format(Math.round(value));
}

export function OverviewCards({ profitSummary, pipelineSummary }: OverviewCardsProps) {
    const isGrossProfitable = profitSummary.grossProfit >= 0;
    const isNetProfitable = profitSummary.netProfit >= 0;

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {/* Revenue */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
            >
                <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">Revenue</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.totalRevenue)}</p>
                <p className="text-xs opacity-70">{profitSummary.orderCount} delivered</p>
            </motion.div>

            {/* Total Costs */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/20"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">Total Costs</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.totalOperationalCost)}</p>
                <p className="text-xs opacity-70">All operational</p>
            </motion.div>

            {/* Product Cost */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/20"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">Product Cost</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.totalProductCost)}</p>
                <p className="text-xs opacity-70">
                    {profitSummary.totalRevenue > 0
                        ? ((profitSummary.totalProductCost / profitSummary.totalRevenue) * 100).toFixed(1) + "%"
                        : "0%"}
                </p>
            </motion.div>

            {/* Gross Profit */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 }}
                className={cn(
                    "p-4 rounded-2xl text-white shadow-lg",
                    isGrossProfitable
                        ? "bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/20"
                        : "bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/20"
                )}
            >
                <div className="flex items-center gap-2 mb-2">
                    {isGrossProfitable ? (
                        <TrendingUp className="w-4 h-4 opacity-80" />
                    ) : (
                        <TrendingDown className="w-4 h-4 opacity-80" />
                    )}
                    <span className="text-xs font-medium opacity-80">Gross Profit</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.grossProfit)}</p>
                <p className="text-xs opacity-70">{profitSummary.grossProfitMargin.toFixed(1)}%</p>
            </motion.div>

            {/* Avg Profit/Order */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-500 text-white shadow-lg shadow-teal-500/20"
            >
                <div className="flex items-center gap-2 mb-2">
                    <PiggyBank className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">Avg/Order</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.avgProfitPerOrder)}</p>
                <p className="text-xs opacity-70">Per delivered</p>
            </motion.div>

            {/* Net Profit */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 }}
                className={cn(
                    "p-4 rounded-2xl text-white shadow-lg",
                    isNetProfitable
                        ? "bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20"
                        : "bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/20"
                )}
            >
                <div className="flex items-center gap-2 mb-2">
                    {isNetProfitable ? (
                        <TrendingUp className="w-4 h-4 opacity-80" />
                    ) : (
                        <TrendingDown className="w-4 h-4 opacity-80" />
                    )}
                    <span className="text-xs font-medium opacity-80">Net Profit</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.netProfit)}</p>
                <p className="text-xs opacity-70">{profitSummary.netProfitMargin.toFixed(1)}%</p>
            </motion.div>

            {/* Pipeline Orders */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">Pipeline</span>
                </div>
                <p className="text-lg font-bold">{pipelineSummary.orderCount}</p>
                <p className="text-xs opacity-70">Awaiting delivery</p>
            </motion.div>

            {/* Pipeline Revenue */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/20"
            >
                <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">Potential</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(pipelineSummary.potentialRevenue)}</p>
                <p className="text-xs opacity-70">If all deliver</p>
            </motion.div>
        </div>
    );
}
