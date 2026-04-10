"use client";

import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { TenantDistribution } from "@/components/dashboard/tenant-distribution";
import { ActivityFeed } from "@/components/dashboard/activity-feed";

export default function CommandCenterPage() {
  const { data, isLoading } = useDashboardStats();

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Command Center</h1>
        <p className="text-foreground-muted mt-1">
          Platform overview and key metrics
        </p>
      </div>

      {/* KPI Cards */}
      <KpiGrid
        totalTenants={data?.totalTenants ?? 0}
        activeTenants={data?.activeTenants ?? 0}
        trialTenants={data?.trialTenants ?? 0}
        suspendedTenants={data?.suspendedTenants ?? 0}
        totalWalletBalance={data?.totalWalletBalance ?? 0}
        totalToppedUpThisMonth={data?.totalToppedUpThisMonth ?? 0}
        totalChargedThisMonth={data?.totalChargedThisMonth ?? 0}
        isLoading={isLoading}
      />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <RevenueChart
          transactions={data?.chartTransactions ?? []}
          isLoading={isLoading}
        />
        <TenantDistribution
          byPlan={data?.tenantsByPlan ?? {}}
          byStatus={data?.tenantsByCity ? {
            active: data.activeTenants,
            trial: data.trialTenants,
            suspended: data.suspendedTenants,
            cancelled: data.totalTenants - data.activeTenants - data.trialTenants - data.suspendedTenants,
          } : {}}
          byCity={data?.tenantsByCity ?? {}}
          isLoading={isLoading}
        />
      </div>

      {/* Activity Feed */}
      <ActivityFeed
        activities={data?.recentActivity ?? []}
        isLoading={isLoading}
      />
    </div>
  );
}
