"use client";

import { useMemo } from "react";
import { baghdadDayStart, baghdadMonthStart, baghdadDayOfWeek } from "@/lib/analytics/dashboard-calculations";
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Preset ranges on the Baghdad calendar (the dashboard's and the server's), not the
 * viewer's device clock. `to` is the last millisecond of the current Baghdad day.
 */
function buildDateRangePresets() {
    const now = new Date();
    const startOfToday = baghdadDayStart(now);
    const endOfToday = new Date(startOfToday.getTime() + DAY_MS - 1);
    const startOfWeek = new Date(startOfToday.getTime() - baghdadDayOfWeek(now) * DAY_MS);

    return {
        today: { from: startOfToday, to: endOfToday },
        thisWeek: { from: startOfWeek, to: endOfToday },
        thisMonth: { from: baghdadMonthStart(now), to: endOfToday },
        last7Days: { from: new Date(startOfToday.getTime() - 6 * DAY_MS), to: endOfToday },
        last30Days: { from: new Date(startOfToday.getTime() - 29 * DAY_MS), to: endOfToday },
    };
}
