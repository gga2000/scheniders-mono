"use client";

import type { ReportOrder } from "@/lib/analytics/report-order-facts";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface StatusFlowMetrics {
    status: string;
    label: string;
    count: number;
    percentage: number;
    conversionRate: number; // Rate to next status
    avgTimeInStatus: number; // Hours
    color: string;
}

export interface KPIMetrics {
    totalOrders: number;
    totalOrdersChange: number;
    deliveryRate: number;
    /** Percentage points (rates), not relative percent. */
    deliveryRateChange: number;
    contactSuccessRate: number;
    contactSuccessChange: number;
    rejectionRate: number;
    rejectionRateChange: number;
    noResponseRate: number;
    noResponseChange: number;
    avgProcessingTime: number; // Hours
    avgProcessingTimeChange: number;
}

export interface ContactAttemptMetrics {
    attempts: number;
    label: string;
    count: number;
    confirmationRate: number;
    color: string;
}

export interface CityPerformanceMetrics {
    city: string;
    governorateCode: string;
    totalOrders: number;
    delivered: number;
    rejected: number;
    deliveryRate: number;
    avgDeliveryDays: number;
    noResponse: number;
    trend: 'up' | 'down' | 'stable';
}

export interface RejectionReasonMetrics {
    reason: string;
    count: number;
    percentage: number;
    topCity?: string;
}

export interface TimeAnalysisMetrics {
    hourlyDistribution: { hour: number; count: number }[];
    dailyDistribution: { day: string; count: number; dayIndex: number }[];
    processingTimeDistribution: { bucket: string; count: number }[];
}

export interface AttentionFlagMetrics {
    flagType: string;
    label: string;
    count: number;
    severity: 'low' | 'medium' | 'high';
}

// ============================================
// STATUS FLOW CALCULATIONS
// ============================================

const STATUS_CONFIG: Record<string, { label: string; color: string; order: number }> = {
    new: { label: "New", color: "#3B82F6", order: 0 },
    contacted: { label: "Contacted", color: "#8B5CF6", order: 1 },
    confirmed: { label: "Confirmed", color: "#10B981", order: 2 },
    cancelled: { label: "Cancelled", color: "#6B7280", order: 2 },
    no_response: { label: "No Response", color: "#F59E0B", order: 2 },
    in_transit: { label: "In Transit", color: "#06B6D4", order: 3 },
    delivered: { label: "Delivered", color: "#22C55E", order: 4 },
    rejected: { label: "Rejected", color: "#EF4444", order: 4 },
    completed: { label: "Completed", color: "#14B8A6", order: 5 },
    return_pending: { label: "Return Pending", color: "#F97316", order: 5 },
    pending_checkout: { label: "Pending Checkout", color: "#A855F7", order: -1 },
};

export function calculateStatusFlow(orders: ReportOrder[]): StatusFlowMetrics[] {
    const statusCounts: Record<string, number> = {};
    const total = orders.length;

    orders.forEach(order => {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    });

    return Object.entries(STATUS_CONFIG)
        .filter(([status]) => statusCounts[status] && statusCounts[status] > 0)
        .sort((a, b) => a[1].order - b[1].order)
        .map(([status, config]) => {
            const count = statusCounts[status] || 0;
            return {
                status,
                label: config.label,
                count,
                percentage: total > 0 ? (count / total) * 100 : 0,
                conversionRate: 0, // Will be calculated based on flow
                avgTimeInStatus: 0, // Would need status history for accurate calculation
                color: config.color,
            };
        });
}

// ============================================
// KPI CALCULATIONS
// ============================================

