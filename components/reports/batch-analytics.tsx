"use client";

import { motion } from "framer-motion";
import { BatchMetrics, BatchAnalyticsSummary } from "@/hooks/use-batch-analytics";
import {
    Package, Truck, Receipt, TrendingUp, MapPin, Calendar,
    CheckCircle2, XCircle, Clock, Loader2, RefreshCw, ChevronRight,
    Boxes, DollarSign
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

interface BatchAnalyticsProps {
    batches: BatchMetrics[];
    summary: BatchAnalyticsSummary;
    loading?: boolean;
    error?: string | null;
    onRefresh?: () => void;
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
};

const getStatusColor = (status: BatchMetrics['status']) => {
    switch (status) {
        case 'completed': return 'text-emerald-600 bg-emerald-50';
        case 'in_progress': return 'text-amber-600 bg-amber-50';
        case 'pending': return 'text-blue-600 bg-blue-50';
        case 'mixed': return 'text-violet-600 bg-violet-50';
        default: return 'text-gray-600 bg-gray-50';
    }
};

const getStatusLabel = (status: BatchMetrics['status']) => {
    switch (status) {
        case 'completed': return 'Completed';
        case 'in_progress': return 'In Progress';
        case 'pending': return 'Pending';
        case 'mixed': return 'Mixed';
        default: return 'Unknown';
    }
};

export function BatchAnalytics({
    batches,
    summary,
    loading,
    error,
    onRefresh
}: BatchAnalyticsProps) {
    // Loading state
    if (loading) {
        return (
            <div className="pastel-card p-8 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted">Loading batch analytics...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="pastel-card p-8 text-center bg-gradient-to-br from-rose-50 to-red-50">
                <p className="text-rose-700 mb-2">{error}</p>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        className="text-sm text-rose-600 hover:text-rose-800 underline"
                    >
                        Try again
                    </button>
                )}
            </div>
        );
    }

    // Empty state
    if (batches.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pastel-card p-8 text-center"
            >
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <Boxes className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-foreground">No Batches Found</h3>
                <p className="text-sm text-muted mt-1">No shipping batches created in this period</p>
            </motion.div>
        );
    }

    // Recent batches (top 5)
    const recentBatches = batches.slice(0, 5);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 overflow-hidden relative"
        >
            {/* Background decoration */}
            <div className="absolute -top-20 -left-20 w-60 h-60 bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-100 rounded-xl text-violet-600">
                            <Boxes className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">Batch Analytics</h3>
                            <p className="text-sm text-muted">{summary.totalBatches} batches shipped</p>
                        </div>
                    </div>

                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className="w-4 h-4 text-muted" />
                        </button>
                    )}
                </div>

                {/* Summary Cards */}
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
                >
                    {[
                        {
                            icon: Boxes,
                            label: "Total Batches",
                            value: summary.totalBatches.toString(),
                            color: "text-violet-600",
                            bg: "bg-violet-100"
                        },
                        {
                            icon: Package,
                            label: "Total Orders",
                            value: summary.totalOrders.toString(),
                            color: "text-blue-600",
                            bg: "bg-blue-100"
                        },
                        {
                            icon: DollarSign,
                            label: "Total Value",
                            value: `${(summary.totalValue / 1000).toFixed(0)}K`,
                            color: "text-emerald-600",
                            bg: "bg-emerald-100"
                        },
                        {
                            icon: TrendingUp,
                            label: "Avg Delivery",
                            value: `${summary.avgDeliveryRate.toFixed(0)}%`,
                            color: "text-amber-600",
                            bg: "bg-amber-100"
                        },
                    ].map((stat, i) => (
                        <motion.div
                            key={i}
                            variants={item}
                            className="text-center p-4 rounded-xl bg-gray-50 border border-gray-100"
                        >
                            <div className={cn("w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center", stat.bg)}>
                                <stat.icon className={cn("w-5 h-5", stat.color)} />
                            </div>
                            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                            <p className="text-xs text-muted">{stat.label}</p>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Top Cities */}
                {summary.topCities.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-sm font-medium text-muted mb-3 flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Top Cities
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {summary.topCities.map((city, i) => (
                                <span
                                    key={city.city}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-sm font-medium",
                                        i === 0 ? "bg-violet-100 text-violet-700" :
                                            i === 1 ? "bg-blue-100 text-blue-700" :
                                                i === 2 ? "bg-emerald-100 text-emerald-700" :
                                                    "bg-gray-100 text-gray-700"
                                    )}
                                >
                                    {city.city} ({city.count})
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent Batches */}
                <div>
                    <h4 className="text-sm font-medium text-muted mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Recent Batches
                    </h4>
                    <div className="space-y-2">
                        {recentBatches.map((batch, index) => (
                            <motion.div
                                key={batch.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 + index * 0.05 }}
                                className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group"
                            >
                                {/* Batch info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-foreground truncate">
                                            {batch.name}
                                        </span>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                            getStatusColor(batch.status)
                                        )}>
                                            {getStatusLabel(batch.status)}
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted mt-0.5 flex items-center gap-3">
                                        <span>{batch.orderCount} orders</span>
                                        <span>•</span>
                                        <span>{formatIQD(batch.totalValue)}</span>
                                        <span>•</span>
                                        <span>{formatDistanceToNow(batch.createdAt, { addSuffix: true })}</span>
                                    </div>
                                </div>

                                {/* Delivery rate */}
                                <div className="text-right">
                                    <div className={cn(
                                        "text-lg font-bold",
                                        batch.deliveryRate >= 80 ? "text-emerald-600" :
                                            batch.deliveryRate >= 60 ? "text-amber-600" :
                                                batch.deliveryRate > 0 ? "text-rose-600" :
                                                    "text-gray-400"
                                    )}>
                                        {batch.deliveryRate > 0 ? `${batch.deliveryRate.toFixed(0)}%` : '-'}
                                    </div>
                                    <div className="text-[10px] text-muted">Delivered</div>
                                </div>

                                <ChevronRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Summary insight */}
                {summary.totalBatches > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200"
                    >
                        <div className="flex items-center gap-3">
                            <Receipt className="w-5 h-5 text-violet-600" />
                            <div>
                                <p className="font-semibold text-violet-900">Batch Insights</p>
                                <p className="text-sm text-violet-700">
                                    Average of {summary.avgOrdersPerBatch.toFixed(1)} orders per batch,
                                    worth {formatIQD(summary.avgBatchValue)} each
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
}
