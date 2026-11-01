"use client";

import { useMemo } from "react";
import { Users2 } from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { SectionCard } from "../primitives/section-card";
import { FinanceTooltip } from "../primitives/finance-tooltip";
import { FinanceValue } from "../primitives/finance-value";
import type { AcquisitionMixPoint } from "@/hooks/use-finance-customers";
import { useLanguage } from "@/hooks/use-language";

interface Props {
    data: AcquisitionMixPoint[];
}

export function CustomersAcquisitionMix({ data }: Props) {
    const { t, language } = useLanguage();
    const series = useMemo(() => {
        const locale = language === "ar" ? "ar-IQ-u-nu-latn" : "en-US";
        return data.map((p) => ({
            label: prettyLabel(p.bucket, locale, (date) => t("finances.cust.mix.week", { date })),
            new_revenue: Math.round(p.new_revenue),
            returning_revenue: Math.round(p.returning_revenue),
            total: Math.round(p.new_revenue + p.returning_revenue),
        }));
    }, [data, language, t]);

    const totals = useMemo(() => {
        let n = 0, r = 0;
        for (const p of data) { n += p.new_revenue; r += p.returning_revenue; }
        return { n, r, total: n + r, share: n + r > 0 ? (r / (n + r)) * 100 : 0 };
    }, [data]);

    if (series.length === 0 || totals.total === 0) {
        return (
            <SectionCard
                title={t("finances.cust.mix.title")}
                subtitle={t("finances.cust.mix.emptySub")}
                icon={Users2}
                accent="cyan"
            >
                <div className="py-10 text-center text-sm text-muted">
                    {t("finances.cust.mix.empty")}
                </div>
            </SectionCard>
        );
    }

    return (
        <SectionCard
            title={t("finances.cust.mix.title")}
            subtitle={t("finances.cust.mix.sub", { pct: totals.share.toFixed(0) })}
            icon={Users2}
            accent="cyan"
        >
            <div className="flex flex-wrap gap-4 mb-4">
                <Stat
                    color="bg-cyan-500"
                    label={t("finances.cust.mix.new")}
                    value={totals.n}
                    share={totals.total > 0 ? (totals.n / totals.total) * 100 : 0}
                />
                <Stat
                    color="bg-violet-500"
                    label={t("finances.cust.mix.returning")}
                    value={totals.r}
                    share={totals.total > 0 ? (totals.r / totals.total) * 100 : 0}
                />
            </div>
            <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="newGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.55} />
                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                            </linearGradient>
                            <linearGradient id="returningGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.55} />
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "var(--muted)" }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: "var(--muted)" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => abbrev(v)}
                            width={48}
                        />
                        <Tooltip
                            content={(p) => (
                                <FinanceTooltip
                                    {...p}
                                    title={String(p.label ?? "")}
                                    rows={[
                                        { label: t("finances.cust.mix.tipNew"), value: Number(p.payload?.[0]?.payload?.new_revenue ?? 0), color: "#06b6d4" },
                                        { label: t("finances.cust.mix.tipReturning"), value: Number(p.payload?.[0]?.payload?.returning_revenue ?? 0), color: "#8b5cf6" },
                                    ]}
                                />
                            )}
                        />
                        <Area
                            type="monotone"
                            dataKey="new_revenue"
                            stackId="1"
                            stroke="#06b6d4"
                            strokeWidth={2}
                            fill="url(#newGrad)"
                        />
                        <Area
                            type="monotone"
                            dataKey="returning_revenue"
                            stackId="1"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            fill="url(#returningGrad)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </SectionCard>
    );
}

function Stat({ color, label, value, share }: { color: string; label: string; value: number; share: number }) {
    return (
        <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <div>
                <div className="text-[10.5px] text-muted">{label}</div>
                <div className="flex items-baseline gap-1.5">
                    <FinanceValue value={value} abbreviate className="text-sm font-semibold tabular-nums" />
                    <span className="text-[10.5px] text-muted tabular-nums">{share.toFixed(0)}%</span>
                </div>
            </div>
        </div>
    );
}

/** Bucket keys are Baghdad day keys; format them as UTC so the browser's zone never shifts the day. */
function prettyLabel(key: string, locale: string, week: (date: string) => string): string {
    const day = { month: "short", day: "numeric", timeZone: "UTC" } as const;
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        return new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, day);
    }
    if (key.startsWith("W-")) {
        return week(new Date(`${key.slice(2)}T00:00:00Z`).toLocaleDateString(locale, day));
    }
    if (/^\d{4}-\d{2}$/.test(key)) {
        return new Date(`${key}-01T00:00:00Z`).toLocaleDateString(locale, { month: "short", year: "2-digit", timeZone: "UTC" });
    }
    return key;
}

function abbrev(v: number): string {
    const a = Math.abs(v);
    if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (a >= 1_000) return `${Math.round(v / 1_000)}K`;
    return String(Math.round(v));
}
