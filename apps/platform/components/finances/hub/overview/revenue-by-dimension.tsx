"use client";

import { useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
    LineChart, Line, Area, ComposedChart,
} from "recharts";
import { SectionCard } from "../primitives/section-card";
import { FinanceTooltip } from "../primitives/finance-tooltip";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { FinanceOverviewResult } from "@/hooks/use-finance-overview";

type DimensionId = "time" | "channel" | "city" | "product" | "payment";

interface RevenueByDimensionProps {
    data: FinanceOverviewResult;
}

const DIMENSIONS: DimensionId[] = ["time", "channel", "city", "product", "payment"];

export function RevenueByDimension({ data }: RevenueByDimensionProps) {
    const { t, language } = useLanguage();
    const locale = language === "ar" ? "ar-IQ-u-nu-latn" : "en-US";
    const [dim, setDim] = useState<DimensionId>("time");

    const content = useMemo(() => {
        if (dim === "time") {
            return <TimeChart data={data} />;
        }
        if (dim === "channel") return <BarRows rows={data.by_channel.map((c) => ({ label: c.label, value: c.revenue, secondary: t("finances.overview.dim.orders", { count: c.orders }) }))} />;
        if (dim === "city") return <BarRows rows={data.by_city.slice(0, 12).map((c) => ({ label: c.label, value: c.revenue, secondary: t("finances.overview.dim.ordersDelivered", { orders: c.orders, delivered: c.delivered }) }))} />;
        if (dim === "product") return <BarRows rows={data.by_product.slice(0, 12).map((p) => ({ label: p.label, value: p.revenue, secondary: t("finances.overview.dim.units", { units: p.units, margin: p.margin.toFixed(0) }) }))} />;
        if (dim === "payment") return <BarRows rows={data.by_payment.map((p) => ({ label: p.label, value: p.revenue, secondary: t("finances.overview.dim.orders", { count: p.orders }) }))} />;
        return null;
    }, [dim, data, t]);

    return (
        <SectionCard
            title={t("finances.overview.dim.title")}
            subtitle={t("finances.overview.dim.sub")}
            icon={BarChart3}
            accent="violet"
            action={
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--card-border)] bg-[var(--background)] overflow-x-auto max-w-full">
                    {DIMENSIONS.map((d) => (
                        <button
                            key={d}
                            onClick={() => setDim(d)}
                            className={cn(
                                "px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap",
                                dim === d ? "bg-[var(--card-bg)] text-foreground shadow-sm" : "text-muted hover:text-foreground"
                            )}
                        >
                            {t(`finances.overview.dim.${d}`)}
                        </button>
                    ))}
                </div>
            }
        >
            {content}
        </SectionCard>
    );
}

function TimeChart({ data }: { data: FinanceOverviewResult }) {
    const { t, language } = useLanguage();
    const locale = language === "ar" ? "ar-IQ-u-nu-latn" : "en-US";
    const series = data.series.map((s) => ({
        bucket: s.bucket,
        revenue: s.revenue,
        profit: s.profit,
        delivered: s.delivered_revenue,
    }));

    if (series.length === 0 || series.every((s) => s.revenue === 0)) {
        return <EmptyBlock label={t("finances.overview.dim.noActivity")} />;
    }

    return (
        <div className="h-64 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                        <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="currentColor" strokeOpacity={0.06} vertical={false} />
                    <XAxis
                        dataKey="bucket"
                        tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(k: string) => shortLabel(k, locale)}
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => abbrev(v as number)}
                        width={42}
                    />
                    <Tooltip
                        content={(p) => <FinanceTooltip {...p} />}
                        cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
                    />
                    <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#revGradient)"
                        name={t("finances.overview.dim.revenue")}
                    />
                    <Line
                        type="monotone"
                        dataKey="profit"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={false}
                        name={t("finances.overview.dim.profit")}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

function BarRows({ rows }: { rows: Array<{ label: string; value: number; secondary?: string }> }) {
    const { t } = useLanguage();
    const max = Math.max(...rows.map((r) => r.value), 1);
    if (rows.length === 0) return <EmptyBlock label={t("finances.overview.dim.nothing")} />;
    return (
        <div className="space-y-1.5">
            {rows.slice(0, 10).map((r) => {
                const w = (r.value / max) * 100;
                return (
                    <div key={r.label} className="group">
                        <div className="flex items-center justify-between text-[12px] mb-0.5">
                            <span className="truncate text-foreground font-medium">{r.label}</span>
                            <span className="tabular-nums text-foreground font-semibold shrink-0 ml-2">{abbrev(r.value)} IQD</span>
                        </div>
                        <div className="relative h-2 rounded-full bg-[var(--background)] overflow-hidden">
                            <div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500/60 to-violet-400/40 rounded-full"
                                style={{ width: `${w}%` }}
                            />
                        </div>
                        {r.secondary && <div className="text-[11px] text-muted mt-0.5">{r.secondary}</div>}
                    </div>
                );
            })}
        </div>
    );
}

function EmptyBlock({ label }: { label: string }) {
    return (
        <div className="h-48 flex items-center justify-center text-sm text-muted">
            {label}
        </div>
    );
}

function abbrev(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${Math.round(n)}`;
}

function shortLabel(key: string, locale: string): string {
    // yyyy-mm-dd → Mar 14 ;  yyyy-mm → Mar 26 ; otherwise as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        const d = new Date(key);
        return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
    }
    if (/^\d{4}-\d{2}$/.test(key)) {
        const [y, m] = key.split("-");
        const d = new Date(Number(y), Number(m) - 1, 1);
        return d.toLocaleDateString(locale, { month: "short", year: "2-digit" });
    }
    return key;
}
