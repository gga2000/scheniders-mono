"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { GeoDistribution } from "@/hooks/use-customers";
import { formatIQD } from "@/lib/utils";

interface GeoDistributionChartProps {
    data: GeoDistribution[];
}

export function GeoDistributionChart({ data }: GeoDistributionChartProps) {
    const chartData = useMemo(() => {
        return data.slice(0, 8).map((d) => ({
            ...d,
            shortCity: d.city.length > 12 ? d.city.slice(0, 12) + "..." : d.city,
        }));
    }, [data]);

    if (data.length === 0) {
        return (
            <div className="h-[200px] flex items-center justify-center text-muted">
                No location data
            </div>
        );
    }

    return (
        <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 50, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--foreground-subtle)" }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="shortCity" tick={{ fontSize: 11, fill: "var(--foreground-subtle)" }} tickLine={false} axisLine={false} width={50} />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--card-bg)",
                            border: "1px solid var(--card-border)",
                            borderRadius: "12px",
                        }}
                        formatter={(value: number, name: string) => [
                            name === "count" ? `${value} customers` : formatIQD(value),
                            name === "count" ? "Customers" : "Revenue",
                        ]}
                        labelFormatter={(label) => label}
                    />
                    <Bar dataKey="count" fill="var(--pastel-mint)" radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
