import { z } from "zod";
import {
    baghdadHour,
    calculateRevenueTrend,
    daysOrderWindow,
    isRealizedRevenue,
    PERIOD_DAYS,
    realizedAt,
    realizedRevenueBetween,
    type ChartLocale,
    type DateRangeKey,
    type RevenueTrendPoint,
    trendWindowStart,
} from "@/lib/analytics/dashboard-calculations";
import type { TrendFact } from "@/lib/analytics/dashboard-order-facts";
import { orderInDateWindow } from "@/lib/order-window";

/**
 * Pure figures behind the dashboard's bento cards (revenue, hourly waves,
 * governorate treemap, seasonality). Every card reads server data that is complete
 * for its window: the 60-day trend facts or the monthly aggregate RPC. Nothing
 * here touches the orders list (ORD-2).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days of trend facts the bento reads: the longest plotted window, twice. */
export const BENTO_FACT_DAYS = 60;

/** Percent change, or null when there is nothing to compare against. */
export function pctChange(current: number, previous: number): number | null {
    if (previous <= 0) return null;
    return ((current - previous) / previous) * 100;
}

// =============================================
// Revenue / orders card
// =============================================
export type RevenueWindow = 7 | 14 | 30;
export type RevenueMeasure = "orders" | "revenue";

/**
 * The revenue card's window for the header's period: 7 days for today and 7
 * days (one day is not a line), 30 for 30 days and «all» (the card reads 60
 * days, so 30 against the 30 before is its longest).
 */
export function revenueWindowFor(range: DateRangeKey): RevenueWindow {
    return range === "today" || range === "7d" ? 7 : 30;
}

export interface RevenueCardFigures {
    /** One point per Baghdad day, oldest first, `window` long. */
    series: { label: string; value: number }[];
    total: number;
    previousTotal: number;
    deltaPct: number | null;
    /** Realized orders in the window: the divisor of the average order value. */
    realizedOrders: number;
}

/**
 * The window and the one before it, cut from a single 60-day series, so the
 * comparison is computed on exactly the same rules as the line.
 * - orders: orders CREATED that day.
 * - revenue: revenue REALIZED that day (COR-D1).
 */
export function revenueCardFigures(
    facts: TrendFact[],
    window: RevenueWindow,
    measure: RevenueMeasure,
    locale: ChartLocale,
    now: Date = new Date(),
): RevenueCardFigures {
    // Orders of the window by the Orders list's rule (daysOrderWindow): the days
    // add up to the list «آخر 7 أيام» opens.
    const days: RevenueTrendPoint[] = calculateRevenueTrend(facts, BENTO_FACT_DAYS, locale, now, daysOrderWindow(window, now));
    const pick = (p: RevenueTrendPoint) => (measure === "orders" ? p.orders : p.revenue);
    const current = days.slice(-window);
    const total = current.reduce((s, p) => s + pick(p), 0);

    // The same stretch of time one window earlier, not the whole days before
    // it: at 09:30 a full previous week against six and a half days read as a
    // fall that was only the clock.
    const span = window * DAY_MS;
    const previousStart = new Date(trendWindowStart(window, now).getTime() - span);
    const previousEnd = new Date(now.getTime() - span);
    const previous = daysOrderWindow(window, now, 1);
    const previousTotal = measure === "orders"
        ? facts.filter((f) => orderInDateWindow(f, previous)).length
        : realizedRevenueBetween(facts, previousStart, previousEnd);

    // Same first instant as the plotted days, so the average matches the line.
    const windowStart = trendWindowStart(window, now).getTime();
    const realizedOrders = facts.filter((f) => {
        if (!isRealizedRevenue(f)) return false;
        const at = realizedAt(f);
        return at !== null && at.getTime() >= windowStart;
    }).length;

    return {
        series: current.map((p) => ({ label: p.date, value: pick(p) })),
        total,
        previousTotal,
        deltaPct: pctChange(total, previousTotal),
        realizedOrders,
    };
}

// =============================================
// Hourly waves: online vs WhatsApp/manual, 3 weeks
// =============================================
export type OrderLane = "online" | "chat";

