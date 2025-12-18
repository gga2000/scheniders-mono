"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { PeriodComparison } from "@/hooks/use-finances";

interface PeriodComparisonCardProps {
    comparison: PeriodComparison;
}

export function PeriodComparisonCard({ comparison }: PeriodComparisonCardProps) {
    const { current, previous, revenueChange, revenueChangePercent, orderChange, orderChangePercent } = comparison;

    const isRevenueUp = revenueChange >= 0;
    const isOrdersUp = orderChange >= 0;

    return (
        <div className="p-5 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
                Period Comparison
            </h3>

            <div className="space-y-4">
                {/* Revenue Comparison */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs text-muted mb-1">Revenue</p>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-foreground">
                                {formatIQD(current.totalRevenue)}
                            </span>
                            <ArrowRight className="w-4 h-4 text-muted" />
                            <span className="text-sm text-muted">
                                {formatIQD(previous.totalRevenue)}
                            </span>
                        </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${isRevenueUp ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"
                        }`}>
                        {isRevenueUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="text-sm font-medium">
                            {isRevenueUp ? "+" : ""}{revenueChangePercent.toFixed(1)}%
                        </span>
                    </div>
                </div>

                {/* Orders Comparison */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs text-muted mb-1">Orders</p>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-foreground">
                                {current.orderCount}
                            </span>
                            <ArrowRight className="w-4 h-4 text-muted" />
                            <span className="text-sm text-muted">
                                {previous.orderCount}
                            </span>
                        </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${isOrdersUp ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"
                        }`}>
                        {isOrdersUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="text-sm font-medium">
                            {isOrdersUp ? "+" : ""}{orderChangePercent.toFixed(1)}%
                        </span>
                    </div>
                </div>

                {/* AOV Comparison */}
                <div className="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
                    <div>
                        <p className="text-xs text-muted mb-1">Avg Order Value</p>
                        <span className="text-sm font-medium text-foreground">
                            {formatIQD(current.averageOrderValue)}
                        </span>
                    </div>
                    <span className="text-sm text-muted">
                        vs {formatIQD(previous.averageOrderValue)}
                    </span>
                </div>
            </div>
        </div>
    );
}
