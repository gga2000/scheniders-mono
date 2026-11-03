"use client";

import { useLanguage } from "@/hooks/use-language";
import { formatDuration, type ActivitySummary } from "@/lib/orders/order-activity";

/** Four numbers that answer "how is this order doing" before the feed is read. */
export function HistorySummary({ summary }: { summary: ActivitySummary }) {
    const { t, language } = useLanguage();
    const dur = (ms: number | null) => (ms === null ? t("orders.history.sum.none") : formatDuration(ms, language));
    const cells: { label: string; value: string }[] = [
        { label: t(summary.closed ? "orders.history.sum.ageClosed" : "orders.history.sum.age"), value: dur(summary.ageMs) },
        { label: t("orders.history.sum.toConfirm"), value: dur(summary.toConfirmMs) },
        { label: t(summary.deliveryOpen ? "orders.history.sum.deliveryOpen" : "orders.history.sum.delivery"), value: dur(summary.deliveryMs) },
        {
            label: t("orders.history.sum.topActor"),
            value: summary.topActor ? `${summary.topActor.name} (${summary.topActor.count})` : t("orders.history.sum.none"),
        },
    ];
    return (
        <dl className="grid grid-cols-4 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--background-soft)]">
            {cells.map((c, i) => (
                <div key={c.label} className={i > 0 ? "min-w-0 border-l border-[var(--card-border)] px-3 py-2" : "min-w-0 px-3 py-2"}>
                    <dt className="truncate text-[11px] text-[var(--foreground-muted)]">{c.label}</dt>
                    <dd className="truncate text-sm font-bold tabular-nums text-[var(--foreground)]"><bdi>{c.value}</bdi></dd>
                </div>
            ))}
        </dl>
    );
}
