"use client";

import { motion } from "framer-motion";
import { SourcePerformanceMetrics } from "@/lib/analytics/source-metrics";
import { Trophy, Medal, Package, CheckCircle2, Clock, DollarSign, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";

interface SourcePerformanceProps {
    data: SourcePerformanceMetrics[];
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

const getMedalGradient = (rank: number) => {
    if (rank === 1) return "from-yellow-400 to-amber-500";
    if (rank === 2) return "from-gray-300 to-gray-400";
    if (rank === 3) return "from-amber-600 to-orange-700";
    return "from-blue-400 to-blue-500";
};

const getMedalShadow = (rank: number) => {
    if (rank === 1) return "shadow-yellow-500/30";
    if (rank === 2) return "shadow-gray-400/30";
    if (rank === 3) return "shadow-orange-500/30";
    return "shadow-blue-400/20";
};

export function SourcePerformance({ data }: SourcePerformanceProps) {
    if (data.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pastel-card p-8 text-center"
            >
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <Trophy className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-foreground">No Performance Data</h3>
                <p className="text-sm text-muted mt-1">Performance metrics will appear once orders are processed</p>
            </motion.div>
        );
    }

    // Show top performers (top 3) and the rest
    const topPerformers = data.slice(0, 3);
    const otherPerformers = data.slice(3);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 overflow-hidden relative"
        >
            {/* Background decoration */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-gradient-to-br from-amber-500/10 to-yellow-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                            <Trophy className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">Source Performance</h3>
                            <p className="text-sm text-muted">Order processing by source</p>
                        </div>
                    </div>
                </div>

                {/* Top 3 Podium */}
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-3 gap-4 mb-6"
                >
                    {topPerformers.map((emp, index) => (
                        <motion.div
                            key={emp.sourceKey}
                            variants={item}
                            className={cn(
                                "p-4 rounded-2xl text-white shadow-lg relative overflow-hidden",
                                `bg-gradient-to-br ${getMedalGradient(emp.rank)}`,
                                getMedalShadow(emp.rank)
                            )}
                        >
                            <div className="absolute top-2 right-2 opacity-20">
                                <Medal className="w-8 h-8" />
                            </div>
                            <div className="relative z-10">
                                <div className="text-xs font-bold opacity-90">#{emp.rank}</div>
                                <h4 className="text-lg font-bold mt-1 truncate">{emp.displayName}</h4>

                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <div>
                                        <div className="text-2xl font-bold">{emp.ordersProcessed}</div>
                                        <div className="text-[10px] opacity-80">Orders</div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold">{emp.deliveryRate.toFixed(0)}%</div>
                                        <div className="text-[10px] opacity-80">Delivery</div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Other performers list */}
                {otherPerformers.length > 0 && (
                    <div className="space-y-2">
                        {otherPerformers.map((emp, index) => (
                            <motion.div
                                key={emp.sourceKey}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 + index * 0.05 }}
                                className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                                    {emp.rank}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-foreground truncate">{emp.displayName}</div>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                    <div className="text-center">
                                        <span className="font-bold text-foreground">{emp.ordersProcessed}</span>
                                        <span className="text-muted ml-1">orders</span>
                                    </div>
                                    <div className={cn(
                                        "px-2 py-1 rounded-full text-xs font-bold",
                                        emp.deliveryRate >= 80 ? "bg-emerald-100 text-emerald-700" :
                                            emp.deliveryRate >= 60 ? "bg-amber-100 text-amber-700" :
                                                "bg-rose-100 text-rose-700"
                                    )}>
                                        {emp.deliveryRate.toFixed(0)}%
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
