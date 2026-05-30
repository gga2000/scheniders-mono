"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

// Types
interface DailyMetric {
    date: string; // YYYY-MM-DD
    totalActions: number;
    ordersCreated: number;
    statusChanges: number;
    ordersPrinted: number;
}

interface PerformanceTrendsChartProps {
    data: DailyMetric[];
    showMetrics?: ("totalActions" | "ordersCreated" | "statusChanges" | "ordersPrinted")[];
    height?: number;
    className?: string;
}

const METRIC_CONFIG = {
    totalActions: {
        key: "totalActions",
        labelKey: "team.stats.totalActions",
        color: "#F59E0B",
        gradientId: "totalActionsGradient",
    },
    ordersCreated: {
        key: "ordersCreated",
        labelKey: "team.stats.newOrders",
        color: "#10B981",
        gradientId: "ordersCreatedGradient",
    },
    statusChanges: {
        key: "statusChanges",
        labelKey: "team.stats.statusChanges",
        color: "#6366F1",
        gradientId: "statusChangesGradient",
    },
    ordersPrinted: {
        key: "ordersPrinted",
        labelKey: "team.stats.printOps",
        color: "#8B5CF6",
        gradientId: "ordersPrintedGradient",
    },
};

export function PerformanceTrendsChart({
    data,
    showMetrics = ["totalActions", "ordersCreated"],
    height = 280,
    className,
}: PerformanceTrendsChartProps) {
    const { t, language } = useLanguage();
    // Format dates for display
    const chartData = useMemo(() => {
        return data.map((d) => ({
            ...d,
            displayDate: new Date(d.date).toLocaleDateString(language === "ar" ? "ar-IQ" : "en-US", {
                month: "short",
                day: "numeric",
            }),
        }));
    }, [data]);

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                <p>{t("team.charts.notEnoughData")}</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("relative", className)}
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">{t("team.charts.performanceTrends")}</h3>
            </div>

            {/* Chart */}
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={chartData}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                        <defs>
                            {showMetrics.map((metric) => (
                                <linearGradient
                                    key={METRIC_CONFIG[metric].gradientId}
                                    id={METRIC_CONFIG[metric].gradientId}
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="5%"
                                        stopColor={METRIC_CONFIG[metric].color}
                                        stopOpacity={0.3}
                                    />
                                    <stop
                                        offset="95%"
                                        stopColor={METRIC_CONFIG[metric].color}
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                            ))}
                        </defs>

                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--border)"
                            vertical={false}
                        />

                        <XAxis
                            dataKey="displayDate"
                            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                            tickLine={false}
                            axisLine={false}
                        />

                        <YAxis
                            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                            tickLine={false}
                            axisLine={false}
                            width={40}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: "var(--background)",
                                border: "1px solid var(--border)",
                                borderRadius: "12px",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            }}
                            formatter={(value: number, name: string) => {
                                const metric = Object.values(METRIC_CONFIG).find(
                                    (m) => m.key === name
                                );
                                return [value, metric ? t(metric.labelKey) : name];
                            }}
                            labelFormatter={(label) => `${label}`}
                        />

                        <Legend
                            formatter={(value) => {
                                const metric = Object.values(METRIC_CONFIG).find(
                                    (m) => m.key === value
                                );
                                return metric ? t(metric.labelKey) : value;
                            }}
                            iconType="circle"
                            wrapperStyle={{ fontSize: "12px" }}
                        />

                        {showMetrics.map((metric) => (
                            <Area
                                key={metric}
                                type="monotone"
                                dataKey={METRIC_CONFIG[metric].key}
                                stroke={METRIC_CONFIG[metric].color}
                                strokeWidth={2}
                                fill={`url(#${METRIC_CONFIG[metric].gradientId})`}
                                dot={false}
                                activeDot={{
                                    r: 4,
                                    stroke: METRIC_CONFIG[metric].color,
                                    strokeWidth: 2,
                                    fill: "white",
                                }}
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    );
}
