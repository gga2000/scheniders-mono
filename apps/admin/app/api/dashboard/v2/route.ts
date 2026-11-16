import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { fetchDashboardStats, fetchIncomeStats, fetchUsageStats } from "@/lib/console-stats";
import {
  calculatePlatformPipeline,
  calculateTopMerchants,
  calculateGeoStats,
  calculatePeakHours,
  calculateFulfillmentFunnel,
  calculateGrowthMetrics,
  calculateWalletHealth,
  calculateActivityHeatmap,
  calculateRevenueBreakdown,
  calculatePlanMovements,
  calculateTopUpPatterns,
  calculateMerchantLTV,
  calculateTimeToFirstOrder,
  calculateOnboardingProgress,
  calculateKpis,
  calculatePlatformOrderStats,
  type DashboardTenant,
} from "@/lib/dashboard-calculations";

const DEFAULT_BRAND_COLOR = "#1E1E1E";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    // Orders and the wallet ledger are counted in the database, never fetched
    // as rows: the API returns at most 1,000 of them.
    const [stats, usage, income, tenantsResult, subscriptionsResult, activityResult, membersResult] =
      await Promise.all([
        fetchDashboardStats(supabase),
        fetchUsageStats(supabase, null),
        fetchIncomeStats(supabase),
        supabase
          .from("tenants")
          .select("id, business_name, plan, status, created_at, branding, config_version, wallet(balance_iqd, total_topped_up_iqd)"),
        supabase.from("subscriptions").select("tenant_id, plan, status, pending_plan"),
        supabase.from("admin_activity_logs").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("tenant_members").select("tenant_id").eq("status", "active"),
      ]);

    // A failed query is an error for the whole page. Answering with empty
    // lists drew zeros that read like a quiet day.
    const failed = [tenantsResult, subscriptionsResult, activityResult, membersResult].find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    const memberCountByTenant: Record<string, number> = {};
    for (const m of membersResult.data ?? []) {
      memberCountByTenant[m.tenant_id] = (memberCountByTenant[m.tenant_id] || 0) + 1;
    }

    const tenants: DashboardTenant[] = (tenantsResult.data ?? []).map((t) => {
      const wallet = Array.isArray(t.wallet) ? t.wallet[0] : t.wallet;
      const branding = t.branding as { logo_url?: string; primary_color?: string } | null;
      const toppedUp = Number(wallet?.total_topped_up_iqd) || 0;

      return {
        id: t.id,
        business_name: t.business_name,
        plan: t.plan,
        status: t.status,
        created_at: t.created_at,
        branding: { primary_color: branding?.primary_color || DEFAULT_BRAND_COLOR },
        wallet_balance: Number(wallet?.balance_iqd) || 0,
        team_members_count: memberCountByTenant[t.id] || 0,
        has_branding: !!(branding?.logo_url || (branding?.primary_color && branding.primary_color !== DEFAULT_BRAND_COLOR)),
        // Publishing the store builder sets config_version 2.
        has_storefront: t.config_version === 2,
        wallet_funded: toppedUp > 0,
      };
    });

    const subChanges = (subscriptionsResult.data ?? [])
      .filter((s) => s.pending_plan || s.status === "cancelled")
      .map((s) => ({
        tenant_id: s.tenant_id,
        from_plan: s.plan,
        to_plan: s.status === "cancelled" ? null : s.pending_plan,
        changed_at: new Date().toISOString(),
        type: s.status === "cancelled" ? "cancellation" : "plan_change",
      }));

    return NextResponse.json({
      kpis: calculateKpis(stats, income, tenants),
      platformStats: calculatePlatformOrderStats(stats.orders),
      pipeline: calculatePlatformPipeline(stats.statuses90),
      topMerchants: calculateTopMerchants(stats.shops, tenants),
      geoStats: calculateGeoStats(stats.governorates90),
      peakHours: calculatePeakHours(stats.hours90),
      funnel: calculateFulfillmentFunnel(stats.statuses90),
      growth: calculateGrowthMetrics(stats, tenants),
      walletHealth: calculateWalletHealth(tenants, income.topups.daily7),
      activityHeatmap: calculateActivityHeatmap(usage),
      revenueBreakdown: calculateRevenueBreakdown(income.byPlan90, stats.cities90, stats.sources90),
      planMovements: calculatePlanMovements(subChanges),
      topUpPatterns: calculateTopUpPatterns(income.topups.byDow),
      merchantLTV: calculateMerchantLTV(tenants, income.byTenant, stats.today),
      timeToFirstOrder: calculateTimeToFirstOrder(tenants, stats.shops),
      onboarding: calculateOnboardingProgress(tenants, stats.shops),
      recentActivity: activityResult.data ?? [],
    });
  } catch (error) {
    console.error("Dashboard V2 error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
