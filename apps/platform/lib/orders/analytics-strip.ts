import { z } from "zod";
import { addDaysToDayKey, baghdadDayKey } from "@/lib/order-window";

/** The period switch on the orders analytics strip. */
export const STRIP_PERIODS = ["today", "7", "30"] as const;
export type StripPeriod = (typeof STRIP_PERIODS)[number];

/** Delivery rate and confirm speed describe orders that have had time to play out, so a single day is too thin. */
export const MIN_QUALITY_DAYS = 7;

/** One request to get_orders_panel_stats. */
export interface PanelWindow {
    from: string;
    to: string;
    /** Baghdad time of day (HH:MM:SS) the window is cut at, or null for the whole days. */
    untilTime: string | null;
}

export interface StripWindows {
    current: PanelWindow;
    previous: PanelWindow;
    /** The windows behind delivery rate, confirm speed and the sparklines. Equal to the main pair except on "today". */
    quality: { current: PanelWindow; previous: PanelWindow };
    /** True when `quality` covers more days than the headline period. */
    qualityIsWider: boolean;
}

/** Baghdad wall-clock time, HH:MM:SS. */
export function baghdadTimeOfDay(now: Date): string {
    return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(11, 19);
}

function trailing(days: number, today: string): { current: PanelWindow; previous: PanelWindow } {
    const from = addDaysToDayKey(today, -(days - 1));
    return {
        current: { from, to: today, untilTime: null },
        previous: { from: addDaysToDayKey(from, -days), to: addDaysToDayKey(from, -1), untilTime: null },
    };
}

/**
 * The windows for a period. "Today" is judged against yesterday cut at the same time of day, so a morning is
 * never compared with a whole day.
 */
export function stripWindows(period: StripPeriod, now: Date = new Date()): StripWindows {
    const today = baghdadDayKey(now);
    if (period === "today") {
        const yesterday = addDaysToDayKey(today, -1);
        return {
            current: { from: today, to: today, untilTime: null },
            previous: { from: yesterday, to: yesterday, untilTime: baghdadTimeOfDay(now) },
            quality: trailing(MIN_QUALITY_DAYS, today),
            qualityIsWider: true,
        };
    }
    const pair = trailing(Number(period), today);
    return { ...pair, quality: pair, qualityIsWider: false };
}

const count = z.number().catch(0);
const nullableNumber = z.number().nullable().catch(null);

/** get_orders_panel_stats returns jsonb, so the generated types say only `Json`. */
export const panelStatsSchema = z.object({
    orders: count,
    revenue: count,
    delivered: count,
    cohort_realized: count,
    cohort_rejected: count,
    confirm_n: count,
    confirm_median_min: nullableNumber,
    daily: z.array(z.object({ day: z.string(), orders: count, revenue: count })).catch([]),
});
export type PanelStats = z.infer<typeof panelStatsSchema>;

/** Delivered share of orders that finished (delivered or refused). Null while none has finished. */
export function deliveryRate(stats: Pick<PanelStats, "cohort_realized" | "cohort_rejected">): number | null {
    const decided = stats.cohort_realized + stats.cohort_rejected;
    return decided > 0 ? (stats.cohort_realized / decided) * 100 : null;
}

/** Percentage-point change between two rates; null when either side is unknown. */
export function pointChange(now: number | null, before: number | null): number | null {
    return now === null || before === null ? null : now - before;
}

/** Whole-number average, or null when there is nothing to divide by. */
export function perUnit(total: number, units: number): number | null {
    return units > 0 ? Math.round(total / units) : null;
}

/** Visitors and orders in a day range of the storefront log; yesterday cut at the same time for "today". */
export interface StoreDay {
    day: string;
    visitors: number;
    orders: number;
}

export interface StoreFigures {
    visitors: number;
    /** Storefront orders per 100 visitors; null without visitors. */
    conversion: number | null;
}

function sumDays(days: readonly StoreDay[], from: string, to: string): StoreFigures {
    let visitors = 0;
    let orders = 0;
    for (const d of days) {
        if (d.day >= from && d.day <= to) {
            visitors += d.visitors;
            orders += d.orders;
        }
    }
    return { visitors, conversion: visitors > 0 ? (orders / visitors) * 100 : null };
}

export function storeFigures(
    days: readonly StoreDay[],
    yesterdaySameTime: { visitors: number; orders: number },
    windows: StripWindows,
): { current: StoreFigures; previous: StoreFigures } {
    const current = sumDays(days, windows.current.from, windows.current.to);
    const previous =
        windows.previous.untilTime !== null
            ? {
                  visitors: yesterdaySameTime.visitors,
                  conversion: yesterdaySameTime.visitors > 0 ? (yesterdaySameTime.orders / yesterdaySameTime.visitors) * 100 : null,
              }
            : sumDays(days, windows.previous.from, windows.previous.to);
    return { current, previous };
}

/** "45 sec" never helps a merchant: under a minute reads "<1", then whole minutes, then hours and minutes. */
export function formatMinutes(minutes: number): { hours: number; minutes: number; underOne: boolean } {
    if (minutes < 1) return { hours: 0, minutes: 0, underOne: true };
    const whole = Math.round(minutes);
    return { hours: Math.floor(whole / 60), minutes: whole % 60, underOne: false };
}
