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
        },
        {
            title: t("reports.kpi.delivery"),
            unit: "pp",
            value: `${metrics.deliveryRate.toFixed(1)}%`,
            change: metrics.deliveryRateChange,
            icon: CheckCircle2,
        },
        {
            title: t("reports.kpi.contact"),
            unit: "pp",
            value: `${metrics.contactSuccessRate.toFixed(1)}%`,
            change: metrics.contactSuccessChange,
            icon: Phone,
        },
        {
            title: t("reports.kpi.rejection"),
            unit: "pp",
            value: `${metrics.rejectionRate.toFixed(1)}%`,
            change: metrics.rejectionRateChange,
            icon: XCircle,
            invertTrend: true,
        },
        {
            title: t("reports.kpi.noResponse"),
            unit: "pp",
            value: `${metrics.noResponseRate.toFixed(1)}%`,
            change: metrics.noResponseChange,
            icon: PhoneOff,
            invertTrend: true,
        },
        {
            title: t("reports.kpi.processing"),
            value: `${metrics.avgProcessingTime.toFixed(0)}h`,
            change: metrics.avgProcessingTimeChange,
            icon: Clock,
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
                        className="pastel-card p-4"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                                <Icon className="w-5 h-5" aria-hidden />
                            </div>
                            {showTrend && (
                                <span
                                    className={cn(
                                        "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full",
                                        // Colour says good/bad, the arrow says up/down: a falling rejection
                                        // rate is a falling arrow in the good colour.
                                        isGood ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                    )}
                                >
                                    {kpi.change > 0 ? <TrendingUp className="w-3 h-3" aria-hidden /> : <TrendingDown className="w-3 h-3" aria-hidden />}
                                    {Math.abs(kpi.change).toFixed(1)}{kpi.unit === "pp" ? ` ${t("reports.kpi.pp")}` : "%"}
                                </span>
                            )}
                        </div>

                        <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground tabular-nums">{kpi.value}</h3>
                        <p className="text-sm font-medium mt-1 text-muted">{kpi.title}</p>
                    </motion.div>
                );
            })}
        </motion.div>
    );
}
