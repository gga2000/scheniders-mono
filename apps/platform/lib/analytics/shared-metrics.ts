/**
 * Shared Metrics Utilities
 * Common calculations used by both Dashboard and Reports
 */

import { Order } from "@/lib/supabase";
import { DateRange } from "@/hooks/use-reports-metrics";
import { startOfDay, endOfDay, subDays, isWithinInterval } from "date-fns";

// =============================================
// Common Types
// =============================================

export interface KPIMetrics {
    totalOrders: number;
    deliveryRate: number;
    rejectionRate: number;
    confirmationRate: number;
    avgProcessingTime: number; // hours
    totalRevenue: number;
    pendingOrders: number;
    inTransitOrders: number;
}

export interface TrendData {
    current: number;
    previous: number;
    changePercent: number;
    isPositive: boolean;
}

// =============================================
// Order Filtering
// =============================================

export function filterOrdersByDateRange(orders: Order[], dateRange: DateRange): Order[] {
    return orders.filter(order => {
        const orderDate = new Date(order.created_at);
        return isWithinInterval(orderDate, { start: dateRange.from, end: dateRange.to });
    });
}

export function getOrdersForToday(orders: Order[]): Order[] {
    const today = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    return filterOrdersByDateRange(orders, { from: today, to: todayEnd });
}

export function getOrdersForYesterday(orders: Order[]): Order[] {
    const yesterday = startOfDay(subDays(new Date(), 1));
    const yesterdayEnd = endOfDay(subDays(new Date(), 1));
    return filterOrdersByDateRange(orders, { from: yesterday, to: yesterdayEnd });
}

// =============================================
// KPI Calculations
// =============================================

export function calculateKPIs(orders: Order[]): KPIMetrics {
    const total = orders.length;
    if (total === 0) {
        return {
            totalOrders: 0,
            deliveryRate: 0,
            rejectionRate: 0,
            confirmationRate: 0,
            avgProcessingTime: 0,
            totalRevenue: 0,
            pendingOrders: 0,
            inTransitOrders: 0,
        };
    }

    const delivered = orders.filter(o => o.status === 'delivered' || o.status === 'completed').length;
    const rejected = orders.filter(o => o.status === 'rejected').length;
    const confirmed = orders.filter(o =>
        ['confirmed', 'in_transit', 'delivered', 'completed'].includes(o.status)
    ).length;
    const pending = orders.filter(o => o.status === 'new' || o.status === 'contacted').length;
    const inTransit = orders.filter(o => o.status === 'in_transit').length;

    // Revenue from delivered orders
    const totalRevenue = orders
        .filter(o => o.status === 'delivered' || o.status === 'completed')
        .reduce((sum, o) => sum + (o.price || 0), 0);

    // Average processing time (from created to delivered)
    const deliveredWithTimes = orders.filter(o =>
        (o.status === 'delivered' || o.status === 'completed') && o.delivered_at
    );
    let avgProcessingTime = 0;
    if (deliveredWithTimes.length > 0) {
        const totalHours = deliveredWithTimes.reduce((sum, o) => {
            const created = new Date(o.created_at).getTime();
            const delivered = new Date(o.delivered_at!).getTime();
            return sum + (delivered - created) / (1000 * 60 * 60);
        }, 0);
        avgProcessingTime = totalHours / deliveredWithTimes.length;
    }

    return {
        totalOrders: total,
        deliveryRate: (delivered / total) * 100,
        rejectionRate: (rejected / total) * 100,
        confirmationRate: (confirmed / total) * 100,
        avgProcessingTime,
        totalRevenue,
        pendingOrders: pending,
        inTransitOrders: inTransit,
    };
}

// =============================================
// Trend Calculations
// =============================================

export function calculateTrend(current: number, previous: number): TrendData {
    if (previous === 0) {
        return {
            current,
            previous,
            changePercent: current > 0 ? 100 : 0,
            isPositive: current > 0,
        };
    }

    const changePercent = ((current - previous) / previous) * 100;
    return {
        current,
        previous,
        changePercent,
        isPositive: changePercent >= 0,
    };
}

