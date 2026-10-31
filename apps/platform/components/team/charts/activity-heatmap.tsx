"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

// Types
interface DailyActivity {
    date: string; // YYYY-MM-DD
    count: number;
}

interface ActivityHeatmapProps {
    data: DailyActivity[];
    year?: number;
    onDayClick?: (date: string, count: number) => void;
    className?: string;
}

// Color scale based on activity count
function getActivityColor(count: number, maxCount: number): string {
    if (count === 0) return "bg-gray-100";

    const intensity = Math.min(count / maxCount, 1);

    if (intensity >= 0.8) return "bg-emerald-600";
    if (intensity >= 0.6) return "bg-emerald-500";
    if (intensity >= 0.4) return "bg-emerald-400";
    if (intensity >= 0.2) return "bg-emerald-300";
    return "bg-emerald-200";
}

export function ActivityHeatmap({
    data,
    year = new Date().getFullYear(),
    onDayClick,
    className,
}: ActivityHeatmapProps) {
    const { t } = useLanguage();

    const WEEKDAYS = [
        t("team.charts.sun"), t("team.charts.mon"), t("team.charts.tue"),
        t("team.charts.wed"), t("team.charts.thu"), t("team.charts.fri"), t("team.charts.sat")
    ];

    const MONTHS = [
        t("team.charts.jan"), t("team.charts.feb"), t("team.charts.mar"),
        t("team.charts.apr"), t("team.charts.may"), t("team.charts.jun"),
        t("team.charts.jul"), t("team.charts.aug"), t("team.charts.sep"),
        t("team.charts.oct"), t("team.charts.nov"), t("team.charts.dec")
    ];
    // Create a map of date -> count for quick lookup
    const activityMap = useMemo(() => {
        const map = new Map<string, number>();
        data.forEach((d) => map.set(d.date, d.count));
        return map;
    }, [data]);

    // Find max count for color scaling
    const maxCount = useMemo(() => {
        return Math.max(...data.map((d) => d.count), 1);
    }, [data]);

    // Generate all weeks for the year
    const weeks = useMemo(() => {
        const result: { date: Date; count: number }[][] = [];
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);

        // Adjust start to beginning of week (Sunday)
        const firstDay = startDate.getDay();
        startDate.setDate(startDate.getDate() - firstDay);

        let currentWeek: { date: Date; count: number }[] = [];
        const current = new Date(startDate);

        while (current <= endDate || currentWeek.length > 0) {
            const dateStr = current.toISOString().split("T")[0];
            const dayOfWeek = current.getDay();

            currentWeek.push({
                date: new Date(current),
                count: activityMap.get(dateStr) || 0,
            });

            if (dayOfWeek === 6) {
                result.push(currentWeek);
                currentWeek = [];
            }

            current.setDate(current.getDate() + 1);

            if (current > endDate && currentWeek.length === 0) break;
        }

        // Add remaining days
        if (currentWeek.length > 0) {
            result.push(currentWeek);
        }

        return result;
    }, [year, activityMap]);

    // Calculate month positions for labels
    const monthPositions = useMemo(() => {
        const positions: { month: number; weekIndex: number }[] = [];
        let lastMonth = -1;

        weeks.forEach((week, weekIndex) => {
            const firstDayOfWeek = week[0]?.date;
            if (firstDayOfWeek) {
                const month = firstDayOfWeek.getMonth();
                if (month !== lastMonth && firstDayOfWeek.getFullYear() === year) {
                    positions.push({ month, weekIndex });
                    lastMonth = month;
                }
            }
        });

        return positions;
    }, [weeks, year]);

    // Calculate total activities
    const totalActivities = useMemo(() => {
        return data.reduce((sum, d) => sum + d.count, 0);
    }, [data]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("relative", className)}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-primary" />
                    <h3 className="font-bold text-foreground">{t("team.charts.yearlyActivity")}</h3>
                </div>
                <div className="text-sm text-muted-foreground">
                    {t("team.charts.activitiesInYear", { count: totalActivities.toLocaleString(), year: year.toString() })}
                </div>
            </div>

            {/* Heatmap */}
            <div className="overflow-x-auto pb-2">
                <div className="inline-block min-w-full">
                    {/* Month labels */}
                    <div className="flex mb-1 mr-8">
                        {monthPositions.map(({ month, weekIndex }) => (
                            <div
                                key={`${month}-${weekIndex}`}
                                className="text-xs text-muted-foreground"
                                style={{
                                    position: "absolute",
                                    left: `${weekIndex * 14 + 32}px`,
                                }}
                            >
                                {MONTHS[month]}
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-1 mt-6">
                        {/* Weekday labels */}
                        <div className="flex flex-col gap-1 mr-1">
                            {WEEKDAYS.map((day, i) => (
                                <div
                                    key={day}
                                    className={cn(
                                        "h-3 w-6 text-[9px] text-muted-foreground flex items-center",
                                        i % 2 === 0 ? "opacity-100" : "opacity-0"
                                    )}
                                >
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Weeks grid */}
                        <div className="flex gap-1">
                            {weeks.map((week, weekIndex) => (
                                <div key={weekIndex} className="flex flex-col gap-1">
                                    {week.map((day, dayIndex) => {
                                        const dateStr = day.date.toISOString().split("T")[0];
                                        const isCurrentYear = day.date.getFullYear() === year;

                                        return (
                                            <motion.div
                                                key={dateStr}
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{
                                                    delay: (weekIndex * 7 + dayIndex) * 0.001,
                                                }}
                                                onClick={() =>
                                                    isCurrentYear &&
                                                    onDayClick?.(dateStr, day.count)
                                                }
                                                className={cn(
                                                    "w-3 h-3 rounded-sm transition-all duration-200",
                                                    isCurrentYear
                                                        ? getActivityColor(day.count, maxCount)
                                                        : "bg-transparent",
                                                    isCurrentYear &&
                                                    day.count > 0 &&
                                                    "cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-1"
                                                )}
                                                title={
                                                    isCurrentYear
                                                        ? t("team.charts.activityCountOnDate", { date: dateStr, count: day.count.toString() })
                                                        : ""
                                                }
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-4">
                <span className="text-xs text-muted-foreground">{t("team.charts.less")}</span>
                <div className="flex gap-0.5">
                    <div className="w-3 h-3 rounded-sm bg-gray-100" />
                    <div className="w-3 h-3 rounded-sm bg-emerald-200" />
                    <div className="w-3 h-3 rounded-sm bg-emerald-300" />
                    <div className="w-3 h-3 rounded-sm bg-emerald-400" />
                    <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                    <div className="w-3 h-3 rounded-sm bg-emerald-600" />
                </div>
                <span className="text-xs text-muted-foreground">{t("team.charts.more")}</span>
            </div>
        </motion.div>
    );
}
