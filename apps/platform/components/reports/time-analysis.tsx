"use client";

import { useLanguage } from "@/hooks/use-language";
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
    { id: 'hourly' as TabType, labelKey: 'reports.time.byHour', icon: Clock, color: 'indigo' },
    { id: 'daily' as TabType, labelKey: 'reports.time.byDay', icon: Calendar, color: 'emerald' },
    { id: 'processing' as TabType, labelKey: 'reports.time.processing', icon: Timer, color: 'cyan' },
];

export function TimeAnalysis({ data }: TimeAnalysisProps) {
    const { t } = useLanguage();
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
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl text-indigo-600 dark:text-indigo-300">
                        <Clock className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-foreground">{t("reports.time.title")}</h3>
                        <p className="text-xs text-muted">{t("reports.time.subtitle")}</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 p-1 bg-gray-100/80 dark:bg-white/10 rounded-2xl">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all",
                                activeTab === tab.id
                                    ? "bg-white dark:bg-neutral-900 text-foreground shadow-sm"
                                    : "text-muted hover:text-foreground"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{t(tab.labelKey)}</span>
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
                                                    <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur shadow-lg border border-border p-3 rounded-xl text-xs">
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
                                                fill={entry.hour === peakHour.hour ? '#1b4f93' : '#7fb0ec'}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Peak insight */}
                        <div className="mt-4 p-3 bg-gradient-to-r from-indigo-50 dark:from-indigo-500/10 to-violet-50 dark:to-violet-500/10 border border-indigo-100 dark:border-indigo-500/30 rounded-xl flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg">
                                <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">{t("reports.time.peak", { hour: peakHour.hour })}</p>
                                <p className="text-xs text-indigo-700 dark:text-indigo-300">{t("reports.time.received", { n: peakHour.count })}</p>
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
                                            ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30"
                                            : "bg-gray-50 dark:bg-white/5 border-transparent hover:border-gray-200 dark:hover:border-white/20"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={cn(
                                            "font-bold",
                                            isBest ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"
                                        )}>
                                            {t(`reports.time.day.${d.day}`, d.day)}
                                            {isBest && <span className="ml-2 text-xs">{t("reports.time.best")}</span>}
                                        </span>
                                        <span className="font-bold text-foreground">{d.count}</span>
                                    </div>
                                    <div className="h-2 bg-gray-200 dark:bg-white/15 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${width}%` }}
                                            transition={{ duration: 0.5, delay: index * 0.05 }}
                                            className="h-full rounded-full"
                                            style={{ backgroundColor: "#2a78d6" }}
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
                                            ? "bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/30"
                                            : "bg-gray-50 dark:bg-white/5 border-transparent"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={cn("font-medium", isFast ? "text-cyan-700 dark:text-cyan-300" : "text-foreground")}>
                                            {t(`reports.time.bucket.${d.bucket}`, d.bucket)}
                                            {isFast && <span className="ml-2 text-xs">{t("reports.time.fastest")}</span>}
                                        </span>
                                        <span className="font-bold text-foreground">{d.count}</span>
                                    </div>
                                    <div className="h-2 bg-gray-200 dark:bg-white/15 rounded-full overflow-hidden">
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
