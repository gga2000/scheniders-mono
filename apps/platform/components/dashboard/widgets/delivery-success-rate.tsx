"use client";

import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";
import { DeliveryRateMetrics } from "@/lib/analytics/dashboard-calculations";
import { TrendingUp, TrendingDown, Minus, PackageCheck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface DeliverySuccessRateProps {
    metrics: DeliveryRateMetrics;
}

export function DeliverySuccessRate({ metrics }: DeliverySuccessRateProps) {
    const { currentRate, sparkline, trend } = metrics;
    const { t } = useLanguage();

    const hasData = currentRate !== null;
    const trendPositive = (trend ?? 0) > 0;
    const trendNeutral = trend === 0;
    const hasTrend = trend !== null;

    return (
        <div className="pastel-card pastel-card-mint p-5 flex flex-col gap-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-white/50 flex items-center justify-center">
                        <PackageCheck className="w-4 h-4 text-teal-700" />
                    </div>
                    <span className="text-xs font-bold text-teal-900/70 uppercase tracking-wider">{t("dashboard.deliveryRate.title")}</span>
                </div>

                {hasTrend && !trendNeutral && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        trendPositive ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                        {trendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {trendPositive ? '+' : ''}{trend}pp {t("dashboard.deliveryRate.vsLastWeek")}
                    </span>
                )}
                {hasTrend && trendNeutral && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                        <Minus className="w-3 h-3" />
                        {t("dashboard.deliveryRate.stable")}
                    </span>
                )}
            </div>

            {/* Big rate */}
            <div>
                <p className="text-4xl font-bold text-teal-950 tracking-tight leading-none">
                    {hasData ? `${currentRate}%` : '—'}
                </p>
                <p className="text-xs text-teal-800/60 mt-1">
                    {hasData ? t("dashboard.deliveryRate.formula") : t("dashboard.deliveryRate.noData")}
                </p>
            </div>

            {/* Sparkline */}
            <div className="h-14 -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkline} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                        <defs>
                            <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Tooltip
                            content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-2 py-1 text-xs shadow-lg">
                                        <span className="font-semibold">{label}: {payload[0]?.value}%</span>
                                    </div>
                                );
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="rate"
                            stroke="#14b8a6"
                            strokeWidth={2}
                            fill="url(#rateGrad)"
                            dot={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Day labels */}
            <div className="flex justify-between text-[10px] text-teal-800/50 -mt-1">
                {sparkline.map(s => <span key={s.day}>{s.day}</span>)}
            </div>
        </div>
    );
}
