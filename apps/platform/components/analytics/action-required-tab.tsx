"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    ArrowRight,
    Package,
    ClipboardList,
    DollarSign,
    AlertCircle,
    CheckCircle2,
} from "lucide-react";
import { Order, Product } from "@/types";
import { calculateProfitPulse } from "@/lib/analytics/profit-calculations";
import { subDays, isWithinInterval } from "date-fns";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface ActionRequiredTabProps {
    orders: Order[];
    products: Product[];
    marketingCost: number;
}

export function ActionRequiredTab({ orders, products, marketingCost }: ActionRequiredTabProps) {
    const router = useRouter();
    const { t } = useLanguage();

    // Calculate profit pulse with real costs
    const profitPulse = useMemo(() => {
        return calculateProfitPulse(orders, products, marketingCost);
    }, [orders, products, marketingCost]);

    // Calculate failed deliveries (last 7 days)
    const failedDeliveries = useMemo(() => {
        const sevenDaysAgo = subDays(new Date(), 7);
        const rejected = orders.filter(
            o =>
                o.status === "rejected" &&
                isWithinInterval(new Date(o.created_at), {
                    start: sevenDaysAgo,
                    end: new Date(),
                })
        );

        // Get top 3 rejection reasons
        const reasonCounts: Record<string, number> = {};
        rejected.forEach(order => {
            const reason = order.rejection_reason || "Unknown";
            reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        });

        const topReasons = Object.entries(reasonCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([reason, count]) => ({ reason, count }));

        return {
            total: rejected.length,
            topReasons,
        };
    }, [orders]);

    // Calculate pending orders count
    const pendingCount = useMemo(() => {
        return orders.filter(o => o.status === "new" || o.status === "contacted").length;
    }, [orders]);

    return (
        <div className="space-y-6">
            {/* Failed Deliveries Alert Card - Full Width */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="relative overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 via-red-50 to-rose-100 dark:from-rose-950/20 dark:via-red-950/20 dark:to-rose-900/20 dark:border-rose-900/30"
            >
                {/* Glassmorphic overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-white/5 backdrop-blur-sm" />

                <div className="relative p-6 md:p-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        {/* Left: Alert Info */}
                        <div className="flex items-start gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 shadow-lg shadow-rose-500/30 shrink-0">
                                <AlertTriangle className="h-7 w-7 text-white" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-lg font-semibold text-rose-900 dark:text-rose-100">
                                        Failed Deliveries Alert
                                    </h3>
                                    {failedDeliveries.total > 10 && (
                                        <span className="animate-pulse flex h-3 w-3">
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600" />
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-rose-700 dark:text-rose-200 mb-4">
                                    {failedDeliveries.total} rejected orders in the last 7 days require attention
                                </p>

                                {/* Top Rejection Reasons */}
                                {failedDeliveries.topReasons.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-rose-600 dark:text-rose-300 uppercase tracking-wider">
                                            Top Reasons
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {failedDeliveries.topReasons.map(({ reason, count }) => (
                                                <div
                                                    key={reason}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/60 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 backdrop-blur-sm"
                                                >
                                                    <AlertCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                                                    <span className="text-sm font-medium text-rose-800 dark:text-rose-200">
                                                        {reason}
                                                    </span>
                                                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                                                        ({count})
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: View All Button */}
                        <div className="flex items-center justify-end md:justify-start">
                            <button
                                onClick={() => router.push("/orders?status=rejected")}
                                className="group flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-white font-medium shadow-lg shadow-rose-500/30 hover:shadow-xl hover:shadow-rose-500/40 transition-all duration-200 hover:scale-[1.02]"
                                role="button"
                                aria-label="View all rejected orders"
                            >
                                View All
                                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>

                    {/* Hero Number */}
                    <div className="mt-6 flex items-baseline gap-2">
                        <div className="text-5xl md:text-6xl font-bold bg-gradient-to-br from-rose-600 to-red-700 bg-clip-text text-transparent">
                            {failedDeliveries.total}
                        </div>
                        <div className="text-sm text-rose-600 dark:text-rose-400 font-medium">
                            rejected
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Two Column Grid: Profit Pulse + Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Profit Pulse Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                    className="relative overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-lg"
                >
                    {/* Glassmorphic gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-blue-500/5 dark:from-emerald-500/10 dark:to-blue-500/10" />

                    <div className="relative p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div
                                className={cn(
                                    "flex h-12 w-12 items-center justify-center rounded-xl shadow-lg shrink-0",
                                    profitPulse.change.trend === "up"
                                        ? "bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/30"
                                        : profitPulse.change.trend === "down"
                                        ? "bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/30"
                                        : "bg-gradient-to-br from-slate-500 to-gray-600 shadow-slate-500/30"
                                )}
                            >
                                <DollarSign className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">
                                    Profit Pulse
                                </h3>
                                <p className="text-xs text-muted">
                                    Real-time net profit (today vs yesterday)
                                </p>
                            </div>
                        </div>

                        {/* Today's Net Profit */}
                        <div className="mb-4">
                            <div className="text-xs font-medium text-muted uppercase tracking-wider mb-1">
                                Today's Net Profit
                            </div>
                            <div className="flex items-baseline gap-3">
                                <div
                                    className={cn(
                                        "text-4xl md:text-5xl font-bold",
                                        profitPulse.today.netProfit >= 0
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : "text-rose-600 dark:text-rose-400"
                                    )}
                                >
                                    {new Intl.NumberFormat("en-IQ").format(
                                        Math.abs(profitPulse.today.netProfit)
                                    )}
                                </div>
                                <div className="text-sm text-muted">IQD</div>
                            </div>
                        </div>

                        {/* Change vs Yesterday */}
                        <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                            <div className="flex items-center gap-2">
                                {profitPulse.change.trend === "up" ? (
                                    <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                ) : profitPulse.change.trend === "down" ? (
                                    <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                                ) : (
                                    <div className="h-5 w-5" />
                                )}
                                <div>
                                    <div className="text-xs text-muted">vs Yesterday</div>
                                    <div
                                        className={cn(
                                            "text-lg font-bold",
                                            profitPulse.change.trend === "up"
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : profitPulse.change.trend === "down"
                                                ? "text-rose-600 dark:text-rose-400"
                                                : "text-muted"
                                        )}
                                    >
                                        {profitPulse.change.trend === "up" ? "+" : ""}
                                        {profitPulse.change.percentage.toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 text-right">
                                <div className="text-xs text-muted">Yesterday</div>
                                <div className="text-sm font-semibold text-foreground">
                                    {new Intl.NumberFormat("en-IQ").format(
                                        Math.abs(profitPulse.yesterday.netProfit)
                                    )}{" "}
                                    IQD
                                </div>
                            </div>
                        </div>

                        {/* Breakdown */}
                        <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <div className="text-xs text-muted">Orders</div>
                                    <div className="font-semibold text-foreground">
                                        {profitPulse.today.orderCount}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted">Revenue</div>
                                    <div className="font-semibold text-foreground">
                                        {new Intl.NumberFormat("en-IQ", {
                                            notation: "compact",
                                        }).format(profitPulse.today.revenue)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Quick Actions Panel */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="relative overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-lg"
                >
                    {/* Glassmorphic gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-violet-500/5 dark:from-blue-500/10 dark:to-violet-500/10" />

                    <div className="relative p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 shrink-0">
                                <ClipboardList className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">
                                    Quick Actions
                                </h3>
                                <p className="text-xs text-muted">
                                    Navigate to key areas that need attention
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {/* Review Pending Orders */}
                            <button
                                onClick={() => router.push("/orders?status=new,contacted")}
                                className="group w-full flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200 dark:border-amber-900/30 hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
                                role="button"
                                aria-label="Review pending orders"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
                                        <Package className="h-5 w-5 text-white" />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-semibold text-foreground">
                                            Review Pending Orders
                                        </div>
                                        <div className="text-xs text-muted">
                                            {pendingCount} orders waiting
                                        </div>
                                    </div>
                                </div>
                                <ArrowRight className="h-5 w-5 text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform" />
                            </button>

                            {/* Check Failed Deliveries */}
                            <button
                                onClick={() => router.push("/orders?status=rejected")}
                                className="group w-full flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-rose-50 to-red-50 dark:from-rose-950/20 dark:to-red-950/20 border border-rose-200 dark:border-rose-900/30 hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
                                role="button"
                                aria-label="Check failed deliveries"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600">
                                        <AlertTriangle className="h-5 w-5 text-white" />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-semibold text-foreground">
                                            Check Failed Deliveries
                                        </div>
                                        <div className="text-xs text-muted">
                                            {failedDeliveries.total} rejected orders
                                        </div>
                                    </div>
                                </div>
                                <ArrowRight className="h-5 w-5 text-rose-600 dark:text-rose-400 group-hover:translate-x-1 transition-transform" />
                            </button>

                            {/* Update Product Costs */}
                            <button
                                onClick={() => router.push("/products")}
                                className="group w-full flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-900/30 hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
                                role="button"
                                aria-label="Update product costs"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
                                        <CheckCircle2 className="h-5 w-5 text-white" />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-semibold text-foreground">
                                            Update Product Costs
                                        </div>
                                        <div className="text-xs text-muted">
                                            Ensure accurate profit tracking
                                        </div>
                                    </div>
                                </div>
                                <ArrowRight className="h-5 w-5 text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