/**
 * Which lane an order arrives through. `whatsapp`, `other` and unset sources are
 * typed in by the team from a chat or call; every other source is a form or shop
 * the customer filled in. Courier imports (`delivery_import`) have no lane: their
 * created_at is when the file was imported, not when anyone ordered.
 */
export function orderLane(source: string | null): OrderLane | null {
    if (source === "delivery_import") return null;
    if (source === null || source === "whatsapp" || source === "other") return "chat";
    return "online";
}

export interface HourlyWaves {
    /**
     * [week][hour]. Week 0 is the dashboard's last 7 days (daysOrderWindow: 7 Baghdad
     * days, today so far included, orders arrived or scheduled in them); weeks 1 and 2
     * are the same stretch of time one and two weeks earlier, so the three lines and
     * the change compare like with like.
     */
    online: number[][];
    chat: number[][];
    /** Orders with a lane, last 7 days. */
    thisWeek: number;
    lastWeek: number;
    deltaPct: number | null;
    /** Busiest Baghdad hour of the last 7 days, or null with no orders. */
    peakHour: number | null;
}

export const WAVE_WEEKS = 3;

export function hourlyWaves(facts: TrendFact[], now: Date = new Date()): HourlyWaves {
    const empty = () => Array.from({ length: WAVE_WEEKS }, () => new Array<number>(24).fill(0));
    const online = empty();
    const chat = empty();
    // Each week holds the orders the Orders list holds for those days (arrived,
    // or scheduled for one of them), at the hour they arrived.
    const weeks = Array.from({ length: WAVE_WEEKS }, (_, week) => daysOrderWindow(7, now, week));

    for (const f of facts) {
        const lane = orderLane(f.source);
        if (!lane) continue;
        const created = new Date(f.created_at);
        if (Number.isNaN(created.getTime())) continue;
        const week = weeks.findIndex((w) => orderInDateWindow(f, w));
        if (week >= 0) (lane === "online" ? online : chat)[week][baghdadHour(created)]++;
    }

    const weekTotal = (w: number) =>
        online[w].reduce((a, b) => a + b, 0) + chat[w].reduce((a, b) => a + b, 0);
    const thisWeek = weekTotal(0);
    const lastWeek = weekTotal(1);

    let peakHour: number | null = null;
    let peak = 0;
    for (let h = 0; h < 24; h++) {
        const n = online[0][h] + chat[0][h];
        if (n > peak) { peak = n; peakHour = h; }
    }

    return { online, chat, thisWeek, lastWeek, deltaPct: pctChange(thisWeek, lastWeek), peakHour };
}

// =============================================
// Governorate treemap
// =============================================
export type GovPeriod = "today" | "7d" | "30d";
export const GOV_PERIODS: GovPeriod[] = ["today", "7d", "30d"];

export type RegionId = "baghdad" | "south" | "euphrates" | "north" | "kurdistan";

/**
 * Iraq's governorates in five trading regions. Codes are lib/address-validator's.
 * Anbar sits with the north: on its own it would be a one-tile region.
 */
export const GOVERNORATE_REGION: Record<string, RegionId> = {
    BGD: "baghdad",
    BAS: "south", NAS: "south", AMA: "south", SAM: "south",
    BBL: "euphrates", KRB: "euphrates", NJF: "euphrates", DWN: "euphrates", KOT: "euphrates",
    MOS: "north", KRK: "north", SAH: "north", DYL: "north", ANB: "north",
    ARB: "kurdistan", SMH: "kurdistan", DOH: "kurdistan",
};
export const REGIONS: RegionId[] = ["baghdad", "south", "euphrates", "north", "kurdistan"];

/** Code for orders whose governorate is missing or not a known code. */
export const UNKNOWN_GOVERNORATE = "unknown";

export interface GovernoratePeriod {
    /** Orders created in the period, per governorate code (or UNKNOWN_GOVERNORATE). */
    counts: Map<string, number>;
    total: number;
    previousTotal: number;
    deltaPct: number | null;
}

