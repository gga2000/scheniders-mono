"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

// Types
interface HourlyActivity {
    hour: number; // 0-23
    count: number;
}

interface PeakHoursHeatmapProps {
    data: HourlyActivity[];
    employeeName?: string;
    className?: string;
}

// Color scale based on activity count
function getHourColor(count: number, maxCount: number): string {
    if (count === 0) return "bg-gray-100";

    const intensity = Math.min(count / maxCount, 1);

    if (intensity >= 0.8) return "bg-blue-600 text-white";
    if (intensity >= 0.6) return "bg-blue-500 text-white";
    if (intensity >= 0.4) return "bg-blue-400";
    if (intensity >= 0.2) return "bg-blue-300";
    return "bg-blue-200";
}

// Format hour for display
function formatHour(hour: number): string {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
}

export function PeakHoursHeatmap({
    data,
    employeeName,
    className,
}: PeakHoursHeatmapProps) {
    const { t } = useLanguage();
    // Fill in missing hours with 0
    const filledData = useMemo(() => {
        const hourMap = new Map<number, number>();
        data.forEach((d) => hourMap.set(d.hour, d.count));

        return Array.from({ length: 24 }, (_, hour) => ({
            hour,
            count: hourMap.get(hour) || 0,
        }));
    }, [data]);

    // Find max count for color scaling
    const maxCount = useMemo(() => {
        return Math.max(...filledData.map((d) => d.count), 1);
    }, [filledData]);

    // Find peak hours
    const peakHours = useMemo(() => {
        return filledData
            .filter((d) => d.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .map((d) => ({
                ...d,
                label: formatHour(d.hour),
            }));
    }, [filledData]);

    // Calculate total and average
    const totalActivities = useMemo(() => {
        return filledData.reduce((sum, d) => sum + d.count, 0);
    }, [filledData]);

    // Group hours into periods
    const periods = useMemo(() => {
        return [
            {
                label: t("team.charts.earlyMorning"),
                hours: filledData.slice(0, 6),
                range: "12AM - 6AM",
            },
            {
                label: t("team.charts.morning"),
                hours: filledData.slice(6, 12),
                range: "6AM - 12PM",
            },
            {
                label: t("team.charts.afternoon"),
                hours: filledData.slice(12, 18),
                range: "12PM - 6PM",
            },
            {
                label: t("team.charts.evening"),
                hours: filledData.slice(18, 24),
                range: "6PM - 12AM",
            },
        ];
    }, [filledData, t]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("relative", className)}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <h3 className="font-bold text-foreground">{t("team.charts.peakHours")}</h3>
                    {employeeName && (
                        <span className="text-sm text-muted-foreground">
                            - {employeeName}
                        </span>
                    )}
                </div>
                <div className="text-sm text-muted-foreground">
                    {t("team.charts.activitiesPlural", { count: totalActivities.toLocaleString() })}
                </div>
            </div>

            {/* 24-hour grid - split into 4 periods */}
            <div className="space-y-3">
                {periods.map((period) => (
                    <div key={period.label} className="flex items-center gap-3">
                        {/* Period label */}
                        <div className="w-24 flex-shrink-0">
                            <p className="text-xs font-medium text-foreground">{period.label}</p>
                            <p className="text-[10px] text-muted-foreground">{period.range}</p>
                        </div>

                        {/* Hours */}
                        <div className="flex gap-1 flex-1">
                            {period.hours.map((hour, index) => (
                                <motion.div
                                    key={hour.hour}
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: index * 0.02 }}
                                    className={cn(
                                        "flex-1 h-8 rounded-lg flex flex-col items-center justify-center",
                                        "text-[10px] font-medium transition-all duration-200",
                                        "hover:ring-2 hover:ring-primary hover:ring-offset-1",
                                        getHourColor(hour.count, maxCount)
                                    )}
                                    title={t("team.charts.activityCountAtHour", { time: formatHour(hour.hour), count: hour.count.toString() })}
                                >
                                    <span className="hidden sm:block">{hour.hour}</span>
                                    {hour.count > 0 && (
                                        <span className="text-[8px] opacity-80">{hour.count}</span>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Peak hours summary */}
            {peakHours.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-xs font-medium text-blue-800 mb-2">
                        {t("team.charts.mostActiveHours")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {peakHours.map((peak, index) => (
                            <span
                                key={peak.hour}
                                className={cn(
                                    "px-2 py-1 rounded-lg text-xs font-medium",
                                    index === 0
                                        ? "bg-blue-600 text-white"
                                        : "bg-blue-200 text-blue-800"
                                )}
                            >
                                {peak.label} ({peak.count})
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-4">
                <span className="text-xs text-muted-foreground">{t("team.charts.less")}</span>
                <div className="flex gap-0.5">
                    <div className="w-4 h-4 rounded-sm bg-gray-100" />
                    <div className="w-4 h-4 rounded-sm bg-blue-200" />
                    <div className="w-4 h-4 rounded-sm bg-blue-300" />
                    <div className="w-4 h-4 rounded-sm bg-blue-400" />
                    <div className="w-4 h-4 rounded-sm bg-blue-500" />
                    <div className="w-4 h-4 rounded-sm bg-blue-600" />
                </div>
                <span className="text-xs text-muted-foreground">{t("team.charts.more")}</span>
            </div>
        </motion.div>
    );
}
