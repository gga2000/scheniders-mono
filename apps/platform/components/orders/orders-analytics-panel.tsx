"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatIQD, FINANCIAL_MASK, cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useOrdersPanelStats } from "@/hooks/use-orders-panel-stats";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { ErrorBoundary } from "@scheniders/ui/error-boundary";
import { EASE_PANEL } from "@/components/layout/page-transition";
import { pctChange } from "@/lib/ads-report";
import {
    STRIP_PERIODS,
    deliveryRate,
    formatMinutes,
    perUnit,
    pointChange,
    type StripPeriod,
} from "@/lib/orders/analytics-strip";
import type { OrderFilters } from "@/lib/supabase";
import { OrdersAnalyticsCell } from "./orders-analytics-cell";

interface OrdersAnalyticsPanelProps {
    open: boolean;
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

const PERIOD_LABEL: Record<StripPeriod, string> = {
    today: "orders.analytics.period.today",
    "7": "orders.analytics.period.7",
    "30": "orders.analytics.period.30",
};

const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The collapsible analytics strip above the orders toolbar: one slim card, a period switch, and up to six
 * figures (orders, revenue, delivery rate, confirm speed, Meta spend, store visitors), each against the period
 * before it. Every number is computed on the server over the whole book (get_orders_panel_stats), in Baghdad
 * days, with the revenue rule Finances uses, so it never depends on which orders happen to be loaded.
 */
export function OrdersAnalyticsPanel({
    open,
    filters,
    setFilters,
    flaggedCount,
    attentionCounts,
    countsHidden = false,
    flaggedCountHidden = false,
}: OrdersAnalyticsPanelProps) {
    return (
        <AnimatePresence initial={false}>
            {open && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: EASE_PANEL }}
                    className="overflow-hidden"
                >
                    <div className="pb-5">
                        <ErrorBoundary name="Analytics Dashboard">
                            <AnalyticsStrip
                                filters={filters}
                                setFilters={setFilters}
                                flaggedCount={flaggedCount}
                                attentionCounts={attentionCounts}
                                countsHidden={countsHidden}
                                flaggedCountHidden={flaggedCountHidden}
                            />
                        </ErrorBoundary>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

type StripProps = Omit<OrdersAnalyticsPanelProps, "open">;

/** Mounted only while the panel is open, so a closed panel costs no queries. */
function AnalyticsStrip({ filters, setFilters, flaggedCount, attentionCounts, countsHidden = false, flaggedCountHidden = false }: StripProps) {
    const { t } = useLanguage();
    const { revealed, canReveal } = useFinancialVisibility();
    const moneyOn = revealed && canReveal;
    const [period, setPeriod] = useState<StripPeriod>("today");
    const stats = useOrdersPanelStats(period);
    const { current, previous, qualityCurrent, qualityPrevious, windows } = stats;

    const money = (n: number) => (moneyOn ? formatIQD(n) : FINANCIAL_MASK);
    const days = period === "today" ? null : period;
    const vsLabel = days === null ? t("orders.analytics.vsToday") : t("orders.analytics.vsPrev").replace("{n}", days);
    const wideTag = windows.qualityIsWider ? t("orders.analytics.period.7") : null;
    const series = (key: "orders" | "revenue") => qualityCurrent.data?.daily.map((d) => d[key]);

    const minutesText = (minutes: number) => {
        const m = formatMinutes(minutes);
        if (m.underOne) return t("orders.analytics.minUnder");
        if (m.hours === 0) return t("orders.analytics.min").replace("{n}", String(m.minutes));
        return t("orders.analytics.hourMin").replace("{h}", String(m.hours)).replace("{m}", String(m.minutes));
    };

    const rateNow = qualityCurrent.data ? deliveryRate(qualityCurrent.data) : null;
    const rateBefore = qualityPrevious.data ? deliveryRate(qualityPrevious.data) : null;
    const decided = qualityCurrent.data ? qualityCurrent.data.cohort_realized + qualityCurrent.data.cohort_rejected : 0;

    const confirmNow = qualityCurrent.data?.confirm_median_min ?? null;
    const confirmBefore = qualityPrevious.data?.confirm_median_min ?? null;

    const spendNow = stats.ads?.spend.data;
    const costPerDelivered = spendNow === undefined || !current.data ? null : perUnit(spendNow, current.data.delivered);

    const storeNow = stats.store.figures?.current;
    const storeBefore = stats.store.figures?.previous;

    const attention: Array<{ key: string; label: string; n: number; tone: string; apply: () => void }> = [];
    if (!flaggedCountHidden) attention.push({ key: "flagged", label: t("orders.stats.flagged"), n: flaggedCount, tone: "text-rose-600", apply: () => setFilters({ ...filters, riskLevel: "flagged" }) });
    if (!countsHidden) {
        attention.push(
            { key: "urgent", label: t("orders.stats.urgent"), n: attentionCounts.urgent, tone: "text-red-600", apply: () => setFilters({ ...filters, priority: "urgent" }) },
            { key: "no_response", label: t("orders.stats.noResponse"), n: attentionCounts.noResponse, tone: "text-orange-600", apply: () => setFilters({ ...filters, status: "no_response" }) },
            { key: "return_pending", label: t("orders.stats.returnsPending"), n: attentionCounts.returnPending, tone: "text-yellow-700", apply: () => setFilters({ ...filters, status: "return_pending" }) },
        );
    }
    const pills = attention.filter((a) => a.n > 0);

    return (
        <section aria-label={t("orders.tip.analytics")} className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm" data-testid="orders-analytics-strip">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--card-border)] px-3 py-2">
                <div role="group" aria-label={t("orders.tip.analytics")} className="inline-flex rounded-lg bg-[var(--background-soft)] p-0.5">
                    {STRIP_PERIODS.map((p) => (
                        <button
                            key={p}
                            type="button"
                            aria-pressed={period === p}
                            onClick={() => setPeriod(p)}
                            className={cn(
                                "rounded-md px-3 py-1 text-[12px] font-semibold transition-colors",
                                period === p ? "bg-[var(--card-bg)] text-foreground shadow-sm" : "text-[var(--foreground-muted)] hover:text-foreground",
                            )}
                            data-period={p}
                        >
                            {t(PERIOD_LABEL[p])}
                        </button>
                    ))}
                </div>
                {pills.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5" data-testid="orders-analytics-attention">
                        {pills.map((a) => (
                            <button
                                key={a.key}
                                type="button"
                                onClick={a.apply}
                                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] px-2.5 py-0.5 text-[12px] text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-soft)]"
                            >
                                {a.label}
                                <b className={cn("tabular-nums", a.tone)} data-attention={a.key}>{a.n}</b>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {current.isError || previous.isError ? (
                <div className="flex items-center justify-between gap-3 px-4 py-5 text-sm text-[var(--foreground-muted)]">
                    <span>{t("orders.analytics.loadError")}</span>
                    <button
                        type="button"
                        onClick={() => {
                            void current.refetch();
                            void previous.refetch();
                            void qualityCurrent.refetch();
                            void qualityPrevious.refetch();
                        }}
                        className="rounded-lg border border-[var(--card-border)] px-3 py-1 text-[12px] font-semibold text-foreground hover:bg-[var(--background-soft)]"
                        data-testid="orders-analytics-retry"
                    >
                        {t("orders.analytics.retry")}
                    </button>
                </div>
            ) : (
                <div className="grid grid-flow-col auto-cols-fr divide-x divide-[var(--card-border)]">
                    <OrdersAnalyticsCell
                        testId="orders"
                        label={t("orders.analytics.orders")}
                        hint={t("orders.analytics.tip.orders")}
                        value={current.data ? whole(current.data.orders) : null}
                        change={current.data && previous.data ? pctChange(current.data.orders, previous.data.orders) : null}
                        caption={vsLabel}
                        series={series("orders")}
                    />
                    <OrdersAnalyticsCell
                        testId="revenue"
                        label={t("orders.analytics.revenue")}
                        hint={t("orders.analytics.tip.revenue")}
                        value={current.data ? money(current.data.revenue) : null}
                        // A money delta would leak the hidden figure, so it hides with it.
                        change={moneyOn && current.data && previous.data ? pctChange(current.data.revenue, previous.data.revenue) : null}
                        caption={moneyOn ? vsLabel : null}
                        series={moneyOn ? series("revenue") : undefined}
                    />
                    <OrdersAnalyticsCell
                        testId="delivery_rate"
                        label={t("orders.analytics.deliveryRate")}
                        hint={t("orders.analytics.tip.deliveryRate")}
                        value={qualityCurrent.data ? (rateNow === null ? "—" : `${rateNow.toFixed(0)}%`) : null}
                        change={pointChange(rateNow, rateBefore)}
                        changeUnit="pt"
                        tag={wideTag}
                        caption={decided > 0 ? t("orders.analytics.ofDecided").replace("{a}", String(qualityCurrent.data?.cohort_realized ?? 0)).replace("{b}", String(decided)) : null}
                    />
                    <OrdersAnalyticsCell
                        testId="confirm_speed"
                        label={t("orders.analytics.confirmSpeed")}
                        hint={t("orders.analytics.tip.confirmSpeed")}
                        value={qualityCurrent.data ? (confirmNow === null ? "—" : minutesText(confirmNow)) : null}
                        change={confirmNow !== null && confirmBefore !== null ? pctChange(confirmNow, confirmBefore) : null}
                        lowerIsBetter
                        tag={wideTag}
                        caption={qualityCurrent.data && qualityCurrent.data.confirm_n > 0 ? t("orders.analytics.ofOrders").replace("{n}", String(qualityCurrent.data.confirm_n)) : null}
                    />
                    {stats.ads && (
                        <OrdersAnalyticsCell
                            testId="ad_spend"
                            label={t("orders.analytics.adSpend")}
                            hint={t("orders.analytics.tip.adSpend")}
                            value={spendNow === undefined ? null : money(spendNow)}
                            // More spend is neither good nor bad on its own, so no change arrow: the cost per delivered order is the verdict.
                            caption={
                                moneyOn && costPerDelivered !== null
                                    ? t("orders.analytics.costPerDelivered").replace("{v}", formatIQD(costPerDelivered))
                                    : null
                            }
                        />
                    )}
                    {stats.store.hasTraffic && (
                        <OrdersAnalyticsCell
                            testId="visitors"
                            label={t("orders.analytics.visitors")}
                            hint={t("orders.analytics.tip.visitors")}
                            value={storeNow ? whole(storeNow.visitors) : null}
                            change={storeNow && storeBefore ? pctChange(storeNow.visitors, storeBefore.visitors) : null}
                            caption={
                                storeNow?.conversion != null
                                    ? t("orders.analytics.conversion").replace("{v}", storeNow.conversion.toFixed(1))
                                    : null
                            }
                        />
                    )}
                </div>
            )}
        </section>
    );
}
