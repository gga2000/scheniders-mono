"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Label } from "recharts";

interface TargetRingsProps {
    revenue: number;
    orders: number;
}

// Configurable Targets (State of the Art would pull from settings)
const TARGETS = {
    revenue: 500000, // 500k IQD
    orders: 20       // 20 Orders
};

export function TargetRings({ revenue, orders }: TargetRingsProps) {
    const revPercent = Math.min(100, (revenue / TARGETS.revenue) * 100);
    const orderPercent = Math.min(100, (orders / TARGETS.orders) * 100);

    const Ring = ({ value, color, label, subLabel }: any) => {
        const data = [
            { name: 'Progress', value: value },
            { name: 'Remaining', value: 100 - value }
        ];

        return (
            <div className="relative w-32 h-32 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={50}
                            startAngle={90}
                            endAngle={-270}
                            dataKey="value"
                            stroke="none"
                        >
                            <Cell fill={color} />
                            <Cell fill="#f3f4f6" />
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-xl font-bold text-foreground">{Math.round(value)}%</span>
                    <span className="text-[10px] text-muted uppercase tracking-wider">{label}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="pastel-card p-6 h-full flex flex-col items-center justify-center">
            <h3 className="text-lg font-bold text-foreground mb-6 w-full text-left">Daily Targets</h3>

            <div className="flex items-center gap-8">
                <Ring value={revPercent} color="#FBE38E" label="Revenue" />
                <Ring value={orderPercent} color="#C0EBA6" label="Orders" />
            </div>

            <div className="mt-6 w-full space-y-2">
                <div className="flex justify-between text-xs">
                    <span className="text-muted">Rev Goal: {(TARGETS.revenue / 1000).toFixed(0)}k</span>
                    <span className="font-bold text-foreground">{revenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                    <span className="text-muted">Order Goal: {TARGETS.orders}</span>
                    <span className="font-bold text-foreground">{orders}</span>
                </div>
            </div>
        </div>
    );
}
