"use client";

import { useMemo } from "react";
import type { ReportOrder } from "@/lib/analytics/report-order-facts";
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

/**
 * Metrics for the report's orders. `current` and `previous` are already split by
 * range (see splitReportOrders), so the numbers cover the whole range, not
 * whatever the shared orders list happened to load.
 */
export function useReportsMetrics(
    current: ReportOrder[],
    previous: ReportOrder[]
): ReportsMetrics {
    return useMemo(() => ({
        statusFlow: calculateStatusFlow(current),
        kpis: calculateKPIs(current, previous),
        contactAttempts: calculateContactAttempts(current),
        cityPerformance: calculateCityPerformance(current),
        rejectionReasons: calculateRejectionReasons(current),
        timeAnalysis: calculateTimeAnalysis(current),
        attentionFlags: calculateAttentionFlags(current),
    }), [current, previous]);
}

// Helper hook for common date ranges
export function useDateRangePresets() {
    return useMemo(() => buildDateRangePresets(), []);
}

function buildDateRangePresets() {
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
