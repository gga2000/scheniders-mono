"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Layers } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useTrustScoreBreakdown, useTrustAuditLog } from "@/hooks/use-customer-trust";
import {
    buildScoreBreakdown, monthlyScoreSeries, type MonthlyScore, type ScoreFactor,
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

/** Horizontal guides of the history chart, on the 0–100 score scale. */
const GUIDES = [100, 50, 0] as const;

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
                <span className="text-sm text-muted-foreground truncate">{t("customers.trust.scoredFromThirdOrder")}</span>
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

/**
 * Monthly average score, one bar per calendar month (empty months stay as
 * gaps). Faint 0/50/100 guides give the scale; the first and the latest scored
 * months carry their value, any other shows it on hover. Bars are neutral: the
 * latest in ink, earlier months muted, at full opacity in both themes.
 */
function HistoryChart({ series, language, t }: { series: MonthlyScore[]; language: string; t: Translate }) {
    const scored = series.flatMap((m, i) => (m.score === null ? [] : [i]));
    const first = scored[0];
    const latest = scored[scored.length - 1];

    return (
        <figure aria-label={t("customers.trust.chartLabel")} className="flex gap-2">
            {/* Y scale */}
            <div className="relative h-48 w-7 shrink-0 text-[11px] text-muted-foreground tabular-nums" aria-hidden>
                {GUIDES.map((g) => (
                    <span key={g} className="absolute end-0 -translate-y-1/2 leading-none" style={{ top: `${100 - g}%` }}>{g}</span>
                ))}
            </div>
            <div className="flex-1 min-w-0">
                <div className="relative h-48">
                    {GUIDES.map((g) => (
                        <div
                            key={g}
                            aria-hidden
                            className={cn("absolute inset-x-0 border-t", g === 0 ? "border-(--card-border)" : "border-dashed border-(--card-border)/70")}
                            style={{ top: `${100 - g}%` }}
                        />
                    ))}
                    <ol className="absolute inset-0 flex items-end gap-2">
                        {series.map((m, i) => {
                            const month = formatMonthShort(m.month, language);
                            const labelled = i === first || i === latest;
                            return (
                                <li
                                    key={m.month}
                                    className="group relative flex-1 h-full flex flex-col justify-end"
                                    title={m.score === null ? month : `${month}: ${m.score}`}
                                >
                                    <span className="sr-only">{m.score === null ? `${month}: —` : `${month}: ${m.score}`}</span>
                                    {m.score !== null && (
                                        <>
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    "mb-1 text-center text-xs tabular-nums transition-opacity",
                                                    i === latest ? "font-bold text-foreground" : "font-medium text-muted-foreground",
                                                    labelled ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                                                )}
                                            >
                                                {m.score}
                                            </span>
                                            <motion.div
                                                aria-hidden
                                                className={cn(
                                                    "w-full rounded-t-[4px]",
                                                    // A neutral ramp, not a status colour: ink for the latest month, muted for the rest (amber means "Needs confirming").
                                                    i === latest ? "bg-foreground/85" : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50",
                                                )}
                                                initial={{ height: 0 }}
                                                animate={{ height: `${Math.max(m.score, 2)}%` }}
                                                transition={{ delay: i * 0.03, duration: 0.4, ease: "easeOut" }}
                                            />
                                        </>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </div>
                {/* Month names under their own bars; a two-word Iraqi month ("تشرين الثاني") wraps rather than clipping. */}
                <div className="flex gap-2 mt-2 text-[11px] font-medium leading-tight text-muted-foreground" aria-hidden>
                    {series.map((m) => (
                        <span key={m.month} className="flex-1 min-w-0 text-center">{formatMonthShort(m.month, language)}</span>
                    ))}
                </div>
                {/* Each bar is that month's average, so the latest bar can sit below today's score. */}
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
    }>;
    blocked: boolean;
    t: Translate;
}

function FactorsView({ breakdown, rated, raw, score, recentEvents, blocked, t }: FactorsViewProps) {
    if (!blocked && breakdown.length === 0 && recentEvents.length === 0) {
        return (
            <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
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
                    <p className="text-sm text-muted-foreground">
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
                                        <TrustEventDate date={evt.event_date} className="block text-xs text-muted-foreground" />
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
