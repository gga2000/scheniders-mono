"use client";

import { useState } from "react";
import { TrendingUp, DollarSign, ShoppingCart, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

interface ProductPerformanceCardProps {
    timesSold?: number;
    totalRevenue?: number;
    profitMargin?: number | null;
    averageOrderValue?: number;
}

const periods = ["7d", "30d", "90d", "All"] as const;
type Period = (typeof periods)[number];

function formatIQD(value: number): string {
    return new Intl.NumberFormat("en-IQ").format(Math.round(value)) + " IQD";
}

const stats = [
    {
        key: "totalSales",
        label: "Total Sales",
        icon: ShoppingCart,
        color: "var(--pastel-blue)",
    },
    {
        key: "revenue",
        label: "Revenue",
        icon: DollarSign,
        color: "var(--pastel-green)",
    },
    {
        key: "profitMargin",
        label: "Profit Margin",
        icon: TrendingUp,
        color: "var(--pastel-yellow)",
    },
    {
        key: "avgOrderValue",
        label: "Avg Order Value",
        icon: BarChart3,
        color: "var(--pastel-pink)",
    },
] as const;

export function ProductPerformanceCard({
    timesSold = 0,
    totalRevenue = 0,
    profitMargin,
    averageOrderValue = 0,
}: ProductPerformanceCardProps) {
    const [activePeriod, setActivePeriod] = useState<Period>("30d");

    function getValue(key: (typeof stats)[number]["key"]): string {
        switch (key) {
            case "totalSales":
                return new Intl.NumberFormat("en-IQ").format(timesSold);
            case "revenue":
                return formatIQD(totalRevenue);
            case "profitMargin":
                return profitMargin != null ? `${profitMargin.toFixed(1)}%` : "--";
            case "avgOrderValue":
                return formatIQD(averageOrderValue);
        }
    }

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-4">
            {/* Header with period selector */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                    Performance
                </h3>
                <div className="flex gap-1 bg-[var(--background)] rounded-lg p-0.5">
                    {periods.map((period) => (
                        <button
                            key={period}
                            type="button"
                            onClick={() => setActivePeriod(period)}
                            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                                activePeriod === period
                                    ? "bg-[var(--card-bg)] text-foreground shadow-sm"
                                    : "text-muted hover:text-foreground"
                            }`}
                        >
                            {period}
                        </button>
                    ))}
                </div>
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
                            <span className="text-xs text-muted">{stat.label}</span>
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