export function calculateKPIs(currentOrders: ReportOrder[], previousOrders: ReportOrder[] = []): KPIMetrics {
    const calcMetrics = (orders: ReportOrder[]) => {
        const total = orders.length;
        const delivered = orders.filter(o => o.status === 'delivered' || o.status === 'completed').length;
        const rejected = orders.filter(o => o.status === 'rejected').length;
        const contacted = orders.filter(o => o.status !== 'new' && o.status !== 'pending_checkout').length;
        const confirmed = orders.filter(o =>
            ['confirmed', 'in_transit', 'delivered', 'completed'].includes(o.status)
        ).length;
        const noResponse = orders.filter(o => o.status === 'no_response').length;

        const shipped = delivered + rejected;
        const deliveryRate = shipped > 0 ? (delivered / shipped) * 100 : 0;
        const contactSuccessRate = contacted > 0 ? (confirmed / contacted) * 100 : 0;
        const rejectionRate = shipped > 0 ? (rejected / shipped) * 100 : 0;
        const noResponseRate = contacted > 0 ? (noResponse / contacted) * 100 : 0;

        // Calculate avg processing time for delivered orders
        let avgProcessingTime = 0;
        const deliveredOrders = orders.filter(o => o.delivered_at);
        if (deliveredOrders.length > 0) {
            const totalHours = deliveredOrders.reduce((sum, o) => {
                const created = new Date(o.created_at);
                const delivered = new Date(o.delivered_at!);
                return sum + (delivered.getTime() - created.getTime()) / (1000 * 60 * 60);
            }, 0);
            avgProcessingTime = totalHours / deliveredOrders.length;
        }

        return { total, deliveryRate, contactSuccessRate, rejectionRate, noResponseRate, avgProcessingTime };
    };

    const current = calcMetrics(currentOrders);
    const previous = calcMetrics(previousOrders);

    // Relative change for counts and times; 0 (no trend shown) when there is no baseline —
    // "+100%" against an empty previous period is not a trend.
    const calcChange = (curr: number, prev: number) => {
        if (prev === 0) return 0;
        return ((curr - prev) / prev) * 100;
    };
    // Rates change in percentage POINTS: 80% -> 79% is -1pp, not -1.2%. Needs a baseline too.
    const calcRateChange = (curr: number, prev: number, hasBaseline: boolean) =>
        hasBaseline ? curr - prev : 0;
    const hasBaseline = previousOrders.length > 0;

    return {
        totalOrders: current.total,
        totalOrdersChange: calcChange(current.total, previous.total),
        deliveryRate: current.deliveryRate,
        deliveryRateChange: calcRateChange(current.deliveryRate, previous.deliveryRate, hasBaseline),
        contactSuccessRate: current.contactSuccessRate,
        contactSuccessChange: calcRateChange(current.contactSuccessRate, previous.contactSuccessRate, hasBaseline),
        rejectionRate: current.rejectionRate,
        rejectionRateChange: calcRateChange(current.rejectionRate, previous.rejectionRate, hasBaseline),
        noResponseRate: current.noResponseRate,
        noResponseChange: calcRateChange(current.noResponseRate, previous.noResponseRate, hasBaseline),
        avgProcessingTime: current.avgProcessingTime,
        avgProcessingTimeChange: calcChange(current.avgProcessingTime, previous.avgProcessingTime),
    };
}

// ============================================
// CONTACT ATTEMPT ANALYSIS
// ============================================

export function calculateContactAttempts(orders: ReportOrder[]): ContactAttemptMetrics[] {
    const buckets: Record<number, { count: number; confirmed: number }> = {
        0: { count: 0, confirmed: 0 },
        1: { count: 0, confirmed: 0 },
        2: { count: 0, confirmed: 0 },
        3: { count: 0, confirmed: 0 }, // 3+ attempts
    };

    orders.forEach(order => {
        const attempts = Math.min(order.contact_count || 0, 3);
        buckets[attempts].count++;
        if (['confirmed', 'in_transit', 'delivered', 'completed'].includes(order.status)) {
            buckets[attempts].confirmed++;
        }
    });

    const labels = ["0 (New)", "1 Attempt", "2 Attempts", "3+ Attempts"];
    const colors = ["#22C55E", "#EAB308", "#F97316", "#EF4444"];

    return Object.entries(buckets).map(([attempts, data], index) => ({
        attempts: parseInt(attempts),
        label: labels[index],
        count: data.count,
        confirmationRate: data.count > 0 ? (data.confirmed / data.count) * 100 : 0,
        color: colors[index],
    }));
}

// ============================================
// CITY PERFORMANCE ANALYSIS
// ============================================

