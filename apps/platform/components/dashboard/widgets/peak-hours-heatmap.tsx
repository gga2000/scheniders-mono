"use client";

import { HeatmapCell } from "@/lib/analytics/dashboard-calculations";
import { useState } from "react";
import { Flame } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_AR = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) =>
    h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`
);

interface PeakHoursHeatmapProps {
    data: HeatmapCell[];
}

export function PeakHoursHeatmap({ data }: PeakHoursHeatmapProps) {
    const [tooltip, setTooltip] = useState<{ day: number; hour: number; count: number } | null>(null);
    const { t, language } = useLanguage();
    const isAr = language === 'ar';
    const dayLabels = isAr ? DAYS_AR : DAYS;

    const cellMap = new Map<string, HeatmapCell>();
    data.forEach(c => cellMap.set(`${c.dayOfWeek}-${c.hour}`, c));

    const peakCell = data.length > 0 ? data.reduce((best, c) => c.count > best.count ? c : best, data[0]) : null;

    return (
        <div className="pastel-card p-5 md:p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[var(--pastel-purple)]/40 flex items-center justify-center">
                        <Flame className="w-4 h-4 text-purple-700" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-foreground">{t("dashboard.heatmap.title")}</h3>
                        <p className="text-xs text-muted">
                            {t("dashboard.heatmap.busiest")} {peakCell && peakCell.count > 0 ? `${dayLabels[peakCell.dayOfWeek]} ${HOUR_LABELS[peakCell.hour]} (${peakCell.count})` : '—'}
                        </p>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span>{t("dashboard.heatmap.less")}</span>
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
                        <div
                            key={v}
                            className="w-3 h-3 rounded-sm"
                            style={{ backgroundColor: `rgba(168, 85, 247, ${v})` }}
                        />
                    ))}
                    <span>{t("dashboard.heatmap.more")}</span>
                </div>
            </div>

            {/* Heatmap grid */}
            <div className="flex-1 overflow-x-auto">
                <div className="min-w-[560px]">
                    {/* Hour headers — show every 3 hours */}
                    <div className="flex mb-1 ml-8">
                        {HOUR_LABELS.map((label, h) => (
                            <div key={h} className="flex-1 text-center">
                                {h % 3 === 0 && (
                                    <span className="text-[9px] text-muted">{label}</span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Day rows */}
                    {dayLabels.map((day, dayIdx) => (
                        <div key={day} className="flex items-center mb-0.5 gap-1">
                            <span className="w-7 text-[10px] text-muted text-right shrink-0">{day}</span>
                            <div className="flex flex-1 gap-0.5">
                                {HOUR_LABELS.map((_, hourIdx) => {
                                    const cell = cellMap.get(`${dayIdx}-${hourIdx}`);
                                    const intensity = cell?.intensity ?? 0;
                                    const count = cell?.count ?? 0;
                                    return (
                                        <div
                                            key={hourIdx}
                                            className="flex-1 h-5 rounded-sm cursor-pointer transition-all hover:ring-1 hover:ring-purple-400"
                                            style={{
                                                backgroundColor: intensity > 0
                                                    ? `rgba(168, 85, 247, ${0.08 + intensity * 0.85})`
                                                    : 'var(--background)',
                                                border: '1px solid var(--card-border)',
                                            }}
                                            onMouseEnter={() => setTooltip({ day: dayIdx, hour: hourIdx, count })}
                                            onMouseLeave={() => setTooltip(null)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Tooltip — height reserved so hovering never reflows the grid */}
            <div className="mt-2 h-5 leading-5 text-xs text-center text-muted">
                {tooltip && (
                    <>
                        <span className="font-semibold text-foreground">{dayLabels[tooltip.day]}</span> {t("dashboard.heatmap.at")}{' '}
                        <span className="font-semibold text-foreground">{HOUR_LABELS[tooltip.hour]}</span>
                        {' '}— <span className="font-semibold text-foreground">{tooltip.count} {t("dashboard.heatmap.orders")}</span>
                    </>
                )}
            </div>
        </div>
    );
}
