import { Order } from "@/lib/supabase";
import { DateRange } from "@/hooks/use-reports-metrics";

/**
 * Source performance metrics, plus period comparison.
 *
 * ARCH-D4. This never measured employees, despite the name it carried: it groups
 * orders by `order.source` ("whatsapp", "meta", "manual"). The widget that
 * renders it is titled "Source Performance" and shows only `displayName`, so
 * nothing false reaches the user — but the employee-shaped naming and a
 * fabricated `email` field made it read like real staff data to anyone editing
 * here. Renamed to what it measures. Real per-staff numbers come from
 * `useEmployeeMetrics`, which reads activity events.
 */

export interface SourcePerformanceMetrics {
    /** The `order.source` value this row aggregates, e.g. "whatsapp". */
    sourceKey: string;
    /** Human label for the source. */
    displayName: string;
    ordersProcessed: number;
    ordersDelivered: number;
    ordersConfirmed: number;
    avgProcessingTime: number; // hours from new → confirmed
    deliveryRate: number;
    confirmationRate: number;
    totalValue: number;
    rank: number;
}

export interface PeriodComparisonMetrics {
    current: {
        totalOrders: number;
        deliveredOrders: number;
        rejectedOrders: number;
        deliveryRate: number;
        totalRevenue: number;
        avgProcessingTime: number;
    };
    previous: {
        totalOrders: number;
        deliveredOrders: number;
        rejectedOrders: number;
        deliveryRate: number;
        totalRevenue: number;
        avgProcessingTime: number;
    };
    changes: {
        orders: number; // percentage change
        deliveryRate: number;
        revenue: number;
        avgProcessingTime: number;
    };
}

/**
 * Calculate employee performance metrics from orders
 * Note: This is a simplified version that uses order data directly
 * For more accurate tracking, we'd need to integrate with activity_logs
 */
export function calculateSourcePerformance(
    orders: Order[],
    dateRange: DateRange
): SourcePerformanceMetrics[] {
    // Filter orders by date range
    const filteredOrders = orders.filter(o => {
        const created = new Date(o.created_at);
        return created >= dateRange.from && created <= dateRange.to;
    });

    // Aggregate by acquisition source. Per-staff attribution lives in
    // useEmployeeMetrics, which reads activity events.
    const sourceMap = new Map<string, {
        ordersProcessed: number;
        ordersDelivered: number;
        ordersConfirmed: number;
        processingTimes: number[];
        totalValue: number;
    }>();

    filteredOrders.forEach(order => {
        const key = order.source || 'manual';

        if (!sourceMap.has(key)) {
            sourceMap.set(key, {
                ordersProcessed: 0,
                ordersDelivered: 0,
                ordersConfirmed: 0,
                processingTimes: [],
                totalValue: 0,
            });
        }

        const stats = sourceMap.get(key)!;
        stats.ordersProcessed++;
        stats.totalValue += order.price || 0;

        if (order.status === 'delivered' || order.status === 'completed') {
            stats.ordersDelivered++;
        }
        if (order.status === 'confirmed' || order.status === 'in_transit' ||
            order.status === 'delivered' || order.status === 'completed') {
            stats.ordersConfirmed++;
        }

        // Calculate processing time if delivered
        if (order.delivered_at) {
            const created = new Date(order.created_at);
            const delivered = new Date(order.delivered_at);
            const hours = (delivered.getTime() - created.getTime()) / (1000 * 60 * 60);
            if (hours > 0 && hours < 720) { // Exclude outliers (max 30 days)
                stats.processingTimes.push(hours);
            }
        }
    });

    // Convert to array and calculate metrics
    const sourceNames: Record<string, string> = {
        'manual': 'Manual Entry',
        'lightfunnels': 'LightFunnels',
        'whatsapp': 'WhatsApp',
        'meta': 'Meta Ads',
        'tiktok': 'TikTok',
        'delivery_import': 'Delivery Import',
        'other': 'Other',
    };

    const sources: SourcePerformanceMetrics[] = [];

    sourceMap.forEach((stats, key) => {
        const avgTime = stats.processingTimes.length > 0
            ? stats.processingTimes.reduce((a, b) => a + b, 0) / stats.processingTimes.length
            : 0;

        sources.push({
            sourceKey: key,
            displayName: sourceNames[key] || key,
            ordersProcessed: stats.ordersProcessed,
            ordersDelivered: stats.ordersDelivered,
            ordersConfirmed: stats.ordersConfirmed,
            avgProcessingTime: avgTime,
            deliveryRate: stats.ordersProcessed > 0
                ? (stats.ordersDelivered / stats.ordersProcessed) * 100
                : 0,
            confirmationRate: stats.ordersProcessed > 0
                ? (stats.ordersConfirmed / stats.ordersProcessed) * 100
                : 0,
            totalValue: stats.totalValue,
            rank: 0,
        });
    });

    // Sort by orders processed and assign ranks
    sources.sort((a, b) => b.ordersProcessed - a.ordersProcessed);
    sources.forEach((src, i) => src.rank = i + 1);

    return sources;
}

/**
 * Calculate period comparison metrics
 */
export function calculatePeriodComparison(
    orders: Order[],
    currentRange: DateRange
): PeriodComparisonMetrics {
    // Calculate previous period (same duration, immediately before)
    const duration = currentRange.to.getTime() - currentRange.from.getTime();
    const previousRange: DateRange = {
        from: new Date(currentRange.from.getTime() - duration),
        to: new Date(currentRange.from.getTime() - 1), // End 1ms before current starts
    };

    // Filter orders for each period
    const currentOrders = orders.filter(o => {
        const created = new Date(o.created_at);
        return created >= currentRange.from && created <= currentRange.to;
    });

    const previousOrders = orders.filter(o => {
        const created = new Date(o.created_at);
        return created >= previousRange.from && created <= previousRange.to;
    });

    // Calculate metrics for each period
    const calculateMetrics = (orderList: Order[]) => {
        const total = orderList.length;
        const delivered = orderList.filter(o =>
            o.status === 'delivered' || o.status === 'completed'
        ).length;
        const rejected = orderList.filter(o => o.status === 'rejected').length;
        const revenue = orderList
            .filter(o => o.status === 'delivered' || o.status === 'completed')
            .reduce((sum, o) => sum + (o.price || 0), 0);

        // Calculate average processing time
        const processingTimes: number[] = [];
        orderList.forEach(o => {
            if (o.delivered_at) {
                const created = new Date(o.created_at);
                const deliveredAt = new Date(o.delivered_at);
                const hours = (deliveredAt.getTime() - created.getTime()) / (1000 * 60 * 60);
                if (hours > 0 && hours < 720) {
                    processingTimes.push(hours);
                }
            }
        });

        const avgProcessingTime = processingTimes.length > 0
            ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
            : 0;

        return {
            totalOrders: total,
            deliveredOrders: delivered,
            rejectedOrders: rejected,
            deliveryRate: total > 0 ? (delivered / total) * 100 : 0,
            totalRevenue: revenue,
            avgProcessingTime,
        };
    };

    const current = calculateMetrics(currentOrders);
    const previous = calculateMetrics(previousOrders);

    // Calculate percentage changes
    const calcChange = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return ((curr - prev) / prev) * 100;
    };

    const changes = {
        orders: calcChange(current.totalOrders, previous.totalOrders),
        deliveryRate: current.deliveryRate - previous.deliveryRate, // Absolute difference for rates
        revenue: calcChange(current.totalRevenue, previous.totalRevenue),
        avgProcessingTime: calcChange(current.avgProcessingTime, previous.avgProcessingTime),
    };

    return { current, previous, changes };
}
