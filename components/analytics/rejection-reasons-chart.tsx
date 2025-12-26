"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { RejectionStats } from "@/hooks/use-finances";

interface RejectionReasonsChartProps {
    data: RejectionStats["byReason"];
}

const COLORS = [
    "#ef4444", // red-500
    "#f97316", // orange-500
    "#f59e0b", // amber-500
    "#eab308", // yellow-500
    "#84cc16", // lime-500
    "#22c55e", // green-500
    "#06b6d4", // cyan-500
    "#3b82f6", // blue-500
    "#8b5cf6", // violet-500
    "#d946ef", // fuchsia-500
];

export function RejectionReasonsChart({ data }: RejectionReasonsChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="h-[300px] w-full flex items-center justify-center text-muted">
                No rejection data available
            </div>
        );
    }

    // Sort by count descending
    const chartData = [...data].sort((a, b) => b.count - a.count).slice(0, 10);

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--card-border)" />
                    <XAxis type="number" hide />
                    <YAxis
                        type="category"
                        dataKey="reason"
                        width={100}
                        tick={{ fontSize: 11, fill: "var(--foreground)" }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--card-bg)",
                            border: "1px solid var(--card-border)",
                            borderRadius: "12px",
                        }}
                        itemStyle={{ color: "var(--foreground)" }}
                        cursor={{ fill: "var(--hover-bg)" }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
