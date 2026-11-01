"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import { PeriodComparisonMetrics } from "@/lib/analytics/source-metrics";
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp, TrendingDown, Package, CheckCircle2, XCircle, Banknote, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { DateRange } from "@/hooks/use-reports-metrics";

interface PeriodComparisonProps {
    data: PeriodComparisonMetrics;
    currentRange: DateRange;
}

const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
};

export function PeriodComparison({ data, currentRange }: PeriodComparisonProps) {
    const { t } = useLanguage();
    const duration = currentRange.to.getTime() - currentRange.from.getTime();
    const days = Math.ceil(duration / (1000 * 60 * 60 * 24));

    const previousRange = {
        from: new Date(currentRange.from.getTime() - duration),
        to: new Date(currentRange.from.getTime() - 1),
    };

    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const metrics = [
        {
            label: t("reports.kpi.total"),
            icon: Package,
            current: data.current.totalOrders,
            previous: data.previous.totalOrders,
            change: data.changes.orders,
            format: (v: number) => v.toString(),
            goodWhenPositive: true,
            gradient: "from-blue-500 to-blue-600",
            bgGradient: "from-blue-50 to-blue-100",
        },
        {
            label: t("reports.common.delivered"),
            icon: CheckCircle2,
            current: data.current.deliveredOrders,
            previous: data.previous.deliveredOrders,
            change: ((data.current.deliveredOrders - data.previous.deliveredOrders) / Math.max(data.previous.deliveredOrders, 1)) * 100,
            format: (v: number) => v.toString(),
            goodWhenPositive: true,
            gradient: "from-emerald-500 to-emerald-600",
            bgGradient: "from-emerald-50 to-emerald-100",
        },
        {
            label: t("reports.common.rejected"),
            icon: XCircle,
            current: data.current.rejectedOrders,
            previous: data.previous.rejectedOrders,
            change: ((data.current.rejectedOrders - data.previous.rejectedOrders) / Math.max(data.previous.rejectedOrders, 1)) * 100,
            format: (v: number) => v.toString(),
            goodWhenPositive: false,
            gradient: "from-rose-500 to-rose-600",
            bgGradient: "from-rose-50 to-rose-100",
        },
        {
            label: t("reports.kpi.delivery"),
            icon: TrendingUp,
            current: data.current.deliveryRate,
            previous: data.previous.deliveryRate,
            change: data.changes.deliveryRate,
            format: (v: number) => `${v.toFixed(1)}%`,
            goodWhenPositive: true,
            gradient: "from-violet-500 to-violet-600",
            bgGradient: "from-violet-50 to-violet-100",
        },
        {
            label: t("reports.period.revenue"),
            icon: Banknote,
            current: data.current.totalRevenue,
            previous: data.previous.totalRevenue,
            change: data.changes.revenue,
            format: (v: number) => formatNumber(v),
            goodWhenPositive: true,
            gradient: "from-amber-500 to-amber-600",
            bgGradient: "from-amber-50 to-amber-100",
        },
        {
            label: t("reports.kpi.processing"),
            icon: Clock,
            current: data.current.avgProcessingTime,
            previous: data.previous.avgProcessingTime,
            change: data.changes.avgProcessingTime,
            format: (v: number) => `${v.toFixed(0)}h`,
            goodWhenPositive: false, // Lower is better
            gradient: "from-cyan-500 to-cyan-600",
            bgGradient: "from-cyan-50 to-cyan-100",
        },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 overflow-hidden relative"
        >
            {/* Background decoration */}
            <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">{t("reports.period.title")}</h3>
                            <p className="text-sm text-muted">{t("reports.period.subtitle", { n: days })}</p>
                        </div>
                    </div>
                </div>

                {/* Period Labels */}
                <div className="flex items-center justify-between mb-6 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-indigo-500" />
                        <span className="font-medium text-foreground">{t("reports.period.current")}</span>
                        <span className="text-muted">({formatDate(currentRange.from)} - {formatDate(currentRange.to)})</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-300" />
                        <span className="font-medium text-foreground">{t("reports.period.previous")}</span>
                        <span className="text-muted">({formatDate(previousRange.from)} - {formatDate(previousRange.to)})</span>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {metrics.map((metric, index) => {
                        const isPositiveChange = metric.change > 0;
                        const isGood = metric.goodWhenPositive ? isPositiveChange : !isPositiveChange;
                        const changeColor = isGood ? "text-emerald-600" : "text-rose-600";
                        const changeBg = isGood ? "bg-emerald-50" : "bg-rose-50";

                        return (
                            <motion.div
                                key={metric.label}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className={cn(
                                    "p-4 rounded-2xl border border-gray-200",
                                    `bg-gradient-to-br ${metric.bgGradient}`
                                )}
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center text-white",
                                        `bg-gradient-to-br ${metric.gradient}`
                                    )}>
                                        <metric.icon className="w-4 h-4" />
                                    </div>
                                    <span className="text-xs font-medium text-gray-600">{metric.label}</span>
                                </div>

                                {/* Current vs Previous */}
                                <div className="space-y-2">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-2xl font-bold text-foreground">
                                            {metric.format(metric.current)}
                                        </span>
                                        <div className={cn(
                                            "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold",
                                            changeBg, changeColor
                                        )}>
                                            {isPositiveChange ? (
                                                <ArrowUpRight className="w-3 h-3" />
                                            ) : metric.change < 0 ? (
                                                <ArrowDownRight className="w-3 h-3" />
                                            ) : (
                                                <Minus className="w-3 h-3" />
                                            )}
                                            {Math.abs(metric.change).toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-muted">
                                        <span>{t("reports.period.vs")}</span>
                                        <span className="font-medium">{metric.format(metric.previous)}</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Summary Banner */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className={cn(
                        "mt-6 p-4 rounded-2xl border",
                        data.changes.orders >= 0
                            ? "bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200"
                            : "bg-gradient-to-r from-rose-50 to-red-50 border-rose-200"
                    )}
                >
                    <div className="flex items-center gap-3">
                        {data.changes.orders >= 0 ? (
                            <TrendingUp className="w-5 h-5 text-emerald-600" />
                        ) : (
                            <TrendingDown className="w-5 h-5 text-rose-600" />
                        )}
                        <div>
                            <p className={cn(
                                "font-semibold",
                                data.changes.orders >= 0 ? "text-emerald-900" : "text-rose-900"
                            )}>
                                {data.changes.orders >= 0 ? t("reports.period.increased") : t("reports.period.decreased")}
                            </p>
                            <p className={cn(
                                "text-sm",
                                data.changes.orders >= 0 ? "text-emerald-700" : "text-rose-700"
                            )}>
                                {t(data.changes.orders >= 0 ? "reports.period.moreDesc" : "reports.period.fewerDesc", { pct: Math.abs(data.changes.orders).toFixed(1), n: days })}
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
