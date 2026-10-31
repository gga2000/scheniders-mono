"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface HourlyActivity {
    hour: number; // 0-23, Baghdad time
    count: number;
}

interface PeakHoursHeatmapProps {
    data: HourlyActivity[];
    employeeName?: string;
    className?: string;
}

/** "9 AM" / "9 ص": a Baghdad clock hour in the reader's language, Latin digits. */
function formatHour(hour: number, language: string): string {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    if (language === "ar") return `${h12} ${hour < 12 ? "ص" : "م"}`;
    return `${h12} ${hour < 12 ? "AM" : "PM"}`;
}

/** Activity per clock hour as 24 bars; the three busiest hours are drawn in ink. */
export function PeakHoursHeatmap({ data, employeeName, className }: PeakHoursHeatmapProps) {
    const { t, language } = useLanguage();

    const hours = useMemo(() => {
        const byHour = new Map(data.map((d) => [d.hour, d.count]));
        return Array.from({ length: 24 }, (_, hour) => ({ hour, count: byHour.get(hour) ?? 0 }));
    }, [data]);
    const max = Math.max(1, ...hours.map((h) => h.count));
    const total = hours.reduce((s, h) => s + h.count, 0);
    const peaks = useMemo(
        () => hours.filter((h) => h.count > 0).sort((a, b) => b.count - a.count).slice(0, 3),
        [hours],
    );
    const peakSet = new Set(peaks.map((p) => p.hour));

    if (total === 0) {
        return <p className={cn("py-20 text-center text-sm text-[#6B6B6B] dark:text-gray-400", className)}>{t("team.charts.noData")}</p>;
    }

    return (
        <div className={className}>
            <div className="flex items-baseline justify-between gap-3 mb-4">
                <p className="text-sm text-[#1E1E1E] dark:text-white">
                    <span className="font-semibold">{t("team.charts.mostActiveHours")}</span>{" · "}
                    {peaks.map((p, i) => (
                        <span key={p.hour}>
                            {i > 0 && "، "}
                            <bdi className="tabular-nums">{formatHour(p.hour, language)}</bdi>
                        </span>
                    ))}
                    {employeeName && <span className="text-[#6B6B6B] dark:text-gray-400"> · <bdi>{employeeName}</bdi></span>}
                </p>
                <p className="text-xs text-[#6B6B6B] dark:text-gray-400 tabular-nums">
                    {t("team.charts.activitiesPlural", { count: total.toLocaleString("en-US") })}
                </p>
            </div>

            <div className="flex items-end gap-1 h-48" role="img" aria-label={t("team.charts.peakHours")}>
                {hours.map((h) => (
                    <div key={h.hour} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
                        <span
                            title={t("team.charts.activityCountAtHour", { time: formatHour(h.hour, language), count: h.count.toString() })}
                            className={cn(
                                "w-full rounded-t-md",
                                h.count === 0 ? "bg-[#F0ECE4] dark:bg-white/5" : peakSet.has(h.hour) ? "bg-[#1E1E1E] dark:bg-white" : "bg-[#C9C3B8] dark:bg-white/30",
                            )}
                            style={{ height: `${Math.max(3, Math.round((h.count / max) * 100))}%` }}
                        />
                    </div>
                ))}
            </div>
            <div className="flex gap-1 mt-2 text-[10px] text-[#9A9A9A] dark:text-gray-500 tabular-nums">
                {hours.map((h) => (
                    <span key={h.hour} className="flex-1 text-center">{h.hour % 3 === 0 ? h.hour : ""}</span>
                ))}
            </div>
        </div>
    );
}
