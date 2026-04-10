"use client";

import { Card } from "@scheniders/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatIQD } from "@/lib/utils";

interface RevenueChartProps {
    data: Array<{ date: string; revenue: number; orders: number }>;
    title: string;
}

export function RevenueChart({ data, title }: RevenueChartProps) {
    return (
        <Card className="p-6">
            <h3 className="text-xl font-bold mb-6">{title}</h3>

            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                    <XAxis
                        dataKey="date"
                        stroke="#a1a1aa"
                        style={{ fontSize: '12px' }}
                    />
                    <YAxis
                        stroke="#a1a1aa"
                        style={{ fontSize: '12px' }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'rgba(24, 24, 27, 0.95)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            backdropFilter: 'blur(24px)',
                        }}
                        labelStyle={{ color: '#fafafa' }}
                        formatter={(value: number) => [formatIQD(value), 'الإيرادات']}
                    />
                    <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#fbbf24"
                        strokeWidth={3}
                        dot={{ fill: '#fbbf24', r: 4 }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </Card>
    );
}
