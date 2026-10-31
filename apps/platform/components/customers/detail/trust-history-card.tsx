"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    BarChart3,
    Layers,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Star,
    Pencil,
    User as UserIcon,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useTrustScoreBreakdown, useTrustAuditLog } from "@/hooks/use-customer-trust";
import { cn } from "@/lib/utils";

interface TrustHistoryCardProps {
    data: { month: string; avg_score: number; event_count: number }[];
    phone: string;
}

type ViewMode = "history" | "factors";

const EVENT_ICONS: Record<string, React.ElementType> = {
    order_delivered: CheckCircle2,
    order_rejected: XCircle,
    order_cancelled: AlertCircle,
    order_no_response: AlertCircle,
    order_refund: XCircle,
    community_rating: Star,
    admin_override: Pencil,
    rejection_edit: Pencil,
};

function eventIconColor(deltaSign: number): string {
    if (deltaSign > 0) return "text-emerald-600 bg-emerald-50";
    if (deltaSign < 0) return "text-rose-600 bg-rose-50";
    return "text-muted-foreground bg-muted/40";
}

function relativeTime(iso: string, lang: "en" | "ar"): string {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return lang === "ar" ? "الآن" : "just now";
    if (m < 60) return lang === "ar" ? `قبل ${m} د` : `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return lang === "ar" ? `قبل ${h} س` : `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return lang === "ar" ? `قبل ${d} ي` : `${d}d ago`;
    const mo = Math.floor(d / 30);
    return lang === "ar" ? `قبل ${mo} شهر` : `${mo}mo ago`;
}

