import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";

/**
 * The Store hub's "last 7 days": today plus the `days - 1` Baghdad days before it,
 * as absolute instants. The KPI strip and the funnel read the same window, so
 * "Orders" and "Buyers" never describe two different weeks.
 */
export function storeHubWindow(days = 7, now: number = Date.now()): { from: Date; to: Date } {
    const today = baghdadDayKey(now);
    return {
        from: new Date(baghdadDayStart(addDaysToDayKey(today, -(days - 1)))),
        to: new Date(now),
    };
}
