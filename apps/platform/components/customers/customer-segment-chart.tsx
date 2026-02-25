"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Crown, Star, Sparkles } from "lucide-react";
import { formatIQD, cn } from "@/lib/utils";

interface CustomerSegmentData {
    vip_revenue: number;
    vip_count: number;
    regular_revenue: number;
    regular_count: number;
    new_revenue: number;
    new_count: number;
}

interface CustomerSegmentChartProps {
    data?: CustomerSegmentData;
    isLoading?: boolean;
}

const SEGMENT_COLORS = {
    vip: "#F59E0B", // amber-500
    regular: "#10B981", // emerald-500
    new: "#8B5CF6", // violet-500
};

export function CustomerSegmentChart({ data, isLoading = false }: CustomerSegmentChartProps) {
    const chartData = useMemo(() => {
        if (!data) return [];

        return [
            {
                name: "VIP Customers",
                value: data.vip_revenue,
                count: data.vip_count,
                color: SEGMENT_COLORS.vip,
                icon: Crown,
            },
            {
                name: "Regular Customers",
                value: data.regular_revenue,
                count: data.regular_count,
                color: SEGMENT_COLORS.regular,
                icon: Star,
            },
            {
                name: "New Customers",
                value: data.new_revenue,
                count: data.new_count,
                color: SEGMENT_COLORS.new,
                icon: Sparkles,
            },
        ].filter((segment) => segment.value > 0); // Only show segments with revenue
    }, [data]);

    const totalRevenue = useMemo(() => {
        return chartData.reduce((sum, segment) => sum + segment.value, 0);
    }, [chartData]);

    if (isLoading) {
        return (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 shadow-sm h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    if (!data || chartData.length === 0) {
        return (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 shadow-sm h-[400px] flex items-center justify-center">
                <p className="text-sm text-muted">No segment data available</p>
            </div>
        );
    }

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 shadow-sm">
            <div className="mb-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    Revenue by Customer Segment
                </h3>
                <p className="text-sm text-muted mt-1">
                    Total: {formatIQD(totalRevenue)}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Donut Chart */}
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload[0]) {
                                        const data = payload[0].payload;
                                        const percentage = ((data.value / totalRevenue) * 100).toFixed(1);
                                        return (
                                            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 shadow-lg">
                                                <p className="text-sm font-bold text-foreground">
                                                    {data.name}
                                                </p>
                                                <p className="text-xs text-muted mt-1">
                                                    {data.count} customers
                                                </p>
                                                <p className="text-sm font-semibold text-foreground mt-1">
                                                    {formatIQD(data.value)}
                                                </p>
                                                <p className="text-xs text-muted">
                                                    {percentage}% of total
                                                </p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Legend with Stats */}
                <div className="flex flex-col justify-center gap-4">
                    {chartData.map((segment) => {
                        const Icon = segment.icon;
                        const percentage = ((segment.value / totalRevenue) * 100).toFixed(1);
                        const avgRevenue = segment.count > 0 ? segment.value / segment.count : 0;

                        return (
                            <div
                                key={segment.name}
                                className="flex items-start gap-3 p-4 rounded-xl border border-[var(--card-border)] hover:bg-[var(--card-border)]/30 transition-colors"
                            >
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: `${segment.color}15` }}
                                >
                                    <Icon className="w-5 h-5" style={{ color: segment.color }} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-sm font-bold text-foreground">
                                            {segment.name}
                                        </p>
                                        <p className="text-xs font-semibold text-muted">
                                            {percentage}%
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-muted">
                                        <span>{segment.count} customers</span>
                                        <span className="font-medium">{formatIQD(avgRevenue)}/customer</span>
                                    </div>

                                    <div className="mt-2 h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${percentage}%`,
                                                backgroundColor: segment.color,
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
