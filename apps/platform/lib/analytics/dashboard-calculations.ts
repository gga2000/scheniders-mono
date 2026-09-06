import { Order, Product } from "@/lib/supabase";

// =============================================
// What counts as an order (COR-D5)
// =============================================
/**
 * Mirrors the `ws` CTE in `get_dashboard_metrics`. Two kinds of row live in
 * `orders` but are not orders a merchant has taken:
 *   - `pending_checkout` — a storefront checkout that was never completed (an
 *     abandoned cart). Counting them inflated order counts, the funnel's first
 *     stage, the heatmap and the city/product leaderboards.
 *   - soft-deleted rows (`deleted_at`) — hidden everywhere else in the product.
 * `suspended` rows ARE orders and are kept.
 */
export function isDashboardOrder(o: Order): boolean {
    if (o.status === 'pending_checkout') return false;
    if ((o as { deleted_at?: string | null }).deleted_at) return false;
    return true;
}

/** Apply the order/non-order rule to a list. */
export function onlyDashboardOrders(orders: Order[]): Order[] {
    return orders.filter(isDashboardOrder);
}

// =============================================
// delivered_at is UTC-naive (COR-D3 / Orders COR-8)
// =============================================
/**
 * `orders.delivered_at` is `timestamp WITHOUT time zone` holding a UTC instant,
 * unlike every sibling timestamp. Postgrest serialises it with no zone
 * designator ("2026-09-01 22:00:00.344756"), and `new Date()` then parses that as
 * BROWSER-LOCAL time — so on a Baghdad machine (UTC+3) every delivery looked 3
 * hours earlier than it was, understating each cycle by 3h and pushing sub-3h
 * deliveries negative, where a `> 0` filter silently discarded them.
 *
 * Parse it explicitly as UTC. Values that already carry a zone are left alone.
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

export function calculateUrgencyMetrics(orders: Order[]): UrgencyMetrics {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // 1. Unconfirmed High Value (> 100,000 IQD) created > 24h ago
    const unconfirmedHighValue = orders.filter(o =>
        o.status === 'new' &&
        o.price > 100000 &&
        new Date(o.created_at) < twentyFourHoursAgo
    ).length;

    // 2. Failed Deliveries (Last 7 days rejected)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const failedDeliveries = orders.filter(o =>
        o.status === 'rejected' &&
        new Date(o.updated_at || o.created_at) > sevenDaysAgo
    ).length;

    // 3. Stuck In Transit (> 3 days)
    const stuckInTransit = orders.filter(o =>
        o.status === 'in_transit' &&
        new Date(o.updated_at || o.created_at) < threeDaysAgo
    ).length;

    // 4. High Return Rate Cities (Min 5 orders)
    const cityStats: Record<string, { total: number; rejected: number }> = {};
    orders.forEach(o => {
        if (!o.city) return;
        if (!cityStats[o.city]) cityStats[o.city] = { total: 0, rejected: 0 };
        cityStats[o.city].total++;
        if (o.status === 'rejected') cityStats[o.city].rejected++;
    });

    const highReturnCities = Object.entries(cityStats)
        .filter(([_, stats]) => stats.total >= 5)
        .map(([city, stats]) => ({
            city,
            rate: (stats.rejected / stats.total) * 100
        }))
        .filter(item => item.rate > 30) // Only show cities with > 30% rejection
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 3);

    // Build full city rejection stats map (exposed for RejectionBreakdown widget)
    const cityRejectionStats: Record<string, { total: number; rejected: number; rate: number }> = {};
    Object.entries(cityStats).forEach(([city, stats]) => {
        cityRejectionStats[city] = {
            total: stats.total,
            rejected: stats.rejected,
            rate: Math.round((stats.rejected / stats.total) * 100),
        };
    });

    return { failedDeliveries, unconfirmedHighValue, stuckInTransit, highReturnCities, cityRejectionStats };
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

export function calculateFunnelMetrics(orders: Order[]): FunnelStep[] {
    const newCount = orders.filter(o => o.status === 'new').length;
    // Contacted includes confirmed, in_transit, etc. (assuming flow)
    // Actually, let's just count strict status buckets for simplicity or cumulative?
    // Funnel usually means "Reached at least this stage"

    // Stage 1: All Orders (New)
    const total = orders.length;

    // Stage 2: Verified (Confirmed + In Transit + Delivered + Completed + Rejected)
    // Basically anything NOT new, no_response, cancelled
    const verified = orders.filter(o =>
        ['confirmed', 'in_transit', 'delivered', 'completed', 'rejected'].includes(o.status)
    ).length;

    // Stage 3: Shipped (In Transit + Delivered + Completed + Rejected)
    const shipped = orders.filter(o =>
        ['in_transit', 'delivered', 'completed', 'rejected'].includes(o.status)
    ).length;

    // Stage 4: Successful Delivery
    const delivered = orders.filter(o =>
        ['delivered', 'completed'].includes(o.status)
    ).length;

    return [
        { id: '1', label: 'All Orders', value: total, fill: '#E4C1F9' }, // Purple
        { id: '2', label: 'Verified', value: verified, fill: '#A6C8FF' }, // Blue
        { id: '3', label: 'Shipped', value: shipped, fill: '#FBE38E' }, // Yellow
        { id: '4', label: 'Delivered', value: delivered, fill: '#C0EBA6' }, // Green
    ];
}

// Product Velocity Matrix - REMOVED (no longer used)
// Use productProfitAnalysis from useOrderProfits instead

// Customer Cohort Retention - REMOVED (no longer used)
// This feature has been removed per user request

// Profit Pulse - MOVED to /lib/analytics/profit-calculations.ts
// Use calculateProfitPulse from profit-calculations.ts for accurate net profit calculations

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

export function calculateLeaderboard(orders: Order[]): LeaderboardMetrics {
    // 1. Top Cities by Orders (Today) vs Yesterday
    // For simplicity, let's do All Time or This Month? "State of the Art" usually shows "Today's Leaders" or "This Month"
    // Let's do This Month for better data density

    const cityStats: Record<string, number> = {};
    const productStats: Record<string, number> = {};

    orders.forEach(o => {
        if (o.status === 'cancelled' || o.status === 'rejected') return;

        // City
        if (o.city) {
            cityStats[o.city] = (cityStats[o.city] || 0) + 1;
        }

        // Product
        o.items.forEach(item => {
            productStats[item.name] = (productStats[item.name] || 0) + (item.quantity || 1);
        });
    });

    const topCities = Object.entries(cityStats)
        .map(([city, count]) => ({ id: city, label: city, value: count, trend: 0, rank: 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map((item, i) => ({ ...item, rank: i + 1 }));

    const topProducts = Object.entries(productStats)
        .map(([name, count]) => ({ id: name, label: name, value: count, trend: 0, rank: 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map((item, i) => ({ ...item, rank: i + 1 }));

    return { topCities, topProducts };
}

// =============================================
// Date Range Filter
// =============================================
export type DateRangeKey = 'today' | '7d' | '30d' | 'all';

export function filterOrdersByDateRange(orders: Order[], range: DateRangeKey): Order[] {
    if (range === 'all') return orders;
    const now = new Date();
    let cutoff: Date;
    if (range === 'today') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === '7d') {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    return orders.filter(o => new Date(o.created_at) >= cutoff);
}

// =============================================
// Today at a Glance Strip
// =============================================
export interface TodayStripMetrics {
    ordersToday: number;
    revenueToday: number;
    ordersYesterday: number;
    revenueYesterday: number;
    ordersDelta: number;
    revenueDelta: number;
    ordersDeltaPct: number | null;
    revenueDeltaPct: number | null;
}

export function calculateTodayStrip(orders: Order[]): TodayStripMetrics {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    const todayOrders = orders.filter(o => new Date(o.created_at) >= todayStart);
    const yesterdayOrders = orders.filter(o => {
        const d = new Date(o.created_at);
        return d >= yesterdayStart && d < todayStart;
    });

    const isRevenue = (o: Order) => o.status === 'confirmed' || o.status === 'delivered' || o.status === 'completed';

    const ordersToday = todayOrders.length;
    const ordersYesterday = yesterdayOrders.length;
    const revenueToday = todayOrders.filter(isRevenue).reduce((s, o) => s + Number(o.price), 0);
    const revenueYesterday = yesterdayOrders.filter(isRevenue).reduce((s, o) => s + Number(o.price), 0);

    const ordersDelta = ordersToday - ordersYesterday;
    const revenueDelta = revenueToday - revenueYesterday;
    const ordersDeltaPct = ordersYesterday > 0 ? Math.round((ordersDelta / ordersYesterday) * 100) : null;
    const revenueDeltaPct = revenueYesterday > 0 ? Math.round((revenueDelta / revenueYesterday) * 100) : null;

    return { ordersToday, revenueToday, ordersYesterday, revenueYesterday, ordersDelta, revenueDelta, ordersDeltaPct, revenueDeltaPct };
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

export function calculatePipeline(orders: Order[]): PipelineStage[] {
    const stages: Array<{ status: string; label: string; color: string; textColor: string; bgClass: string }> = [
        { status: 'new',        label: 'New',         color: 'var(--pastel-yellow)', textColor: '#78350f', bgClass: 'pastel-card-yellow' },
        { status: 'contacted',  label: 'Contacted',   color: 'var(--pastel-blue)',   textColor: '#1e3a5f', bgClass: 'pastel-card-blue'   },
        { status: 'confirmed',  label: 'Confirmed',   color: 'var(--pastel-green)',  textColor: '#14532d', bgClass: 'pastel-card-green'  },
        { status: 'in_transit', label: 'In Transit',  color: 'var(--pastel-mint)',   textColor: '#134e4a', bgClass: 'pastel-card-mint'   },
        { status: 'delivered',  label: 'Delivered',   color: 'var(--pastel-purple)', textColor: '#4c1d95', bgClass: 'pastel-card-purple' },
    ];

    const counts: Record<string, number> = {};
    orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });

    return stages.map(s => ({ ...s, count: counts[s.status] || 0 }));
}

// =============================================
// Revenue Trend (7 / 14 / 30 days)
// =============================================
export interface RevenueTrendPoint {
    date: string;
    orders: number;
    revenue: number;
}

export function calculateRevenueTrend(orders: Order[], days: 7 | 14 | 30): RevenueTrendPoint[] {
    const now = new Date();
    const points: RevenueTrendPoint[] = [];

    for (let i = days - 1; i >= 0; i--) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);

        const dayOrders = orders.filter(o => {
            const d = new Date(o.created_at);
            return d >= day && d < next;
        });

        const revenue = dayOrders
            .filter(o => ['confirmed', 'delivered', 'completed'].includes(o.status))
            .reduce((s, o) => s + Number(o.price), 0);

        let label: string;
        if (days === 7) {
            label = day.toLocaleDateString('en-US', { weekday: 'short' });
        } else {
            label = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

export function calculateOrdersPerHourToday(orders: Order[]): HourlyCount[] {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayOrders = orders.filter(o => new Date(o.created_at) >= todayStart);
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    todayOrders.forEach(o => {
        const h = new Date(o.created_at).getHours();
        buckets[h].count++;
    });

    return buckets.map(b => ({
        hour: b.hour,
        label: b.hour === 0 ? '12AM' : b.hour < 12 ? `${b.hour}AM` : b.hour === 12 ? '12PM' : `${b.hour - 12}PM`,
        count: b.count,
    }));
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

export function calculatePeakHoursHeatmap(orders: Order[]): HeatmapCell[] {
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));

    orders.forEach(o => {
        const d = new Date(o.created_at);
        grid[d.getDay()][d.getHours()]++;
    });

    const max = Math.max(1, ...grid.flat());
    const cells: HeatmapCell[] = [];

    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            cells.push({ dayOfWeek: day, hour, count: grid[day][hour], intensity: grid[day][hour] / max });
        }
    }

    return cells;
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

export function calculateDeliverySuccessRate(orders: Order[]): DeliveryRateMetrics {
    const now = new Date();

    // COR-D7: an empty window has no rate. Returning 0 rendered a catastrophic
    // "0% delivery rate" for a merchant who simply had a quiet week.
    const rateForWindow = (start: Date, end: Date): number | null => {
        const window = orders.filter(o => {
            const d = new Date(o.updated_at || o.created_at);
            return d >= start && d < end && ['delivered', 'completed', 'rejected'].includes(o.status);
        });
        if (!window.length) return null;
        const success = window.filter(o => ['delivered', 'completed'].includes(o.status)).length;
        return Math.round((success / window.length) * 100);
    };

    // 7-day sparkline
    const sparkline = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
        const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
        return {
            day: day.toLocaleDateString('en-US', { weekday: 'short' }),
            rate: rateForWindow(day, next),
        };
    });

    const currentPeriodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevPeriodStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const currentRate = rateForWindow(currentPeriodStart, now);
    const prevRate = rateForWindow(prevPeriodStart, currentPeriodStart);

    const trend = currentRate === null || prevRate === null ? null : currentRate - prevRate;
    return { currentRate, sparkline, trend };
}

// =============================================
// Avg Time Per Stage
// =============================================
export interface StageTimeMetric {
    label: string;
    avgHours: number;
    sampleSize: number;
}

export function calculateAvgTimePerStage(orders: Order[]): StageTimeMetric[] {
    // Metric 1: Total cycle time (created → delivered) for completed deliveries
    const delivered = orders.filter(o =>
        ['delivered', 'completed'].includes(o.status) && o.delivered_at
    );
    const cycleTimes = delivered.map(o =>
        (parseUtcNaiveTimestamp(o.delivered_at!).getTime() - new Date(o.created_at).getTime()) / (1000 * 60 * 60)
    ).filter(h => h >= 0 && h < 24 * 30); // exclude outliers > 30 days; h>=0 admits same-instant cycles

    const avgCycle = cycleTimes.length > 0
        ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
        : 0;

    // Metric 2: Time stuck in transit (in_transit orders, using updated_at)
    const now = new Date();
    const inTransit = orders.filter(o => o.status === 'in_transit');
    const transitTimes = inTransit.map(o =>
        (now.getTime() - new Date(o.updated_at || o.created_at).getTime()) / (1000 * 60 * 60)
    ).filter(h => h < 24 * 30);

    const avgTransit = transitTimes.length > 0
        ? transitTimes.reduce((a, b) => a + b, 0) / transitTimes.length
        : 0;

    // Metric 3: Time pending (new + contacted orders age)
    const pending = orders.filter(o => ['new', 'contacted'].includes(o.status));
    const pendingTimes = pending.map(o =>
        (now.getTime() - new Date(o.created_at).getTime()) / (1000 * 60 * 60)
    ).filter(h => h < 24 * 30);

    const avgPending = pendingTimes.length > 0
        ? pendingTimes.reduce((a, b) => a + b, 0) / pendingTimes.length
        : 0;

    return [
        { label: 'New → Delivered (full cycle)', avgHours: avgCycle, sampleSize: cycleTimes.length },
        { label: 'Pending response (avg age)', avgHours: avgPending, sampleSize: pendingTimes.length },
        { label: 'In transit (avg wait)', avgHours: avgTransit, sampleSize: transitTimes.length },
    ];
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

export function calculateWeekOverWeek(orders: Order[]): WowMetric[] {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const current = orders.filter(o => new Date(o.created_at) >= weekAgo);
    const previous = orders.filter(o => {
        const d = new Date(o.created_at);
        return d >= twoWeeksAgo && d < weekAgo;
    });

    const deliveryRate = (set: Order[]): number | null => {
        const terminal = set.filter(o => ['delivered', 'completed', 'rejected'].includes(o.status));
        if (!terminal.length) return null;   // COR-D7
        return Math.round((terminal.filter(o => ['delivered', 'completed'].includes(o.status)).length / terminal.length) * 100);
    };

    const revenue = (set: Order[]) =>
        set.filter(o => ['confirmed', 'delivered', 'completed'].includes(o.status))
           .reduce((s, o) => s + Number(o.price), 0);

    const pct = (curr: number, prev: number) => prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;

    const currOrders = current.length;
    const prevOrders = previous.length;
    const currRate = deliveryRate(current);
    const prevRate = deliveryRate(previous);
    const currRevenue = revenue(current);
    const prevRevenue = revenue(previous);

    return [
        {
            label: 'Orders',
            current: currOrders,
            previous: prevOrders,
            delta: currOrders - prevOrders,
            deltaPct: pct(currOrders, prevOrders),
            isFinancial: false,
        },
        {
            label: 'Delivery Rate',
            current: currRate,
            previous: prevRate,
            delta: currRate === null || prevRate === null ? null : currRate - prevRate,
            deltaPct: null,
            isFinancial: false,
            unit: '%',
        },
        {
            label: 'Revenue',
            current: currRevenue,
            previous: prevRevenue,
            delta: currRevenue - prevRevenue,
            deltaPct: pct(currRevenue, prevRevenue),
            isFinancial: true,
        },
    ];
}

// =============================================
// Month Forecast
// =============================================
export interface MonthForecast {
    projectedOrders: number;
    projectedRevenue: number;
    daysElapsed: number;
    daysInMonth: number;
    ordersThisMonth: number;
    revenueThisMonth: number;
    ordersPerDay: number;
}

export function calculateMonthForecast(orders: Order[]): MonthForecast {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed = Math.max(1, now.getDate());

    const monthOrders = orders.filter(o => new Date(o.created_at) >= monthStart);
    const ordersThisMonth = monthOrders.length;
    const revenueThisMonth = monthOrders
        .filter(o => ['confirmed', 'delivered', 'completed'].includes(o.status))
        .reduce((s, o) => s + Number(o.price), 0);

    const ordersPerDay = ordersThisMonth / daysElapsed;
    const projectedOrders = Math.round(ordersPerDay * daysInMonth);
    const revenuePerDay = revenueThisMonth / daysElapsed;
    const projectedRevenue = Math.round(revenuePerDay * daysInMonth);

    return { projectedOrders, projectedRevenue, daysElapsed, daysInMonth, ordersThisMonth, revenueThisMonth, ordersPerDay };
}

// =============================================
// Enhanced Leaderboard (Product Revenue)
// =============================================
export interface EnhancedProductItem extends LeaderboardItem {
    revenue: number;
}

export interface EnhancedLeaderboardMetrics extends LeaderboardMetrics {
    topProductsEnhanced: EnhancedProductItem[];
}

export function calculateEnhancedLeaderboard(orders: Order[]): EnhancedLeaderboardMetrics {
    const cityStats: Record<string, number> = {};
    const productStats: Record<string, { count: number; revenue: number }> = {};

    orders.forEach(o => {
        if (o.status === 'cancelled' || o.status === 'rejected') return;

        if (o.city) {
            cityStats[o.city] = (cityStats[o.city] || 0) + 1;
        }

        // COR-D2: attribute revenue by each line's value, scaled so the shares
        // still sum to the order's real price (discount-safe). The old code split
        // `price` equally across lines, crediting a 5,000 accessory the same as a
        // 40,000 perfume. Equal split remains only as the no-line-price fallback.
        const lineGross = o.items.map(item =>
            Number((item as { price?: number }).price ?? 0) * (item.quantity || 1)
        );
        const linesTotal = lineGross.reduce((s, v) => s + v, 0);

        o.items.forEach((item, i) => {
            if (!productStats[item.name]) productStats[item.name] = { count: 0, revenue: 0 };
            productStats[item.name].count += (item.quantity || 1);
            productStats[item.name].revenue += linesTotal > 0
                ? Number(o.price) * (lineGross[i] / linesTotal)
                : Number(o.price) / o.items.length;
        });
    });

    const topCities: LeaderboardItem[] = Object.entries(cityStats)
        .map(([city, count]) => ({ id: city, label: city, value: count, trend: 0, rank: 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map((item, i) => ({ ...item, rank: i + 1 }));

    const topProductsEnhanced: EnhancedProductItem[] = Object.entries(productStats)
        .map(([name, s]) => ({ id: name, label: name, value: s.count, revenue: s.revenue, trend: 0, rank: 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map((item, i) => ({ ...item, rank: i + 1 }));

    const topProducts: LeaderboardItem[] = topProductsEnhanced.map(({ revenue: _, ...rest }) => rest);

    return { topCities, topProducts, topProductsEnhanced };
}

// =============================================
// Recent Orders Feed
// =============================================
export function getRecentOrders(orders: Order[], limit = 10): Order[] {
    return [...orders]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);
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

/**
 * COR-D6. Staff performance is attributed from `activity_logs` (`order.status_change`
 * grouped by user_id) in `get_dashboard_metrics` — the same source payroll uses.
 *
 * This client fallback deliberately returns nothing. It only has the orders list,
 * whose `last_status_changed_by_name` is free text that (a) credits solely the
 * LATEST toucher, (b) merges/splits people on a rename, (c) includes non-human
 * actors — the audited tenant's board was topped by "WhatsApp Bot", with "System"
 * on 1,397 orders — and (d) windows on `updated_at`, which platform writes never
 * bump (COR-D4). Ranking real people by that is worse than showing nothing, so
 * when the server metrics are unavailable the widget shows its no-activity state.
 */
export function calculateStaffLeaderboard(_orders: Order[]): StaffEntry[] {
    return [];
}
