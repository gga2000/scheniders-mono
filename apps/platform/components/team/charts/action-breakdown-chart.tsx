"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
} from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

// Types
interface ActionBreakdown {
    action: string;
    count: number;
}

interface ActionBreakdownChartProps {
    data: ActionBreakdown[];
    height?: number;
    showLabels?: boolean;
    className?: string;
}

const ACTION_CONFIG: Record<string, { labelKey: string; color: string }> = {
    "order.create": { labelKey: "team.drawer.actionCreate", color: "#10B981" },
    "order.status_change": { labelKey: "team.drawer.actionStatus", color: "#F59E0B" },
    "order.edit": { labelKey: "team.drawer.actionEdit", color: "#8B5CF6" },
    "order.print": { labelKey: "team.drawer.actionPrint", color: "#3B82F6" },
    "order.delete": { labelKey: "team.drawer.actionDelete", color: "#EF4444" },
    "order.assign": { labelKey: "team.drawer.actionAssign", color: "#06B6D4" },
    "user.login": { labelKey: "team.drawer.actionLogin", color: "#84CC16" },
    "customer.blacklist": { labelKey: "team.drawer.actionBlacklist", color: "#F43F5E" },
    "settings.update": { labelKey: "team.drawer.actionSettings", color: "#6B7280" },
};

const DEFAULT_COLORS = [
    "#10B981",
    "#F59E0B",
    "#8B5CF6",
    "#3B82F6",
    "#EF4444",
    "#06B6D4",
    "#84CC16",
    "#F43F5E",
    "#6B7280",
];

export function ActionBreakdownChart({
    data,
    height = 280,
    showLabels = true,
    className,
}: ActionBreakdownChartProps) {
    const { t } = useLanguage();
    // Process data with labels and colors
    const chartData = useMemo(() => {
        return data.map((item, index) => {
            const config = ACTION_CONFIG[item.action];
            return {
                name: config ? t(config.labelKey) : item.action,
                value: item.count,
                color: config?.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
            };
        });
    }, [data, t]);

    const totalCount = useMemo(() => {
        return data.reduce((sum, item) => sum + item.count, 0);
    }, [data]);

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                <p>{t("team.charts.noData")}</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn("relative", className)}
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <PieChartIcon className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">{t("team.charts.actionBreakdown")}</h3>
            </div>

            {/* Chart */}
            <div style={{ height }} className="relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>

                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    const percentage = ((data.value / totalCount) * 100).toFixed(1);
                                    return (
                                        <div className="bg-white/95 backdrop-blur-sm shadow-lg border border-border rounded-xl p-3">
                                            <p
                                                className="font-bold text-sm mb-1"
                                                style={{ color: data.color }}
                                            >
                                                {data.name}
                                            </p>
                                            <p className="text-sm text-foreground">
                                                {data.value} ({percentage}%)
                                            </p>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />

                        {showLabels && (
                            <Legend
                                layout="vertical"
                                align="left"
                                verticalAlign="middle"
                                iconType="circle"
                                iconSize={8}
                                formatter={(value) => (
                                    <span className="text-xs text-foreground">{value}</span>
                                )}
                                wrapperStyle={{
                                    paddingRight: "20px",
                                    fontSize: "12px",
                                }}
                            />
                        )}
                    </PieChart>
                </ResponsiveContainer>

                {/* Center stat */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-bold text-foreground">{totalCount}</span>
                    <span className="text-xs text-muted-foreground">{t("team.stats.total")}</span>
                </div>
            </div>
        </motion.div>
    );
}
