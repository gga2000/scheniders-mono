"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { DashboardV2Stats } from "@/types/dashboard";

async function fetchDashboardV2(): Promise<DashboardV2Stats> {
  const res = await fetch("/api/dashboard/v2");
  if (!res.ok) {
    throw new Error("Failed to fetch dashboard V2 stats");
  }
  return res.json();
}

export function useDashboardV2() {
  const query = useQuery<DashboardV2Stats>({
    queryKey: ["admin", "dashboard-v2"],
    queryFn: fetchDashboardV2,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Memoized selectors for individual widgets
  const kpis = useMemo(() => query.data?.kpis, [query.data?.kpis]);
  const platformStats = useMemo(() => query.data?.platformStats, [query.data?.platformStats]);
  const pipeline = useMemo(() => query.data?.pipeline, [query.data?.pipeline]);
  const topMerchants = useMemo(() => query.data?.topMerchants, [query.data?.topMerchants]);
  const geoStats = useMemo(() => query.data?.geoStats, [query.data?.geoStats]);
  const peakHours = useMemo(() => query.data?.peakHours, [query.data?.peakHours]);
  const funnel = useMemo(() => query.data?.funnel, [query.data?.funnel]);
  const growth = useMemo(() => query.data?.growth, [query.data?.growth]);
  const walletHealth = useMemo(() => query.data?.walletHealth, [query.data?.walletHealth]);
  const activityHeatmap = useMemo(() => query.data?.activityHeatmap, [query.data?.activityHeatmap]);
  const revenueBreakdown = useMemo(() => query.data?.revenueBreakdown, [query.data?.revenueBreakdown]);
  const planMovements = useMemo(() => query.data?.planMovements, [query.data?.planMovements]);
  const topUpPatterns = useMemo(() => query.data?.topUpPatterns, [query.data?.topUpPatterns]);
  const merchantLTV = useMemo(() => query.data?.merchantLTV, [query.data?.merchantLTV]);
  const timeToFirstOrder = useMemo(() => query.data?.timeToFirstOrder, [query.data?.timeToFirstOrder]);
  const onboarding = useMemo(() => query.data?.onboarding, [query.data?.onboarding]);

  return {
    ...query,
    kpis,
    platformStats,
    pipeline,
    topMerchants,
    geoStats,
    peakHours,
    funnel,
    growth,
    walletHealth,
    activityHeatmap,
    revenueBreakdown,
    planMovements,
    topUpPatterns,
    merchantLTV,
    timeToFirstOrder,
    onboarding,
  };
}
