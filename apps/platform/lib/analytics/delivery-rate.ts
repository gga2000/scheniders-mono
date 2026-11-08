/**
 * The one delivery rate every page reports: of the parcels that reached a
 * final answer at the door, the share the customer took.
 *
 *     delivered ÷ (delivered + rejected)
 *
 * Cancelled orders never left the shop, so they are not delivery attempts and
 * do not count. Orders still on the way have no answer yet and are left out.
 * Pages that show a narrower slice (one city, one channel, last 7 days) use the
 * same formula over fewer orders and say which slice in their label.
 *
 * Returns null when nothing has been decided yet, so callers can show "—"
 * instead of a misleading 0%.
 */
export function deliveryRatePct(delivered: number, rejected: number): number | null {
    const decided = delivered + rejected;
    return decided > 0 ? (delivered / decided) * 100 : null;
}
