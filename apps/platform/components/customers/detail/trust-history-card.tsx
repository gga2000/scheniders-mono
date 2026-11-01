"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Layers } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useTrustScoreBreakdown, useTrustAuditLog } from "@/hooks/use-customer-trust";
import {
    buildScoreBreakdown, monthlyScoreSeries, historyAxisFloor, type MonthlyScore, type ScoreFactor,
} from "@/lib/customer-reliability";
import { ScoreFactorBars } from "@/components/customers/detail/score-factor-bars";
import { ScoreTotalRow } from "@/components/customers/detail/score-total-row";
import { formatMonthShort } from "@/lib/customer-format";
import { TrustEventIcon } from "@/components/customers/detail/trust-event-icon";
import { TrustEventDate } from "@/components/customers/detail/trust-event-date";
import { cn } from "@/lib/utils";

interface TrustHistoryCardProps {
    data: { month: string; avg_score: number; event_count: number }[];
    phone: string;
    /** The stored trust score, the total the factors add up to (as on the hero and in the breakdown). */
    score: number | null;
    /** From isBlockedCustomer: no score, no factors and no score history, only the "not scored" note. */
    blocked: boolean;
    /** From showsTrustScore, the hero's rule: without a shown score there is no monthly score history either. */
    scored: boolean;
}

