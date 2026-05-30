"use client";

import { LineChart } from "lucide-react";
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { SectionCard } from "../primitives/section-card";
import { FinanceTooltip } from "../primitives/finance-tooltip";
import type { CashPositionResult } from "@/hooks/use-cash-position";

interface Props {
    data: CashPositionResult;
}

export function CashTimeline({ data }: Props) {
    const hasData = data.cashSeries.some((s) => s.collected > 0 || s.float > 0);

    return (
        <SectionCard
            title="Cash Timeline"
            subtitle="Daily collected vs. in-transit over the last 30 days"
            icon={LineChart}
            accent="cyan"
        >
            {!hasData ? (
                <div className="h-48 flex items-center justify-center text-sm text-muted">
                    No cash activity in the last 30 days.
                </div>
            ) : (
                <div className="h-64 -mx-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.cashSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                            <defs>
                                <linearGradient id="collectedGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="floatGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.22} />
                                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="currentColor" strokeOpacity={0.06} vertical={false} />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={shortDate}
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v) => abbrev(v as number)}
                                width={42}
                            />
                            <Tooltip
                                content={(p) => <FinanceTooltip {...p} />}
                                cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="collected"
                                stroke="#10b981"
                                strokeWidth={2}
                                fill="url(#collectedGrad)"
                                name="Collected"
                            />
                            <Area
                                type="monotone"
                                dataKey="float"
                                stroke="#06b6d4"
                                strokeWidth={2}
                                fill="url(#floatGrad)"
                                name="In Transit"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </SectionCard>
    );
}

function abbrev(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${Math.round(n)}`;
}

function shortDate(key: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        const d = new Date(key);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return key;
}
