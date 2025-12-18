"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HourlyData } from "@/hooks/use-finances";
import { formatIQD } from "@/lib/utils";

interface PeakHoursChartProps {
    data: HourlyData[];
}

export function PeakHoursChart({ data }: PeakHoursChartProps) {
    const chartData = useMemo(() => {
        return data.map((d) => ({
            ...d,
            hourLabel: `${d.hour.toString().padStart(2, "0")}:00`,
        }));
    }, [data]);

    const maxOrders = Math.max(...data.map((d) => d.orders));

    return (
        <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                    <XAxis
                        dataKey="hourLabel"
                        tick={{ fontSize: 10, fill: "var(--foreground-subtle)" }}
                        tickLine={false}
                        axisLine={false}
                        interval={2}
                    />
                    <YAxis
                        tick={{ fontSize: 12, fill: "var(--foreground-subtle)" }}
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
                            name === "orders" ? `${value} orders` : formatIQD(value),
                            name === "orders" ? "Orders" : "Revenue",
                        ]}
                        labelFormatter={(label) => `${label}`}
                    />
                    <Bar
                        dataKey="orders"
                        fill="var(--pastel-yellow)"
                        radius={[4, 4, 0, 0]}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
