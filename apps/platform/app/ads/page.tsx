"use client";

import { useState } from "react";
import { Megaphone, RefreshCw } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useMetaAdsAutoRefresh, useMetaAdsConnection, useMetaAdsReport, useMetaAdsSyncNow, type CampaignTotals } from "@/hooks/use-meta-ads";
import { MetaAdsConnectCard } from "@/components/ads/meta-ads-connect-card";

const RANGES = [7, 30, 90] as const;

function ratio(numerator: number, denominator: number): number | null {
    return denominator > 0 ? Math.round(numerator / denominator) : null;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
            {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        </div>
    );
}

function CampaignRow({ c }: { c: CampaignTotals }) {
    const costPerResult = ratio(c.spendIqd, c.results);
    return (
        <tr className="border-t border-[var(--card-border)]">
            <td className="py-3 pe-4 font-medium text-foreground">{c.campaignName}</td>
            <td className="py-3 pe-4 tabular-nums">{formatIQD(c.spendIqd)}</td>
            <td className="py-3 pe-4 tabular-nums text-muted">${c.spendUsd.toFixed(2)}</td>
            <td className="py-3 pe-4 tabular-nums">{c.results}</td>
            <td className="py-3 pe-4 tabular-nums">{costPerResult === null ? "—" : formatIQD(costPerResult)}</td>
            <td className="py-3 pe-4 tabular-nums text-muted">{c.clicks.toLocaleString()}</td>
        </tr>
    );
}

export default function AdsPage() {
    const { t } = useLanguage();
    const [days, setDays] = useState<(typeof RANGES)[number]>(30);
    const connection = useMetaAdsConnection();
    const report = useMetaAdsReport(days);
    const sync = useMetaAdsSyncNow();
    useMetaAdsAutoRefresh(connection.data?.is_active === true);

    const data = report.data;
    const costPerDelivered = data ? ratio(data.spendIqd, data.deliveredOrders) : null;
    const costPerResult = data ? ratio(data.spendIqd, data.results) : null;

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                        <Megaphone className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">{t("ads.title")}</h1>
                        <p className="text-xs text-muted">
                            {connection.data?.last_synced_at
                                ? `${t("ads.lastSync")}: ${new Date(connection.data.last_synced_at).toLocaleString()}`
                                : t("ads.neverSynced")}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-xl border border-[var(--card-border)] p-1">
                        {RANGES.map((r) => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => setDays(r)}
                                className={cn(
                                    "rounded-lg px-3 py-1 text-sm",
                                    days === r ? "bg-foreground text-background" : "text-muted",
                                )}
                            >
                                {r}d
                            </button>
                        ))}
                    </div>
                    {connection.data ? (
                        <button
                            type="button"
                            onClick={() => sync.mutate({ force: true })}
                            disabled={sync.isPending}
                            className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm disabled:opacity-60"
                        >
                            <RefreshCw className={cn("h-4 w-4", sync.isPending && "animate-spin")} />
                            {t("ads.syncNow")}
                        </button>
                    ) : null}
                </div>
            </header>

            {connection.data?.last_error ? (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
                    {t("ads.syncFailed")}: {connection.data.last_error}
                </p>
            ) : null}
            {sync.isError ? (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">{sync.error.message}</p>
            ) : null}

            {connection.isSuccess && !connection.data ? <MetaAdsConnectCard /> : null}

            {data ? (
                <>
                    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <Kpi label={t("ads.spend")} value={formatIQD(data.spendIqd)} hint={`$${data.spendUsd.toFixed(2)}`} />
                        <Kpi label={t("ads.results")} value={data.results.toLocaleString()} hint={t("ads.resultsHint")} />
                        <Kpi
                            label={t("ads.costPerResult")}
                            value={costPerResult === null ? "—" : formatIQD(costPerResult)}
                        />
                        <Kpi
                            label={t("ads.costPerDelivered")}
                            value={costPerDelivered === null ? "—" : formatIQD(costPerDelivered)}
                            hint={`${data.deliveredOrders.toLocaleString()} ${t("ads.deliveredOrders")}`}
                        />
                    </section>

                    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
                        <h2 className="mb-3 text-sm font-semibold text-foreground">{t("ads.campaigns")}</h2>
                        {data.campaigns.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted">{t("ads.empty")}</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-start text-sm">
                                    <thead className="text-xs text-muted">
                                        <tr>
                                            <th className="pb-2 pe-4 text-start font-medium">{t("ads.campaign")}</th>
                                            <th className="pb-2 pe-4 text-start font-medium">{t("ads.spend")}</th>
                                            <th className="pb-2 pe-4 text-start font-medium">USD</th>
                                            <th className="pb-2 pe-4 text-start font-medium">{t("ads.results")}</th>
                                            <th className="pb-2 pe-4 text-start font-medium">{t("ads.costPerResult")}</th>
                                            <th className="pb-2 pe-4 text-start font-medium">{t("ads.clicks")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.campaigns.map((c) => (
                                            <CampaignRow key={c.campaignId} c={c} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            ) : report.isError ? (
                <p className="text-sm text-red-600">{report.error.message}</p>
            ) : (
                <div className="h-48 animate-pulse rounded-2xl bg-[var(--card-bg)]" />
            )}
        </div>
    );
}
