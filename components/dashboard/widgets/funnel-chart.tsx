"use client";

import { ResponsiveContainer, FunnelChart, Funnel, LabelList, Tooltip, Cell } from "recharts";
import { FunnelStep } from "@/lib/analytics/dashboard-calculations";

interface FunnelChartProps {
    data: FunnelStep[];
}

export function OrderFunnel({ data }: FunnelChartProps) {
    if (!data.length) return <div className="h-[300px] flex items-center justify-center text-muted">No data available</div>;

    // Calculate drop-off for tooltip
    // ...

    return (
        <div className="pastel-card p-6 h-full flex flex-col">
            <h3 className="text-lg font-bold text-foreground mb-1">Conversion Funnel</h3>
            <p className="text-sm text-muted mb-4">Order Flow Health (New → Delivered)</p>

            <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <FunnelChart>
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload as FunnelStep;
                                    return (
                                        <div className="bg-white/95 backdrop-blur shadow-lg border border-border p-3 rounded-xl text-xs">
                                            <p className="font-bold mb-1 text-sm">{data.label}</p>
                                            <p>Count: {data.value}</p>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Funnel
                            dataKey="value"
                            data={data}
                            isAnimationActive
                        >
                            <LabelList position="right" fill="#000" stroke="none" dataKey="label" />
                        </Funnel>
                    </FunnelChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
