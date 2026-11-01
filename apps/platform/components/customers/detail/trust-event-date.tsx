"use client";

import { useLanguage } from "@/hooks/use-language";
import { daysSince, relativeOrShortDate } from "@/lib/customer-reliability";
import { formatBaghdadDate } from "@/lib/customer-format";

/**
 * Which order a trust-score event came from and when, the one way the Trust factors card
 * and the score-breakdown modal both write it: "#SCH-10420 · 2 days ago". Recent events
 * read relative; past a month the short day (relativeOrShortDate, the card's and the
 * table's last-order rule too).
 * The full Baghdad calendar day is on hover and in the machine-readable dateTime. The
 * order number names the same order as Order history, so the two never look unrelated;
 * an event without one (a rating, a block) shows the date alone.
 */
export function TrustEventDate({ date, orderId, className }: { date: string; orderId?: string | null; className?: string }) {
    const { t, language } = useLanguage();
    const days = daysSince(date);
    const when = days === null
        ? <span>—</span>
        : (
            <time dateTime={date} title={formatBaghdadDate(date, language)}>
                <bdi>{relativeOrShortDate(date, days, language, t)}</bdi>
            </time>
        );
    return (
        <span className={className}>
            {orderId && (
                <>
                    <span className="font-mono tabular-nums">#{orderId}</span>
                    <span aria-hidden> · </span>
                </>
            )}
            {when}
        </span>
    );
}
