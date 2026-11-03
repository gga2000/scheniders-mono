"use client";

import { useMemo, useState } from "react";
import { History, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useOrderActivity } from "@/hooks/use-order-activity";
import { formatBaghdadDate } from "@/lib/baghdad-date";
import { baghdadDayStart } from "@/lib/order-window";
import {
    ACTIVITY_FILTERS,
    buildActivityFeed,
    buildJourney,
    buildSummary,
    dayLabel,
    eventFilter,
    filterCounts,
    groupByBaghdadDay,
    type ActivityFilter,
} from "@/lib/orders/order-activity";
import type { Order } from "@/lib/supabase";
import { HistoryJourney } from "./history-journey";
import { HistorySummary } from "./history-summary";
import { HistoryEvent } from "./history-event";

/**
 * The order's history tab (السجل): the journey bar, four summary numbers,
 * filter chips, then every recorded action grouped by Baghdad day, newest
 * first. All of it comes from get_order_activity in one request.
 */
export function OrderHistory({ order }: { order: Order }) {
    const { t } = useLanguage();
    const { data, isPending, isError, refetch, isFetching } = useOrderActivity(order.id, order.version, true);
    const [filter, setFilter] = useState<ActivityFilter>("all");
    // One clock per load, so the summary and day labels agree with each other.
    const [now] = useState(() => Date.now());
    const isReturn = !!order.is_return;

    const view = useMemo(() => {
        if (!data) return null;
        const feed = buildActivityFeed(data.events);
        return {
            feed,
            counts: filterCounts(feed),
            journey: buildJourney(order.status, isReturn, feed, data.order.created_at),
            summary: buildSummary(order.status, data.order.created_at, feed, now),
        };
    }, [data, order.status, isReturn, now]);

    if (isPending) {
        return (
            <div className="py-10 text-center" role="status">
                <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[var(--ink)] border-t-transparent" />
                <p className="text-sm text-[var(--foreground-muted)]">{t("orders.history.loading")}</p>
            </div>
        );
    }

    if (isError || !view || !data) {
        return (
            <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
                <p className="text-sm text-[var(--foreground-muted)]">{t("orders.history.loadFailed")}</p>
                <button
                    type="button"
                    onClick={() => void refetch()}
                    disabled={isFetching}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--ink)] disabled:opacity-50"
                >
                    <RotateCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                    {t("orders.history.retry")}
                </button>
            </div>
        );
    }

    const shown = filter === "all" ? view.feed : view.feed.filter((e) => eventFilter(e) === filter);
    const groups = groupByBaghdadDay(shown);

    return (
        <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-2 pb-2 pt-3">
                <HistoryJourney steps={view.journey} isReturn={isReturn} now={now} />
            </div>
            <HistorySummary summary={view.summary} />

            <div role="toolbar" aria-label={t("orderDetail.history")} className="flex flex-wrap items-center gap-1.5">
                {ACTIVITY_FILTERS.map((f) => {
                    const count = view.counts[f];
                    if (f !== "all" && count === 0) return null;
                    const active = filter === f;
                    return (
                        <button
                            key={f}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]",
                                active
                                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--ink-contrast)]"
                                    : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] hover:border-[var(--ink)]",
                            )}
                        >
                            {t(`orders.history.filter.${f}`)}
                            <span className={cn("tabular-nums", active ? "opacity-70" : "text-[var(--foreground-muted)]")}>{count}</span>
                        </button>
                    );
                })}
            </div>

            <div className="max-h-[46vh] overflow-y-auto pr-1">
                {groups.length === 0 ? (
                    <div className="py-10 text-center">
                        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--background-soft)]">
                            <History className="h-6 w-6 text-[var(--foreground-subtle)]" />
                        </div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">
                            {t(view.feed.length === 0 ? "orders.history.empty" : "orders.history.emptyFilter")}
                        </p>
                    </div>
                ) : (
                    groups.map((g) => {
                        const label = dayLabel(g.day, now);
                        return (
                            <section key={g.day} aria-label={g.day}>
                                <h3 className="sticky top-0 z-20 mb-2 flex items-center gap-3 bg-[var(--card-bg)] py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                                    <bdi>
                                        {label.kind === "today" ? t("orders.history.today") : label.kind === "yesterday" ? t("orders.history.yesterday") : null}
                                        {label.kind !== "date" && " · "}
                                        <span className="tabular-nums">{formatBaghdadDate(baghdadDayStart(g.day))}</span>
                                    </bdi>
                                    <span aria-hidden="true" className="h-px flex-1 bg-[var(--card-border)]" />
                                </h3>
                                <ol>
                                    {g.events.map((e, i) => (
                                        <HistoryEvent key={`${e.kind}-${e.id}`} e={e} order={data.order} isReturn={isReturn} isLast={i === g.events.length - 1} />
                                    ))}
                                </ol>
                            </section>
                        );
                    })
                )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--foreground-subtle)]">
                <bdi className="tabular-nums">{t("orders.history.count", { shown: shown.length, total: view.feed.length })}</bdi>
                <span>{t("orders.history.timezone")}</span>
            </div>
        </div>
    );
}
