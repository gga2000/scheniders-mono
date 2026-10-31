"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    BarChart3,
    Users,
    Activity,
    TrendingUp,
    Calendar,
    Package,
    LayoutGrid,
    Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PerformanceTrendsChart } from "./charts/performance-trends-chart";
import { ActionBreakdownChart } from "./charts/action-breakdown-chart";
import { ActivityHeatmap } from "./charts/activity-heatmap";
import { PeakHoursHeatmap } from "./charts/peak-hours-heatmap";
import { ActivityLogEntry } from "@/lib/activity-logger";
import { PastelCard, StatCard } from "./shared-pastel-components";
import { useLanguage } from "@/hooks/use-language";

// Types
interface EmployeeStats {
    userId: string;
    email: string;
    displayName: string | null;
    totalActions: number;
    ordersCreated: number;
    statusChanges: number;
    ordersPrinted: number;
}

interface TeamAnalyticsTabProps {
    activities: ActivityLogEntry[];
    employees: EmployeeStats[];
    className?: string;
}

type ChartView = "trends" | "breakdown" | "heatmap" | "hours";

export function TeamAnalyticsTab({
    activities,
    employees,
    className,
}: TeamAnalyticsTabProps) {
    const { t } = useLanguage();
    const [activeChart, setActiveChart] = useState<ChartView>("trends");

    // Process data for performance trends (last 14 days)
    const trendsData = useMemo(() => {
        const dayMap = new Map<string, {
            totalActions: number;
            ordersCreated: number;
            statusChanges: number;
            ordersPrinted: number;
        }>();

        // Initialize last 14 days
        for (let i = 13; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split("T")[0];
            dayMap.set(dateStr, {
                totalActions: 0,
                ordersCreated: 0,
                statusChanges: 0,
                ordersPrinted: 0,
            });
        }

        // Aggregate activities by day
        activities.forEach((activity) => {
            const dateStr = activity.created_at.split("T")[0];
            const day = dayMap.get(dateStr);
            if (day) {
                day.totalActions++;
                if (activity.action === "order.create") day.ordersCreated++;
                if (activity.action === "order.status_change") day.statusChanges++;
                if (activity.action === "order.print") day.ordersPrinted++;
            }
        });

        return Array.from(dayMap.entries()).map(([date, stats]) => ({
            date,
            ...stats,
        }));
    }, [activities]);

    // Process data for action breakdown
    const breakdownData = useMemo(() => {
        const actionMap = new Map<string, number>();
        activities.forEach((activity) => {
            actionMap.set(activity.action, (actionMap.get(activity.action) || 0) + 1);
        });
        return Array.from(actionMap.entries())
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count);
    }, [activities]);

    // Process data for yearly heatmap
    const heatmapData = useMemo(() => {
        const dayMap = new Map<string, number>();
        activities.forEach((activity) => {
            const dateStr = activity.created_at.split("T")[0];
            dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
        });
        return Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));
    }, [activities]);

    // Process data for peak hours
    const peakHoursData = useMemo(() => {
        const hourMap = new Map<number, number>();
        activities.forEach((activity) => {
            const hour = new Date(activity.created_at).getHours();
            hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
        });
        return Array.from(hourMap.entries())
            .map(([hour, count]) => ({ hour, count }))
            .sort((a, b) => a.hour - b.hour);
    }, [activities]);

    // Team totals
    const teamTotals = useMemo(() => {
        return {
            totalEmployees: employees.length,
            totalActions: employees.reduce((sum, e) => sum + e.totalActions, 0),
            totalOrders: employees.reduce((sum, e) => sum + e.ordersCreated, 0),
            avgPerEmployee: employees.length > 0
                ? Math.round(employees.reduce((sum, e) => sum + e.totalActions, 0) / employees.length)
                : 0,
        };
    }, [employees]);

    const charts: { key: ChartView; icon: React.ElementType; labelKey: string }[] = [
        { key: "trends", icon: TrendingUp, labelKey: "team.charts.trends" },
        { key: "breakdown", icon: LayoutGrid, labelKey: "team.charts.breakdown" },
        { key: "heatmap", icon: Calendar, labelKey: "team.charts.heatmap" },
        { key: "hours", icon: Clock, labelKey: "team.charts.peakHours" },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("space-y-6", className)}
        >
            {/* Team Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={Users}
                    label={t("team.analytics.totalEmployees")}
                    value={teamTotals.totalEmployees}
                    color="purple"
                    delay={0}
                />
                <StatCard
                    icon={Activity}
                    label={t("team.analytics.totalActions")}
                    value={teamTotals.totalActions}
                    color="yellow"
                    delay={0.1}
                />
                <StatCard
                    icon={Package}
                    label={t("team.analytics.newOrders")}
                    value={teamTotals.totalOrders}
                    color="green"
                    delay={0.2}
                />
                <StatCard
                    icon={BarChart3}
                    label={t("team.analytics.avgPerEmployee")}
                    value={teamTotals.avgPerEmployee}
                    color="mint"
                    delay={0.3}
                />
            </div>

            {/* Main Analytics Card */}
            <PastelCard className="p-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#E5E7EB] dark:bg-gray-500/20 flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-[#1E1E1E] dark:text-white">{t("team.analytics.title")}</h2>
                            <p className="text-sm text-[#6B6B6B] dark:text-gray-400">{t("team.analytics.subtitle")}</p>
                        </div>
                    </div>

                    <div className="flex bg-[#FAF8F5] dark:bg-white/5 border border-[#E8E4DC] dark:border-white/10 p-1 rounded-2xl w-full md:w-auto overflow-x-auto">
                        {charts.map((chart) => (
                            <button
                                key={chart.key}
                                onClick={() => setActiveChart(chart.key)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                                    activeChart === chart.key
                                        ? "bg-white dark:bg-[#1A1A1A] text-[#1E1E1E] dark:text-white shadow-sm"
                                        : "text-[#9A9A9A] dark:text-gray-500 hover:text-[#1E1E1E] dark:hover:text-white"
                                )}
                            >
                                <chart.icon className="w-4 h-4" />
                                <span>{t(chart.labelKey)}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="min-h-[350px]">
                    {activeChart === "trends" && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                            <PerformanceTrendsChart
                                data={trendsData}
                                showMetrics={["totalActions", "ordersCreated", "statusChanges"]}
                                height={320}
                            />
                        </motion.div>
                    )}
                    {activeChart === "breakdown" && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                            <ActionBreakdownChart data={breakdownData} height={320} />
                        </motion.div>
                    )}
                    {activeChart === "heatmap" && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                            <ActivityHeatmap data={heatmapData} />
                        </motion.div>
                    )}
                    {activeChart === "hours" && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                            <PeakHoursHeatmap data={peakHoursData} />
                        </motion.div>
                    )}
                </div>
            </PastelCard>
        </motion.div>
    );
}
