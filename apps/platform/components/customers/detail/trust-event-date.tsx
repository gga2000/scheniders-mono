"use client";

import { useLanguage } from "@/hooks/use-language";
import { daysAgoLabel, daysSince } from "@/lib/customer-reliability";
import { formatBaghdadDate } from "@/lib/customer-format";

/**
 * When a trust-score event happened, the one way the Trust factors card and the
 * score-breakdown modal both write it: relative ("2 days ago"), with the Baghdad
 * calendar day on hover and in the machine-readable dateTime.
 */
export function TrustEventDate({ date, className }: { date: string; className?: string }) {
    const { t, language } = useLanguage();
    const days = daysSince(date);
    if (days === null) return <span className={className}>—</span>;
    return (
        <time dateTime={date} title={formatBaghdadDate(date, language)} className={className}>
            <bdi>{daysAgoLabel(days, t)}</bdi>
        </time>
    );
}
