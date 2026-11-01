"use client";

import { useMemo } from "react";
import { Grid3x3 } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { MarginHeatmap as HeatmapData } from "@/hooks/use-finance-revenue";

interface Props {
    data: HeatmapData;
}

export function MarginHeatmap({ data }: Props) {
    const { t, language } = useLanguage();
    const { products, buckets, cells, granularity } = data;
    const locale = language === "ar" ? "ar-IQ-u-nu-latn" : "en-US";
    const bucketLabel = (key: string, ts: number): string => {
        const at = new Date(ts);
        const day = { month: "short", day: "numeric", timeZone: "Asia/Baghdad" } as const;
        if (granularity === "day") return at.toLocaleDateString(locale, day);
        if (granularity === "week") return t("finances.heatmap.week", { date: at.toLocaleDateString(locale, day) });
        if (granularity === "month") return at.toLocaleDateString(locale, { month: "short", year: "2-digit", timeZone: "Asia/Baghdad" });
        return key;
    };

    const cellIndex = useMemo(() => {
        const map = new Map<string, (typeof cells)[number]>();
        for (const c of cells) map.set(`${c.product}|${c.bucket}`, c);
        return map;
    }, [cells]);

    if (products.length === 0 || buckets.length === 0) {
        return (
            <SectionCard
                title={t("finances.heatmap.title")}
                subtitle={t("finances.heatmap.emptySub")}
                icon={Grid3x3}
                accent="violet"
            >
                <div className="py-10 text-center text-sm text-muted">
                    {t("finances.heatmap.emptyBody")}
                </div>
            </SectionCard>
        );
    }

    return (
        <SectionCard
            title={t("finances.heatmap.title")}
            subtitle={t("finances.heatmap.sub", { products: products.length, periods: buckets.length })}
            icon={Grid3x3}
            accent="violet"
        >
            <div className="overflow-x-auto -mx-2 px-2">
                <div className="inline-block min-w-full">
                    <table className="w-full text-[12px] border-separate border-spacing-0">
                        <thead>
                            <tr>
                                <th className="sticky left-0 z-10 bg-[var(--card-bg)] text-left text-muted font-semibold px-2.5 py-2 min-w-[180px]">
                                    {t("finances.heatmap.product")}
                                </th>
                                {buckets.map((b) => (
                                    <th
                                        key={b.key}
                                        className="text-right text-muted font-semibold px-2 py-2 whitespace-nowrap min-w-[72px]"
                                    >
                                        {bucketLabel(b.key, b.ts)}
                                    </th>
                                ))}
                                <th className="text-right text-muted font-semibold px-2.5 py-2 whitespace-nowrap min-w-[80px]">
                                    {t("finances.heatmap.avg")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map((p) => (
                                <tr key={p.name}>
                                    <td className="sticky left-0 z-10 bg-[var(--card-bg)] text-foreground font-medium px-2.5 py-2 truncate max-w-[220px]">
                                        <div className="truncate">{p.name}</div>
                                        <div className="text-[10px] text-muted truncate">
                                            <FinanceValue value={p.total_revenue} abbreviate className="tabular-nums" /> {t("finances.heatmap.revenueSuffix")}
                                        </div>
                                    </td>
                                    {buckets.map((b) => {
                                        const cell = cellIndex.get(`${p.name}|${b.key}`);
                                        return (
                                            <td key={b.key} className="px-1 py-1">
                                                <HeatCell cell={cell} />
                                            </td>
                                        );
                                    })}
                                    <td className="px-2.5 py-2 text-right tabular-nums font-semibold text-foreground">
                                        {p.total_margin_pct.toFixed(1)}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex items-center gap-3 mt-4 px-1 text-[11px] text-muted">
                <span>{t("finances.heatmap.margin")}</span>
                <LegendChip color="bg-rose-500/20 text-rose-700 dark:text-rose-300" label="≤ 0%" />
                <LegendChip color="bg-amber-500/20 text-amber-700 dark:text-amber-300" label="1–15%" />
                <LegendChip color="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" label="15–35%" />
                <LegendChip color="bg-emerald-500/35 text-emerald-800 dark:text-emerald-200" label="> 35%" />
            </div>
        </SectionCard>
    );
}

function HeatCell({ cell }: { cell?: { revenue: number; margin_pct: number; units: number } }) {
    const { t } = useLanguage();
    if (!cell || cell.revenue === 0) {
        return <div className="h-9 rounded-md border border-dashed border-[var(--card-border)] opacity-40" />;
    }
    const tone = marginTone(cell.margin_pct);
    return (
        <div
            className={cn(
                "h-9 rounded-md px-2 flex items-center justify-end text-[11px] font-semibold tabular-nums",
                tone
            )}
            title={t("finances.heatmap.cell", { revenue: Math.round(cell.revenue).toLocaleString("en-US"), units: cell.units, margin: cell.margin_pct.toFixed(1) })}
        >
            {cell.margin_pct.toFixed(0)}%
        </div>
    );
}

function marginTone(pct: number): string {
    if (pct <= 0) return "bg-rose-500/20 text-rose-700 dark:text-rose-300";
    if (pct < 15) return "bg-amber-500/20 text-amber-700 dark:text-amber-300";
    if (pct < 35) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    return "bg-emerald-500/35 text-emerald-800 dark:text-emerald-200";
}

function LegendChip({ color, label }: { color: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <span className={cn("w-3 h-3 rounded-sm", color)} />
            <span className="text-muted">{label}</span>
        </span>
    );
}
