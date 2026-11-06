import { addDaysToDayKey, baghdadDayKey, toBaghdadDayKey } from "@/lib/order-window";

/**
 * Confirmed orders parked for a later day: the merchant already confirmed
 * them and chose a delivery day after today (`orders.scheduled_date`). Their
 * day is not today, so they sit outside today's list; this finds them.
 */

export interface ScheduledLaterRow {
    id: string;
    scheduled_date: string | null;
}

export interface ScheduledLater {
    ids: readonly string[];
    /** First day the orders can fall on (tomorrow, Baghdad). */
    fromDay: string;
    /** Latest scheduled day among them. */
    toDay: string;
}

/**
 * The orders scheduled after `now`'s Baghdad day, and the day range that
 * contains them. Rows with no usable or a not-later date are dropped.
 */
export function scheduledLaterFrom(rows: readonly ScheduledLaterRow[], now: number = Date.now()): ScheduledLater | null {
    const today = baghdadDayKey(now);
    const ids: string[] = [];
    let toDay = "";
    for (const row of rows) {
        const day = toBaghdadDayKey(row.scheduled_date);
        if (!day || day <= today) continue;
        ids.push(row.id);
        if (day > toDay) toDay = day;
    }
    if (ids.length === 0) return null;
    return { ids, fromDay: addDaysToDayKey(today, 1), toDay };
}
