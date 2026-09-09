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
    onlyDashboardOrders,
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
import type { RecentOrderDisplayRow } from "@/lib/analytics/dashboard-metrics-schema";

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
    /**
     * ARCH-D3. The RPC sends only the seven fields the feed renders (SEC-D2),
     * not whole orders. Typing this `Order[]` forced a double cast in the query
     * hook and told every consumer that fields like `phone` exist on rows that
     * never carry them. The client fallback returns full orders, which satisfy
     * this narrower contract; the RPC's rows do not satisfy `Order`.
     */
    recentOrders: RecentOrderDisplayRow[];
}

export function useDashboardMetrics(orders: Order[], products: Product[] = []): DashboardMetrics | null {
    return useMemo(() => {
        if (!orders.length) return null;

        // COR-D5: abandoned checkouts and soft-deleted rows are not orders. The
        // server RPC filters them in its `ws` CTE; this keeps the fallback engine
        // computing over the same set instead of quietly disagreeing.
        const dashboardOrders = onlyDashboardOrders(orders);
        if (!dashboardOrders.length) return null;
        const orders_ = dashboardOrders;

        return {
            urgency: calculateUrgencyMetrics(orders_),
            funnel: calculateFunnelMetrics(orders_),
            leaderboard: calculateLeaderboard(orders_),
            todayStrip: calculateTodayStrip(orders_),
            pipeline: calculatePipeline(orders_),
            ordersPerHour: calculateOrdersPerHourToday(orders_),
            peakHeatmap: calculatePeakHoursHeatmap(orders_),
            deliveryRate: calculateDeliverySuccessRate(orders_),
            avgTimePerStage: calculateAvgTimePerStage(orders_),
            weekOverWeek: calculateWeekOverWeek(orders_),
            monthForecast: calculateMonthForecast(orders_),
            enhancedLeaderboard: calculateEnhancedLeaderboard(orders_),
            staffLeaderboard: calculateStaffLeaderboard(orders_),
            recentOrders: getRecentOrders(orders_, 12),
        };
    }, [orders]);
}