export function calculateKPITrends(
    currentOrders: Order[],
    previousOrders: Order[]
): Record<keyof KPIMetrics, TrendData> {
    const current = calculateKPIs(currentOrders);
    const previous = calculateKPIs(previousOrders);

    return {
        totalOrders: calculateTrend(current.totalOrders, previous.totalOrders),
        deliveryRate: calculateTrend(current.deliveryRate, previous.deliveryRate),
        rejectionRate: calculateTrend(current.rejectionRate, previous.rejectionRate),
        confirmationRate: calculateTrend(current.confirmationRate, previous.confirmationRate),
        avgProcessingTime: calculateTrend(current.avgProcessingTime, previous.avgProcessingTime),
        totalRevenue: calculateTrend(current.totalRevenue, previous.totalRevenue),
        pendingOrders: calculateTrend(current.pendingOrders, previous.pendingOrders),
        inTransitOrders: calculateTrend(current.inTransitOrders, previous.inTransitOrders),
    };
}

// =============================================
// Status Distribution
// =============================================

export interface StatusCount {
    status: string;
    count: number;
    percentage: number;
    label: string;
}

const STATUS_LABELS: Record<string, string> = {
    new: 'New',
    contacted: 'Contacted',
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    in_transit: 'In Transit',
    delivered: 'Delivered',
    rejected: 'Rejected',
    completed: 'Completed',
};

export function calculateStatusDistribution(orders: Order[]): StatusCount[] {
    const total = orders.length;
    if (total === 0) return [];

    const counts: Record<string, number> = {};
    orders.forEach(order => {
        counts[order.status] = (counts[order.status] || 0) + 1;
    });

    return Object.entries(counts)
        .map(([status, count]) => ({
            status,
            count,
            percentage: (count / total) * 100,
            label: STATUS_LABELS[status] || status,
        }))
        .sort((a, b) => b.count - a.count);
}

// =============================================
// City Analytics
// =============================================

export interface CityMetrics {
    city: string;
    totalOrders: number;
    deliveredOrders: number;
    rejectedOrders: number;
    deliveryRate: number;
    revenue: number;
}

export function calculateCityMetrics(orders: Order[]): CityMetrics[] {
    const cityMap = new Map<string, {
        total: number;
        delivered: number;
        rejected: number;
        revenue: number;
    }>();

    orders.forEach(order => {
        const city = order.city || 'Unknown';
        if (!cityMap.has(city)) {
            cityMap.set(city, { total: 0, delivered: 0, rejected: 0, revenue: 0 });
        }
        const stats = cityMap.get(city)!;
        stats.total++;
        if (order.status === 'delivered' || order.status === 'completed') {
            stats.delivered++;
            stats.revenue += order.price || 0;
        }
        if (order.status === 'rejected') {
            stats.rejected++;
        }
    });

    return Array.from(cityMap.entries())
        .map(([city, stats]) => ({
            city,
            totalOrders: stats.total,
            deliveredOrders: stats.delivered,
            rejectedOrders: stats.rejected,
            deliveryRate: stats.total > 0 ? (stats.delivered / stats.total) * 100 : 0,
            revenue: stats.revenue,
        }))
        .sort((a, b) => b.totalOrders - a.totalOrders);
}

// =============================================
// Source Analytics
// =============================================

export interface SourceMetrics {
    source: string;
    totalOrders: number;
    deliveryRate: number;
    confirmationRate: number;
    revenue: number;
}

export function calculateSourceMetrics(orders: Order[]): SourceMetrics[] {
    const sourceMap = new Map<string, {
        total: number;
        delivered: number;
        confirmed: number;
        revenue: number;
    }>();

    orders.forEach(order => {
        const source = order.source || 'other';
        if (!sourceMap.has(source)) {
            sourceMap.set(source, { total: 0, delivered: 0, confirmed: 0, revenue: 0 });
        }
        const stats = sourceMap.get(source)!;
        stats.total++;
        if (order.status === 'delivered' || order.status === 'completed') {
            stats.delivered++;
            stats.revenue += order.price || 0;
        }
        if (['confirmed', 'in_transit', 'delivered', 'completed'].includes(order.status)) {
            stats.confirmed++;
        }
    });

    return Array.from(sourceMap.entries())
        .map(([source, stats]) => ({
            source,
            totalOrders: stats.total,
            deliveryRate: stats.total > 0 ? (stats.delivered / stats.total) * 100 : 0,
            confirmationRate: stats.total > 0 ? (stats.confirmed / stats.total) * 100 : 0,
            revenue: stats.revenue,
        }))
        .sort((a, b) => b.totalOrders - a.totalOrders);
}
