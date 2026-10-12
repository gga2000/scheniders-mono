/**
 * Types and calendar helpers for the dashboard.
 *
 * Every number on the dashboard comes from `get_dashboard_metrics` (parsed by
 * dashboard-metrics-schema.ts). The client engine that used to recompute them from
 * the loaded orders was removed (ORD-2): once the orders list became a window, that
 * engine reported window-sized numbers that jumped when the RPC landed. What is left
 * here is the widget-facing types, the Baghdad calendar, and the one series the RPC
 * does not return — the daily trend — computed from a bounded server query.
 */

// =============================================
// Baghdad calendar boundaries (TMP-D1)
// =============================================
/**
 * Iraq is UTC+3 all year and does not observe DST, so a fixed offset is both
 * correct and cheaper than an Intl round-trip.
 *
 * The server function computes every boundary in `Asia/Baghdad`. Client code that
 * derives a boundary from the BROWSER clock disagrees with it for any viewer whose
 * device is not on Baghdad time, so every client-side boundary goes through these.
 */
const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The instant at which the current Baghdad day began. */
export function baghdadDayStart(now: Date = new Date()): Date {
    const shifted = new Date(now.getTime() + BAGHDAD_OFFSET_MS);
    return new Date(Date.UTC(
        shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(),
    ) - BAGHDAD_OFFSET_MS);
}

/** The instant at which the current Baghdad month began. */
export function baghdadMonthStart(now: Date = new Date()): Date {
    const shifted = new Date(now.getTime() + BAGHDAD_OFFSET_MS);
    return new Date(Date.UTC(
        shifted.getUTCFullYear(), shifted.getUTCMonth(), 1,
    ) - BAGHDAD_OFFSET_MS);
}

/** Hour of day (0-23) in Baghdad for an instant. */
export function baghdadHour(d: Date): number {
    return new Date(d.getTime() + BAGHDAD_OFFSET_MS).getUTCHours();
}

/** Day of week (0 = Sunday) in Baghdad for an instant. */
export function baghdadDayOfWeek(d: Date): number {
    return new Date(d.getTime() + BAGHDAD_OFFSET_MS).getUTCDay();
}

/** Day of the month in Baghdad — used for "days elapsed" in the forecast. */
export function baghdadDayOfMonth(d: Date): number {
    return new Date(d.getTime() + BAGHDAD_OFFSET_MS).getUTCDate();
}

// =============================================
// Timestamp parsing (COR-D3, corrected)
// =============================================
/**
 * CORRECTION. COR-D3 asserted that `orders.delivered_at` is
 * `timestamp WITHOUT time zone` holding a UTC instant. **That was wrong.**
 * Verified against the live catalog and the serialised payload: the column is
 * `timestamp WITH time zone`, like every sibling, and PostgREST sends it with an
 * offset ("2026-03-16T12:25:12.848+00:00"). So this helper has always taken its
 * `hasZone` branch and has always been a no-op on real data — the client engine
 * was never wrong.
 *
 * The SQL half of that same fix was not harmless: it wrapped the column in
 * `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Baghdad'`, which on a timestamptz
 * shifted every delivery by a flat -6h, understating today's revenue by 59% and
 * discarding 383 sub-6h deliveries as "impossible". Fixed in migration
 * 20260909074726.
 *
 * The helper is kept because it is genuinely defensive: a zone-less value would
 * otherwise be read as BROWSER-LOCAL, which in Baghdad (UTC+3) silently shifts
 * the instant. It is not evidence that any column is zone-less.
 */
export function parseUtcNaiveTimestamp(value: string): Date {
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value.trim());
    return new Date(hasZone ? value : `${value.trim().replace(' ', 'T')}Z`);
}

// =============================================
// Urgency Metrics
// =============================================
export interface UrgencyMetrics {
    failedDeliveries: number;
    unconfirmedHighValue: number;
    stuckInTransit: number;
    highReturnCities: { city: string; rate: number }[];
    cityRejectionStats: Record<string, { total: number; rejected: number; rate: number }>;
}

// =============================================
// Funnel Metrics
// =============================================
export interface FunnelStep {
    id: string;
    label: string;
    value: number;
    fill: string;
}

// =============================================
// Leaderboard Metrics
// =============================================
export interface LeaderboardItem {
    id: string;
    label: string;
    subLabel?: string;
    value: number; // Revenue or Count
    trend: number; // % growth vs yesterday/prev period
    rank: number;
}

