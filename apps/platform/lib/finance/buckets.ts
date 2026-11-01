import { addDaysToDayKey, baghdadDayKey, baghdadDayStart } from "@/lib/order-window";
import type { Granularity } from "@/hooks/use-finance-period";

/**
 * The chart bucket a moment belongs to, on Baghdad calendar days.
 *
 * Weeks start on Monday. Months, quarters and years are cut from the Baghdad
 * day too, never from the browser's local clock, so a device set to another
 * zone files an order under the same bucket the reports and chips use.
 * `ts` is the instant the bucket starts.
 */
export function periodBucket(at: Date, granularity: Granularity): { key: string; ts: number } {
    const dayKey = baghdadDayKey(at);
    if (granularity === "day") return { key: dayKey, ts: baghdadDayStart(dayKey) };
    if (granularity === "week") {
        const weekday = new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
        const mondayKey = addDaysToDayKey(dayKey, -((weekday + 6) % 7));
        return { key: mondayKey, ts: baghdadDayStart(mondayKey) };
    }
    const year = dayKey.slice(0, 4);
    const month = Number(dayKey.slice(5, 7));
    if (granularity === "year") return { key: year, ts: baghdadDayStart(`${year}-01-01`) };
    if (granularity === "quarter") {
        const q = Math.floor((month - 1) / 3);
        return { key: `${year}-Q${q + 1}`, ts: baghdadDayStart(`${year}-${String(q * 3 + 1).padStart(2, "0")}-01`) };
    }
    const mm = String(month).padStart(2, "0");
    return { key: `${year}-${mm}`, ts: baghdadDayStart(`${year}-${mm}-01`) };
}

/** Every bucket touched by [start, end], oldest first. */
export function bucketsBetween(start: Date, end: Date, granularity: Granularity): Array<{ key: string; ts: number }> {
    const out = new Map<string, { key: string; ts: number }>();
    const lastDay = baghdadDayKey(end);
    for (let day = baghdadDayKey(start); day <= lastDay; day = addDaysToDayKey(day, 1)) {
        const b = periodBucket(new Date(baghdadDayStart(day)), granularity);
        out.set(b.key, b);
    }
    return Array.from(out.values());
}
