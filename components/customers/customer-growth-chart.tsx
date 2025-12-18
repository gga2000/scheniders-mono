"use client";

import { useMemo } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { CustomerGrowth } from "@/hooks/use-customers";

interface CustomerGrowthChartProps {
    data: CustomerGrowth[];
}

export function CustomerGrowthChart({ data }: CustomerGrowthChartProps) {
    const chartData = useMemo(() => {
        return data.slice(-30).map((d) => ({
            ...d,
            displayDate: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        }));
    }, [data]);

    if (data.length === 0) {
        return (
            <div className="h-[200px] flex items-center justify-center text-muted">
                No customer data yet
            </div>
        );
    }

    return (
        <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="customerGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                    <XAxis
                        dataKey="displayDate"
                        tick={{ fontSize: 11, fill: "var(--foreground-subtle)" }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: "var(--foreground-subtle)" }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--card-bg)",
                            border: "1px solid var(--card-border)",
                            borderRadius: "12px",
                        }}
                        formatter={(value: number, name: string) => [
                            value,
                            name === "totalCustomers" ? "Total Customers" : "New Customers",
                        ]}
                    />
                    <Area
                        type="monotone"
                        dataKey="totalCustomers"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fill="url(#customerGradient)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