export interface LeaderboardMetrics {
    topCities: LeaderboardItem[];
    topProducts: LeaderboardItem[];
}

// =============================================
// Date Range Filter
// =============================================
export type DateRangeKey = 'today' | '7d' | '30d' | 'all';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The instant a dashboard range starts, exactly as `get_dashboard_metrics` computes
 * it: `today` is the Baghdad calendar day, `7d`/`30d` are rolling windows ending
 * now, and `all` has no cutoff (null). Any client query that must agree with the
 * RPC's ranged numbers windows on this.
 */
export function rangeCutoff(range: DateRangeKey, now: Date = new Date()): Date | null {
    switch (range) {
        case 'today': return baghdadDayStart(now);
        case '7d': return new Date(now.getTime() - 7 * DAY_MS);
        case '30d': return new Date(now.getTime() - 30 * DAY_MS);
        case 'all': return null;
    }
}

/**
 * COR-D1 — when an order's money was actually realized.
 *
 * Revenue used to count `confirmed` orders bucketed by order date: a promise, not
 * a collection. In COD Iraq a confirmed order can still be refused at the door, so
 * the dashboard booked revenue at promise time and quietly un-booked it later.
 * Realized revenue is delivered/completed orders, dated by when they were realized.
 *
 * Both `delivered_at` and `completed_at` are timestamptz and arrive with an
 * offset; see parseUtcNaiveTimestamp for why its name overstates the case.
 * Returns null when neither exists — true only of pre-2026 legacy imports on this data, none of
 * which fall inside any window the dashboard shows.
 */

/** The fields the realized-revenue rules read. */
export interface RealizableOrder {
    status: string;
    /** Absent when the viewer is not entitled to money (SEC-D2). */
    price?: number | null;
    created_at: string;
    delivered_at?: string | null;
    completed_at?: string | null;
}

export function realizedAt(o: RealizableOrder): Date | null {
    if (o.delivered_at) return parseUtcNaiveTimestamp(o.delivered_at);
    if (o.completed_at) return new Date(o.completed_at);
    return null;
}

/** Orders whose money is realized, i.e. actually collected. */
export function isRealizedRevenue(o: RealizableOrder): boolean {
    return o.status === 'delivered' || o.status === 'completed';
}

/** Sum of realized revenue in [start, end). */
export function realizedRevenueBetween(orders: RealizableOrder[], start: Date, end?: Date): number {
    return orders.reduce((sum, o) => {
        if (!isRealizedRevenue(o)) return sum;
        const at = realizedAt(o);
        if (!at || at < start || (end && at >= end)) return sum;
        return sum + Number(o.price ?? 0);
    }, 0);
}

// =============================================
// Today at a Glance Strip
// =============================================
export interface TodayStripMetrics {
    ordersToday: number;
    ordersYesterday: number;
    ordersDelta: number;
    ordersDeltaPct: number | null;
    /** Money fields are null when the viewer lacks VIEW_FINANCIALS (SEC-D2). */
    revenueToday: number | null;
    revenueYesterday: number | null;
    revenueDelta: number | null;
    revenueDeltaPct: number | null;
}

// =============================================
// Order Pipeline Bar
// =============================================
export interface PipelineStage {
    status: string;
    label: string;
    count: number;
    color: string;
    textColor: string;
    bgClass: string;
}

/**
 * I18N-D3. Axis labels were hardcoded `en-US`, which renders English weekday names
 * inside an Arabic UI and orders dates month-first — wrong for Iraq. Formatting is
 * pinned to the Baghdad timezone so a label always names the day the bucket
 * actually covers, whatever the viewer's device is set to.
 */
export type ChartLocale = "en" | "ar";

const CHART_LOCALE_TAG: Record<ChartLocale, string> = { en: "en-GB", ar: "ar-IQ" };

export function formatChartWeekday(d: Date, locale: ChartLocale = "en"): string {
    return d.toLocaleDateString(CHART_LOCALE_TAG[locale], {
        weekday: "short", timeZone: "Asia/Baghdad",
    });
}

export function formatChartDayMonth(d: Date, locale: ChartLocale = "en"): string {
    return d.toLocaleDateString(CHART_LOCALE_TAG[locale], {
        day: "numeric", month: "short", timeZone: "Asia/Baghdad",
    });
}

