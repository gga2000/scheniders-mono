"use client";

import { useLanguage } from "@/hooks/use-language";
import { daysAgoLabel, daysSince } from "@/lib/customer-reliability";
import { formatBaghdadDate, formatBaghdadShortDate } from "@/lib/customer-format";

/** Up to this many days an event reads relative ("20 days ago"); older, as its day ("Jul 12"). */
export const RELATIVE_EVENT_DAYS = 30;

/**
 * Which order a trust-score event came from and when, the one way the Trust factors card
 * and the score-breakdown modal both write it: "#SCH-10420 · 2 days ago". Recent events
 * read relative; past a month the short day, so nobody counts back from "117 days ago".
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
                <bdi>{days <= RELATIVE_EVENT_DAYS ? daysAgoLabel(days, t) : formatBaghdadShortDate(date, language)}</bdi>
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
