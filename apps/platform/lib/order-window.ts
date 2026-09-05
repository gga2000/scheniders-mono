/**
 * The "window" of orders the cache currently holds.
 *
 * While the page fetches every non-archived order the cache IS the complete set
 * and the window is `null`. Once PERF-1 stage C narrows the fetch to the active
 * date filter, realtime has to know what belongs: an INSERT for an order outside
 * the window must not be prepended, and an UPDATE for a row that was never
 * loaded must not conjure a phantom into a list the merchant is acting on.
 *
 * TIMEZONE. The merchant's date filter is a calendar day in Iraq, and
 * `get_orders_aggregates` buckets on Asia/Baghdad. If the row fetch used UTC
 * day boundaries instead, the list and the status-chip counts would disagree by
 * three hours' worth of orders every day. Both sides therefore resolve a
 * calendar day to the same absolute instants here. Iraq is UTC+3 year-round with
 * no daylight saving, so a fixed offset is correct rather than a simplification.
 */

/** Iraq (Asia/Baghdad) is UTC+3 all year — no DST transitions to handle. */
export const BAGHDAD_UTC_OFFSET_HOURS = 3;

export type OrderWindow = {
    /** Inclusive lower bound, as an absolute instant. */
    fromInstant: number;
    /** Inclusive upper bound, as an absolute instant. */
    toInstant: number;
} | null;

/**
 * Resolve a merchant-facing date filter (`YYYY-MM-DD`, Baghdad calendar days)
 * to the absolute instants the fetch and the predicate both use.
 *
 * Returns `null` when the filter is open-ended, which means "the cache is not
 * windowed by date" — the caller then holds the complete set.
 */
export function windowFromDateFilter(dateFrom?: string, dateTo?: string): OrderWindow {
    if (!dateFrom && !dateTo) return null;

    const offsetMs = BAGHDAD_UTC_OFFSET_HOURS * 60 * 60 * 1000;
    // A Baghdad day starts 3 hours BEFORE the same UTC date starts.
    const startOf = (day: string) => Date.parse(`${day}T00:00:00.000Z`) - offsetMs;
    const endOf = (day: string) => Date.parse(`${day}T23:59:59.999Z`) - offsetMs;

    const from = dateFrom ?? dateTo!;
    const to = dateTo ?? dateFrom!;

    return { fromInstant: startOf(from), toInstant: endOf(to) };
}

/**
 * Whether an order belongs in the currently-loaded window.
 *
 * Archived orders never belong in the active list. With a `null` window every
 * non-archived order belongs, which is exactly today's behaviour — so wiring
 * this in ahead of stage C changes nothing until the window becomes real.
 */
export function belongsInWindow(
    order: { created_at: string; is_archived?: boolean | null },
    window: OrderWindow,
): boolean {
    if (order.is_archived) return false;
    if (!window) return true;

    const at = Date.parse(order.created_at);
    if (Number.isNaN(at)) return true; // never drop a row over an unparseable date
    return at >= window.fromInstant && at <= window.toInstant;
}
