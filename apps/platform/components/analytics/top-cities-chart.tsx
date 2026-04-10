"use client";

import { Card } from "@scheniders/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface TopCitiesChartProps {
    data: Array<{ city: string; orders: number; revenue: number }>;
}

export function TopCitiesChart({ data }: TopCitiesChartProps) {
    return (
        <Card className="p-6">
            <h3 className="text-xl font-bold mb-6">أعلى المدن</h3>

            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                    <XAxis
                        dataKey="city"
                        stroke="#a1a1aa"
                        style={{ fontSize: '12px' }}
                    />
                    <YAxis
                        stroke="#a1a1aa"
                        style={{ fontSize: '12px' }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'rgba(24, 24, 27, 0.95)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            backdropFilter: 'blur(24px)',
                        }}
                        labelStyle={{ color: '#fafafa' }}
                    />
                    <Bar dataKey="orders" fill="#10b981" radius={[8, 8, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </Card>
    );
}
