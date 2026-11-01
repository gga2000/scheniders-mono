"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import { CityPerformanceMetrics } from "@/lib/analytics/reports-calculations";
import { MapPin, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Medal } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CityPerformanceProps {
    data: CityPerformanceMetrics[];
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.03 }
    }
};

const item = {
    hidden: { x: -20, opacity: 0 },
    show: { x: 0, opacity: 1 }
};

export function CityPerformance({ data }: CityPerformanceProps) {
    const { t } = useLanguage();
    const [sortKey, setSortKey] = useState<keyof CityPerformanceMetrics>('totalOrders');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [showAll, setShowAll] = useState(false);

    const handleSort = (key: keyof CityPerformanceMetrics) => {
        if (sortKey === key) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const sortedData = [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return 0;
    });

    const displayData = showAll ? sortedData : sortedData.slice(0, 8);

    // Top 3 cities for medals
    // The podium is always the busiest cities, whatever column the table is sorted by.
    const topCities = [...data].sort((a, b) => b.totalOrders - a.totalOrders).slice(0, 3);

    // Calm rank accents: a tinted surface with readable text instead of loud gradients
    // (white text on silver failed contrast).
    const getMedalStyle = (index: number) => {
        if (index === 0) return { card: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30", icon: "text-amber-500" };
        if (index === 1) return { card: "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10", icon: "text-slate-400" };
        return { card: "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/30", icon: "text-orange-500" };
    };

    const getDeliveryRateColor = (rate: number) => {
        if (rate >= 85) return { bg: "bg-emerald-100 dark:bg-emerald-500/20", text: "text-emerald-700 dark:text-emerald-300" };
        if (rate >= 70) return { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-300" };
        return { bg: "bg-rose-100 dark:bg-rose-500/20", text: "text-rose-700 dark:text-rose-300" };
    };

    const SortHeader = ({ label, sortKey: key }: { label: string; sortKey: keyof CityPerformanceMetrics }) => (
        <th
            className="pb-3 font-semibold cursor-pointer hover:text-foreground transition-colors text-left"
            onClick={() => handleSort(key)}
        >
            <span className="flex items-center gap-1">
                {label}
                {sortKey === key && (
                    sortDir === 'desc'
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronUp className="w-3 h-3" />
                )}
            </span>
        </th>
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 overflow-hidden relative"
        >
            {/* Background decoration */}
            <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-gradient-to-br from-cyan-500/10 to-teal-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-100 dark:bg-cyan-500/20 rounded-xl text-cyan-600 dark:text-cyan-300">
                            <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">{t("reports.city.title")}</h3>
                            <p className="text-sm text-muted">{t("reports.city.subtitle")}</p>
                        </div>
                    </div>
                </div>

                {/* Top 3 Cities Podium */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    {topCities.map((city, index) => (
                        <motion.div
                            key={city.city}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className={cn("p-4 rounded-2xl border relative overflow-hidden", getMedalStyle(index).card)}
                        >
                            <div className={cn("absolute top-2 right-2 opacity-40", getMedalStyle(index).icon)}>
                                <Medal className="w-10 h-10" aria-hidden />
                            </div>
                            <div className="relative z-10">
                                <span className="text-xs font-bold text-muted">#{index + 1}</span>
                                <h4 className="text-lg font-bold mt-1 text-foreground">{city.city}</h4>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-2xl font-bold text-foreground tabular-nums">{city.totalOrders}</span>
                                    <span className="text-xs text-muted">{t("reports.common.orders")}</span>
                                </div>
                                <div className="text-xs mt-1 text-muted">
                                    {t("reports.city.deliveredPct", { pct: city.deliveryRate.toFixed(0) })}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full">
                        <thead className="bg-gray-50/50 dark:bg-white/5">
                            <tr className="text-xs text-muted">
                                <th className="py-3 px-4 text-left font-semibold">{t("reports.city.col.city")}</th>
                                <SortHeader label={t("reports.common.ordersCap")} sortKey="totalOrders" />
                                <SortHeader label={t("reports.common.delivered")} sortKey="delivered" />
                                <SortHeader label={t("reports.common.rejected")} sortKey="rejected" />
                                <SortHeader label={t("reports.city.col.rate")} sortKey="deliveryRate" />
                                <SortHeader label={t("reports.city.col.days")} sortKey="avgDeliveryDays" />
                            </tr>
                        </thead>
                        <motion.tbody
                            variants={container}
                            initial="hidden"
                            animate="show"
                        >
                            {displayData.map((city, index) => {
                                const rateColors = getDeliveryRateColor(city.deliveryRate);
                                return (
                                    <motion.tr
                                        key={city.city}
                                        variants={item}
                                        className="border-t border-border hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-foreground">{city.city}</span>
                                                {city.governorateCode && (
                                                    <span className="text-[10px] text-muted bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                                        {city.governorateCode}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 font-bold text-foreground">
                                            {city.totalOrders.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-emerald-600 dark:text-emerald-300 font-medium">
                                            {city.delivered.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-rose-600 dark:text-rose-300 font-medium">
                                            {city.rejected.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={cn(
                                                "text-xs font-bold px-2 py-1 rounded-full",
                                                rateColors.bg,
                                                rateColors.text
                                            )}>
                                                {city.deliveryRate.toFixed(0)}%
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-muted">
                                            {city.avgDeliveryDays > 0 ? t("reports.unit.days", { n: city.avgDeliveryDays.toFixed(1) }) : '-'}
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </motion.tbody>
                    </table>
                </div>

                {/* Show more */}
                {data.length > 8 && (
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="mt-4 w-full py-2 text-sm font-medium text-muted hover:text-foreground transition-colors flex items-center justify-center gap-1 rounded-xl hover:bg-gray-50"
                    >
                        {showAll ? (
                            <>{t("reports.city.showLess")} <ChevronUp className="w-4 h-4" /></>
                        ) : (
                            <>{t("reports.city.showMore", { n: data.length })} <ChevronDown className="w-4 h-4" /></>
                        )}
                    </button>
                )}
            </div>
        </motion.div>
    );
}
