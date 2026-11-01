"use client";

import { motion } from "framer-motion";
import { AlertTriangle, CircleHelp, Megaphone, RefreshCw } from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { AdChannelBadge } from "@/components/orders/ad-channel-badge";
import { resolveChannel } from "@/lib/ad-attribution";
import type { ChannelPerformanceRow, ChannelPerformanceSummary } from "@/lib/analytics/channel-metrics";

/**
 * Where the money actually came from.
 *
 * The neighbouring "Source Performance" card groups by `orders.source`, which
 * says "lightfunnels" for every paid order — true, and useless for deciding
 * where next month's budget goes. This splits the period's orders by the ad
 * network the customer clicked, ranked by revenue that landed rather than by
 * volume. Orders with no channel stay in their own "unattributed" row.
 */

interface ChannelPerformanceProps {
    data: ChannelPerformanceSummary | undefined;
    loading: boolean;
    error: Error | null;
    onRetry: () => void;
}

const cardMotion = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

function EmptyState({ title, description }: { title: string; description: string }) {
    return (
        <motion.div {...cardMotion} className="pastel-card p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/10 dark:bg-white/5 flex items-center justify-center mx-auto mb-4">
                <Megaphone className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            <p className="text-sm text-muted mt-1">{description}</p>
        </motion.div>
    );
}

function Stats({ row, showMoney }: { row: ChannelPerformanceRow; showMoney: boolean }) {
    const { t } = useLanguage();
    return (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span title={t("reports.channels.shareHint")}>
                <span className="tabular-nums">{row.share.toFixed(0)}%</span> {t("reports.channels.ofOrders")}
            </span>
            {row.deliveryRate !== null && (
                <span title={t("reports.channels.deliveryHint")}>
                    <span className="tabular-nums">{row.deliveryRate.toFixed(0)}%</span> {t("reports.channels.delivered")}
                </span>
            )}
            {showMoney && row.revenuePerOrder !== null && (
                <span title={t("reports.channels.perOrderHint")}>
                    <span className="tabular-nums">{formatIQD(Math.round(row.revenuePerOrder))}</span>{" "}
                    {t("reports.channels.perOrder")}
                </span>
            )}
        </div>
    );
}

function Headline({ row }: { row: ChannelPerformanceRow }) {
    const { t } = useLanguage();
    return (
        <div className="flex items-center gap-4 text-xs">
            {row.realizedRevenue !== null && (
                <span className="font-bold text-foreground tabular-nums">{formatIQD(row.realizedRevenue)}</span>
            )}
            <span className="text-muted">
                <span className="tabular-nums">{row.orders}</span> {t("reports.channels.orders")}
            </span>
        </div>
    );
}

export function ChannelPerformance({ data, loading, error, onRetry }: ChannelPerformanceProps) {
    const { t } = useLanguage();

    if (loading && !data) {
        return <div className="h-64 animate-pulse bg-black/5 dark:bg-white/5 rounded-3xl" />;
    }

    if (error && !data) {
        return (
            <motion.div {...cardMotion} className="pastel-card p-8 text-center">
                <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
                <h3 className="text-base font-bold text-foreground">{t("reports.channels.error")}</h3>
                <p className="text-xs text-muted mt-1 break-words">{error.message}</p>
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-medium text-foreground hover:shadow-md transition-all"
                >
                    <RefreshCw className="w-4 h-4" />
                    {t("reports.channels.retry")}
                </button>
            </motion.div>
        );
    }

    if (!data || data.totalOrders === 0) {
        return <EmptyState title={t("reports.channels.emptyTitle")} description={t("reports.channels.emptyDesc")} />;
    }

    const showMoney = data.totalRealizedRevenue !== null;
    // The widest bar is the leader, so small channels stay visible instead of
    // collapsing to a sliver against the biggest one. Without money access the
    // bar measures orders instead.
    const barValue = (row: ChannelPerformanceRow) => (showMoney ? row.realizedRevenue ?? 0 : row.orders);
    const maxBar = Math.max(...data.channels.map(barValue), 1);

    return (
        <motion.div {...cardMotion} className="pastel-card p-6 overflow-hidden relative">
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-gradient-to-br from-fuchsia-500/10 to-sky-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
                    <div>
                        <h3 className="text-lg font-bold text-foreground">{t("reports.channels.title")}</h3>
                        <p className="text-sm text-muted mt-0.5">
                            {showMoney ? t("reports.channels.subtitle") : t("reports.channels.subtitleNoMoney")}
                        </p>
                    </div>
                    <div className="text-end">
                        {data.totalRealizedRevenue !== null && (
                            <div className="text-xl font-bold text-foreground tabular-nums">
                                {formatIQD(data.totalRealizedRevenue)}
                            </div>
                        )}
                        <div className="text-xs text-muted">
                            <span className="tabular-nums">{data.totalOrders}</span> {t("reports.channels.orders")}
                            {" · "}
                            <span data-testid="channel-coverage">
                                {t("reports.channels.coverage", { pct: data.attributedShare.toFixed(0) })}
                            </span>
                        </div>
                    </div>
                </div>

                {data.channels.length === 0 && (
                    <div className="mb-3 rounded-2xl border border-dashed border-[var(--card-border)] p-4 text-center">
                        <p className="text-sm font-bold text-foreground">{t("reports.channels.noneTitle")}</p>
                        <p className="text-xs text-muted mt-1">{t("reports.channels.noneDesc")}</p>
                    </div>
                )}

                <div className="space-y-3">
                    {data.channels.map(row => (
                        <div
                            key={row.channel}
                            data-channel={row.channel}
                            className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-3 dark:bg-white/5"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-muted tabular-nums w-5">{row.rank}</span>
                                    <AdChannelBadge
                                        attribution={{
                                            channel: resolveChannel(row.channel ?? undefined),
                                            // An unrecognised network keeps its raw name; the generic bucket gets a word.
                                            source: row.channel === "other" ? t("reports.channels.other") : row.channel ?? undefined,
                                        }}
                                        compact
                                    />
                                </div>
                                <Headline row={row} />
                            </div>

                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-sky-500"
                                    style={{ width: `${Math.max((barValue(row) / maxBar) * 100, 2)}%` }}
                                />
                            </div>

                            <Stats row={row} showMoney={showMoney} />
                        </div>
                    ))}

                    {data.unattributed && (
                        <div
                            data-channel="unattributed"
                            className="rounded-2xl border border-dashed border-[var(--card-border)] p-3"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-5" />
                                    <span
                                        className="inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] px-2 py-0.5 text-[10px] font-bold text-muted"
                                        title={t("reports.channels.unattributedHint")}
                                    >
                                        <CircleHelp className="h-3 w-3" aria-hidden="true" />
                                        {t("reports.channels.unattributed")}
                                    </span>
                                </div>
                                <Headline row={data.unattributed} />
                            </div>
                            <p className="mt-2 text-[11px] text-muted">{t("reports.channels.unattributedHint")}</p>
                            <Stats row={data.unattributed} showMoney={showMoney} />
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
