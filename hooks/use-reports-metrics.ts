"use client";

import { useMemo } from "react";
import { Order } from "@/lib/supabase";
import {
    calculateStatusFlow,
    calculateKPIs,
    calculateContactAttempts,
    calculateCityPerformance,
    calculateRejectionReasons,
    calculateTimeAnalysis,
    calculateAttentionFlags,
    StatusFlowMetrics,
    KPIMetrics,
    ContactAttemptMetrics,
    CityPerformanceMetrics,
    RejectionReasonMetrics,
    TimeAnalysisMetrics,
    AttentionFlagMetrics,
} from "@/lib/analytics/reports-calculations";

export interface ReportsMetrics {
    statusFlow: StatusFlowMetrics[];
    kpis: KPIMetrics;
    contactAttempts: ContactAttemptMetrics[];
    cityPerformance: CityPerformanceMetrics[];
    rejectionReasons: RejectionReasonMetrics[];
    timeAnalysis: TimeAnalysisMetrics;
    attentionFlags: AttentionFlagMetrics[];
}

export interface DateRange {
    from: Date;
    to: Date;
}

function filterOrdersByDateRange(orders: Order[], range: DateRange): Order[] {
    return orders.filter(order => {
        const orderDate = new Date(order.created_at);
        return orderDate >= range.from && orderDate <= range.to;
    });
}

function getPreviousPeriodRange(range: DateRange): DateRange {
    const duration = range.to.getTime() - range.from.getTime();
    return {
        from: new Date(range.from.getTime() - duration),
        to: new Date(range.from.getTime() - 1),
    };
}

export function useReportsMetrics(
    orders: Order[],
    dateRange?: DateRange
): ReportsMetrics | null {
    return useMemo(() => {
        if (!orders.length) return null;

        // Filter orders by date range if provided
        const currentOrders = dateRange
            ? filterOrdersByDateRange(orders, dateRange)
            : orders;

        // Get previous period orders for comparison
        const previousOrders = dateRange
            ? filterOrdersByDateRange(orders, getPreviousPeriodRange(dateRange))
            : [];

        return {
            statusFlow: calculateStatusFlow(currentOrders),
            kpis: calculateKPIs(currentOrders, previousOrders),
            contactAttempts: calculateContactAttempts(currentOrders),
            cityPerformance: calculateCityPerformance(currentOrders),
            rejectionReasons: calculateRejectionReasons(currentOrders),
            timeAnalysis: calculateTimeAnalysis(currentOrders),
            attentionFlags: calculateAttentionFlags(currentOrders),
        };
    }, [orders, dateRange]);
}

// Helper hook for common date ranges
export function useDateRangePresets() {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const last7Days = new Date(startOfToday);
    last7Days.setDate(last7Days.getDate() - 6);

    const last30Days = new Date(startOfToday);
    last30Days.setDate(last30Days.getDate() - 29);

    return {
        today: { from: startOfToday, to: today },
        thisWeek: { from: startOfWeek, to: today },
        thisMonth: { from: startOfMonth, to: today },
        last7Days: { from: last7Days, to: today },
        last30Days: { from: last30Days, to: today },
    };
}