export function TrustHistoryCard({ data, phone }: TrustHistoryCardProps) {
    const { t, language } = useLanguage();
    const [period, setPeriod] = useState<6 | 12>(12);

    const { data: breakdown = [] } = useTrustScoreBreakdown(phone);
    const { data: auditData } = useTrustAuditLog(phone, 5);
    const recentEvents = auditData?.events ?? [];

    const hasHistory = data.length > 0;
    const hasFactors = breakdown.length > 0 || recentEvents.length > 0;

    // Default to whichever has data; prefer history when both exist
    const [view, setView] = useState<ViewMode>(hasHistory ? "history" : "factors");

    useEffect(() => {
        if (!hasHistory && view === "history") setView("factors");
        if (hasHistory && view === "factors" && !hasFactors) setView("history");
    }, [hasHistory, hasFactors, view]);

    const displayData = data.slice(-period);
    const lastIndex = displayData.length - 1;

    return (
        <div className="bg-(--card-bg) rounded-[3rem] p-8 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] flex flex-col justify-between min-h-[320px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    {view === "history" ? (
                        <BarChart3 className="w-5 h-5 text-foreground" />
                    ) : (
                        <Layers className="w-5 h-5 text-foreground" />
                    )}
                    <span className="font-headline font-extrabold text-lg leading-none">
                        {view === "history"
                            ? t("customers.trust.history")
                            : t("customers.trust.factors")}
                    </span>
                </div>

                {/* View toggle (history vs factors) */}
                <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-full">
                    <button
                        onClick={() => setView("history")}
                        disabled={!hasHistory}
                        className={cn(
                            "relative px-3 py-1.5 rounded-full text-[10px] font-bold transition-colors",
                            view === "history"
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground",
                            !hasHistory && "opacity-40 cursor-not-allowed"
                        )}
                    >
                        {t("customers.trust.viewHistory")}
                    </button>
                    <button
                        onClick={() => setView("factors")}
                        disabled={!hasFactors}
                        className={cn(
                            "relative px-3 py-1.5 rounded-full text-[10px] font-bold transition-colors",
                            view === "factors"
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground",
                            !hasFactors && "opacity-40 cursor-not-allowed"
                        )}
                    >
                        {t("customers.trust.viewFactors")}
                    </button>
                </div>

                {/* Period toggle — only meaningful in history mode */}
                {view === "history" && (
                    <div className="flex items-center gap-1">
                        {([6, 12] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className="relative"
                            >
                                {period === p && (
                                    <motion.div
                                        layoutId="trust-history-period-pill"
                                        className="absolute inset-0 bg-foreground rounded-full"
                                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                    />
                                )}
                                <span
                                    className={cn(
                                        "relative z-10 block px-4 py-1.5 rounded-full text-[10px] font-bold transition-colors",
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
                {view === "history" ? (
                    <motion.div
                        key="history"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                    >
                        {hasHistory ? (
                            <>
                                <div className="h-48 w-full flex items-end justify-between gap-4 px-2">
                                    {displayData.map((entry, i) => {
                                        const heightPct = Math.max((entry.avg_score / 100) * 100, 2);
                                        const isCurrent = i === lastIndex;
                                        const score = Math.round(entry.avg_score);
                                        return (
                                            <div
                                                key={`${period}-${i}`}
                                                className="group flex-1 flex flex-col items-stretch relative"
                                                style={{ height: "100%" }}
                                            >
                                                {/* The score sits on top of its own bar, not at the top of the chart. */}
                                                <div className="flex-1 flex flex-col justify-end">
                                                    <div
                                                        className={cn(
                                                            "mb-1 w-full flex justify-center transition-opacity duration-200",
                                                            isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                                        )}
                                                    >
                                                        <span className="text-[10px] font-bold text-foreground tabular-nums">{score}</span>
                                                    </div>
                                                    <motion.div
                                                        className={cn(
                                                            "w-full rounded-t-2xl transition-colors duration-200",
                                                            isCurrent ? "bg-[#FBE38E]" : "bg-[#FBE38E]/45 hover:bg-[#FBE38E]/70 dark:bg-[#FBE38E]/25"
                                                        )}
                                                        initial={{ height: 0 }}
                                                        animate={{ height: `${heightPct}%` }}
                                                        transition={{ delay: i * 0.04, duration: 0.45, ease: "easeOut" }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex justify-between mt-6 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    {displayData.map((entry, i) => (
                                        <span key={i} className="tabular-nums">
                                            {entry.month.slice(5)}
                                        </span>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <FactorsView breakdown={breakdown} recentEvents={recentEvents} language={language} t={t} />
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="factors"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                    >
                        <FactorsView breakdown={breakdown} recentEvents={recentEvents} language={language} t={t} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

interface FactorsViewProps {
    breakdown: { label: string; value: number; type: "positive" | "negative" | "neutral" }[];
    recentEvents: Array<{
        id: string;
        event_date: string;
        event_type: string;
        score_change: number;
        reason: string | null;
    }>;
    language: "en" | "ar";
    t: (key: string, vars?: Record<string, string | number>) => string;
}

function FactorsView({ breakdown, recentEvents, language, t }: FactorsViewProps) {
    const maxAbs = useMemo(
        () => Math.max(1, ...breakdown.map((f) => Math.abs(f.value))),
        [breakdown]
    );

    if (breakdown.length === 0 && recentEvents.length === 0) {
        return (
            <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                    {t("customers.trust.factorsEmpty")}
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Score breakdown */}
            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    {t("customers.trust.factorsBreakdown")}
                </p>
                {breakdown.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        {t("customers.trust.noFactors")}
                    </p>
                ) : (
                    <div className="space-y-2">
                        {breakdown.slice(0, 6).map((factor, i) => {
                            const widthPct = (Math.abs(factor.value) / maxAbs) * 100;
                            const isPositive = factor.value >= 0;
                            return (
                                <div key={i} className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-foreground flex-1 truncate">
                                        {factor.label}
                                    </span>
                                    <div className="flex items-center gap-2 w-32">
                                        <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${widthPct}%` }}
                                                transition={{ delay: i * 0.05, duration: 0.4 }}
                                                className={cn(
                                                    "h-full rounded-full",
                                                    isPositive ? "bg-emerald-500" : "bg-rose-500"
                                                )}
                                            />
                                        </div>
                                        <span
                                            className={cn(
                                                "text-xs font-bold tabular-nums w-8 text-right",
                                                isPositive ? "text-emerald-600" : "text-rose-600"
                                            )}
                                        >
                                            {isPositive ? "+" : ""}
                                            {factor.value}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Recent events feed */}
            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    {t("customers.trust.recentEvents")}
                </p>
                {recentEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        {t("customers.trust.noRecentEvents")}
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {recentEvents.slice(0, 5).map((evt) => {
                            const Icon = EVENT_ICONS[evt.event_type] || UserIcon;
                            const sign = Math.sign(evt.score_change);
                            return (
                                <li key={evt.id} className="flex items-start gap-2.5">
                                    <div
                                        className={cn(
                                            "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                                            eventIconColor(sign)
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-foreground truncate">
                                            {t(`customers.trust.event.${evt.event_type}`)}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">
                                            {relativeTime(evt.event_date, language)}
                                        </p>
                                    </div>
                                    {evt.score_change !== 0 && (
                                        <span
                                            className={cn(
                                                "text-xs font-bold tabular-nums shrink-0",
                                                sign > 0 ? "text-emerald-600" : "text-rose-600"
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
                )}
            </div>
        </div>
    );
}