export function governorateOf(f: Pick<TrendFact, "governorate_code" | "validated_governorate_code">): string {
    const code = f.validated_governorate_code || f.governorate_code;
    return code && GOVERNORATE_REGION[code] ? code : UNKNOWN_GOVERNORATE;
}

export function governoratePeriods(facts: TrendFact[], now: Date = new Date()): Record<GovPeriod, GovernoratePeriod> {
    const out = {} as Record<GovPeriod, GovernoratePeriod>;
    for (const period of GOV_PERIODS) {
        // The orders get_dashboard_metrics and the Orders list count for these days,
        // compared with the same stretch of time one period earlier.
        const current = daysOrderWindow(PERIOD_DAYS[period], now);
        const previous = daysOrderWindow(PERIOD_DAYS[period], now, 1);
        const counts = new Map<string, number>();
        let total = 0;
        let previousTotal = 0;
        for (const f of facts) {
            if (orderInDateWindow(f, current)) {
                const code = governorateOf(f);
                counts.set(code, (counts.get(code) ?? 0) + 1);
                total++;
            }
            if (orderInDateWindow(f, previous)) previousTotal++;
        }
        out[period] = { counts, total, previousTotal, deltaPct: pctChange(total, previousTotal) };
    }
    return out;
}

// =============================================
// Seasonality (get_dashboard_monthly_sales)
// =============================================
export const monthlySalesSchema = z.array(z.object({
    /** YYYY-MM, Baghdad calendar month */
    month: z.string().regex(/^\d{4}-\d{2}$/),
    orders: z.number().int().nonnegative(),
    /** null for viewers without VIEW_FINANCIALS (SEC-D2). */
    revenue: z.number().nullable(),
}));
export type MonthlySales = z.infer<typeof monthlySalesSchema>[number];

/** Months the RPC is asked for: 24 complete months plus the current one. */
export const MONTHLY_SALES_MONTHS = 25;

export interface SeasonYear {
    /** 12 complete months, oldest first. */
    months: MonthlySales[];
    total: number;
    monthlyAverage: number;
    best: MonthlySales | null;
    quietest: MonthlySales | null;
    /** vs the 12 months before; null when those had nothing. */
    deltaPct: number | null;
}

export interface Seasonality {
    /** [last 12 complete months, the 12 before] */
    years: [SeasonYear, SeasonYear | null];
    /** The current, unfinished month: shown as a figure, never on the shape. */
    current: MonthlySales | null;
}

/**
 * Split the RPC rows into the last 12 COMPLETE months and the 12 before them.
 * The running month is left off the shape: on the 2nd of a month it would read as
 * a collapse. The prior year is null when it has no orders at all, so the card
 * does not offer a toggle onto an empty shape.
 */
export function seasonality(rows: MonthlySales[], measure: RevenueMeasure): Seasonality {
    const current = rows.length ? rows[rows.length - 1] : null;
    const complete = rows.slice(0, -1);
    const value = (m: MonthlySales) => (measure === "revenue" ? m.revenue ?? 0 : m.orders);

    const year = (months: MonthlySales[], before: MonthlySales[]): SeasonYear => {
        const total = months.reduce((s, m) => s + value(m), 0);
        const beforeTotal = before.reduce((s, m) => s + value(m), 0);
        const active = months.filter((m) => value(m) > 0);
        const by = (dir: 1 | -1) => active.reduce<MonthlySales | null>(
            (best, m) => (best === null || dir * (value(m) - value(best)) > 0 ? m : best), null);
        return {
            months,
            total,
            monthlyAverage: months.length ? total / months.length : 0,
            best: by(1),
            quietest: by(-1),
            deltaPct: pctChange(total, beforeTotal),
        };
    };

    const last = complete.slice(-12);
    const prior = complete.slice(-24, -12);
    const older: MonthlySales[] = [];
    const priorHasData = prior.some((m) => m.orders > 0);
    return {
        years: [year(last, prior), priorHasData ? year(prior, older) : null],
        current,
    };
}

/** Value of one month for the measure in use. */
export function monthValue(m: MonthlySales, measure: RevenueMeasure): number {
    return measure === "revenue" ? m.revenue ?? 0 : m.orders;
}
