"use client";

import { motion } from "framer-motion";
import { TrendingUp, Users, Tag } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { Delta } from "../primitives/delta";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { RevenueDecomposition as Decomp } from "@/hooks/use-finance-revenue";

interface Props {
    data: Decomp;
}

export function RevenueDecomposition({ data }: Props) {
    const { t } = useLanguage();
    const noPrev = data.revPrev === 0 && data.ordersPrev === 0;

    return (
        <SectionCard
            title={t("finances.decomp.title")}
            subtitle={noPrev ? t("finances.decomp.noPrev") : t("finances.decomp.sub")}
            icon={TrendingUp}
            accent="emerald"
        >
            {noPrev ? (
                <div className="py-10 text-center text-sm text-muted">
                    {t("finances.decomp.enable")}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <MetricCard
                            label={t("finances.decomp.revenue")}
                            prev={data.revPrev}
                            curr={data.revCurr}
                        />
                        <MetricCard
                            label={t("finances.decomp.orders")}
                            prev={data.ordersPrev}
                            curr={data.ordersCurr}
                            currency="none"
                        />
                        <MetricCard
                            label={t("finances.decomp.aov")}
                            prev={data.aovPrev}
                            curr={data.aovCurr}
                        />
                    </div>

                    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-4">
                        <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-3">
                            {t("finances.decomp.bridge")}
                        </div>
                        <WaterfallBridge data={data} />
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <EffectCard
                            icon={Users}
                            label={t("finances.decomp.volumeEffect")}
                            sublabel={t("finances.decomp.volumeSub", { orders: formatSignedNumber(data.deltaOrders), aov: formatShortIqd(data.aovPrev) })}
                            value={data.volumeEffect}
                            tone={data.volumeEffect >= 0 ? "emerald" : "rose"}
                        />
                        <EffectCard
                            icon={Tag}
                            label={t("finances.decomp.priceEffect")}
                            sublabel={t("finances.decomp.priceSub", { aov: formatSignedIqd(data.deltaAov), orders: formatSignedNumber(data.ordersCurr) })}
                            value={data.priceEffect}
                            tone={data.priceEffect >= 0 ? "emerald" : "rose"}
                        />
                    </div>
                </>
            )}
        </SectionCard>
    );
}

interface MetricCardProps {
    label: string;
    prev: number;
    curr: number;
    currency?: "IQD" | "USD" | "none";
}

function MetricCard({ label, prev, curr, currency = "IQD" }: MetricCardProps) {
    const { t } = useLanguage();
    const deltaPct = prev === 0 ? 0 : ((curr - prev) / prev) * 100;
    return (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">{label}</div>
            <div className="flex items-baseline gap-2">
                <FinanceValue
                    value={curr}
                    currency={currency}
                    abbreviate={currency !== "none"}
                    decimals={currency === "none" ? 0 : undefined}
                    className="text-xl font-bold text-foreground tabular-nums"
                />
                <Delta value={deltaPct} variant="inline" size="sm" />
            </div>
            <div className="text-[11px] text-muted mt-1.5">
                {t("finances.decomp.was")}{" "}
                <FinanceValue
                    value={prev}
                    currency={currency}
                    abbreviate={currency !== "none"}
                    decimals={currency === "none" ? 0 : undefined}
                    className="tabular-nums"
                />
            </div>
        </div>
    );
}

interface EffectCardProps {
    icon: typeof Users;
    label: string;
    sublabel: string;
    value: number;
    tone: "emerald" | "rose";
}

function EffectCard({ icon: Icon, label, sublabel, value, tone }: EffectCardProps) {
    const toneBg = tone === "emerald" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400";
    return (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", toneBg)}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</div>
                <FinanceValue
                    value={value}
                    signed
                    abbreviate
                    className={cn("text-lg font-bold tabular-nums", tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}
                />
                <div className="text-[10.5px] text-muted truncate">{sublabel}</div>
            </div>
        </div>
    );
}

function WaterfallBridge({ data }: { data: Decomp }) {
    const { t } = useLanguage();
    // Steps: Prev → +Volume → +Price → +Mix → Curr
    const prev = data.revPrev;
    const curr = data.revCurr;
    const steps = [
        { label: t("finances.decomp.step.prev"), value: prev, isAnchor: true, delta: 0 },
        { label: t("finances.decomp.step.volume"), value: data.volumeEffect, isAnchor: false, delta: data.volumeEffect },
        { label: t("finances.decomp.step.price"), value: data.priceEffect, isAnchor: false, delta: data.priceEffect },
        { label: t("finances.decomp.step.mix"), value: data.mixResidual, isAnchor: false, delta: data.mixResidual },
        { label: t("finances.decomp.step.curr"), value: curr, isAnchor: true, delta: 0 },
    ];

    // Single shared scale so anchors and deltas are visually comparable, and
    // nothing dwarfs the rest into invisibility.
    const scale = Math.max(
        Math.abs(prev), Math.abs(curr),
        Math.abs(data.volumeEffect), Math.abs(data.priceEffect), Math.abs(data.mixResidual),
        1,
    );

    return (
        <div className="flex items-end gap-2 h-36 px-1">
            {steps.map((s, i) => {
                const magnitude = s.isAnchor ? Math.abs(s.value) : Math.abs(s.delta);
                const rawPct = (magnitude / scale) * 88;
                // Square-root softens the dominant bar so secondary deltas stay readable.
                const softened = Math.sqrt(rawPct / 88) * 88;
                const pct = magnitude === 0
                    ? 0
                    : Math.max(6, Math.min(92, softened));
                const negative = !s.isAnchor && s.delta < 0;
                const barColor = s.isAnchor
                    ? "bg-slate-500/70 ring-1 ring-slate-500/40"
                    : negative
                        ? "bg-rose-500"
                        : "bg-emerald-500";
                return (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0"
                    >
                        <div className="text-[10px] font-semibold text-foreground/80 tabular-nums whitespace-nowrap">
                            {s.isAnchor ? formatShortIqd(s.value) : formatSignedShortIqd(s.delta)}
                        </div>
                        <div
                            className={cn("w-full rounded-md transition-all min-h-[2px]", barColor)}
                            style={{ height: `${pct}%` }}
                        />
                        <div className="text-[10px] text-muted font-medium truncate w-full text-center">{s.label}</div>
                    </motion.div>
                );
            })}
        </div>
    );
}

function formatShortIqd(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
    return `${Math.round(n)}`;
}

function formatSignedShortIqd(n: number): string {
    // Treat sub-currency-rounding values as zero so the bridge doesn't show "+0".
    if (Math.round(n) === 0) return "—";
    const sign = n > 0 ? "+" : "-";
    return `${sign}${formatShortIqd(Math.abs(n))}`;
}

function formatSignedIqd(n: number): string {
    if (n === 0) return "0";
    const sign = n > 0 ? "+" : "-";
    return `${sign}${formatShortIqd(Math.abs(n))}`;
}

function formatSignedNumber(n: number): string {
    if (n === 0) return "0";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toLocaleString()}`;
}
