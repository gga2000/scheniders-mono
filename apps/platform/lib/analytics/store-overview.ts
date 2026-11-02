import { z } from "zod";
import { pctChange } from "@/lib/analytics/dashboard-bento";

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

export interface OverviewMetric {
    key: OverviewMetricKey;
    /** Today so far. */
    value: number;
    /** Percent change against yesterday up to the same time of day; null when yesterday had nothing. */
    deltaPct: number | null;
    /** One point per Baghdad day, oldest first, today last. */
    series: number[];
}

type Figures = { visitors: number; orders: number; sales: number };

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
 * The six overview figures. Today is compared with yesterday cut off at the same
 * time of day, so a morning is never judged against a whole day.
 */
export function storeOverviewMetrics(raw: StoreOverviewRaw): OverviewMetric[] {
    const today = raw.days[raw.days.length - 1] ?? { visitors: 0, orders: 0, sales: 0 };
    return OVERVIEW_METRICS.map((key) => {
        const pick = PICK[key];
        const value = pick(today);
        return {
            key,
            value,
            deltaPct: pctChange(value, pick(raw.yesterday_same_time)),
            series: raw.days.map(pick),
        };
    });
}
