import { z } from "zod";
import {
    rangeCutoff,
    trendWindowStart,
    type DateRangeKey,
    type TrendDays,
} from "@/lib/analytics/dashboard-calculations";

/**
 * Per-order facts for the dashboard widgets `get_dashboard_metrics` does not
 * cover: the revenue / hourly / governorate bento cards (one shared "trend"
 * read) and the governorate map.
 *
 * Both used to read the shared orders list (ORD-2). That list is a window of the
 * book, so the chart and map silently plotted whatever happened to be loaded. They
 * now read a bounded, complete server query instead: only the columns they use,
 * only the rows inside their window, every page of it.
 *
 * `price` is selected only for viewers entitled to money, so a viewer who may not
 * see revenue is never sent it (SEC-D2).
 */

// numeric arrives as a JSON number; null on legacy rows; absent when not selected.
const price = z.number().nullable().optional();

export const trendFactSchema = z.object({
    created_at: z.string(),
    status: z.string(),
    delivered_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    /** Which system sent the order: splits the hourly waves into online vs chat. */
    source: z.string().nullable(),
    governorate_code: z.string().nullable(),
    validated_governorate_code: z.string().nullable(),
    price,
});
export type TrendFact = z.infer<typeof trendFactSchema>;

export const geoFactSchema = z.object({
    status: z.string(),
    governorate_code: z.string().nullable(),
    validated_governorate_code: z.string().nullable(),
    price,
});
export type GeoFact = z.infer<typeof geoFactSchema>;

/** Which rows a widget needs. */
export type OrderFactsWindow =
    | { kind: "trend"; days: TrendDays }
    | { kind: "geo"; range: DateRangeKey };

const TREND_COLUMNS = "created_at,status,delivered_at,completed_at,source,governorate_code,validated_governorate_code";
const GEO_COLUMNS = "status,governorate_code,validated_governorate_code";

export function factColumns(kind: OrderFactsWindow["kind"], includePrice: boolean): string {
    const base = kind === "trend" ? TREND_COLUMNS : GEO_COLUMNS;
    return includePrice ? `${base},price` : base;
}

/**
 * The PostgREST filter for a window: an `or` union, a created_at floor, or none.
 *
 * - trend: orders CREATED in the window (the bars) and orders REALIZED in it (the
 *   revenue line, COR-D1). A delivery today of an order created last month belongs
 *   to today's revenue, so a created_at filter alone would undercount it.
 * - geo: orders created since the dashboard range's cutoff, the same cutoff
 *   `get_dashboard_metrics(p_range)` applies, so the map agrees with the ranged
 *   widgets beside it. `all` has no floor.
 */
export type FactFilter =
    | { type: "or"; expression: string }
    | { type: "createdSince"; since: string }
    | { type: "none" };

export function factFilter(window: OrderFactsWindow, now: Date = new Date()): FactFilter {
    if (window.kind === "trend") {
        const since = trendWindowStart(window.days, now).toISOString();
        return {
            type: "or",
            expression: `created_at.gte.${since},delivered_at.gte.${since},completed_at.gte.${since}`,
        };
    }
    const cutoff = rangeCutoff(window.range, now);
    return cutoff ? { type: "createdSince", since: cutoff.toISOString() } : { type: "none" };
}

/** Rows per request. Supabase caps a response at 1,000 rows. */
export const FACTS_PAGE_SIZE = 1000;

/**
 * Fetch every page. A short page is the last one; stopping at the first page
 * would reintroduce exactly the truncation this replaces.
 */
export async function fetchAllPages<T>(
    fetchPage: (from: number, to: number) => Promise<T[]>,
    pageSize: number = FACTS_PAGE_SIZE,
): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += pageSize) {
        const page = await fetchPage(from, from + pageSize - 1);
        rows.push(...page);
        if (page.length < pageSize) return rows;
    }
}
