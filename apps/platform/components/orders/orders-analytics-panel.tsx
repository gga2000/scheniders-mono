"use client";

import { AnimatePresence, motion } from "framer-motion";
import { formatIQD, cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useOrdersPanelStats } from "@/hooks/use-orders-panel-stats";
import { ErrorBoundary } from "@scheniders/ui/error-boundary";
import { EASE_PANEL } from "@/components/layout/page-transition";
import { pctChange } from "@/lib/ads-report";
import { perUnit, pointChange } from "@/lib/orders/analytics-strip";
import type { OrderFilters } from "@/lib/supabase";
import { OrdersAnalyticsCell } from "./orders-analytics-cell";

interface OrdersAnalyticsPanelProps {
    open: boolean;
    /** The page's filters: the bar reads the same date range (and city / product / priority / payment) the list does. */
    filters: OrderFilters;
    setFilters: (filters: OrderFilters) => void;
    /** Orders with a data-quality problem or a rejection, for the attention pills. */
    flaggedCount: number;
    /** Urgent / no response / returns pending, each the length of the list its click opens (useOrderFilters). */
    attentionCounts: { urgent: number; noResponse: number; returnPending: number };
    /**
     * Attention numbers are not shown: the list they would describe is not the one on screen (search, archive,
     * a refinement, or a window still loading). See lib/orders/count-visibility.ts.
     */
    countsHidden?: boolean;
    /** The Flagged number is not shown (its own visibility rule). */
    flaggedCountHidden?: boolean;
}

const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The collapsible analytics bar above the orders toolbar: one slim dark strip of up to six figures (orders,
 * revenue, delivery rate, confirm speed, Meta spend, store visitors) for whatever the page's date filter and
 * other filters show, each against the period right before it. Every number is computed on the server over the
 * whole book (get_orders_panel_stats), in Baghdad days, with the revenue rule Finances uses, so it never depends
 * on which orders happen to be loaded.
 */
