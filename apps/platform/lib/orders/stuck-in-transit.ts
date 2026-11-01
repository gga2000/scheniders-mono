/**
 * Orders that went out with the courier and never came back as delivered or
 * rejected. Nothing tracks them once they leave (most have no courier link), so
 * without this they sit in "in transit" for weeks unnoticed: on 2026-11-01 nine
 * orders had been there 2 to 4 weeks.
 */

/** Days in transit after which an order counts as stuck. */
export const STUCK_TRANSIT_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the order was moved to in transit. */
export function daysInTransit(since: string, now: number = Date.now()): number {
    const t = Date.parse(since);
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.floor((now - t) / DAY_MS));
}

export interface InTransitRow {
    id: string;
    updated_at: string;
}

export interface TransitHistoryRow {
    order_id: string;
    changed_at: string;
}

/**
 * When each in-transit order entered that status: its latest move to
 * `in_transit` in the status history, or `updated_at` for orders that predate
 * the history trigger.
 */
export function inTransitSince(
    orders: readonly InTransitRow[],
    history: readonly TransitHistoryRow[],
): Map<string, string> {
    const latest = new Map<string, string>();
    for (const h of history) {
        const prev = latest.get(h.order_id);
        if (!prev || Date.parse(h.changed_at) > Date.parse(prev)) latest.set(h.order_id, h.changed_at);
    }
    const since = new Map<string, string>();
    for (const o of orders) since.set(o.id, latest.get(o.id) ?? o.updated_at);
    return since;
}

/** Ids of the orders stuck in transit, oldest first. */
export function stuckOrderIds(since: ReadonlyMap<string, string>, now: number = Date.now()): string[] {
    return [...since.entries()]
        .filter(([, at]) => daysInTransit(at, now) >= STUCK_TRANSIT_DAYS)
        .sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]))
        .map(([id]) => id);
}
