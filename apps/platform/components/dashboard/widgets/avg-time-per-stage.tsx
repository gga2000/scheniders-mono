"use client";

import { StageTimeMetric } from "@/lib/analytics/dashboard-calculations";
import { Timer } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { PeriodTag } from "@/components/dashboard/period-tag";

interface AvgTimePerStageProps {
    metrics: StageTimeMetric[];
    /** The header period whose orders the averages read. */
    periodLabel?: string;
}

function formatHours(hours: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
    if (hours === 0) return '—';
    if (hours < 1) return t("dashboard.avgTime.minutes", { n: Math.round(hours * 60) });
    if (hours < 24) return t("reports.unit.hours", { n: hours.toFixed(1) });
    return t("reports.unit.days", { n: (hours / 24).toFixed(1) });
}

const STAGE_COLORS = [
    { bar: 'var(--pastel-blue)',   text: 'text-blue-700',   bg: 'bg-blue-50'   },
    { bar: 'var(--pastel-yellow)', text: 'text-amber-700',  bg: 'bg-amber-50'  },
    { bar: 'var(--pastel-mint)',   text: 'text-teal-700',   bg: 'bg-teal-50'   },
];

// Map original English labels to i18n keys
const LABEL_KEYS: Record<string, string> = {
    // Exactly as get_dashboard_metrics spells them (ASCII arrow since the Sept migrations).
    'New -> Delivered (full cycle)': 'dashboard.avgTime.fullCycle',
    'Pending response (avg age)': 'dashboard.avgTime.pendingResponse',
    'In transit (avg wait)': 'dashboard.avgTime.inTransitWait',
};

export function AvgTimePerStage({ metrics, periodLabel }: AvgTimePerStageProps) {
    const maxHours = Math.max(1, ...metrics.map(m => m.avgHours));
    const { t } = useLanguage();

    return (
        <div className="pastel-card p-5 md:p-6 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)]/40 flex items-center justify-center">
                    <Timer className="w-4 h-4 text-blue-700" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-foreground">{t("dashboard.avgTime.title")}<PeriodTag label={periodLabel} /></h3>
                    <p className="text-xs text-muted">{t("dashboard.avgTime.subtitle")}</p>
                </div>
            </div>

            <div className="flex flex-col gap-4 flex-1 justify-center">
                {metrics.map((m, i) => {
                    const colors = STAGE_COLORS[i % STAGE_COLORS.length];
                    const pct = maxHours > 0 ? (m.avgHours / maxHours) * 100 : 0;
                    const translatedLabel = LABEL_KEYS[m.label] ? t(LABEL_KEYS[m.label]) : m.label;
                    return (
                        <div key={m.label} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted font-medium truncate pr-2">{translatedLabel}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <bdi className="text-sm font-bold text-foreground whitespace-nowrap">{formatHours(m.avgHours, t)}</bdi>
                                    <span className="text-[10px] text-muted whitespace-nowrap">{t("dashboard.avgTime.sample", { count: m.sampleSize })}</span>
                                    {/* DQ-D1: say when rows were dropped rather than
                                        letting the sample quietly shrink. */}
                                    {!!m.excluded && m.excluded > 0 && (
                                        <span
                                            className="text-[10px] text-amber-600"
                                            title={t("dashboard.avgTime.excludedTitle")}
                                        >
                                            {t("dashboard.avgTime.excluded", { count: m.excluded })}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {/* Progress bar */}
                            <div className="h-2 rounded-full bg-[var(--background)] overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${pct}%`,
                                        backgroundColor: colors.bar,
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="text-[10px] text-muted mt-4">
                <bdi>{t("dashboard.avgTime.disclaimer")}</bdi>
            </p>
        </div>
    );
}
