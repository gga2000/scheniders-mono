"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart, ReferenceLine,
} from "recharts";
import { Target, TrendingUp, Calendar, Wallet, AlertTriangle } from "lucide-react";
import type { Order } from "@/lib/supabase";
import type { Expense } from "@/types/expense";
import type { FinancePeriod } from "@/hooks/use-finance-period";
import { useCashPosition } from "@/hooks/use-cash-position";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { FinanceTooltip } from "../primitives/finance-tooltip";
import { cn } from "@/lib/utils";

const REVENUE_STATUSES = new Set(["delivered", "completed"]);

interface Props {
    orders: Order[];
    expenses: Expense[];
    period: FinancePeriod;
}

export function ForecastsTab({ orders, expenses }: Props) {
    const cash = useCashPosition(orders);

    const forecast = useMemo(() => {
        // Build last 60 days daily revenue history → simple moving average + trend projection
        const now = new Date();
        const startWindow = new Date(now);
        startWindow.setDate(now.getDate() - 60);
        startWindow.setHours(0, 0, 0, 0);

        const dailyRevMap = new Map<string, number>();
        for (const o of orders) {
            if (!REVENUE_STATUSES.has(o.status)) continue;
            const t = o.created_at ? new Date(o.created_at) : null;
            if (!t || t < startWindow || t > now) continue;
            const key = t.toISOString().slice(0, 10);
            dailyRevMap.set(key, (dailyRevMap.get(key) || 0) + (Number(o.price) || 0));
        }

        // Build full timeline (fill zeros)
        const history: { date: string; ts: number; revenue: number }[] = [];
        const cursor = new Date(startWindow);
        while (cursor <= now) {
            const k = cursor.toISOString().slice(0, 10);
            history.push({ date: k, ts: cursor.getTime(), revenue: dailyRevMap.get(k) || 0 });
            cursor.setDate(cursor.getDate() + 1);
        }

        // Compute 14-day trailing average (smoother) and 30-day for trend
        const avg14 = trailingAvg(history.map(h => h.revenue), 14);
        const avg30 = trailingAvg(history.map(h => h.revenue), 30);

        const baseline = avg30[avg30.length - 1] || 0;
        const recent = avg14[avg14.length - 1] || 0;
        const rawMomentum = baseline > 0 ? (recent - baseline) / baseline : 0;
        // Clamp momentum to [-50%, +50%] so a momentary lull doesn't collapse projections to 0
        const momentum = Math.max(-0.5, Math.min(0.5, rawMomentum));

        // Project forward 90 days at 3 scenarios
        const projection: { date: string; ts: number; best: number; likely: number; worst: number }[] = [];
        const projCursor = new Date(now);
        for (let d = 1; d <= 90; d++) {
            projCursor.setDate(projCursor.getDate() + 1);
            const trend = baseline * (1 + momentum); // baseline ± momentum (clamped)
            const best = trend * 1.25;
            const worst = trend * 0.7;
            projection.push({
                date: projCursor.toISOString().slice(0, 10),
                ts: projCursor.getTime(),
                best: Math.round(best),
                likely: Math.round(trend),
                worst: Math.round(worst),
            });
        }

        // Combined timeline for chart
        const chart = [
            ...history.map(h => ({ label: shortDate(h.ts), historical: h.revenue, best: null as number | null, likely: null as number | null, worst: null as number | null })),
            ...projection.map(p => ({ label: shortDate(p.ts), historical: null as number | null, best: p.best, likely: p.likely, worst: p.worst })),
        ];

        // 30/60/90-day projections
        const sumWindow = (n: number) => projection.slice(0, n).reduce((acc, p) => ({
            best: acc.best + p.best,
            likely: acc.likely + p.likely,
            worst: acc.worst + p.worst,
        }), { best: 0, likely: 0, worst: 0 });

        return {
            chart,
            baseline,
            momentum,
            rawMomentum,
            momentumClamped: rawMomentum !== momentum,
            d30: sumWindow(30),
            d60: sumWindow(60),
            d90: sumWindow(90),
        };
    }, [orders]);

    // Cash runway: current cash position vs avg daily burn
    const runway = useMemo(() => {
        const totalExpenses30 = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const dailyBurn = totalExpenses30 > 0 ? totalExpenses30 / Math.max(1, expenses.length > 0 ? 30 : 1) : 0;
        const liquidCash = cash.cashCollected + cash.cashInTransit;
        const days = dailyBurn > 0 ? liquidCash / dailyBurn : Infinity;
        return { dailyBurn, liquidCash, days };
    }, [cash.cashCollected, cash.cashInTransit, expenses]);

    const momentumPct = forecast.momentum * 100;
    const momentumTone = momentumPct >= 5 ? "emerald" : momentumPct >= -5 ? "amber" : "rose";

    return (
        <div className="space-y-5">
            <ScenarioStrip d30={forecast.d30} d60={forecast.d60} d90={forecast.d90} />

            <ProjectionChart data={forecast.chart} momentumPct={momentumPct} momentumTone={momentumTone} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <CashRunwayCard runway={runway} liquidCash={cash.cashCollected + cash.cashInTransit} />
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
    const cards = [
        { label: "Next 30 days", data: d30, icon: Calendar },
        { label: "Next 60 days", data: d60, icon: Calendar },
        { label: "Next 90 days", data: d90, icon: Calendar },
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
                            <span>Worst <FinanceValue value={c.data.worst} abbreviate className="text-rose-600 dark:text-rose-400 inline" /></span>
                            <span>Best <FinanceValue value={c.data.best} abbreviate className="text-emerald-600 dark:text-emerald-400 inline" /></span>
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
    return (
        <SectionCard
            title="Revenue Projection"
            subtitle="60-day history + 90-day forecast (best · likely · worst)"
            icon={TrendingUp}
            accent="violet"
            action={
                <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border",
                    momentumTone === "emerald" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" :
                        momentumTone === "amber" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
                            "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                )}>
                    Momentum {momentumPct >= 0 ? "+" : ""}{momentumPct.toFixed(1)}%
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
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false}
                            tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : v}
                        />
                        <Tooltip content={(p) => <FinanceTooltip {...p} />} />
                        <Area type="monotone" dataKey="best" name="Best case" stroke="#10b981" strokeWidth={1.5} fill="url(#bestGradient)" connectNulls />
                        <Area type="monotone" dataKey="worst" name="Worst case" stroke="#f43f5e" strokeWidth={1.5} fill="url(#worstGradient)" connectNulls strokeDasharray="3 3" />
                        <Area type="monotone" dataKey="likely" name="Likely" stroke="#8b5cf6" strokeWidth={2} fill="none" connectNulls />
                        <Area type="monotone" dataKey="historical" name="Historical" stroke="#6366f1" strokeWidth={2} fill="url(#histGradient)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </SectionCard>
    );
}

function CashRunwayCard({
    runway, liquidCash,
}: {
    runway: { dailyBurn: number; liquidCash: number; days: number };
    liquidCash: number;
}) {
    const tone = runway.days >= 90 ? "emerald" : runway.days >= 30 ? "amber" : "rose";
    const isInfinite = !Number.isFinite(runway.days);

    return (
        <SectionCard
            title="Cash Runway"
            subtitle="How long current liquid cash covers expenses at current burn"
            icon={Wallet}
            accent={tone === "rose" ? "rose" : tone === "amber" ? "amber" : "emerald"}
        >
            <div className="space-y-4 py-2">
                <div>
                    <div className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">Liquid cash</div>
                    <FinanceValue value={liquidCash} className="text-3xl font-bold text-foreground tabular-nums" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
                        <div className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">Daily burn</div>
                        <FinanceValue value={runway.dailyBurn} abbreviate className="text-xl font-bold text-foreground tabular-nums" />
                    </div>
                    <div className={cn(
                        "rounded-xl border p-3",
                        tone === "emerald" ? "border-emerald-500/30 bg-emerald-500/5" :
                            tone === "amber" ? "border-amber-500/30 bg-amber-500/5" :
                                "border-rose-500/30 bg-rose-500/5"
                    )}>
                        <div className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">Runway</div>
                        <div className={cn(
                            "text-xl font-bold tabular-nums",
                            tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
                                tone === "amber" ? "text-amber-600 dark:text-amber-400" :
                                    "text-rose-600 dark:text-rose-400"
                        )}>
                            {isInfinite ? "∞" : `${Math.round(runway.days)}d`}
                        </div>
                    </div>
                </div>
                {!isInfinite && runway.days < 30 && (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                        <div className="text-[12px] text-rose-700 dark:text-rose-300">
                            Less than 30 days of runway. Consider speeding up COD collection or trimming non-critical expenses.
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
    const confidence = Math.min(95, Math.max(20, Math.floor(60 + samples / 2)));
    const confTone = confidence >= 75 ? "emerald" : confidence >= 50 ? "amber" : "rose";

    return (
        <SectionCard
            title="Forecast Health"
            subtitle="Inputs feeding the projection model"
            icon={Target}
            accent="cyan"
        >
            <div className="space-y-3 py-1">
                <Row label="Baseline (30d MA)" value={<FinanceValue value={baseline} abbreviate className="text-foreground tabular-nums font-semibold" />} />
                <Row
                    label={momentumClamped ? "Momentum (capped)" : "Momentum (14d vs 30d)"}
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
                                    (raw {rawMomentumPct >= 0 ? "+" : ""}{rawMomentumPct.toFixed(0)}%)
                                </span>
                            )}
                        </span>
                    }
                />
                <Row label="Sample size" value={<span className="text-foreground tabular-nums font-semibold">{samples} orders</span>} />
                <Row
                    label="Confidence"
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
                    Forecast uses a 30-day moving average baseline adjusted by recent momentum. Best/worst bands are ±25%/−30% relative to the likely path. Higher sample counts and stable momentum increase confidence.
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

function trailingAvg(values: number[], window: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < values.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = values.slice(start, i + 1);
        out.push(slice.reduce((s, v) => s + v, 0) / slice.length);
    }
    return out;
}

function shortDate(ts: number): string {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}
