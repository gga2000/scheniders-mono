"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Target, TrendingUp, Calendar, Wallet, AlertTriangle } from "lucide-react";
import type { Order } from "@/lib/supabase";
import type { Expense } from "@/types/expense";
import type { FinancePeriod } from "@/hooks/use-finance-period";
import { useCashPosition } from "@/hooks/use-cash-position";
import { useInTransitSince } from "@/hooks/use-in-transit-since";
import { useLanguage } from "@/hooks/use-language";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { FinanceTooltip } from "../primitives/finance-tooltip";
import { cn } from "@/lib/utils";
import { baghdadDayKey } from "@/lib/order-window";
import { buildForecast, coverDays, daysBetween } from "@/lib/finance/forecast";

interface Props {
    orders: Order[];
    expenses: Expense[];
    period: FinancePeriod;
}

export function ForecastsTab({ orders, expenses, period }: Props) {
    const cash = useCashPosition(orders, useInTransitSince(orders));

    const forecast = useMemo(() => buildForecast(orders), [orders]);

    // Spending in the selected period, burned at that period's own daily rate.
    const runway = useMemo(() => {
        const periodExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const days = daysBetween(baghdadDayKey(period.start), baghdadDayKey(period.end));
        return { ...coverDays(cash.cashInTransit, periodExpenses, days), inTransit: cash.cashInTransit };
    }, [cash.cashInTransit, expenses, period.start, period.end]);

    const chart = useMemo(() => forecast.chart.map((p) => ({
        label: shortDay(p.day),
        historical: p.historical,
        best: p.best,
        likely: p.likely,
        worst: p.worst,
    })), [forecast.chart]);

    const momentumPct = forecast.momentum * 100;
    const momentumTone = momentumPct >= 5 ? "emerald" : momentumPct >= -5 ? "amber" : "rose";

    return (
        <div className="space-y-5">
            <ScenarioStrip d30={forecast.d30} d60={forecast.d60} d90={forecast.d90} />

            <ProjectionChart data={chart} momentumPct={momentumPct} momentumTone={momentumTone} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <CashCoverCard runway={runway} />
                <ForecastConfidenceCard
                    baseline={forecast.baseline}
                    momentumPct={momentumPct}
                    rawMomentumPct={forecast.rawMomentum * 100}
                    momentumClamped={forecast.momentumClamped}
                    samples={Math.min(60, orders.length)}
                />
            </div>
        </div>
    );
}

