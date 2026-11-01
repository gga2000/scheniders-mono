"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useMetaAdInsights, type CampaignTotals } from "@/hooks/use-meta-ads";
import { campaignVerdict, ratio, type DayRange } from "@/lib/ads-report";
import type { AdsetTotals } from "@/lib/ads-creatives";

type SortKey = "spend" | "results" | "costPerResult" | "orders" | "delivered" | "costPerDelivered" | "clicks";

const COLUMNS: ReadonlyArray<{ key: SortKey; labelKey: string }> = [
    { key: "spend", labelKey: "ads.spend" },
    { key: "results", labelKey: "ads.results" },
    { key: "costPerResult", labelKey: "ads.costPerResult" },
    { key: "orders", labelKey: "ads.campaignOrders" },
    { key: "delivered", labelKey: "ads.chartDelivered" },
    { key: "costPerDelivered", labelKey: "ads.costPerDelivered" },
    { key: "clicks", labelKey: "ads.clicks" },
];

function valueOf(c: CampaignTotals, key: SortKey): number | null {
    switch (key) {
        case "spend": return c.spendIqd;
        case "results": return c.results;
        case "costPerResult": return ratio(c.spendIqd, c.results);
        case "orders": return c.orders;
        case "delivered": return c.delivered;
        case "costPerDelivered": return ratio(c.spendIqd, c.delivered);
        case "clicks": return c.clicks;
    }
}

const dash = (n: number | null, fmt: (v: number) => string) => (n === null ? "—" : fmt(n));

function AdsetBlock({ set }: { set: AdsetTotals }) {
    const { t } = useLanguage();
    return (
        <>
            <tr className="bg-[var(--card-bg)] font-medium text-foreground">
                <td className="py-2 pe-4 ps-6">{set.adsetName}</td>
                <td className="py-2 pe-4 tabular-nums">{formatIQD(set.spendIqd)}</td>
                <td className="py-2 pe-4 tabular-nums">{set.results}</td>
                <td className="py-2 pe-4 tabular-nums">{dash(set.ctr, (v) => `${v.toFixed(2)}%`)}</td>
                <td className="py-2 pe-4 tabular-nums">{dash(set.cpm, formatIQD)}</td>
                <td className="py-2 pe-4" />
                <td className="py-2 pe-4" />
            </tr>
            {set.ads.map((ad) => (
                <tr key={ad.adId} className="border-t border-[var(--card-border)] text-muted">
                    <td className="py-2 pe-4 ps-10">{ad.adName}</td>
                    <td className="py-2 pe-4 tabular-nums">{formatIQD(ad.spendIqd)}</td>
                    <td className="py-2 pe-4 tabular-nums">{ad.results}</td>
                    <td className="py-2 pe-4 tabular-nums">{dash(ad.ctr, (v) => `${v.toFixed(2)}%`)}</td>
                    <td className="py-2 pe-4 tabular-nums">{dash(ad.cpm, formatIQD)}</td>
                    <td className="py-2 pe-4 tabular-nums">{dash(ad.frequency, (v) => v.toFixed(2))}</td>
                    <td className="py-2 pe-4">
                        {ad.fatigued ? (
                            <span title={t("ads.fatiguedHint")} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700">
                                {t("ads.fatigued")}
                            </span>
                        ) : null}
                    </td>
                </tr>
            ))}
        </>
    );
}

function AdsetPanel({ sets, loading, error }: { sets: AdsetTotals[] | undefined; loading: boolean; error: string | null }) {
    const { t } = useLanguage();
    if (loading) return <div className="h-12 animate-pulse rounded-xl bg-[var(--card-bg)]" />;
    if (error) return <p className="text-sm text-red-600">{error}</p>;
    if (!sets || sets.length === 0) return <p className="text-sm text-muted">{t("ads.noAdData")}</p>;
    return (
        <table className="w-full text-start text-xs">
            <thead className="text-muted">
                <tr>
                    <th className="pb-1 pe-4 text-start font-medium">{t("ads.adset")} / {t("ads.ad")}</th>
                    <th className="pb-1 pe-4 text-start font-medium">{t("ads.spend")}</th>
                    <th className="pb-1 pe-4 text-start font-medium">{t("ads.results")}</th>
                    <th className="pb-1 pe-4 text-start font-medium">{t("ads.ctr")}</th>
                    <th className="pb-1 pe-4 text-start font-medium">{t("ads.cpm")}</th>
                    <th className="pb-1 pe-4 text-start font-medium">{t("ads.frequency")}</th>
                    <th className="pb-1 pe-4" />
                </tr>
            </thead>
            <tbody>
                {sets.map((set) => (
                    <AdsetBlock key={set.adsetId} set={set} />
                ))}
            </tbody>
        </table>
    );
}

