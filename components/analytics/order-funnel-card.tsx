"use client";

import { motion } from "framer-motion";
import {
    ListChecks,
    Package,
    ChevronRight,
    DollarSign,
    TrendingUp,
} from "lucide-react";
import { FunnelSummary } from "@/types/expense";
import { cn } from "@/lib/utils";

interface OrderFunnelCardProps {
    funnel: FunnelSummary;
}

function formatIQD(value: number): string {
    return new Intl.NumberFormat("en-IQ").format(Math.round(value));
}

const stages = [
    { key: "pending", label: "Pending", color: "gray", bgClass: "bg-gray-50 dark:bg-gray-800/20", borderClass: "border-gray-200 dark:border-gray-700/30", dotClass: "bg-gray-400", textClass: "text-gray-600" },
    { key: "confirmed", label: "Confirmed", color: "amber", bgClass: "bg-amber-50 dark:bg-amber-900/10", borderClass: "border-amber-100 dark:border-amber-800/30", dotClass: "bg-amber-500", textClass: "text-amber-600" },
    { key: "inTransit", label: "In Transit", color: "blue", bgClass: "bg-blue-50 dark:bg-blue-900/10", borderClass: "border-blue-100 dark:border-blue-800/30", dotClass: "bg-blue-500", textClass: "text-blue-600" },
    { key: "delivered", label: "Delivered", color: "emerald", bgClass: "bg-emerald-50 dark:bg-emerald-900/10", borderClass: "border-emerald-100 dark:border-emerald-800/30", dotClass: "bg-emerald-500", textClass: "text-emerald-600" },
] as const;

export function OrderFunnelCard({ funnel }: OrderFunnelCardProps) {
    const {
        totalOrders,
        pendingCount,
        confirmedCount,
        inTransitCount,
        deliveredCount,
        confirmationRate,
        deliveryRate,
        totalRevenue,
        deliveredRevenue,
    } = funnel;

    const counts: Record<string, number> = {
        pending: pendingCount,
        confirmed: confirmedCount,
        inTransit: inTransitCount,
        delivered: deliveredCount,
    };

    return (
        <div className="h-full p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/30">
                        <ListChecks className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Order Funnel</h3>
                        <p className="text-xs text-muted">All orders lifecycle</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--background)] border border-[var(--card-border)] text-muted text-sm font-medium">
                    <Package className="w-4 h-4" />
                    {totalOrders} orders
                </div>
            </div>

            {/* Funnel Stages */}
            <div className="grid grid-cols-4 gap-2 mb-5">
                {stages.map((stage, index) => {
                    const count = counts[stage.key];
                    const pct = totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(0) : "0";

                    return (
                        <motion.div
                            key={stage.key}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                            className="relative"
                        >
                            <div className={cn("p-4 rounded-xl border", stage.bgClass, stage.borderClass)}>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className={cn("w-2 h-2 rounded-full", stage.dotClass)} />
                                    <span className="text-xs text-muted uppercase tracking-wider">{stage.label}</span>
                                </div>
                                <p className={cn("text-2xl font-bold", stage.textClass)}>{count}</p>
                                <p className="text-xs text-muted mt-1">{pct}%</p>
                            </div>
                            {/* Arrow between stages */}
                            {index < stages.length - 1 && (
                                <ChevronRight className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted z-10" />
                            )}
                        </motion.div>
                    );
                })}
            </div>

            {/* Conversion Rates */}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <div className={cn(
                    "flex items-center justify-between p-3 rounded-xl border",
                    confirmationRate >= 70
                        ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30"
                        : "bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-800/30"
                )}>
                    <div className="flex items-center gap-3">
                        <TrendingUp className={cn("w-4 h-4", confirmationRate >= 70 ? "text-emerald-500" : "text-rose-500")} />
                        <span className="text-sm font-medium text-foreground">Confirmation Rate</span>
                    </div>
                    <span className={cn("font-semibold", confirmationRate >= 70 ? "text-emerald-600" : "text-rose-600")}>
                        {confirmationRate.toFixed(1)}%
                    </span>
                </div>

                <div className={cn(
                    "flex items-center justify-between p-3 rounded-xl border",
                    deliveryRate >= 50
                        ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30"
                        : "bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-800/30"
                )}>
                    <div className="flex items-center gap-3">
                        <TrendingUp className={cn("w-4 h-4", deliveryRate >= 50 ? "text-emerald-500" : "text-rose-500")} />
                        <span className="text-sm font-medium text-foreground">Delivery Rate</span>
                    </div>
                    <span className={cn("font-semibold", deliveryRate >= 50 ? "text-emerald-600" : "text-rose-600")}>
                        {deliveryRate.toFixed(1)}%
                    </span>
                </div>
            </div>

            {/* Revenue Summary */}
            <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                    <div className="flex items-center gap-3">
                        <DollarSign className="w-4 h-4 text-muted" />
                        <span className="text-sm font-medium text-foreground">Total Revenue (All Positive)</span>
                    </div>
                    <span className="font-semibold text-foreground">
                        IQD {formatIQD(totalRevenue)}
                    </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30">
                    <div className="flex items-center gap-3">
                        <DollarSign className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium text-foreground">Delivered Revenue</span>
                    </div>
                    <span className="font-semibold text-emerald-600">
                        IQD {formatIQD(deliveredRevenue)}
                    </span>
                </div>
            </div>
        </div>
    );
}