function ScenarioStrip({
    d30, d60, d90,
}: {
    d30: { best: number; likely: number; worst: number };
    d60: { best: number; likely: number; worst: number };
    d90: { best: number; likely: number; worst: number };
}) {
    const { t } = useLanguage();
    const cards = [
        { label: t("finances.forecast.next30"), data: d30, icon: Calendar },
        { label: t("finances.forecast.next60"), data: d60, icon: Calendar },
        { label: t("finances.forecast.next90"), data: d90, icon: Calendar },
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {cards.map((c, i) => {
                const Icon = c.icon;
                return (
                    <motion.div
                        key={c.label}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 ring-1 ring-violet-500/10"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                                <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">{c.label}</div>
                        </div>
                        <FinanceValue value={c.data.likely} abbreviate className="text-2xl font-bold text-foreground tabular-nums block" />
                        <div className="text-[10.5px] text-muted mt-1 flex items-center gap-3">
                            <span>{t("finances.forecast.worst")} <bdi><FinanceValue value={c.data.worst} abbreviate className="text-rose-600 dark:text-rose-400 inline" /></bdi></span>
                            <span>{t("finances.forecast.best")} <bdi><FinanceValue value={c.data.best} abbreviate className="text-emerald-600 dark:text-emerald-400 inline" /></bdi></span>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}

function ProjectionChart({
    data, momentumPct, momentumTone,
}: {
    data: Array<{ label: string; historical: number | null; best: number | null; likely: number | null; worst: number | null }>;
    momentumPct: number;
    momentumTone: "emerald" | "amber" | "rose";
}) {
    const { t } = useLanguage();
    return (
        <SectionCard
            title={t("finances.forecast.title")}
            subtitle={t("finances.forecast.sub")}
            icon={TrendingUp}
            accent="violet"
            action={
                <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border",
                    momentumTone === "emerald" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" :
                        momentumTone === "amber" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
                            "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                )}>
                    <bdi>{t("finances.forecast.momentum", { pct: `${momentumPct >= 0 ? "+" : ""}${momentumPct.toFixed(1)}` })}</bdi>
                </span>
            }
        >
            <div className="h-[340px] -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                        <defs>
                            <linearGradient id="bestGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="worstGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="histGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} interval={13} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false}
                            tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : v}
                        />
                        <Tooltip content={(p) => <FinanceTooltip {...p} />} />
                        <Area type="monotone" dataKey="best" name={t("finances.forecast.series.best")} stroke="#10b981" strokeWidth={1.5} fill="url(#bestGradient)" connectNulls />
                        <Area type="monotone" dataKey="worst" name={t("finances.forecast.series.worst")} stroke="#f43f5e" strokeWidth={1.5} fill="url(#worstGradient)" connectNulls strokeDasharray="3 3" />
                        <Area type="monotone" dataKey="likely" name={t("finances.forecast.series.likely")} stroke="#8b5cf6" strokeWidth={2} fill="none" connectNulls />
                        <Area type="monotone" dataKey="historical" name={t("finances.forecast.series.historical")} stroke="#6366f1" strokeWidth={2} fill="url(#histGradient)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </SectionCard>
    );
}

function CashCoverCard({
    runway,
}: {
    runway: { dailyBurn: number; inTransit: number; days: number };
}) {
    const { t } = useLanguage();
    const tone = runway.days >= 90 ? "emerald" : runway.days >= 30 ? "amber" : "rose";
    const isInfinite = !Number.isFinite(runway.days);

    return (
        <SectionCard
            title={t("finances.forecast.cover.title")}
            subtitle={t("finances.forecast.cover.sub")}
            icon={Wallet}
            accent={tone === "rose" ? "rose" : tone === "amber" ? "amber" : "emerald"}
        >
            <div className="space-y-4 py-2">
                <div>
                    <div className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">{t("finances.forecast.cover.inTransit")}</div>
                    <FinanceValue value={runway.inTransit} className="text-3xl font-bold text-foreground tabular-nums" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
                        <div className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">{t("finances.forecast.cover.burn")}</div>
                        <FinanceValue value={runway.dailyBurn} abbreviate className="text-xl font-bold text-foreground tabular-nums" />
                    </div>
                    <div className={cn(
                        "rounded-xl border p-3",
                        tone === "emerald" ? "border-emerald-500/30 bg-emerald-500/5" :
                            tone === "amber" ? "border-amber-500/30 bg-amber-500/5" :
                                "border-rose-500/30 bg-rose-500/5"
                    )}>
                        <div className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">{t("finances.forecast.cover.days")}</div>
                        <div className={cn(
                            "text-xl font-bold tabular-nums",
                            tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
                                tone === "amber" ? "text-amber-600 dark:text-amber-400" :
                                    "text-rose-600 dark:text-rose-400"
                        )}>
                            {isInfinite ? "∞" : t("finances.forecast.cover.daysValue", { count: Math.round(runway.days) })}
                        </div>
                    </div>
                </div>
                {!isInfinite && runway.days < 30 && (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                        <div className="text-[12px] text-rose-700 dark:text-rose-300">
                            {t("finances.forecast.cover.warn")}
                        </div>
                    </div>
                )}
            </div>
        </SectionCard>
    );
}

function ForecastConfidenceCard({
    baseline, momentumPct, rawMomentumPct, momentumClamped, samples,
}: {
    baseline: number;
    momentumPct: number;
    rawMomentumPct: number;
    momentumClamped: boolean;
    samples: number;
}) {
    const { t } = useLanguage();
    const confidence = Math.min(95, Math.max(20, Math.floor(60 + samples / 2)));
    const confTone = confidence >= 75 ? "emerald" : confidence >= 50 ? "amber" : "rose";

    return (
        <SectionCard
            title={t("finances.forecast.health.title")}
            subtitle={t("finances.forecast.health.sub")}
            icon={Target}
            accent="cyan"
        >
            <div className="space-y-3 py-1">
                <Row label={t("finances.forecast.health.baseline")} value={<FinanceValue value={baseline} abbreviate className="text-foreground tabular-nums font-semibold" />} />
                <Row
                    label={momentumClamped ? t("finances.forecast.health.momentumCapped") : t("finances.forecast.health.momentum")}
                    value={
                        <span className={cn(
                            "tabular-nums font-semibold",
                            momentumPct >= 5 ? "text-emerald-600 dark:text-emerald-400" :
                                momentumPct >= -5 ? "text-foreground" :
                                    "text-rose-600 dark:text-rose-400"
                        )}>
                            {momentumPct >= 0 ? "+" : ""}{momentumPct.toFixed(1)}%
                            {momentumClamped && (
                                <span className="ml-1 text-[10px] font-normal text-muted">
                                    {t("finances.forecast.health.raw", { pct: `${rawMomentumPct >= 0 ? "+" : ""}${rawMomentumPct.toFixed(0)}` })}
                                </span>
                            )}
                        </span>
                    }
                />
                <Row label={t("finances.forecast.health.samples")} value={<span className="text-foreground tabular-nums font-semibold">{t("finances.forecast.health.orders", { count: samples })}</span>} />
                <Row
                    label={t("finances.forecast.health.confidence")}
                    value={
                        <span className={cn(
                            "tabular-nums font-semibold",
                            confTone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
                                confTone === "amber" ? "text-amber-600 dark:text-amber-400" :
                                    "text-rose-600 dark:text-rose-400"
                        )}>{confidence}%</span>
                    }
                />
                <div className="text-[11px] text-muted leading-relaxed pt-2 border-t border-[var(--card-border)]">
                    {t("finances.forecast.health.note")}
                </div>
            </div>
        </SectionCard>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between py-1.5">
            <span className="text-[12px] text-muted">{label}</span>
            <span className="text-[13px]">{value}</span>
        </div>
    );
}

function shortDay(day: string): string {
    const [, month, date] = day.split("-");
    return `${Number(month)}/${Number(date)}`;
}
