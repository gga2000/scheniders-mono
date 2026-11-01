"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import {
    TrendingUp,
    TrendingDown,
    Package,
    CheckCircle2,
    Phone,
    XCircle,
    PhoneOff,
    Clock
} from "lucide-react";
import { KPIMetrics } from "@/lib/analytics/reports-calculations";
import { cn } from "@/lib/utils";

interface KPICardsProps {
    metrics: KPIMetrics;
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.08 }
    }
};

const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
};

export function KPICards({ metrics }: KPICardsProps) {
    const { t } = useLanguage();
    const kpiData = [
        {
            title: t("reports.kpi.total"),
            value: metrics.totalOrders,
            change: metrics.totalOrdersChange,
            icon: Package,
            gradient: "from-blue-500 to-blue-600",
            shadow: "shadow-blue-500/20",
            labelColor: "text-blue-100",
        },
        {
            title: t("reports.kpi.delivery"),
            unit: "pp",
            value: `${metrics.deliveryRate.toFixed(1)}%`,
            change: metrics.deliveryRateChange,
            icon: CheckCircle2,
            gradient: "from-emerald-500 to-green-600",
            shadow: "shadow-emerald-500/20",
            labelColor: "text-emerald-100",
        },
        {
            title: t("reports.kpi.contact"),
            unit: "pp",
            value: `${metrics.contactSuccessRate.toFixed(1)}%`,
            change: metrics.contactSuccessChange,
            icon: Phone,
            gradient: "from-violet-500 to-purple-600",
            shadow: "shadow-violet-500/20",
            labelColor: "text-violet-100",
        },
        {
            title: t("reports.kpi.rejection"),
            unit: "pp",
            value: `${metrics.rejectionRate.toFixed(1)}%`,
            change: metrics.rejectionRateChange,
            icon: XCircle,
            gradient: "from-rose-500 to-red-600",
            shadow: "shadow-rose-500/20",
            labelColor: "text-rose-100",
            invertTrend: true,
        },
        {
            title: t("reports.kpi.noResponse"),
            unit: "pp",
            value: `${metrics.noResponseRate.toFixed(1)}%`,
            change: metrics.noResponseChange,
            icon: PhoneOff,
            gradient: "from-amber-400 to-orange-500",
            shadow: "shadow-amber-500/20",
            labelColor: "text-amber-100",
            invertTrend: true,
        },
        {
            title: t("reports.kpi.processing"),
            value: `${metrics.avgProcessingTime.toFixed(0)}h`,
            change: metrics.avgProcessingTimeChange,
            icon: Clock,
            gradient: "from-cyan-500 to-teal-600",
            shadow: "shadow-cyan-500/20",
            labelColor: "text-cyan-100",
            invertTrend: true,
        },
    ];

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
        >
            {kpiData.map((kpi) => {
                const Icon = kpi.icon;
                const isGood = kpi.invertTrend ? kpi.change < 0 : kpi.change > 0;
                const showTrend = Math.abs(kpi.change) >= 0.1;

                return (
                    <motion.div
                        key={kpi.title}
                        variants={item}
                        className={cn(
                            "p-4 rounded-2xl bg-gradient-to-br text-white shadow-lg",
                            kpi.gradient,
                            kpi.shadow,
                            "group"
                        )}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                                <Icon className="w-5 h-5" />
                            </div>
                            {showTrend && (
                                <span className={cn(
                                    "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                                    isGood
                                        ? "bg-white/20 text-white"
                                        : "bg-black/20 text-white"
                                )}>
                                    {kpi.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {Math.abs(kpi.change).toFixed(1)}{kpi.unit === "pp" ? ` ${t("reports.kpi.pp")}` : "%"}
                                </span>
                            )}
                        </div>

                        <h3 className="text-2xl md:text-3xl font-bold tracking-tight">{kpi.value}</h3>
                        <p className={cn("text-sm font-medium mt-1 opacity-90", kpi.labelColor)}>{kpi.title}</p>
                    </motion.div>
                );
            })}
        </motion.div>
    );
}
