"use client";

import { useMemo } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
    Legend,
} from "recharts";
import { DailyData } from "@/hooks/use-finances";
import { formatIQD } from "@/lib/utils";

interface RevenueChartProps {
    data: DailyData[];
    showProfit?: boolean;
}

export function RevenueChart({ data, showProfit = true }: RevenueChartProps) {
    const chartData = useMemo(() => {
        return data.map((d) => ({
            ...d,
            displayDate: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        }));
    }, [data]);

    if (data.length === 0) {
        return (
            <div className="h-[300px] flex items-center justify-center text-muted">
                No data for selected period
            </div>
        );
    }

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                    <XAxis
                        dataKey="displayDate"
                        tick={{ fontSize: 12, fill: "var(--foreground-subtle)" }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        tick={{ fontSize: 12, fill: "var(--foreground-subtle)" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--card-bg)",
                            border: "1px solid var(--card-border)",
                            borderRadius: "12px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                        formatter={(value: number, name: string) => [
                            formatIQD(value),
                            name === "revenue" ? "Revenue" : "Profit"
                        ]}
                        labelFormatter={(label) => label}
                    />
                    <Legend />
                    <Area
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#revenueGradient)"
                    />
                    {showProfit && (
                        <Area
                            type="monotone"
                            dataKey="profit"
                            name="Profit"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            fill="url(#profitGradient)"
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
