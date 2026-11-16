/**
 * « · آخر 7 أيام» after a card title: the period the card counts (round 15,
 * board D2). Nothing when the card has no period of its own.
 */
export function PeriodTag({ label }: { label?: string }) {
    if (!label) return null;
    return <span className="font-medium opacity-70"> · <bdi>{label}</bdi></span>;
}
