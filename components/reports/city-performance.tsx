"use client";

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
    const topCities = sortedData.slice(0, 3);

    const getMedalColor = (index: number) => {
        if (index === 0) return "from-yellow-400 to-amber-500";
        if (index === 1) return "from-gray-300 to-gray-400";
        return "from-amber-600 to-orange-700";
    };

    const getDeliveryRateColor = (rate: number) => {
        if (rate >= 85) return { bg: "bg-emerald-100", text: "text-emerald-700" };
        if (rate >= 70) return { bg: "bg-amber-100", text: "text-amber-700" };
        return { bg: "bg-rose-100", text: "text-rose-700" };
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
                        <div className="p-2 bg-cyan-100 rounded-xl text-cyan-600">
                            <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">City Performance</h3>
                            <p className="text-sm text-muted">Delivery metrics by governorate</p>
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
                            className={cn(
                                "p-4 rounded-2xl text-white shadow-lg relative overflow-hidden",
                                `bg-gradient-to-br ${getMedalColor(index)}`,
                                index === 0 ? "shadow-yellow-500/30" : index === 1 ? "shadow-gray-400/30" : "shadow-orange-500/30"
                            )}
                        >
                            <div className="absolute top-2 right-2 opacity-20">
                                <Medal className="w-10 h-10" />
                            </div>
                            <div className="relative z-10">
                                <span className="text-xs font-bold opacity-80">#{index + 1}</span>
                                <h4 className="text-lg font-bold mt-1">{city.city}</h4>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-2xl font-bold">{city.totalOrders}</span>
                                    <span className="text-xs opacity-80">orders</span>
                                </div>
                                <div className="text-xs mt-1 opacity-80">
                                    {city.deliveryRate.toFixed(0)}% delivered
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full">
                        <thead className="bg-gray-50/50">
                            <tr className="text-xs text-muted">
                                <th className="py-3 px-4 text-left font-semibold">City</th>
                                <SortHeader label="Orders" sortKey="totalOrders" />
                                <SortHeader label="Delivered" sortKey="delivered" />
                                <SortHeader label="Rejected" sortKey="rejected" />
                                <SortHeader label="Rate" sortKey="deliveryRate" />
                                <SortHeader label="Avg Days" sortKey="avgDeliveryDays" />
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
                                        className="border-t border-border hover:bg-gray-50/50 transition-colors"
                                    >
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-foreground">{city.city}</span>
                                                {city.governorateCode && (
                                                    <span className="text-[10px] text-muted bg-gray-100 px-1.5 py-0.5 rounded">
                                                        {city.governorateCode}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 font-bold text-foreground">
                                            {city.totalOrders.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-emerald-600 font-medium">
                                            {city.delivered.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-rose-600 font-medium">
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
                                            {city.avgDeliveryDays > 0 ? `${city.avgDeliveryDays.toFixed(1)}d` : '-'}
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
                            <>Show Less <ChevronUp className="w-4 h-4" /></>
                        ) : (
                            <>View All {data.length} Cities <ChevronDown className="w-4 h-4" /></>
                        )}
                    </button>
                )}
            </div>
        </motion.div>
    );
}
