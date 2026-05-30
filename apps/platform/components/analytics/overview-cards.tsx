"use client";

import { motion } from "framer-motion";
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    Wallet,
    Package,
    Target,
    Layers,
} from "lucide-react";
import { ProfitSummary, PipelineSummary } from "@/types/expense";
import { cn, formatIQD } from "@/lib/utils";

interface OverviewCardsProps {
    profitSummary: ProfitSummary;
    pipelineSummary: PipelineSummary;
}

export function OverviewCards({ profitSummary, pipelineSummary }: OverviewCardsProps) {
    const isGrossProfitable = profitSummary.grossProfit >= 0;
    const isOperatingProfitable = profitSummary.operatingProfit >= 0;
    const isNetProfitable = profitSummary.netProfit >= 0;
    const cogsPercent = profitSummary.totalRevenue > 0
        ? (profitSummary.totalCOGS / profitSummary.totalRevenue) * 100
        : 0;

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

            {/* COGS (Cost of Goods Sold) */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">COGS</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.totalCOGS)}</p>
                <p className="text-xs opacity-70">{cogsPercent.toFixed(1)}% of revenue</p>
            </motion.div>

            {/* Gross Profit — revenue minus COGS */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className={cn(
                    "p-4 rounded-2xl text-white shadow-lg",
                    isGrossProfitable
                        ? "bg-gradient-to-br from-teal-500 to-emerald-600 shadow-teal-500/20"
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
                <p className="text-xs opacity-70">{profitSummary.grossProfitMargin.toFixed(1)}% margin</p>
            </motion.div>

            {/* Operational Costs (non-COGS: delivery, packaging, vial, sweets) */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-lg shadow-slate-500/20"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">Operational</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.totalOperationalCost)}</p>
                <p className="text-xs opacity-70">Delivery · packaging · vials</p>
            </motion.div>

            {/* Operating Profit — gross minus operational */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className={cn(
                    "p-4 rounded-2xl text-white shadow-lg",
                    isOperatingProfitable
                        ? "bg-gradient-to-br from-cyan-500 to-teal-600 shadow-cyan-500/20"
                        : "bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/20"
                )}
            >
                <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">Operating Profit</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.operatingProfit)}</p>
                <p className="text-xs opacity-70">{profitSummary.operatingProfitMargin.toFixed(1)}% margin</p>
            </motion.div>

            {/* Total Costs (all-in including marketing) */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/20"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">Total Costs</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.totalCost)}</p>
                <p className="text-xs opacity-70">
                    {profitSummary.marketingCost > 0 ? "Incl. marketing" : "No marketing yet"}
                </p>
            </motion.div>

            {/* Net Profit — the hero number */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className={cn(
                    "p-4 rounded-2xl text-white shadow-lg ring-2 ring-offset-2 ring-offset-transparent",
                    isNetProfitable
                        ? "bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/30 ring-emerald-400/40"
                        : "bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/30 ring-red-400/40"
                )}
            >
                <div className="flex items-center gap-2 mb-2">
                    {isNetProfitable ? (
                        <TrendingUp className="w-4 h-4 opacity-80" />
                    ) : (
                        <TrendingDown className="w-4 h-4 opacity-80" />
                    )}
                    <span className="text-xs font-medium opacity-90">Net Profit</span>
                </div>
                <p className="text-lg font-bold">{formatIQD(profitSummary.netProfit)}</p>
                <p className="text-xs opacity-80">{profitSummary.netProfitMargin.toFixed(1)}% margin</p>
            </motion.div>

            {/* Pipeline (in-transit orders — amber for pending) */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 opacity-80" />
                    <span className="text-xs font-medium opacity-80">In Transit</span>
                </div>
                <p className="text-lg font-bold">{pipelineSummary.orderCount}</p>
                <p className="text-xs opacity-70">
                    {formatIQD(pipelineSummary.potentialRevenue)} upside
                </p>
            </motion.div>
        </div>
    );
}
