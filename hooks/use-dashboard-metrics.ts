"use client";

import { useMemo } from "react";
import { Order, Product } from "@/lib/supabase";
import {
    calculateUrgencyMetrics,
    calculateFunnelMetrics,
    calculateVelocityMatrix,
    calculateCohortRetention,
    calculateProfitPulse,
    calculateLeaderboard,
    UrgencyMetrics,
    FunnelStep,
    ProductMetric,
    CohortData,
    LeaderboardMetrics
} from "@/lib/analytics/dashboard-calculations";

export interface DashboardMetrics {
    urgency: UrgencyMetrics;
    funnel: FunnelStep[];
    velocity: ProductMetric[];
    cohorts: CohortData[];
    profitPulse: { today: number; yesterday: number };
    leaderboard: LeaderboardMetrics;
}

export function useDashboardMetrics(orders: Order[], products: Product[] = []) {
    return useMemo(() => {
        if (!orders.length) return null;

        return {
            urgency: calculateUrgencyMetrics(orders),
            funnel: calculateFunnelMetrics(orders),
            velocity: calculateVelocityMatrix(orders, products),
            cohorts: calculateCohortRetention(orders),
            profitPulse: calculateProfitPulse(orders),
            leaderboard: calculateLeaderboard(orders)
        };
    }, [orders, products]);
}
