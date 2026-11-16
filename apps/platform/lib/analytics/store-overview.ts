import { z } from "zod";
import { pctChange } from "@/lib/analytics/dashboard-bento";
import { PERIOD_DAYS, type DateRangeKey } from "@/lib/analytics/dashboard-calculations";

// get_store_overview returns jsonb, so the generated types say only `Json`.
const count = z.number().catch(0);
const figures = z.object({ visitors: count, orders: count, sales: count });

export const storeOverviewSchema = z.object({
    days: z.array(figures.extend({ day: z.string().catch("") })).catch([]),
    yesterday_same_time: figures.catch({ visitors: 0, orders: 0, sales: 0 }),
});

export type StoreOverviewRaw = z.infer<typeof storeOverviewSchema>;

export type OverviewMetricKey = "visitors" | "orders" | "sales" | "conversion" | "aov" | "epc";

export const OVERVIEW_METRICS: readonly OverviewMetricKey[] = ["visitors", "orders", "sales", "conversion", "aov", "epc"];

/** The Baghdad days `get_store_overview` returns at most, and the dashboard reads. */
export const STORE_OVERVIEW_MAX_DAYS = 60;

/** Days of sparkline on the Today view. */
const TODAY_SPARK_DAYS = 14;

export interface OverviewMetric {
    key: OverviewMetricKey;
    /** The period so far: today, or the last 7 / 30 Baghdad days with today, or every day the log returns. */
    value: number;
    /**
     * Percent change against the comparison: yesterday up to the same time of day
     * for Today, the equal run of days just before for 7 and 30 days, none for all.
     * Null when the comparison had nothing.
     */
    deltaPct: number | null;
    /** One point per Baghdad day, oldest first, today last. */
    series: number[];
}

type Figures = { visitors: number; orders: number; sales: number };

const ZERO: Figures = { visitors: 0, orders: 0, sales: 0 };

/** Orders per 100 visitors; a day without visitors converts at 0, not NaN. */
const conversion = (f: Figures) => (f.visitors > 0 ? (f.orders / f.visitors) * 100 : 0);
/** Sales per order. */
const aov = (f: Figures) => (f.orders > 0 ? f.sales / f.orders : 0);
/** Earnings per click: sales per visitor. */
const epc = (f: Figures) => (f.visitors > 0 ? f.sales / f.visitors : 0);

const PICK: Record<OverviewMetricKey, (f: Figures) => number> = {
    visitors: (f) => f.visitors,
    orders: (f) => f.orders,
    sales: (f) => f.sales,
    conversion,
    aov,
    epc,
};

/**
 * Several days as one. Visitors are counted once per day (the log counts a
 * visitor once on each day it came), so a visitor who came on three days of a
 * week counts three times in that week, as each day's card counted them.
 */
function sum(days: readonly Figures[]): Figures {
    return days.reduce<Figures>(
        (acc, d) => ({ visitors: acc.visitors + d.visitors, orders: acc.orders + d.orders, sales: acc.sales + d.sales }),
        ZERO,
    );
}

/**
 * The first day the storefront log saw anything (a visit, an order or a sale),
 * or null when it saw nothing. The RPC pads its 60 days with empty ones, so
 * «all» really covers the days from here: round 15's critic read «آخر 60
 * يوماً» on a log that began 30 days ago.
 */
export function storeLogStart(raw: StoreOverviewRaw): string | null {
    return raw.days.find((d) => d.visitors > 0 || d.orders > 0 || d.sales > 0)?.day || null;
}

/**
 * The six overview figures for the dashboard's period.
 *
 * Today is compared with yesterday cut off at the same time of day, so a morning
 * is never judged against a whole day. 7 and 30 days are the last N Baghdad days,
 * today included (the rule every dashboard period uses), against the N days
 * before them. All is every day from the log's first activity (at most 60), with
 * no comparison.
 */
export function storeOverviewMetrics(raw: StoreOverviewRaw, range: DateRangeKey = "today"): OverviewMetric[] {
    const start = range === "all" ? storeLogStart(raw) : null;
    const days = start ? raw.days.filter((d) => d.day >= start) : raw.days;
    const n = range === "all" ? days.length : PERIOD_DAYS[range];
    const current = range === "today" ? (days[days.length - 1] ?? ZERO) : sum(days.slice(-n));
    const previous = range === "today"
        ? raw.yesterday_same_time
        // Only a full run of earlier days is a fair comparison.
        : range !== "all" && days.length >= 2 * n ? sum(days.slice(-2 * n, -n)) : null;
    const sparkDays = days.slice(-Math.max(range === "today" ? TODAY_SPARK_DAYS : n, 2));
    return OVERVIEW_METRICS.map((key) => {
        const pick = PICK[key];
        const value = pick(current);
        return {
            key,
            value,
            deltaPct: previous ? pctChange(value, pick(previous)) : null,
            series: sparkDays.map(pick),
        };
    });
}
