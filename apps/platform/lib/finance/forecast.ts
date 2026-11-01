import type { Order } from "@/types/order";
import { addDaysToDayKey, baghdadDayKey, baghdadDayStart, toBaghdadDayKey } from "@/lib/order-window";
import { isRealizedRevenue, realizedAt } from "@/lib/order-revenue";

const HISTORY_DAYS = 60;
const PROJECTION_DAYS = 90;
/** Momentum is clamped so a momentary lull does not collapse the projection to zero. */
const MAX_MOMENTUM = 0.5;
const BEST_FACTOR = 1.25;
const WORST_FACTOR = 0.7;

export interface Scenario {
    best: number;
    likely: number;
    worst: number;
}

export interface ForecastPoint {
    /** Baghdad day key. */
    day: string;
    historical: number | null;
    best: number | null;
    likely: number | null;
    worst: number | null;
}

export interface Forecast {
    chart: ForecastPoint[];
    baseline: number;
    momentum: number;
    rawMomentum: number;
    momentumClamped: boolean;
    d30: Scenario;
    d60: Scenario;
    d90: Scenario;
}

function trailingAvg(values: number[], window: number): number[] {
    return values.map((_, i) => {
        const slice = values.slice(Math.max(0, i - window + 1), i + 1);
        return slice.reduce((s, v) => s + v, 0) / slice.length;
    });
}

/**
 * Cash-in forecast: the last 60 Baghdad days of realized revenue, a 30-day
 * moving-average baseline nudged by 14-vs-30-day momentum, projected 90 days at
 * best / likely / worst.
 *
 * Revenue is dated by the day it was delivered, not the day the order was
 * placed. Dated by placement, the newest days would only hold orders that were
 * already delivered, which reads as a slump and drags the baseline down.
 */
export function buildForecast(orders: readonly Order[], now: number = Date.now()): Forecast {
    const today = baghdadDayKey(now);
    const firstDay = addDaysToDayKey(today, -HISTORY_DAYS);

    const byDay = new Map<string, number>();
    for (const o of orders) {
        if (!isRealizedRevenue(o)) continue;
        const day = toBaghdadDayKey(realizedAt(o));
        if (!day || day < firstDay || day > today) continue;
        byDay.set(day, (byDay.get(day) ?? 0) + (Number(o.price) || 0));
    }

    const history: Array<{ day: string; revenue: number }> = [];
    for (let day = firstDay; day <= today; day = addDaysToDayKey(day, 1)) {
        history.push({ day, revenue: byDay.get(day) ?? 0 });
    }

    const revenues = history.map((h) => h.revenue);
    const avg14 = trailingAvg(revenues, 14);
    const avg30 = trailingAvg(revenues, 30);
    const baseline = avg30[avg30.length - 1] || 0;
    const recent = avg14[avg14.length - 1] || 0;
    const rawMomentum = baseline > 0 ? (recent - baseline) / baseline : 0;
    const momentum = Math.max(-MAX_MOMENTUM, Math.min(MAX_MOMENTUM, rawMomentum));

    const trend = baseline * (1 + momentum);
    const projection: Scenario[] = [];
    const chart: ForecastPoint[] = history.map((h) => ({
        day: h.day, historical: h.revenue, best: null, likely: null, worst: null,
    }));
    for (let d = 1; d <= PROJECTION_DAYS; d++) {
        const scenario = {
            best: Math.round(trend * BEST_FACTOR),
            likely: Math.round(trend),
            worst: Math.round(trend * WORST_FACTOR),
        };
        projection.push(scenario);
        chart.push({ day: addDaysToDayKey(today, d), historical: null, ...scenario });
    }

    const sumWindow = (n: number): Scenario => projection.slice(0, n).reduce(
        (acc, p) => ({ best: acc.best + p.best, likely: acc.likely + p.likely, worst: acc.worst + p.worst }),
        { best: 0, likely: 0, worst: 0 },
    );

    return {
        chart,
        baseline,
        momentum,
        rawMomentum,
        momentumClamped: rawMomentum !== momentum,
        d30: sumWindow(30),
        d60: sumWindow(60),
        d90: sumWindow(90),
    };
}

/**
 * How many days of spending the cash still on its way in covers. Infinity when
 * there is no spending to cover. `periodDays` is the length of the window the
 * expenses were taken from, so a 7-day or a 90-day period burns at its own rate.
 */
export function coverDays(inTransitCash: number, periodExpenses: number, periodDays: number): { dailyBurn: number; days: number } {
    const dailyBurn = periodExpenses > 0 ? periodExpenses / Math.max(1, periodDays) : 0;
    return { dailyBurn, days: dailyBurn > 0 ? inTransitCash / dailyBurn : Infinity };
}

/** Whole Baghdad days from the start of `startDay` to the end of `endDay`, at least 1. */
export function daysBetween(startDay: string, endDay: string): number {
    return Math.max(1, Math.round((baghdadDayStart(endDay) - baghdadDayStart(startDay)) / 86_400_000) + 1);
}
