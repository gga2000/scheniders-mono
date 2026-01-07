import { Order, Product } from "@/lib/supabase";
import { startOfMonth, format, differenceInMonths, parseISO, isSameDay, subDays } from "date-fns";

// =============================================
// Urgency Metrics
// =============================================
export interface UrgencyMetrics {
    failedDeliveries: number;
    unconfirmedHighValue: number;
    stuckInTransit: number;
    highReturnCities: { city: string; rate: number }[];
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

    return { failedDeliveries, unconfirmedHighValue, stuckInTransit, highReturnCities };
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

// =============================================
// Product Velocity Matrix
// =============================================
export interface ProductMetric {
    id: string;
    name: string;
    volume: number; // Total items sold
    revenue: number; // Total revenue
    profit: number; // (Price - Cost) * Volume
    margin: number; // Profit / Revenue
    category: 'Star' | 'Cash Cow' | 'Question Mark' | 'Dog';
}

export function calculateVelocityMatrix(orders: Order[], products: Product[]): ProductMetric[] {
    // 1. Create Product Map for fast lookup of costs
    const productMap = new Map<string, Product>();
    products.forEach(p => {
        // Use name normalized or ID if available. 
        // Order items usually rely on name currently, or product_id if linked.
        // Let's rely on name matching as fallback
        productMap.set(p.name.trim().toLowerCase(), p);
        if (p.id) productMap.set(p.id, p);
    });

    const metrics: Record<string, { volume: number; revenue: number; cost: number }> = {};

    // 2. Aggregate Order Items
    orders.forEach(o => {
        // Only count valid sales
        if (['cancelled', 'rejected', 'return_pending'].includes(o.status)) return;

        o.items.forEach(item => {
            const key = item.name;
            if (!metrics[key]) metrics[key] = { volume: 0, revenue: 0, cost: 0 };

            const quantity = item.quantity || 1;
            const revenue = item.price * quantity;

            // Allow matching by ID or Name
            const product = (item.product_id && productMap.get(item.product_id)) || productMap.get(item.name.trim().toLowerCase());
            const cost = product?.cost || 0;

            metrics[key].volume += quantity;
            metrics[key].revenue += revenue;
            metrics[key].cost += cost * quantity;
        });
    });

    // 3. Calculate Quadrants
    const result: ProductMetric[] = Object.entries(metrics).map(([name, data]) => {
        const profit = data.revenue - data.cost;
        const margin = data.revenue > 0 ? (profit / data.revenue) : 0;

        return {
            id: name,
            name,
            volume: data.volume,
            revenue: data.revenue,
            profit,
            margin,
            category: 'Question Mark' // Placeholder
        };
    });

    if (result.length === 0) return [];

    // 4. Determine Categories based on Averages
    const avgVolume = result.reduce((sum, p) => sum + p.volume, 0) / result.length;
    const avgMargin = result.reduce((sum, p) => sum + p.margin, 0) / result.length;

    return result.map(p => {
        let category: ProductMetric['category'] = 'Dog';
        if (p.volume >= avgVolume && p.margin >= avgMargin) category = 'Star';
        else if (p.volume >= avgVolume && p.margin < avgMargin) category = 'Cash Cow';
        else if (p.volume < avgVolume && p.margin >= avgMargin) category = 'Question Mark';
        // else Dog

        return { ...p, category };
    });
}

// =============================================
// Customer Cohort Analysis
// =============================================
export interface CohortData {
    month: string; // "2023-01"
    cohortSize: number;
    retention: Record<number, number>; // { 1: 50%, 2: 30% ... } (Month index -> Retention %)
}

export function calculateCohortRetention(orders: Order[]): CohortData[] {
    // 1. Identify First Order Date for each customer (by Phone)
    const customerFirstOrder = new Map<string, Date>();

    // Sort orders by date asc
    const sortedOrders = [...orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    sortedOrders.forEach(o => {
        if (!o.phone) return;
        const phone = o.phone.replace(/\s/g, '');
        if (!customerFirstOrder.has(phone)) {
            customerFirstOrder.set(phone, new Date(o.created_at));
        }
    });

    // 2. Group customers into Cohorts (Month of first order)
    const cohorts: Record<string, Set<string>> = {}; // "2023-01" -> Set(Phone1, Phone2)

    customerFirstOrder.forEach((date, phone) => {
        const cohortKey = format(date, 'yyyy-MM');
        if (!cohorts[cohortKey]) cohorts[cohortKey] = new Set();
        cohorts[cohortKey].add(phone);
    });

    // 3. Calculate Retention
    const results: CohortData[] = [];

    // Process last 12 cohorts
    Object.entries(cohorts)
        .sort()
        .slice(-12)
        .forEach(([monthKey, customers]) => {
            const cohortDate = parseISO(`${monthKey}-01`);
            const retention: Record<number, number> = {};

            // Check subsequent months (0 to 11)
            for (let i = 0; i < 12; i++) {
                // Find orders from these customers in monthKey + i
                // This is computationally expensive, optimize if needed
                // For simplified version: check each customer in the cohort if they ordered in month + i

                let activeCount = 0;
                customers.forEach(phone => {
                    // Check if this customer has an order in the target month (i months after cohort)
                    // We need to check all orders. To optimize, maybe pre-index orders by customer?
                    const hasOrder = orders.some(o => {
                        if (!o.phone || o.phone.replace(/\s/g, '') !== phone) return false;
                        const orderDate = new Date(o.created_at);
                        const monthDiff = differenceInMonths(startOfMonth(orderDate), cohortDate);
                        return monthDiff === i;
                    });
                    if (hasOrder) activeCount++;
                });

                if (customers.size > 0) {
                    // Normalize to percentage
                    retention[i] = Math.round((activeCount / customers.size) * 100);
                }
            }

            results.push({
                month: monthKey,
                cohortSize: customers.size,
                retention
            });
        });

    return results;
}

// =============================================
// Profit Pulse (Daily)
// =============================================
export function calculateProfitPulse(orders: Order[]) {
    const today = new Date();
    const yesterday = subDays(today, 1);

    const getDataForDate = (date: Date) => {
        return orders
            .filter(o => isSameDay(new Date(o.created_at), date))
            .reduce((sum, o) => sum + o.price, 0); // Using Revenue as proxy for profit if cost missing
    };

    return {
        today: getDataForDate(today),
        yesterday: getDataForDate(yesterday)
    };
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

