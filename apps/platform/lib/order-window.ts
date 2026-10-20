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

const BAGHDAD_OFFSET_MS = BAGHDAD_UTC_OFFSET_HOURS * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Baghdad calendar day of an instant, as "YYYY-MM-DD".
 *
 * `toISOString().split("T")[0]` is the UTC day, which is still yesterday for
 * the first three hours of every Baghdad day: an order postponed "to tomorrow"
 * at 01:00 would land on today. The browser's local day is no better — a
 * merchant travelling, or a device set to the wrong zone, files it under a day
 * the window, the chips and the reports all disagree with.
 */
export function baghdadDayKey(at: Date | number = Date.now()): string {
    const ms = typeof at === "number" ? at : at.getTime();
    return new Date(ms + BAGHDAD_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * A value as a Baghdad day key, or null when it is not a usable date.
 *
 * A date-only string ("2026-09-08", the shape of `orders.scheduled_date`) is
 * already a calendar day and is taken as-is — parsing it would make it UTC
 * midnight and invite exactly the off-by-one this module exists to prevent.
 */
export function toBaghdadDayKey(value: string | Date | null | undefined): string | null {
    if (!value) return null;
    if (typeof value === "string" && DAY_KEY.test(value)) return value;
    const ms = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isNaN(ms) ? null : baghdadDayKey(ms);
}

/** Calendar arithmetic on a day key: `addDaysToDayKey("2026-09-30", 1)` is "2026-10-01". */
export function addDaysToDayKey(day: string, days: number): string {
    return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The instant a Baghdad calendar day starts. */
export function baghdadDayStart(day: string): number {
    return Date.parse(`${day}T00:00:00.000Z`) - BAGHDAD_OFFSET_MS;
}

export type OrderWindow = {
    /** Inclusive lower bound, as an absolute instant. */
    fromInstant: number;
    /** Inclusive upper bound, as an absolute instant. */
    toInstant: number;
    /**
     * The same bounds as Baghdad calendar days ("YYYY-MM-DD"), for the
     * date-only `scheduled_date` column. A postponed order belongs to the
     * window of the day it was scheduled for as well as the day it arrived.
     */
    fromDay: string;
    toDay: string;
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

    // A Baghdad day starts 3 hours BEFORE the same UTC date starts.
    const endOf = (day: string) => baghdadDayStart(day) + DAY_MS - 1;

    // Only date-only filters are expected here, but a full timestamp must not
    // become a malformed day bound for the `scheduled_date` comparison.
    const from = (dateFrom || dateTo || "").slice(0, 10);
    const to = (dateTo || dateFrom || "").slice(0, 10);

    return { fromInstant: baghdadDayStart(from), toInstant: endOf(to), fromDay: from, toDay: to };
}

/**
 * Whether an order falls inside a date window, archive state aside: it arrived
 * inside the window, or it was scheduled for a day inside it.
 *
 * The scheduled half is what makes postponing work. `created_at` is a fact and
 * a database trigger forbids forward-dating it, so without this an order
 * parked for the 15th could never appear when the merchant opens the 15th.
 * It deliberately stays visible on the day it arrived as well — that is the
 * day the status chips (bucketed on `created_at`) count it under, and hiding
 * it there would make a list disagree with its own counts.
 */
export function orderInDateWindow(
    order: { created_at: string; scheduled_date?: string | null },
    window: NonNullable<OrderWindow>,
): boolean {
    const scheduled = order.scheduled_date ? order.scheduled_date.slice(0, 10) : null;
    if (scheduled && DAY_KEY.test(scheduled) && scheduled >= window.fromDay && scheduled <= window.toDay) {
        return true;
    }

    const at = Date.parse(order.created_at);
    if (Number.isNaN(at)) return true; // never drop a row over an unparseable date
    return at >= window.fromInstant && at <= window.toInstant;
}

/**
 * Whether an order belongs in the currently-loaded window.
 *
 * Archived orders never belong in the active list. With a `null` window every
 * non-archived order belongs, which is exactly today's behaviour — so wiring
 * this in ahead of stage C changes nothing until the window becomes real.
 */
/** A stable string for a window, so a snapshot or a fetch is only ever matched to the window it holds. */
export function windowCacheKey(window: OrderWindow): string {
    return window ? `${window.fromInstant}-${window.toInstant}` : "all";
}

export function belongsInWindow(
    order: { created_at: string; scheduled_date?: string | null; is_archived?: boolean | null },
    window: OrderWindow,
): boolean {
    if (order.is_archived) return false;
    if (!window) return true;
    return orderInDateWindow(order, window);
}
