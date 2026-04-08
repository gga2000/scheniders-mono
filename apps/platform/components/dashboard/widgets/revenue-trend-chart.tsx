"use client";

import { useState, useMemo } from "react";
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
} from "recharts";
import { RevenueTrendPoint, calculateRevenueTrend } from "@/lib/analytics/dashboard-calculations";
import { formatIQD } from "@/lib/utils";
import { Order } from "@/lib/supabase";
import { TrendingUp } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

type Days = 7 | 14 | 30;

interface RevenueTrendChartProps {
    orders: Order[];
    showRevenue: boolean;
}

const CustomTooltip = ({ active, payload, label, showRevenue, ordersLabel, revenueLabel }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
    showRevenue: boolean;
    ordersLabel: string;
    revenueLabel: string;
}) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-xl p-3 text-sm">
            <p className="font-bold text-foreground mb-2">{label}</p>
            {payload.map((p) => (
                <p key={p.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-muted">{p.name === 'Orders' ? ordersLabel : p.name === 'Revenue' ? revenueLabel : p.name}:</span>
                    <span className="font-semibold text-foreground">
                        {p.name === 'Revenue' ? formatIQD(p.value) : p.value}
                    </span>
                </p>
            ))}
        </div>
    );
};

export function RevenueTrendChart({ orders, showRevenue }: RevenueTrendChartProps) {
    const [days, setDays] = useState<Days>(7);
    const { t } = useLanguage();

    const data = useMemo(() => calculateRevenueTrend(orders, days), [orders, days]);

    const totalOrders = data.reduce((s, d) => s + d.orders, 0);
    const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);

    return (
        <div className="pastel-card p-5 md:p-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)]/40 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-blue-700" />
                    </div>
                    <div>
                        <h3 className="font-bold text-foreground text-sm">{t("dashboard.trend.title")}</h3>
                        <p className="text-xs text-muted">
                            {totalOrders} {t("dashboard.trend.orders")}
                            {showRevenue && ` · ${formatIQD(totalRevenue)}`}
                        </p>
                    </div>
                </div>

                {/* Day toggle */}
                <div className="flex items-center gap-1 bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
                    {([7, 14, 30] as Days[]).map(d => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                                days === d
                                    ? 'bg-[var(--card-bg)] text-foreground shadow-sm'
                                    : 'text-muted hover:text-foreground'
                            }`}
                        >
                            {d}D
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart */}
            <div className="flex-1 min-h-0" style={{ minHeight: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#A6C8FF" stopOpacity={0.9} />
                                <stop offset="100%" stopColor="#A6C8FF" stopOpacity={0.4} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11, fill: 'var(--foreground-subtle)' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            yAxisId="orders"
                            tick={{ fontSize: 11, fill: 'var(--foreground-subtle)' }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                        />
                        {showRevenue && (
                            <YAxis
                                yAxisId="revenue"
                                orientation="right"
                                tick={{ fontSize: 11, fill: 'var(--foreground-subtle)' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                            />
                        )}
                        <Tooltip content={<CustomTooltip showRevenue={showRevenue} ordersLabel={t("dashboard.trend.ordersLabel")} revenueLabel={t("dashboard.trend.revenueLabel")} />} />
                        <Bar
                            yAxisId="orders"
                            dataKey="orders"
                            name="Orders"
                            fill="url(#barGrad)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                        />
                        {showRevenue && (
                            <Line
                                yAxisId="revenue"
                                type="monotone"
                                dataKey="revenue"
                                name="Revenue"
                                stroke="#FBE38E"
                                strokeWidth={2.5}
                                dot={{ fill: '#FBE38E', r: 3, strokeWidth: 0 }}
                                activeDot={{ r: 5, fill: '#FBE38E' }}
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
