"use client";

import { useMemo } from "react";
import { Order, Product } from "@/lib/supabase";
import {
    calculateUrgencyMetrics,
    calculateFunnelMetrics,
    calculateLeaderboard,
    calculateTodayStrip,
    calculatePipeline,
    calculateOrdersPerHourToday,
    calculatePeakHoursHeatmap,
    calculateDeliverySuccessRate,
    calculateAvgTimePerStage,
    calculateWeekOverWeek,
    calculateMonthForecast,
    calculateEnhancedLeaderboard,
    calculateStaffLeaderboard,
    getRecentOrders,
    UrgencyMetrics,
    FunnelStep,
    LeaderboardMetrics,
    TodayStripMetrics,
    PipelineStage,
    HourlyCount,
    HeatmapCell,
    DeliveryRateMetrics,
    StageTimeMetric,
    WowMetric,
    MonthForecast,
    EnhancedLeaderboardMetrics,
    StaffEntry,
} from "@/lib/analytics/dashboard-calculations";

export interface DashboardMetrics {
    urgency: UrgencyMetrics;
    funnel: FunnelStep[];
    leaderboard: LeaderboardMetrics;
    todayStrip: TodayStripMetrics;
    pipeline: PipelineStage[];
    ordersPerHour: HourlyCount[];
    peakHeatmap: HeatmapCell[];
    deliveryRate: DeliveryRateMetrics;
    avgTimePerStage: StageTimeMetric[];
    weekOverWeek: WowMetric[];
    monthForecast: MonthForecast;
    enhancedLeaderboard: EnhancedLeaderboardMetrics;
    staffLeaderboard: StaffEntry[];
    recentOrders: Order[];
}

export function useDashboardMetrics(orders: Order[], products: Product[] = []) {
    return useMemo(() => {
        if (!orders.length) return null;

        return {
            urgency: calculateUrgencyMetrics(orders),
            funnel: calculateFunnelMetrics(orders),
            leaderboard: calculateLeaderboard(orders),
            todayStrip: calculateTodayStrip(orders),
            pipeline: calculatePipeline(orders),
            ordersPerHour: calculateOrdersPerHourToday(orders),
            peakHeatmap: calculatePeakHoursHeatmap(orders),
            deliveryRate: calculateDeliverySuccessRate(orders),
            avgTimePerStage: calculateAvgTimePerStage(orders),
            weekOverWeek: calculateWeekOverWeek(orders),
            monthForecast: calculateMonthForecast(orders),
            enhancedLeaderboard: calculateEnhancedLeaderboard(orders),
            staffLeaderboard: calculateStaffLeaderboard(orders),
            recentOrders: getRecentOrders(orders, 12),
        };
    }, [orders]);
}
