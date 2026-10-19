"use client";

import { useQuery } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityLog {
  id: string;
  admin_user_id: string | null;
  admin_label: string | null;
  actor_email: string | null;
  action: string;
  details: Record<string, unknown> | null;
  tenant_id: string | null;
  created_at: string;
}

export interface DashboardStats {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  totalWalletBalance: number;
  totalToppedUpThisMonth: number;
  totalChargedThisMonth: number;
  recentActivity: ActivityLog[];
  tenantsByCity: Record<string, number>;
  tenantsByPlan: Record<string, number>;
  chartTransactions: Array<{
    type: string;
    amount_iqd: number;
    created_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// Query function
// ---------------------------------------------------------------------------

async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch("/api/dashboard/stats");
  if (!res.ok) {
    throw new Error("Failed to fetch dashboard stats");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ["admin", "dashboard-stats"],
    queryFn: fetchDashboardStats,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
