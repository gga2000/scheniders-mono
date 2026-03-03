"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronDown,
    ChevronUp,
    Package,
    Truck,
    Box,
    Droplet,
    Candy,
    FlaskConical,
    TrendingUp,
    TrendingDown,
} from "lucide-react";
import { OrderCostBreakdown } from "@/types/expense";
import { formatIQD } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ProfitBreakdownTableProps {
    breakdowns: OrderCostBreakdown[];
    maxRows?: number;
}

export function ProfitBreakdownTable({ breakdowns, maxRows = 10 }: ProfitBreakdownTableProps) {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [showAll, setShowAll] = useState(false);

    const displayedRows = showAll ? breakdowns : breakdowns.slice(0, maxRows);

    const toggleRow = (orderId: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(orderId)) {
                next.delete(orderId);
            } else {
                next.add(orderId);
            }
            return next;
        });
    };

    if (breakdowns.length === 0) {
        return (
            <div className="text-center py-12 text-muted">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No delivered orders in this period</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-muted uppercase tracking-wider">
                <div className="col-span-1">#</div>
                <div className="col-span-3">Customer</div>
                <div className="col-span-2 text-right">Revenue</div>
                <div className="col-span-2 text-right">Total Cost</div>
                <div className="col-span-2 text-right">Profit</div>
                <div className="col-span-2 text-right">Margin</div>
            </div>

            {/* Rows */}
            {displayedRows.map((order, index) => {
                const isExpanded = expandedRows.has(order.orderId);
                const isProfitable = order.grossProfit >= 0;

                return (
                    <div key={order.orderId} className="bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] overflow-hidden">
                        {/* Main Row */}
                        <button
                            onClick={() => toggleRow(order.orderId)}
                            className="w-full grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-[var(--background)] transition-colors"
                        >
                            <div className="col-span-1 flex items-center gap-2">
                                <motion.div
                                    animate={{ rotate: isExpanded ? 180 : 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <ChevronDown className="w-4 h-4 text-muted" />
                                </motion.div>
                                <span className="text-xs text-muted">
                                    #{order.orderNumber || index + 1}
                                </span>
                            </div>
                            <div className="col-span-3 text-left">
                                <p className="font-medium text-foreground truncate">
                                    {order.customerName}
                                </p>
                                <p className="text-xs text-muted">
                                    {new Date(order.orderDate).toLocaleDateString("ar-IQ")}
                                </p>
                            </div>
                            <div className="col-span-2 text-right font-semibold text-foreground">
                                {formatIQD(order.revenue)}
                            </div>
                            <div className="col-span-2 text-right text-rose-600 font-medium">
                                {formatIQD(order.totalCost)}
                            </div>
                            <div className={cn(
                                "col-span-2 text-right font-bold flex items-center justify-end gap-1",
                                isProfitable ? "text-green-600" : "text-rose-600"
                            )}>
                                {isProfitable ? (
                                    <TrendingUp className="w-3 h-3" />
                                ) : (
                                    <TrendingDown className="w-3 h-3" />
                                )}
                                {formatIQD(order.grossProfit)}
                            </div>
                            <div className={cn(
                                "col-span-2 text-right font-semibold",
                                isProfitable ? "text-green-600" : "text-rose-600"
                            )}>
                                {order.profitMargin.toFixed(1)}%
                            </div>
                        </button>

                        {/* Expanded Details */}
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-4 pb-4 pt-2 bg-[var(--background)] border-t border-[var(--card-border)]">
                                        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                                            Cost Breakdown
                                        </p>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                            <CostItem
                                                icon={Package}
                                                label="Product Cost"
                                                value={order.productCost}
                                                color="amber"
                                            />
                                            <CostItem
                                                icon={Truck}
                                                label="Delivery"
                                                value={order.deliveryCost}
                                                color="indigo"
                                            />
                                            <CostItem
                                                icon={Box}
                                                label="Packaging"
                                                value={order.packagingCost}
                                                color="violet"
                                                subtitle={`${order.itemCount} bags`}
                                            />
                                            <CostItem
                                                icon={FlaskConical}
                                                label="Vials"
                                                value={order.vialCost}
                                                color="cyan"
                                                subtitle={`${order.uniqueProductCount} vials`}
                                            />
                                            <CostItem
                                                icon={Droplet}
                                                label="Sample Perfume"
                                                value={order.samplePerfumeCost}
                                                color="pink"
                                                subtitle={`${order.uniqueProductCount}ml`}
                                            />
                                            <CostItem
                                                icon={Candy}
                                                label="Sweets"
                                                value={order.sweetsCost}
                                                color="orange"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}

            {/* Show More Button */}
            {breakdowns.length > maxRows && (
                <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full py-3 text-sm font-medium text-muted hover:text-foreground transition-colors flex items-center justify-center gap-2"
                >
                    {showAll ? (
                        <>
                            <ChevronUp className="w-4 h-4" />
                            Show Less
                        </>
                    ) : (
                        <>
                            <ChevronDown className="w-4 h-4" />
                            Show All ({breakdowns.length} orders)
                        </>
                    )}
                </button>
            )}
        </div>
    );
}

interface CostItemProps {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    color: 'amber' | 'indigo' | 'violet' | 'cyan' | 'pink' | 'orange';
    subtitle?: string;
}

function CostItem({ icon: Icon, label, value, color, subtitle }: CostItemProps) {
    const colorClasses = {
        amber: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
        indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400",
        violet: "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400",
        cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400",
        pink: "bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400",
        orange: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
    };

    return (
        <div className={cn("p-3 rounded-xl", colorClasses[color])}>
            <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="text-lg font-bold">{formatIQD(value)}</p>
            {subtitle && <p className="text-xs opacity-75">{subtitle}</p>}
        </div>
    );
}
