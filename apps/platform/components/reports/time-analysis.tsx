"use client";

import { motion } from "framer-motion";
import { TimeAnalysisMetrics } from "@/lib/analytics/reports-calculations";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { Clock, Calendar, Timer, Zap } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface TimeAnalysisProps {
    data: TimeAnalysisMetrics;
}

type TabType = 'hourly' | 'daily' | 'processing';

const tabs = [
    { id: 'hourly' as TabType, label: 'By Hour', icon: Clock, color: 'indigo' },
    { id: 'daily' as TabType, label: 'By Day', icon: Calendar, color: 'emerald' },
    { id: 'processing' as TabType, label: 'Processing', icon: Timer, color: 'cyan' },
];

export function TimeAnalysis({ data }: TimeAnalysisProps) {
    const [activeTab, setActiveTab] = useState<TabType>('hourly');

    // Format hourly data for chart
    const hourlyChartData = data.hourlyDistribution.map(d => ({
        name: `${d.hour}:00`,
        value: d.count,
        hour: d.hour,
    }));

    // Find peak hour
    const peakHour = data.hourlyDistribution.reduce((max, curr) =>
        curr.count > max.count ? curr : max, { hour: 0, count: 0 });

    // Find best day
    const bestDay = data.dailyDistribution.reduce((max, curr) =>
        curr.count > max.count ? curr : max, { day: '', count: 0, dayIndex: 0 });

    const dayColors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6'];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 h-full overflow-hidden relative"
        >
            {/* Background glow */}
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-gradient-to-br from-indigo-500/10 to-blue-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                        <Clock className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-foreground">Time Patterns</h3>
                        <p className="text-xs text-muted">When orders come in</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 p-1 bg-gray-100/80 rounded-2xl">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all",
                                activeTab === tab.id
                                    ? "bg-white text-foreground shadow-sm"
                                    : "text-muted hover:text-foreground"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Hourly Distribution */}
                {activeTab === 'hourly' && (
                    <div>
                        <div className="h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={hourlyChartData}>
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 10 }}
                                        tickFormatter={(v) => v.split(':')[0]}
                                        interval={2}
                                    />
                                    <YAxis hide />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="bg-white/95 backdrop-blur shadow-lg border border-border p-3 rounded-xl text-xs">
                                                        <p className="font-bold">{d.name}</p>
                                                        <p>{d.value} orders</p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {hourlyChartData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.hour === peakHour.hour ? '#6366F1' : '#C7D2FE'}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Peak insight */}
                        <div className="mt-4 p-3 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <Zap className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-indigo-900">Peak Hour: {peakHour.hour}:00</p>
                                <p className="text-xs text-indigo-700">{peakHour.count} orders received</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Daily Distribution */}
                {activeTab === 'daily' && (
                    <div className="space-y-3">
                        {data.dailyDistribution.map((d, index) => {
                            const maxCount = Math.max(...data.dailyDistribution.map(x => x.count), 1);
                            const width = (d.count / maxCount) * 100;
                            const isBest = d.day === bestDay.day;

                            return (
                                <motion.div
                                    key={d.day}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className={cn(
                                        "p-3 rounded-xl border-2 transition-all",
                                        isBest
                                            ? "bg-emerald-50 border-emerald-200"
                                            : "bg-gray-50 border-transparent hover:border-gray-200"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={cn(
                                            "font-bold",
                                            isBest ? "text-emerald-700" : "text-foreground"
                                        )}>
                                            {d.day}
                                            {isBest && <span className="ml-2 text-xs">🏆 Best</span>}
                                        </span>
                                        <span className="font-bold text-foreground">{d.count}</span>
                                    </div>
                                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${width}%` }}
                                            transition={{ duration: 0.5, delay: index * 0.05 }}
                                            className="h-full rounded-full"
                                            style={{ backgroundColor: dayColors[d.dayIndex] }}
                                        />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}

                {/* Processing Time Distribution */}
                {activeTab === 'processing' && (
                    <div className="space-y-3">
                        {data.processingTimeDistribution.map((d, index) => {
                            const maxCount = Math.max(...data.processingTimeDistribution.map(x => x.count), 1);
                            const width = (d.count / maxCount) * 100;
                            const isFast = index === 0;

                            return (
                                <motion.div
                                    key={d.bucket}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className={cn(
                                        "p-3 rounded-xl border-2 transition-all",
                                        isFast
                                            ? "bg-cyan-50 border-cyan-200"
                                            : "bg-gray-50 border-transparent"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={cn("font-medium", isFast ? "text-cyan-700" : "text-foreground")}>
                                            {d.bucket}
                                            {isFast && <span className="ml-2 text-xs">⚡ Fastest</span>}
                                        </span>
                                        <span className="font-bold text-foreground">{d.count}</span>
                                    </div>
                                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${width}%` }}
                                            transition={{ duration: 0.5, delay: index * 0.05 }}
                                            className="h-full rounded-full"
                                            style={{
                                                backgroundColor: isFast ? '#06B6D4' : '#E5E7EB',
                                                background: isFast ? 'linear-gradient(to right, #06B6D4, #14B8A6)' : undefined
                                            }}
                                        />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
