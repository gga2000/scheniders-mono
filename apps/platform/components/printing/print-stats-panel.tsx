"use client";

import { motion } from "framer-motion";
import { PrintStats } from "@/hooks/use-printing";
import {
    Printer,
    Clock,
    CheckCircle,
    MapPin,
    TrendingUp,
    BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PrintStatsPanelProps {
    stats: PrintStats;
    isExpanded?: boolean;
}

export function PrintStatsPanel({ stats, isExpanded = true }: PrintStatsPanelProps) {
    if (!isExpanded) return null;

    // Colors for city distribution
    const cityColors = [
        "bg-blue-500",
        "bg-purple-500",
        "bg-green-500",
        "bg-amber-500",
        "bg-rose-500",
        "bg-teal-500",
        "bg-indigo-500",
        "bg-orange-500",
    ];

    return (
        <div className="space-y-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Today's Printed */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0 }}
                    className="pastel-card pastel-card-green p-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-700" />
                        </div>
                        <div>
                            <p className="text-xs text-green-700 font-medium uppercase tracking-wide">Printed Today</p>
                            <p className="text-2xl font-bold text-green-900">{stats.todayPrinted}</p>
                        </div>
                    </div>
                </motion.div>

                {/* Today's Pending */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="pastel-card pastel-card-yellow p-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-amber-700" />
                        </div>
                        <div>
                            <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Pending</p>
                            <p className="text-2xl font-bold text-amber-900">{stats.todayPending}</p>
                        </div>
                    </div>
                </motion.div>

                {/* Total Printed */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="pastel-card pastel-card-purple p-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                            <Printer className="w-5 h-5 text-purple-700" />
                        </div>
                        <div>
                            <p className="text-xs text-purple-700 font-medium uppercase tracking-wide">Total Printed</p>
                            <p className="text-2xl font-bold text-purple-900">{stats.totalPrinted}</p>
                        </div>
                    </div>
                </motion.div>

                {/* Completion Rate */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="pastel-card p-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-blue-700" />
                        </div>
                        <div>
                            <p className="text-xs text-muted font-medium uppercase tracking-wide">Completion</p>
                            <p className="text-2xl font-bold text-foreground">
                                {stats.todayPrinted + stats.todayPending > 0
                                    ? Math.round((stats.todayPrinted / (stats.todayPrinted + stats.todayPending)) * 100)
                                    : 0}
                                %
                            </p>
                        </div>
                    </div>
                    <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-1000"
                            style={{
                                width: `${stats.todayPrinted + stats.todayPending > 0
                                    ? (stats.todayPrinted / (stats.todayPrinted + stats.todayPending)) * 100
                                    : 0
                                    }%`,
                            }}
                        />
                    </div>
                </motion.div>
            </div>

            {/* City Distribution Chart */}
            {stats.cityDistribution.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="pastel-card p-4"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <MapPin className="w-4 h-4 text-muted" />
                        <h3 className="font-semibold text-foreground">City Distribution</h3>
                    </div>

                    {/* Horizontal Bar Chart */}
                    <div className="space-y-3">
                        {stats.cityDistribution.slice(0, 6).map((city, idx) => (
                            <div key={city.city} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-foreground">{city.city}</span>
                                    <span className="text-muted">
                                        {city.count} ({city.percentage}%)
                                    </span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${city.percentage}%` }}
                                        transition={{ duration: 0.8, delay: 0.5 + idx * 0.1 }}
                                        className={cn("h-full rounded-full", cityColors[idx % cityColors.length])}
                                    />
                                </div>
                            </div>
                        ))}

                        {stats.cityDistribution.length > 6 && (
                            <p className="text-xs text-muted text-center pt-2">
                                +{stats.cityDistribution.length - 6} more cities
                            </p>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
