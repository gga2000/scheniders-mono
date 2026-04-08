"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ListChecks,
    Package,
    ArrowRight,
    DollarSign,
    TrendingUp,
} from "lucide-react";
import { FunnelSummary } from "@/types/expense";
import { cn } from "@/lib/utils";

// Shared components
import { StatusBox } from "./shared/StatusBox";
import { FinancialMetricRow } from "./shared/FinancialMetricRow";
import { ExpandToggle } from "./shared/ExpandToggle";
import { CostBreakdownItem } from "./shared/CostBreakdownItem";
import { PrimaryResultCard } from "./shared/PrimaryResultCard";

interface OrderFunnelCardProps {
    funnel: FunnelSummary;
}

export function OrderFunnelCard({ funnel }: OrderFunnelCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);

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

    const isGoodConfirmationRate = confirmationRate >= 70;
    const isGoodDeliveryRate = deliveryRate >= 50;

    return (
        <div className="h-full p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/30">
                        <ListChecks className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Order Funnel</h3>
                        <p className="text-xs text-muted">Complete order lifecycle</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--background)] border border-[var(--card-border)] text-muted text-sm font-medium">
                    <Package className="w-4 h-4" />
                    <span className="tabular-nums">{totalOrders} orders</span>
                </div>
            </div>

            {/* Status Grid - 4 columns */}
            <div className="grid grid-cols-4 gap-2 mb-5">
                <StatusBox
                    label="Pending"
                    count={pendingCount}
                    total={totalOrders}
                    colorTheme="slate"
                    delay={0}
                />
                <StatusBox
                    label="Confirmed"
                    count={confirmedCount}
                    total={totalOrders}
                    colorTheme="amber"
                    delay={0.05}
                />
                <StatusBox
                    label="In Transit"
                    count={inTransitCount}
                    total={totalOrders}
                    colorTheme="blue"
                    delay={0.1}
                />
                <StatusBox
                    label="Delivered"
                    count={deliveredCount}
                    total={totalOrders}
                    colorTheme="emerald"
                    delay={0.15}
                />
            </div>

            {/* Financial Flow (Always Visible) */}
            <div className="space-y-2 mb-4">
                <FinancialMetricRow
                    icon={DollarSign}
                    label="Total Revenue"
                    amount={totalRevenue}
                    colorTheme="blue"
                    subtitle="All positive orders"
                    delay={0.2}
                />
                <FinancialMetricRow
                    icon={DollarSign}
                    label="Delivered Revenue"
                    amount={deliveredRevenue}
                    colorTheme="green"
                    subtitle="Completed + delivered only"
                    delay={0.25}
                />
            </div>

            {/* Conversion Rates (Always Visible) */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.3, ease: "easeOut" }}
                    className={cn(
                        "flex items-center justify-between p-3 rounded-xl backdrop-blur-sm border",
                        isGoodConfirmationRate
                            ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30"
                            : "bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-800/30"
                    )}
                >
                    <div className="flex items-center gap-2">
                        <TrendingUp
                            className={cn(
                                "w-4 h-4",
                                isGoodConfirmationRate ? "text-emerald-500" : "text-rose-500"
                            )}
                        />
                        <span className="text-sm font-medium text-foreground">Confirmation</span>
                    </div>
                    <span
                        className={cn(
                            "font-semibold tabular-nums",
                            isGoodConfirmationRate
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                        )}
                    >
                        {confirmationRate.toFixed(1)}%
                    </span>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.35, duration: 0.3, ease: "easeOut" }}
                    className={cn(
                        "flex items-center justify-between p-3 rounded-xl backdrop-blur-sm border",
                        isGoodDeliveryRate
                            ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30"
                            : "bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-800/30"
                    )}
                >
                    <div className="flex items-center gap-2">
                        <TrendingUp
                            className={cn(
                                "w-4 h-4",
                                isGoodDeliveryRate ? "text-emerald-500" : "text-rose-500"
                            )}
                        />
                        <span className="text-sm font-medium text-foreground">Delivery</span>
                    </div>
                    <span
                        className={cn(
                            "font-semibold tabular-nums",
                            isGoodDeliveryRate
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                        )}
                    >
                        {deliveryRate.toFixed(1)}%
                    </span>
                </motion.div>
            </div>

            {/* Expand Toggle */}
            <ExpandToggle
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
                label="Revenue by Stage"
            />

            {/* Collapsible Details */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-1.5 pt-3 pb-2">
                            <CostBreakdownItem
                                label="Pending Revenue"
                                amount={totalRevenue - deliveredRevenue}
                                percentage={((totalRevenue - deliveredRevenue) / totalRevenue) * 100}
                                color="#94A3B8"
                            />
                            <CostBreakdownItem
                                label="Delivered Revenue"
                                amount={deliveredRevenue}
                                percentage={(deliveredRevenue / totalRevenue) * 100}
                                color="#10B981"
                            />
                            <CostBreakdownItem
                                label="Conversion Gap"
                                amount={totalRevenue - deliveredRevenue}
                                percentage={100 - deliveryRate}
                                color="#F43F5E"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Divider */}
            <div className="flex items-center justify-center py-3">
                <ArrowRight className="w-4 h-4 text-muted rotate-90" />
            </div>

            {/* Primary Result */}
            <PrimaryResultCard
                title="Delivery Rate"
                amount={deliveryRate}
                isPositive={isGoodDeliveryRate}
                description={`${deliveredCount} of ${totalOrders} orders delivered`}
            />
        </div>
    );
}