export function OrdersAnalyticsPanel(props: OrdersAnalyticsPanelProps) {
    return (
        <AnimatePresence initial={false}>
            {props.open && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: EASE_PANEL }}
                    className="overflow-hidden"
                >
                    <div className="pb-5">
                        <ErrorBoundary name="Analytics Dashboard">
                            <AnalyticsBar {...props} />
                        </ErrorBoundary>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/** Mounted only while the panel is open, so a closed panel costs no queries. */
function AnalyticsBar({ filters, setFilters, flaggedCount, attentionCounts, countsHidden = false, flaggedCountHidden = false }: OrdersAnalyticsPanelProps) {
    const { t } = useLanguage();
    const stats = useOrdersPanelStats(filters);
    const { current, previous, windows } = stats;

    const shell = "flex flex-wrap items-center gap-y-2 rounded-2xl bg-stone-900 px-3 py-2.5 text-stone-50 shadow-lg shadow-black/10 ring-1 ring-white/5";

    if (!stats.salesView) {
        return (
            <section aria-label={t("orders.tip.analytics")} className={shell} data-testid="orders-analytics-strip">
                <span className="px-2 text-[13px] text-stone-300">{t("orders.analytics.notSales")}</span>
            </section>
        );
    }

    const comparing = windows.previous !== null;

    const spend = stats.ads?.spend.data;
    const costPerOrder = spend === undefined || !current.data ? null : perUnit(spend, current.data.orders);
    const storeNow = stats.store.figures?.current;
    const storeBefore = stats.store.figures?.previous;

    // Each pill is a switch: one click narrows the list, the next one lifts it. An active pill stays on screen even
    // when its count is hidden or zero (the narrowed list is what the counts would describe), so it can always be lifted.
    const attention: Array<{ key: string; label: string; n: number | null; tone: string; active: boolean; apply: () => void; clear: () => void }> = [
        {
            key: "flagged", label: t("orders.stats.flagged"), n: flaggedCountHidden ? null : flaggedCount, tone: "text-rose-400", active: filters.riskLevel === "flagged",
            apply: () => setFilters({ ...filters, riskLevel: "flagged" }), clear: () => setFilters({ ...filters, riskLevel: undefined }),
        },
        {
            key: "urgent", label: t("orders.stats.urgent"), n: countsHidden ? null : attentionCounts.urgent, tone: "text-red-400", active: filters.priority === "urgent",
            apply: () => setFilters({ ...filters, priority: "urgent" }), clear: () => setFilters({ ...filters, priority: undefined }),
        },
        {
            key: "no_response", label: t("orders.stats.noResponse"), n: countsHidden ? null : attentionCounts.noResponse, tone: "text-orange-400", active: filters.status === "no_response",
            apply: () => setFilters({ ...filters, status: "no_response" }), clear: () => setFilters({ ...filters, status: "all" }),
        },
        {
            key: "return_pending", label: t("orders.stats.returnsPending"), n: countsHidden ? null : attentionCounts.returnPending, tone: "text-yellow-300", active: filters.status === "return_pending",
            apply: () => setFilters({ ...filters, status: "return_pending" }), clear: () => setFilters({ ...filters, status: "all" }),
        },
    ];
    const pills = attention.filter((a) => a.active || (a.n !== null && a.n > 0));

    if (current.isError || previous.isError) {
        return (
            <section aria-label={t("orders.tip.analytics")} className={cn(shell, "justify-between")} data-testid="orders-analytics-strip">
                <span className="px-2 text-[13px] text-stone-300">{t("orders.analytics.loadError")}</span>
                <button
                    type="button"
                    onClick={() => {
                        void current.refetch();
                        void previous.refetch();
                    }}
                    className="rounded-lg bg-white/10 px-3 py-1 text-[12px] font-semibold hover:bg-white/15"
                    data-testid="orders-analytics-retry"
                >
                    {t("orders.analytics.retry")}
                </button>
            </section>
        );
    }

    return (
        <section aria-label={t("orders.tip.analytics")} className={shell} data-testid="orders-analytics-strip">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-y-1.5">
                {stats.store.show && storeNow && (
                    <OrdersAnalyticsCell
                        testId="visitors"
                        label={t("orders.analytics.visitors")}
                        hint={t("orders.analytics.tip.visitors")}
                        value={whole(storeNow.visitors)}
                        change={storeBefore ? pctChange(storeNow.visitors, storeBefore.visitors) : null}
                    />
                )}
                <OrdersAnalyticsCell
                    testId="orders"
                    label={t("orders.analytics.orders")}
                    hint={t("orders.analytics.tip.orders")}
                    value={current.data ? whole(current.data.orders) : null}
                    change={comparing && current.data && previous.data ? pctChange(current.data.orders, previous.data.orders) : null}
                />
                {stats.store.show && storeNow && (
                    <OrdersAnalyticsCell
                        testId="conversion"
                        label={t("orders.analytics.conversionRate")}
                        hint={t("orders.analytics.tip.conversion")}
                        value={storeNow.conversion === null ? "—" : `${storeNow.conversion.toFixed(1)}%`}
                        change={pointChange(storeNow.conversion, storeBefore?.conversion ?? null)}
                        changeUnit="pt"
                    />
                )}
                <OrdersAnalyticsCell
                    testId="revenue"
                    label={t("orders.analytics.revenue")}
                    hint={t("orders.analytics.tip.revenue")}
                    value={current.data ? formatIQD(current.data.revenue) : null}
                    change={comparing && current.data && previous.data ? pctChange(current.data.revenue, previous.data.revenue) : null}
                />
                {stats.ads && (
                    <>
                        <OrdersAnalyticsCell
                            testId="ad_spend"
                            label={t("orders.analytics.adSpend")}
                            hint={t("orders.analytics.tip.adSpend")}
                            value={spend === undefined ? null : formatIQD(spend)}
                        />
                        <OrdersAnalyticsCell
                            testId="cpa"
                            label={t("orders.analytics.cpa")}
                            hint={t("orders.analytics.tip.cpa")}
                            value={spend === undefined || !current.data ? null : costPerOrder === null ? "—" : formatIQD(costPerOrder)}
                        />
                        {stats.ads.limit.data && (
                            <OrdersAnalyticsCell
                                testId="ad_limit"
                                label={t("orders.analytics.adLimit")}
                                hint={t("orders.analytics.tip.adLimit")}
                                value={formatIQD(stats.ads.limit.data.leftIqd)}
                            />
                        )}
                    </>
                )}
            </div>
            {pills.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 ps-3" data-testid="orders-analytics-attention">
                    {pills.map((a) => (
                        <button
                            key={a.key}
                            type="button"
                            onClick={a.active ? a.clear : a.apply}
                            aria-pressed={a.active}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                                a.active ? "border-white/40 bg-white/15 text-white" : "border-white/15 text-stone-200 hover:bg-white/10",
                            )}
                        >
                            {a.label}
                            <b className={cn("tabular-nums", a.tone)} data-attention={a.key}>{a.active && a.n === null ? "×" : a.n}</b>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