export function calculateCityPerformance(orders: ReportOrder[]): CityPerformanceMetrics[] {
    const cityData: Record<string, {
        total: number;
        delivered: number;
        rejected: number;
        noResponse: number;
        governorateCode: string;
        totalDeliveryDays: number;
        deliveredCount: number;
    }> = {};

    orders.forEach(order => {
        const city = order.city || order.governorate_code || "Unknown";
        const govCode = order.governorate_code || order.validated_governorate_code || "";

        if (!cityData[city]) {
            cityData[city] = {
                total: 0,
                delivered: 0,
                rejected: 0,
                noResponse: 0,
                governorateCode: govCode,
                totalDeliveryDays: 0,
                deliveredCount: 0,
            };
        }

        cityData[city].total++;

        if (order.status === 'delivered' || order.status === 'completed') {
            cityData[city].delivered++;
            if (order.delivered_at) {
                const created = new Date(order.created_at);
                const delivered = new Date(order.delivered_at);
                const days = (delivered.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
                cityData[city].totalDeliveryDays += days;
                cityData[city].deliveredCount++;
            }
        } else if (order.status === 'rejected') {
            cityData[city].rejected++;
        } else if (order.status === 'no_response') {
            cityData[city].noResponse++;
        }
    });

    return Object.entries(cityData)
        .map(([city, data]) => {
            const shipped = data.delivered + data.rejected;
            return {
                city,
                governorateCode: data.governorateCode,
                totalOrders: data.total,
                delivered: data.delivered,
                rejected: data.rejected,
                deliveryRate: shipped > 0 ? (data.delivered / shipped) * 100 : 0,
                avgDeliveryDays: data.deliveredCount > 0 ? data.totalDeliveryDays / data.deliveredCount : 0,
                noResponse: data.noResponse,
                trend: 'stable' as const, // Would need historical data for actual trend
            };
        })
        .sort((a, b) => b.totalOrders - a.totalOrders);
}

// ============================================
// REJECTION REASON ANALYSIS
// ============================================

export function calculateRejectionReasons(orders: ReportOrder[]): RejectionReasonMetrics[] {
    const rejectedOrders = orders.filter(o => o.status === 'rejected');
    const reasonCounts: Record<string, { count: number; cities: Record<string, number> }> = {};

    rejectedOrders.forEach(order => {
        const reason = order.rejection_reason || "Unknown";
        const city = order.city || "Unknown";

        if (!reasonCounts[reason]) {
            reasonCounts[reason] = { count: 0, cities: {} };
        }
        reasonCounts[reason].count++;
        reasonCounts[reason].cities[city] = (reasonCounts[reason].cities[city] || 0) + 1;
    });

    const total = rejectedOrders.length;

    return Object.entries(reasonCounts)
        .map(([reason, data]) => {
            const topCity = Object.entries(data.cities)
                .sort((a, b) => b[1] - a[1])[0]?.[0];
            return {
                reason,
                count: data.count,
                percentage: total > 0 ? (data.count / total) * 100 : 0,
                topCity,
            };
        })
        .sort((a, b) => b.count - a.count);
}

// ============================================
// TIME-BASED ANALYSIS
// ============================================

export function calculateTimeAnalysis(orders: ReportOrder[]): TimeAnalysisMetrics {
    // Hourly distribution
    const hourlyData: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hourlyData[i] = 0;

    // Daily distribution
    const dailyData: Record<number, number> = {};
    for (let i = 0; i < 7; i++) dailyData[i] = 0;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Processing time buckets (in hours)
    const processingBuckets: Record<string, number> = {
        "< 24h": 0,
        "1-2 days": 0,
        "2-3 days": 0,
        "3-5 days": 0,
        "5-7 days": 0,
        "7+ days": 0,
    };

    orders.forEach(order => {
        const createdDate = new Date(order.created_at);
        hourlyData[createdDate.getHours()]++;
        dailyData[createdDate.getDay()]++;

        // Processing time for delivered orders
        if (order.delivered_at) {
            const delivered = new Date(order.delivered_at);
            const hours = (delivered.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

            if (hours < 24) processingBuckets["< 24h"]++;
            else if (hours < 48) processingBuckets["1-2 days"]++;
            else if (hours < 72) processingBuckets["2-3 days"]++;
            else if (hours < 120) processingBuckets["3-5 days"]++;
            else if (hours < 168) processingBuckets["5-7 days"]++;
            else processingBuckets["7+ days"]++;
        }
    });

    return {
        hourlyDistribution: Object.entries(hourlyData).map(([hour, count]) => ({
            hour: parseInt(hour),
            count,
        })),
        dailyDistribution: Object.entries(dailyData).map(([dayIndex, count]) => ({
            day: dayNames[parseInt(dayIndex)],
            count,
            dayIndex: parseInt(dayIndex),
        })),
        processingTimeDistribution: Object.entries(processingBuckets).map(([bucket, count]) => ({
            bucket,
            count,
        })),
    };
}

// ============================================
// ATTENTION FLAGS ANALYSIS
// ============================================

export function calculateAttentionFlags(orders: ReportOrder[]): AttentionFlagMetrics[] {
    let missingPhone = 0;
    let missingProduct = 0;
    let invalidAddress = 0;
    let needsReview = 0;
    let priceIssues = 0;

    orders.forEach(order => {
        if (!order.phone || order.phone.trim() === '') missingPhone++;
        if (order.needs_attention) {
            const reasons = order.attention_reasons || [];
            if (reasons.includes('missing_product')) missingProduct++;
            if (reasons.includes('price_changed')) priceIssues++;
        }
        if (order.address_status === 'invalid' || order.address_status === 'incomplete') invalidAddress++;
        if (order.address_status === 'needs_review') needsReview++;
    });

    return [
        { flagType: 'missing_phone', label: 'Missing Phone', count: missingPhone, severity: 'high' as const },
        { flagType: 'missing_product', label: 'Missing Product', count: missingProduct, severity: 'high' as const },
        { flagType: 'invalid_address', label: 'Invalid Address', count: invalidAddress, severity: 'medium' as const },
        { flagType: 'needs_review', label: 'Needs Review', count: needsReview, severity: 'low' as const },
        { flagType: 'price_issues', label: 'Price Issues', count: priceIssues, severity: 'medium' as const },
    ].filter(flag => flag.count > 0);
}

// ============================================
// RETURN ORDER ANALYSIS
// ============================================

export interface ReturnReasonMetrics {
    reason: string;
    count: number;
    percentage: number;
    totalAmount: number;
    avgAmount: number;
    topCity?: string;
}

export interface ReturnAnalyticsMetrics {
    totalReturns: number;
    totalReturnValue: number;
    returnRate: number; // Returns / (Delivered + Completed) * 100
    avgReturnValue: number;
    returnsByReason: ReturnReasonMetrics[];
    returnsByCity: { city: string; count: number; totalAmount: number }[];
    returnTrend: 'up' | 'down' | 'stable';
}

/**
 * Return/refund analytics for one range: `returnOrders` are the range's return orders, `salesOrders` its sales orders.
 */
export function calculateReturnAnalytics(
    returnOrders: ReportOrder[],
    salesOrders: ReportOrder[]
): ReturnAnalyticsMetrics {
    // Delivered/completed sales orders of the same range, for the return rate
    const deliveredOrders = salesOrders.filter(o =>
        o.status === 'delivered' || o.status === 'completed'
    );

    const totalReturns = returnOrders.length;

    // Return value is stored as negative, so we use Math.abs
    const totalReturnValue = returnOrders.reduce((sum, o) =>
        sum + Math.abs(Number(o.price) || 0), 0
    );

    const avgReturnValue = totalReturns > 0 ? totalReturnValue / totalReturns : 0;

    // Return rate = returns / delivered orders
    const returnRate = deliveredOrders.length > 0
        ? (totalReturns / deliveredOrders.length) * 100
        : 0;

    // Parse return reasons from notes field
    // Format: "استرجاع: {reason} | ..." or just use notes directly
    const reasonCounts: Record<string, {
        count: number;
        totalAmount: number;
        cities: Record<string, number>
    }> = {};

    const cityCounts: Record<string, { count: number; totalAmount: number }> = {};

    returnOrders.forEach(order => {
        // Extract reason from notes (format: "استرجاع: REASON | ...")
        let reason = "غير محدد"; // Default: "Unspecified"
        if (order.notes) {
            const match = order.notes.match(/استرجاع:\s*([^|]+)/);
            if (match && match[1]) {
                reason = match[1].trim();
            }
        }

        const city = order.city || "غير محدد";
        const amount = Math.abs(Number(order.price) || 0);

        // Aggregate by reason
        if (!reasonCounts[reason]) {
            reasonCounts[reason] = { count: 0, totalAmount: 0, cities: {} };
        }
        reasonCounts[reason].count++;
        reasonCounts[reason].totalAmount += amount;
        reasonCounts[reason].cities[city] = (reasonCounts[reason].cities[city] || 0) + 1;

        // Aggregate by city
        if (!cityCounts[city]) {
            cityCounts[city] = { count: 0, totalAmount: 0 };
        }
        cityCounts[city].count++;
        cityCounts[city].totalAmount += amount;
    });

    // Build returns by reason with percentages
    const returnsByReason: ReturnReasonMetrics[] = Object.entries(reasonCounts)
        .map(([reason, data]) => {
            const topCity = Object.entries(data.cities)
                .sort((a, b) => b[1] - a[1])[0]?.[0];

            return {
                reason,
                count: data.count,
                percentage: totalReturns > 0 ? (data.count / totalReturns) * 100 : 0,
                totalAmount: data.totalAmount,
                avgAmount: data.count > 0 ? data.totalAmount / data.count : 0,
                topCity,
            };
        })
        .sort((a, b) => b.count - a.count);

    // Build returns by city
    const returnsByCity = Object.entries(cityCounts)
        .map(([city, data]) => ({
            city,
            count: data.count,
            totalAmount: data.totalAmount,
        }))
        .sort((a, b) => b.count - a.count);

    return {
        totalReturns,
        totalReturnValue,
        returnRate,
        avgReturnValue,
        returnsByReason,
        returnsByCity,
        returnTrend: 'stable', // Would need historical data for actual trend
    };
}