// =============================================
// Revenue Trend (7 / 14 / 30 days)
// =============================================
export interface RevenueTrendPoint {
    date: string;
    orders: number;
    revenue: number;
}

export type TrendDays = 7 | 14 | 30;

/**
 * The first instant the trend chart plots: the start of the Baghdad day `days - 1`
 * days before today. Orders created, and orders realized, from this instant on are
 * everything the chart needs.
 */
export function trendWindowStart(days: TrendDays, now: Date = new Date()): Date {
    return new Date(baghdadDayStart(now).getTime() - (days - 1) * DAY_MS);
}

/**
 * One point per Baghdad day: orders CREATED that day, and revenue REALIZED that day
 * (COR-D1). `orders` must contain every order created or realized inside the
 * window — not a page of the orders list.
 */
export function calculateRevenueTrend(orders: RealizableOrder[], days: TrendDays, locale: ChartLocale = "en", now: Date = new Date()): RevenueTrendPoint[] {
    const points: RevenueTrendPoint[] = [];

    const todayStart = baghdadDayStart(now);
    for (let i = days - 1; i >= 0; i--) {
        const day = new Date(todayStart.getTime() - i * DAY_MS);
        const next = new Date(day.getTime() + DAY_MS);

        const dayOrders = orders.filter(o => {
            const d = new Date(o.created_at);
            return d >= day && d < next;
        });

        const revenue = realizedRevenueBetween(orders, day, next);   // COR-D1

        let label: string;
        if (days === 7) {
            label = formatChartWeekday(day, locale);
        } else {
            label = formatChartDayMonth(day, locale);
        }

        points.push({ date: label, orders: dayOrders.length, revenue });
    }

    return points;
}

// =============================================
// Orders Per Hour (Today)
// =============================================
export interface HourlyCount {
    hour: number;
    label: string;
    count: number;
}

// =============================================
// Peak Hours Heatmap (historical, 7 days × 24 hours)
// =============================================
export interface HeatmapCell {
    dayOfWeek: number;   // 0 = Sun
    hour: number;
    count: number;
    intensity: number;   // 0–1 normalized
}

// =============================================
// Delivery Success Rate
// =============================================
export interface DeliveryRateMetrics {
    /** null when no terminal orders fell in the window — "no data", not 0%. (COR-D7) */
    currentRate: number | null;
    sparkline: { day: string; rate: number | null }[];
    /** null when either side of the comparison has no data. */
    trend: number | null;
}

// =============================================
// Avg Time Per Stage
// =============================================
export interface StageTimeMetric {
    label: string;
    avgHours: number;
    sampleSize: number;
    /**
     * Rows the average had to discard: impossible durations (delivered before
     * created) and >30-day outliers. DQ-D1 — 16 such rows exist on the audited
     * tenant. Dropping them is right; dropping them SILENTLY is what made a
     * shrinking sample invisible.
     */
    excluded?: number;
}

// =============================================
// Week-over-Week Comparison
// =============================================
export interface WowMetric {
    label: string;
    /** null when the metric has no data for the window (COR-D7). */
    current: number | null;
    previous: number | null;
    delta: number | null;
    deltaPct: number | null;
    isFinancial: boolean;
    unit?: string;
}

// =============================================
// Month Forecast
// =============================================
export interface MonthForecast {
    projectedOrders: number;
    /** null when the viewer lacks VIEW_FINANCIALS (SEC-D2). */
    projectedRevenue: number | null;
    daysElapsed: number;
    daysInMonth: number;
    ordersThisMonth: number;
    /** null when the viewer lacks VIEW_FINANCIALS (SEC-D2). */
    revenueThisMonth: number | null;
    ordersPerDay: number;
}

// =============================================
// Enhanced Leaderboard (Product Revenue)
// =============================================
export interface EnhancedProductItem extends LeaderboardItem {
    /** null when the viewer lacks VIEW_FINANCIALS (SEC-D2). */
    revenue: number | null;
}

export interface EnhancedLeaderboardMetrics extends LeaderboardMetrics {
    topProductsEnhanced: EnhancedProductItem[];
}

// =============================================
// Staff Leaderboard
// =============================================
export interface StaffEntry {
    name: string;
    ordersToday: number;
    ordersThisWeek: number;
    rank: number;
}

