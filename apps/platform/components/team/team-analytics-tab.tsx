"use client";

import { useState } from "react";
import { Clock, LayoutGrid, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@scheniders/ui/skeletons";
import { useLanguage } from "@/hooks/use-language";
import type { TeamTimeRange } from "@/lib/team-time-window";
import { PerformanceTrendsChart } from "./charts/performance-trends-chart";
import { ActionBreakdownChart } from "./charts/action-breakdown-chart";
import { PeakHoursHeatmap } from "./charts/peak-hours-heatmap";
import type { TeamInsights } from "@/lib/team-insights";

type ChartView = "trends" | "breakdown" | "hours";

const CHARTS: { key: ChartView; icon: React.ElementType; labelKey: string }[] = [
    { key: "trends", icon: TrendingUp, labelKey: "team.charts.trends" },
    { key: "breakdown", icon: LayoutGrid, labelKey: "team.charts.breakdown" },
    { key: "hours", icon: Clock, labelKey: "team.charts.peakHours" },
];

interface TeamAnalyticsTabProps {
    range: TeamTimeRange;
    insights: TeamInsights | null;
    loading: boolean;
    failed: boolean;
    className?: string;
}

/** Team-wide charts for the chosen window, from counts made in the database. */
export function TeamAnalyticsTab({ range, insights, loading, failed, className }: TeamAnalyticsTabProps) {
    const { t } = useLanguage();
    const [activeChart, setActiveChart] = useState<ChartView>("trends");

    return (
        <section className={cn("bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 rounded-3xl p-6", className)}>
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-[#1E1E1E] dark:text-white">{t("team.analytics.title")}</h2>
                    <p className="text-sm text-[#6B6B6B] dark:text-gray-400 mt-0.5">{t(`team.analytics.window.${range}`)}</p>
                </div>

                <div role="tablist" className="flex bg-[#FAF8F5] dark:bg-white/5 border border-[#E8E4DC] dark:border-white/10 p-1 rounded-xl">
                    {CHARTS.map((chart) => (
                        <button
                            key={chart.key}
                            type="button"
                            role="tab"
                            aria-selected={activeChart === chart.key}
                            onClick={() => setActiveChart(chart.key)}
                            className={cn(
                                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap",
                                activeChart === chart.key
                                    ? "bg-white dark:bg-[#1A1A1A] text-[#1E1E1E] dark:text-white shadow-sm"
                                    : "text-[#6B6B6B] dark:text-gray-400 hover:text-[#1E1E1E] dark:hover:text-white",
                            )}
                        >
                            <chart.icon className="w-4 h-4" aria-hidden="true" />
                            {t(chart.labelKey)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-[340px]">
                {failed ? (
                    <p className="py-24 text-center text-sm text-[#6B6B6B] dark:text-gray-400">{t("team.analytics.loadFailed")}</p>
                ) : loading || !insights ? (
                    <Skeleton className="h-[320px] rounded-2xl" />
                ) : insights.byDay.every((d) => d.totalActions === 0) ? (
                    <div className="py-24 text-center">
                        <p className="text-base font-semibold text-[#1E1E1E] dark:text-white">{t("team.analytics.emptyTitle")}</p>
                        <p className="mt-1 text-sm text-[#6B6B6B] dark:text-gray-400 max-w-md mx-auto">{t("team.analytics.emptyBody")}</p>
                    </div>
                ) : activeChart === "trends" ? (
                    <PerformanceTrendsChart
                        data={insights.byDay}
                        showMetrics={["totalActions", "ordersCreated", "statusChanges"]}
                        height={320}
                    />
                ) : activeChart === "breakdown" ? (
                    <ActionBreakdownChart data={insights.byAction} />
                ) : (
                    <PeakHoursHeatmap data={insights.byHour} />
                )}
            </div>
        </section>
    );
}