type ViewMode = "history" | "factors";
type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function TrustHistoryCard({ data, phone, score, blocked, scored }: TrustHistoryCardProps) {
    const { t, language } = useLanguage();
    const [period, setPeriod] = useState<6 | 12>(12);

    const { data: breakdownData } = useTrustScoreBreakdown(phone);
    // The same factors as the score-breakdown modal: zeros dropped, the gap to the stored score closed.
    const { factors: breakdown, raw, score: shownScore } = buildScoreBreakdown(breakdownData?.items ?? [], {
        storedScore: score, blocked, tier: breakdownData?.tier ?? null,
    });
    const { data: auditData } = useTrustAuditLog(phone, 5);
    const recentEvents = auditData?.events ?? [];

    // Monthly scores for a blocked or unrated customer would bring back the score the hero hides.
    const hasHistory = data.length > 0 && scored;
    const hasFactors = breakdown.length > 0 || recentEvents.length > 0 || blocked;

    // History leads once there is any; a choice the user made sticks while it still has data.
    const [chosenView, setChosenView] = useState<ViewMode | null>(null);
    const view: ViewMode = chosenView === "history" && hasHistory ? "history"
        : chosenView === "factors" && hasFactors ? "factors"
        : hasHistory ? "history" : "factors";

    const series = useMemo(() => monthlyScoreSeries(data, period), [data, period]);

    // Not scored yet and nothing has happened: one line, like the Ratings strip, never a
    // card of empty bars (an unscored bar drawn full width reads as a full score).
    if (!blocked && !scored && !hasHistory && recentEvents.length === 0) {
        return (
            <div className="bg-(--card-bg) rounded-2xl border border-(--card-border) px-5 h-14 flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-foreground shrink-0" />
                <span className="font-semibold text-sm text-foreground whitespace-nowrap">{t("customers.trust.factors")}</span>
                <span className="text-sm text-muted-foreground" aria-hidden>·</span>
                {/* dir="auto": the Arabic sentence keeps its full stop at its end. */}
                <span dir="auto" className="text-sm text-muted-foreground truncate">{t("customers.trust.scoredFromThirdOrder")}</span>
            </div>
        );
    }

    const toggleCls = (active: boolean, enabled: boolean) => cn(
        "relative px-3 py-1.5 rounded-full text-xs font-bold transition-colors",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
        !enabled && "opacity-40 cursor-not-allowed",
    );

    return (
        <div className="bg-(--card-bg) rounded-2xl p-6 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col justify-start h-full min-h-[280px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    {view === "history" ? (
                        <BarChart3 className="w-5 h-5 text-foreground" />
                    ) : (
                        <Layers className="w-5 h-5 text-foreground" />
                    )}
                    <span className="font-headline font-extrabold text-lg leading-none">
                        {view === "history" ? t("customers.trust.history") : t("customers.trust.factors")}
                    </span>
                </div>

                {/* View toggle (history vs factors); a blocked customer has no score history to show */}
                {!blocked && (
                    <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-full">
                        <button onClick={() => setChosenView("history")} disabled={!hasHistory} aria-pressed={view === "history"} className={toggleCls(view === "history", hasHistory)}>
                            {t("customers.trust.viewHistory")}
                        </button>
                        <button onClick={() => setChosenView("factors")} disabled={!hasFactors} aria-pressed={view === "factors"} className={toggleCls(view === "factors", hasFactors)}>
                            {t("customers.trust.viewFactors")}
                        </button>
                    </div>
                )}

                {/* Period toggle — only meaningful in history mode */}
                {view === "history" && (
                    <div className="flex items-center gap-1">
                        {([6, 12] as const).map((p) => (
                            <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p} className="relative">
                                {period === p && (
                                    <motion.div
                                        layoutId="trust-history-period-pill"
                                        className="absolute inset-0 bg-foreground rounded-full"
                                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                    />
                                )}
                                <span
                                    className={cn(
                                        "relative z-10 block px-4 py-1.5 rounded-full text-xs font-bold transition-colors",
                                        period === p ? "text-background" : "bg-muted/30 text-muted-foreground"
                                    )}
                                >
                                    {p === 6 ? t("customers.trust.6Month") : t("customers.trust.1Year")}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={view}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                >
                    {view === "history" ? (
                        <HistoryChart series={series} language={language} t={t} />
                    ) : (
                        <FactorsView breakdown={breakdown} rated={scored && score !== null} raw={raw} score={shownScore} recentEvents={recentEvents} blocked={blocked} t={t} />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

/** Thin diagonal stripes in the ink colour at low strength, over a faint wash of it. */
const UNSCORED_HATCH = [
    "repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) 14%, transparent) 0 1px, transparent 1px 7px)",
    "linear-gradient(color-mix(in oklab, var(--foreground) 4%, transparent), color-mix(in oklab, var(--foreground) 4%, transparent))",
].join(", ");

/**
 * Monthly average score as a line over calendar months, oldest first. The axis
 * starts at 50 while every shown month is at 50 or more, so steady scores read
 * as a level line high on the chart, not as identical full bars from zero; it
 * starts at 0 once a month falls below 50. Months before the first score are
 * one labelled "Not scored yet" span; a quiet month later on is a dashed join.
 * The first and the latest scored months carry their value, any other shows
 * it on hover. Neutral ink in both themes: the latest point solid, the rest muted.
 */
function HistoryChart({ series, language, t }: { series: MonthlyScore[]; language: string; t: Translate }) {
    const scored = series.flatMap((m, i) => (m.score === null ? [] : [i]));
    const first = scored[0];
    const latest = scored[scored.length - 1];
    const floor = historyAxisFloor(series);
    const guides = [100, (100 + floor) / 2, floor];
    const count = series.length;
    // Percent from the left for a month's centre, from the top for a score.
    const x = (i: number) => ((i + 0.5) / count) * 100;
    const y = (score: number) => 100 - ((score - floor) / (100 - floor)) * 100;
    const unscoredMonths = first ?? count;
    const segments = scored.slice(1).map((b, k) => ({ a: scored[k], b }));
    const scoreAt = (i: number) => series[i].score ?? floor;

    return (
        // pt-5: room above the 100 line for the latest point's label, so a peak value never
        // crowds the period toggle above the chart.
        <figure aria-label={t("customers.trust.chartLabel")} className="flex gap-2 pt-5">
            {/* Y scale */}
            <div className="relative h-48 w-7 shrink-0 text-[11px] text-muted-foreground tabular-nums" aria-hidden>
                {guides.map((g) => (
                    <span key={g} className="absolute end-0 -translate-y-1/2 leading-none" style={{ top: `${y(g)}%` }}>{g}</span>
                ))}
            </div>
            <div className="flex-1 min-w-0">
                <div className="relative h-48">
                    {guides.map((g) => (
                        <div
                            key={g}
                            aria-hidden
                            className={cn("absolute inset-x-0 border-t", g === floor ? "border-(--card-border)" : "border-dashed border-(--card-border)/70")}
                            style={{ top: `${y(g)}%` }}
                        />
                    ))}
                    {/* The months before the first score: said once, not left blank. A hatch mixed from the
                        ink reads as "no data" on the white light card and the dark card alike; the
                        caption sits on a card-coloured chip so the stripes never run through it. */}
                    {unscoredMonths > 0 && (
                        <div
                            aria-hidden
                            data-unscored
                            className="absolute inset-y-0 left-0 flex items-center justify-center rounded-lg border border-dashed border-(--card-border) px-2"
                            style={{ width: `${(unscoredMonths / count) * 100}%`, backgroundImage: UNSCORED_HATCH }}
                        >
                            <span className="rounded-full bg-(--card-bg) px-2 py-0.5 text-center text-xs font-medium leading-tight text-muted-foreground">{t("customers.trust.notScored")}</span>
                        </div>
                    )}
                    <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible text-muted-foreground" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {segments.map(({ a, b }) => (
                            <line
                                key={`${a}-${b}`}
                                x1={x(a)} y1={y(scoreAt(a))} x2={x(b)} y2={y(scoreAt(b))}
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeDasharray={b === a + 1 ? undefined : "4 4"}
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}
                    </svg>
                    <ol className="absolute inset-0">
                        {series.map((m, i) => {
                            const month = formatMonthShort(m.month, language);
                            const value = m.score === null
                                ? (i < unscoredMonths ? t("customers.trust.notScored") : "—")
                                : String(m.score);
                            const labelled = i === first || i === latest;
                            return (
                                <li
                                    key={m.month}
                                    className="group absolute inset-y-0"
                                    style={{ left: `${(i / count) * 100}%`, width: `${100 / count}%` }}
                                    title={`${month}: ${value}`}
                                >
                                    <span className="sr-only">{`${month}: ${value}`}</span>
                                    {m.score !== null && (
                                        <span aria-hidden className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: `${y(m.score)}%` }}>
                                            <span
                                                className={cn(
                                                    "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-xs tabular-nums transition-opacity",
                                                    i === latest ? "font-bold text-foreground" : "font-medium text-muted-foreground",
                                                    labelled ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                                                )}
                                            >
                                                {m.score}
                                            </span>
                                            <span
                                                className={cn(
                                                    "block rounded-full ring-2 ring-(--card-bg)",
                                                    i === latest ? "size-3 bg-foreground" : "size-2.5 bg-muted-foreground group-hover:bg-foreground/70",
                                                )}
                                            />
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </div>
                {/* Month names under their own points; a two-word Iraqi month ("تشرين الثاني") wraps rather than clipping. */}
                <div className="flex mt-2 text-[11px] font-medium leading-tight text-muted-foreground" aria-hidden>
                    {series.map((m) => (
                        <span key={m.month} className="flex-1 min-w-0 px-0.5 text-center">{formatMonthShort(m.month, language)}</span>
                    ))}
                </div>
                {/* Each point is that month's average, so the latest can sit below today's score. */}
                <figcaption className="mt-3 text-xs text-muted-foreground">{t("customers.trust.monthlyAverage")}</figcaption>
            </div>
        </figure>
    );
}

interface FactorsViewProps {
    breakdown: ScoreFactor[];
    /** False for a customer without a rated score yet: the bars are shown greyed, without points. */
    rated: boolean;
    /** What the factors add up to before the 0–100 cap, and the shown score (buildScoreBreakdown). */
    raw: number;
    score: number;
    recentEvents: Array<{
        id: string;
        event_date: string;
        event_type: string;
        score_change: number;
        reason: string | null;
        order_id: string | null;
    }>;
    blocked: boolean;
    t: Translate;
}

function FactorsView({ breakdown, rated, raw, score, recentEvents, blocked, t }: FactorsViewProps) {
    if (!blocked && breakdown.length === 0 && recentEvents.length === 0) {
        return (
            <div className="py-8 text-center">
                <p dir="auto" className="text-sm text-muted-foreground">
                    {t("customers.trust.factorsEmpty")}
                </p>
            </div>
        );
    }

    // "Recent events" takes a column only when there are events; otherwise the breakdown spans the card.
    const showEvents = recentEvents.length > 0;

    return (
        <div className={cn("grid grid-cols-1 gap-6", showEvents && "md:grid-cols-2")}>
            {/* Score breakdown */}
            <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">
                    {t("customers.trust.factorsBreakdown")}
                </p>
                {blocked ? (
                    <p dir="auto" className="text-left text-sm text-muted-foreground">
                        {t("customers.scoreBreakdown.notScored")}
                    </p>
                ) : breakdown.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        {t("customers.trust.noFactors")}
                    </p>
                ) : (
                    <div className="space-y-2">
                        <ScoreFactorBars factors={breakdown} rated={rated} />
                        {/* The modal's total, so the card and "See breakdown" agree on what the bars add up to. */}
                        {rated && <ScoreTotalRow score={score} raw={raw} size="sm" />}
                    </div>
                )}
            </div>

            {showEvents && (
                <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-3">
                        {t("customers.trust.recentEvents")}
                    </p>
                    <ul className="space-y-2">
                        {recentEvents.slice(0, 5).map((evt) => {
                            const sign = Math.sign(evt.score_change);
                            return (
                                <li key={evt.id} className="flex items-start gap-2.5">
                                    <TrustEventIcon eventType={evt.event_type} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-foreground truncate">
                                            {t(`customers.trust.event.${evt.event_type}`)}
                                        </p>
                                        <TrustEventDate date={evt.event_date} orderId={evt.order_id} className="block text-xs text-muted-foreground truncate" />
                                    </div>
                                    {/* A blocked customer's points are not shown anywhere. */}
                                    {evt.score_change !== 0 && !blocked && (
                                        <span
                                            className={cn(
                                                "text-xs font-bold tabular-nums shrink-0",
                                                sign > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                                            )}
                                        >
                                            {sign > 0 ? "+" : ""}
                                            {evt.score_change}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