/**
 * Campaign table: click a header to sort, click a row to open its ad sets and ads
 * (CTR, CPM, frequency, and a "tiring" flag). The header stays put while scrolling.
 */
export function AdsCampaignTable({ campaigns, breakEven, range }: { campaigns: CampaignTotals[]; breakEven: number | null; range: DayRange }) {
    const { t } = useLanguage();
    const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "spend", desc: true });
    const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
    const adInsights = useMetaAdInsights(range);

    const sorted = useMemo(() => {
        const dir = sort.desc ? -1 : 1;
        return [...campaigns].sort((a, b) => {
            const x = valueOf(a, sort.key);
            const y = valueOf(b, sort.key);
            if (x === null && y === null) return 0;
            if (x === null) return 1; // unknown always last
            if (y === null) return -1;
            return (x - y) * dir;
        });
    }, [campaigns, sort]);

    const toggle = (id: string) =>
        setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    return (
        <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-start text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--card-bg)] text-xs text-muted">
                    <tr>
                        <th className="pb-2 pe-4 text-start font-medium">{t("ads.campaign")}</th>
                        {COLUMNS.map((col) => (
                            <th key={col.key} aria-sort={sort.key === col.key ? (sort.desc ? "descending" : "ascending") : "none"} className="pb-2 pe-4 text-start font-medium">
                                <button
                                    type="button"
                                    onClick={() => setSort((s) => ({ key: col.key, desc: s.key === col.key ? !s.desc : true }))}
                                    className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.key === col.key && "text-foreground")}
                                >
                                    {t(col.labelKey)}
                                    {sort.key === col.key ? <span aria-hidden>{sort.desc ? "↓" : "↑"}</span> : null}
                                </button>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((c) => {
                        const costPerDelivered = ratio(c.spendIqd, c.delivered);
                        const costPerResult = ratio(c.spendIqd, c.results);
                        const verdict = campaignVerdict(costPerDelivered, breakEven);
                        const isOpen = open.has(c.campaignId);
                        return (
                            <Fragment key={c.campaignId}>
                                <tr className="border-t border-[var(--card-border)]">
                                    <td className="py-3 pe-4 font-medium text-foreground">
                                        <button
                                            type="button"
                                            onClick={() => toggle(c.campaignId)}
                                            aria-expanded={isOpen}
                                            aria-label={isOpen ? t("ads.collapse") : t("ads.expand")}
                                            className="inline-flex items-center gap-1.5 text-start"
                                        >
                                            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                            {c.campaignName}
                                        </button>
                                    </td>
                                    <td className="py-3 pe-4 tabular-nums">
                                        {formatIQD(c.spendIqd)} <span className="text-xs text-muted">${c.spendUsd.toFixed(2)}</span>
                                    </td>
                                    <td className="py-3 pe-4 tabular-nums">{c.results}</td>
                                    <td className="py-3 pe-4 tabular-nums">{dash(costPerResult, formatIQD)}</td>
                                    <td className="py-3 pe-4 tabular-nums">{c.orders}</td>
                                    <td className="py-3 pe-4 tabular-nums">{c.delivered}</td>
                                    <td className={cn("py-3 pe-4 font-medium tabular-nums", verdict === "profitable" && "text-emerald-600", verdict === "losing" && "text-red-600")}>
                                        {dash(costPerDelivered, formatIQD)}
                                    </td>
                                    <td className="py-3 pe-4 tabular-nums text-muted">{c.clicks.toLocaleString()}</td>
                                </tr>
                                {isOpen ? (
                                    <tr>
                                        <td colSpan={COLUMNS.length + 1} className="pb-3 ps-5 pe-4">
                                            <AdsetPanel
                                                sets={adInsights.data?.get(c.campaignId)}
                                                loading={adInsights.isPending}
                                                error={adInsights.isError ? adInsights.error.message : null}
                                            />
                                        </td>
                                    </tr>
                                ) : null}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
