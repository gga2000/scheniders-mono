import { z } from "zod";
import { addDaysToDayKey, baghdadDayKey } from "@/lib/order-window";
import type { OrderFilters } from "@/lib/supabase";

/** Delivery rate and confirm speed describe orders that have had time to play out, so a single day is too thin. */
export const MIN_QUALITY_DAYS = 7;

/** One request to get_orders_panel_stats. A null bound is open ended. */
export interface PanelWindow {
    from: string | null;
    to: string | null;
    /** Baghdad time of day (HH:MM:SS) the window is cut at, or null for the whole days. */
    untilTime: string | null;
}

export interface BarWindows {
    current: PanelWindow;
    /** The period just before `current`, same length; null when there is nothing fair to compare with. */
    previous: PanelWindow | null;
    /** The windows behind delivery rate and confirm speed. Equal to the main pair unless `current` is under a week. */
    quality: { current: PanelWindow; previous: PanelWindow | null };
    /** True when `quality` covers more days than the page's date filter. */
    qualityIsWider: boolean;
}

/** Baghdad wall-clock time, HH:MM:SS. */
export function baghdadTimeOfDay(now: Date): string {
    return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(11, 19);
}

function dayCount(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * The windows for the orders page's date filter. A day that is still going (today) is judged against yesterday cut
 * at the same time of day, so a morning is never compared with a whole day; any other range is compared with the
 * same number of days right before it. No date filter reads the whole book and has nothing to compare with.
 */
export function barWindows(dateFrom: string | null | undefined, dateTo: string | null | undefined, now: Date = new Date()): BarWindows {
    const today = baghdadDayKey(now);
    const open = { from: dateFrom ?? null, to: dateTo ?? null, untilTime: null };
    if (!dateFrom) {
        return { current: open, previous: null, quality: { current: open, previous: null }, qualityIsWider: false };
    }
    const from = dateFrom;
    const to = dateTo ?? today;
    const current: PanelWindow = { from, to, untilTime: null };
    const days = dayCount(from, to);
    const previous: PanelWindow =
        from === to && to === today
            ? { from: addDaysToDayKey(today, -1), to: addDaysToDayKey(today, -1), untilTime: baghdadTimeOfDay(now) }
            : { from: addDaysToDayKey(from, -days), to: addDaysToDayKey(from, -1), untilTime: null };
    if (days >= MIN_QUALITY_DAYS) {
        return { current, previous, quality: { current, previous }, qualityIsWider: false };
    }
    const qFrom = addDaysToDayKey(to, -(MIN_QUALITY_DAYS - 1));
    return {
        current,
        previous,
        quality: {
            current: { from: qFrom, to, untilTime: null },
            previous: { from: addDaysToDayKey(qFrom, -MIN_QUALITY_DAYS), to: addDaysToDayKey(qFrom, -1), untilTime: null },
        },
        qualityIsWider: true,
    };
}

const NON_SALE_STATUS_VIEWS: ReadonlyArray<OrderFilters["status"]> = ["refunds", "refunded", "refund_pending", "replacements"];

/** Return rows and refund / replacement / abandoned-cart views are not sales: there is nothing for the bar to say about them. */
export function isSalesView(filters: Pick<OrderFilters, "isReturn" | "orderType" | "status">): boolean {
    return filters.isReturn !== true && !filters.orderType && !NON_SALE_STATUS_VIEWS.includes(filters.status);
}

/** Ad spend and the storefront log are store-wide: they cannot follow a city, product, priority or payment filter. */
export function followsStoreWideNumbers(filters: Pick<OrderFilters, "city" | "product" | "priority" | "paymentStatus">): boolean {
    return !filters.city && !filters.product && !filters.priority && !filters.paymentStatus;
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

/** Visitors and orders of one Baghdad day in the storefront log. */
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

/**
 * Storefront visitors for the window and the one before it. The log call only reaches back `days.length` days:
 * a window that starts earlier cannot be answered, so it is null rather than a partial sum.
 */
export function storeFigures(
    days: readonly StoreDay[],
    yesterdaySameTime: { visitors: number; orders: number },
    windows: BarWindows,
): { current: StoreFigures | null; previous: StoreFigures | null } {
    const oldest = days[0]?.day;
    const covers = (w: PanelWindow | null): w is PanelWindow & { from: string; to: string } =>
        w !== null && w.from !== null && w.to !== null && oldest !== undefined && w.from >= oldest;
    const current = covers(windows.current) ? sumDays(days, windows.current.from, windows.current.to) : null;
    const prev = windows.previous;
    let previous: StoreFigures | null = null;
    if (current && prev && prev.untilTime !== null) {
        previous = {
            visitors: yesterdaySameTime.visitors,
            conversion: yesterdaySameTime.visitors > 0 ? (yesterdaySameTime.orders / yesterdaySameTime.visitors) * 100 : null,
        };
    } else if (current && covers(prev)) {
        previous = sumDays(days, prev.from, prev.to);
    }
    return { current, previous };
}

/** Under a minute reads "<1", then whole minutes, then hours and minutes. */
export function formatMinutes(minutes: number): { hours: number; minutes: number; underOne: boolean } {
    if (minutes < 1) return { hours: 0, minutes: 0, underOne: true };
    const whole = Math.round(minutes);
    return { hours: Math.floor(whole / 60), minutes: whole % 60, underOne: false };
}
