"use client";

import { useLanguage } from "@/hooks/use-language";
import { TrendingUp, DollarSign, ShoppingCart, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

interface ProductPerformanceCardProps {
    /**
     * Sales figures. Undefined means not known (not zero): they
     * are shown as "--", never as 0 sold.
     */
    timesSold?: number;
    totalRevenue?: number;
    profitMargin?: number | null;
    averageOrderValue?: number;
}


function formatIQD(value: number): string {
    return new Intl.NumberFormat("en-IQ").format(Math.round(value)) + " IQD";
}

const stats = [
    {
        key: "totalSales",
        label: "products.ed.perf.totalSales",
        icon: ShoppingCart,
        color: "var(--pastel-blue)",
    },
    {
        key: "revenue",
        label: "products.ed.perf.revenue",
        icon: DollarSign,
        color: "var(--pastel-green)",
    },
    {
        key: "profitMargin",
        label: "products.ed.perf.profitMargin",
        icon: TrendingUp,
        color: "var(--pastel-yellow)",
    },
    {
        key: "avgOrderValue",
        label: "products.ed.perf.avgOrderValue",
        icon: BarChart3,
        color: "var(--pastel-pink)",
    },
] as const;

export function ProductPerformanceCard({
    timesSold,
    totalRevenue,
    profitMargin,
    averageOrderValue,
}: ProductPerformanceCardProps) {
    const { t } = useLanguage();

    function getValue(key: (typeof stats)[number]["key"]): string {
        switch (key) {
            case "totalSales":
                return timesSold != null ? new Intl.NumberFormat("en-IQ").format(timesSold) : "--";
            case "revenue":
                return totalRevenue != null ? formatIQD(totalRevenue) : "--";
            case "profitMargin":
                return profitMargin != null ? `${profitMargin.toFixed(1)}%` : "--";
            case "avgOrderValue":
                return averageOrderValue != null ? formatIQD(averageOrderValue) : "--";
        }
    }

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-4">
            {/* Header: lifetime figures */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                    {t("products.ed.perf.title")}
                </h3>
                <span className="text-xs text-muted">{t("products.ed.perf.allTime")}</span>
            </div>

            {/* 2x2 stat grid */}
            <div className="grid grid-cols-2 gap-3">
                {stats.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <motion.div
                            key={stat.key}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05, duration: 0.3 }}
                            className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--background)]"
                        >
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: stat.color }}
                            >
                                <Icon className="w-4 h-4 text-foreground" />
                            </div>
                            <span className="text-xs text-muted">{t(stat.label)}</span>
                            <span className="text-sm font-bold text-foreground leading-tight">
                                {getValue(stat.key)}
                            </span>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
