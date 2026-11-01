import { z } from "zod";
import {
    baghdadHour,
    calculateRevenueTrend,
    isRealizedRevenue,
    rangeCutoff,
    realizedAt,
    type ChartLocale,
    type RevenueTrendPoint,
    trendWindowStart,
} from "@/lib/analytics/dashboard-calculations";
import type { TrendFact } from "@/lib/analytics/dashboard-order-facts";

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
    const days: RevenueTrendPoint[] = calculateRevenueTrend(facts, BENTO_FACT_DAYS, locale, now);
    const pick = (p: RevenueTrendPoint) => (measure === "orders" ? p.orders : p.revenue);
    const current = days.slice(-window);
    const previous = days.slice(-2 * window, -window);
    const total = current.reduce((s, p) => s + pick(p), 0);
    const previousTotal = previous.reduce((s, p) => s + pick(p), 0);

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
    /** [week][hour]; week 0 is the last 7 days, 1 and 2 the weeks before. */
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
    const nowMs = now.getTime();

    for (const f of facts) {
        const lane = orderLane(f.source);
        if (!lane) continue;
        const created = new Date(f.created_at);
        const age = nowMs - created.getTime();
        if (age < 0) continue;
        const week = Math.floor(age / (7 * DAY_MS));
        if (week >= WAVE_WEEKS) continue;
        (lane === "online" ? online : chat)[week][baghdadHour(created)]++;
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

/**
 * Period bounds. `today` is the Baghdad day so far, compared with the same hours of
 * yesterday (a full yesterday against a half-finished today is always "down").
 * `7d`/`30d` are the rolling windows get_dashboard_metrics uses, compared with the
 * window before.
 */
function periodBounds(period: GovPeriod, now: Date) {
    const start = rangeCutoff(period, now);
    if (!start) throw new Error(`period ${period} has no start`);
    const length = now.getTime() - start.getTime();
    const previousStart = period === "today" ? new Date(start.getTime() - DAY_MS) : new Date(start.getTime() - length);
    const previousEnd = period === "today" ? new Date(now.getTime() - DAY_MS) : start;
    return { start, previousStart, previousEnd };
}

export function governorateOf(f: Pick<TrendFact, "governorate_code" | "validated_governorate_code">): string {
    const code = f.validated_governorate_code || f.governorate_code;
    return code && GOVERNORATE_REGION[code] ? code : UNKNOWN_GOVERNORATE;
}

export function governoratePeriods(facts: TrendFact[], now: Date = new Date()): Record<GovPeriod, GovernoratePeriod> {
    const out = {} as Record<GovPeriod, GovernoratePeriod>;
    for (const period of GOV_PERIODS) {
        const { start, previousStart, previousEnd } = periodBounds(period, now);
        const counts = new Map<string, number>();
        let total = 0;
        let previousTotal = 0;
        for (const f of facts) {
            const created = new Date(f.created_at);
            if (created >= start && created <= now) {
                const code = governorateOf(f);
                counts.set(code, (counts.get(code) ?? 0) + 1);
                total++;
            } else if (created >= previousStart && created < previousEnd) {
                previousTotal++;
            }
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
