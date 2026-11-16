"use client";

import { ChevronRight } from "lucide-react";
import type { DateRangeKey, PipelineStage } from "@/lib/analytics/dashboard-calculations";
import { useLanguage } from "@/hooks/use-language";

/** Below this share of the bar (about 40 px at 1440) a segment shows no count or label. */
const MIN_LABELLED_PCT = 6;
/** The stage get_dashboard_metrics fills with every order outside the five named stages. */
const OTHER_STAGE = "other";

interface OrderPipelineProps {
    stages: PipelineStage[];
    /** The dashboard period the stages were counted over: orders created in it, by their status now. */
    period: DateRangeKey;
    onStageClick?: (status: string) => void;
}

export function OrderPipeline({ stages, period, onStageClick }: OrderPipelineProps) {
    const { t } = useLanguage();
    const total = stages.reduce((s, stage) => s + stage.count, 0);

    // Map pipeline labels to translation keys
    const PIPELINE_LABELS: Record<string, string> = {
        'new': t("dashboard.pipeline.new"),
        'contacted': t("dashboard.pipeline.contacted"),
        'confirmed': t("dashboard.pipeline.confirmed"),
        'in_transit': t("dashboard.pipeline.inTransit"),
        'delivered': t("dashboard.pipeline.delivered"),
        'other': t("dashboard.pipeline.other"),
    };

    const getLabel = (stage: PipelineStage) => PIPELINE_LABELS[stage.status] ?? stage.label;
    // 'other' gathers several statuses (cancelled, rejected, returned, no answer): no one Orders filter shows it.
    const isOther = (stage: PipelineStage) => stage.status === OTHER_STAGE;
    const openStage = (stage: PipelineStage) => {
        if (!isOther(stage)) onStageClick?.(stage.status);
    };
    const stageTitle = (stage: PipelineStage) =>
        isOther(stage)
            ? t("dashboard.pipeline.otherHint", { count: stage.count })
            : `${getLabel(stage)}: ${stage.count} ${t("dashboard.pipeline.orders")}`;

    return (
        <div className="pastel-card p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-muted uppercase tracking-widest">{t("dashboard.pipeline.title")}</h3>
                {/* Names its period: Orders' «قيد التوصيل» counts every day, this bar only the dashboard's period.
                    The stages hold every order of the period, so this total matches the orders card. */}
                <bdi className="text-xs text-muted" title={t("dashboard.pipeline.scopeHint")}>
                    {t("dashboard.pipeline.periodTotal", { count: total, period: t(`dashboard.pipeline.period.${period}`) })}
                </bdi>
            </div>

            {/* Desktop: proportional bar */}
            <div className="hidden md:flex items-stretch gap-0 rounded-xl overflow-hidden h-14">
                {stages.map((stage, i) => {
                    // VIS-D2: this used to floor every segment at 10% of the bar, so a
                    // stage with ZERO orders rendered as wide as one holding 10% of the
                    // book — the bar stopped encoding the data it claims to show. Widths
                    // are now the true proportion; a hairline minimum keeps an empty
                    // stage visible as a divider, and the legend row below always lists
                    // every stage with its count, so nothing is lost when a segment is
                    // too narrow for its label.
                    const pct = total > 0 ? (stage.count / total) * 100 : 0;
                    const width = pct;
                    return (
                        <div
                            key={stage.status}
                            className={`relative flex flex-col items-center justify-center gap-0.5 overflow-hidden transition-all ${isOther(stage) ? "" : "cursor-pointer hover:brightness-95 active:scale-95"} ${i > 0 ? "border-l border-white/40" : ""}`}
                            style={{ flexBasis: `${width}%`, minWidth: '2px', background: stage.color }}
                            onClick={() => openStage(stage)}
                            title={stageTitle(stage)}
                        >
                            {/* A sliver cannot hold its words: they spilled over the next segment. The legend below names it. */}
                            {pct >= MIN_LABELLED_PCT && (
                                <>
                                    <span className="text-xs font-bold leading-none" style={{ color: stage.textColor }}>{stage.count}</span>
                                    <span className="text-[10px] font-semibold leading-none opacity-70 truncate px-1 max-w-full" style={{ color: stage.textColor }}>{getLabel(stage)}</span>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Mobile: stacked list */}
            <div className="flex flex-col gap-2 md:hidden">
                {stages.map((stage) => {
                    const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0;
                    return (
                        <div
                            key={stage.status}
                            className={`flex items-center gap-3 ${isOther(stage) ? "" : "cursor-pointer"}`}
                            onClick={() => openStage(stage)}
                            title={stageTitle(stage)}
                        >
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
                            <span className="text-sm text-foreground font-medium flex-1">{getLabel(stage)}</span>
                            <div className="flex-1 bg-[var(--background)] rounded-full h-2 overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${pct}%`, background: stage.color }}
                                />
                            </div>
                            <span className="text-sm font-bold text-foreground w-8 text-right">{stage.count}</span>
                        </div>
                    );
                })}
            </div>

            {/* Legend row (desktop only) */}
            <div className="hidden md:flex items-center gap-4 mt-3 flex-wrap">
                {stages.map((stage) =>
                    isOther(stage) ? (
                        <span key={stage.status} className="flex items-center gap-1.5 text-xs text-muted" title={stageTitle(stage)}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
                            <span>{getLabel(stage)}</span>
                        </span>
                    ) : (
                        <button
                            key={stage.status}
                            className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
                            onClick={() => openStage(stage)}
                        >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
                            <span>{getLabel(stage)}</span>
                            <ChevronRight className="w-3 h-3 opacity-50" />
                        </button>
                    ),
                )}
            </div>
        </div>
    );
}
