import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { fetchDashboardStats, fetchIncomeStats, fetchUsageStats } from "@/lib/console-stats";
import { everyRow } from "@/lib/every-row";
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
    // as rows: the API returns at most 1,000 of them. Shops, subscriptions and
    // team members are read a page at a time for the same reason. A failed
    // read is an error for the whole page: empty lists drew zeros that read
    // like a quiet day.
    const [stats, usage, income, shopRows, subscriptionRows, activityResult, memberRows] = await Promise.all([
      fetchDashboardStats(supabase),
      fetchUsageStats(supabase, null),
      fetchIncomeStats(supabase),
      everyRow((from, to) =>
        supabase
          .from("tenants")
          .select("id, business_name, plan, status, created_at, branding, config_version, wallet(balance_iqd, total_topped_up_iqd)")
          // The demo store (Fermi B13) is in no platform number.
          .eq("is_demo", false)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      everyRow((from, to) =>
        supabase
          .from("subscriptions")
          .select("tenant_id, plan, status, pending_plan")
          .order("id", { ascending: true })
          .range(from, to),
      ),
      supabase.from("admin_activity_logs").select("*").order("created_at", { ascending: false }).limit(20),
      everyRow((from, to) =>
        supabase
          .from("tenant_members")
          .select("tenant_id")
          .eq("status", "active")
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);
    if (activityResult.error) throw new Error(activityResult.error.message);

    const memberCountByTenant: Record<string, number> = {};
    for (const m of memberRows) {
      memberCountByTenant[m.tenant_id] = (memberCountByTenant[m.tenant_id] || 0) + 1;
    }

    const tenants: DashboardTenant[] = shopRows.map((t) => {
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
        setup: { branding, configVersion: t.config_version, toppedUpIqd: toppedUp },
      };
    });

    const subChanges = subscriptionRows
      .filter((s) => s.pending_plan || s.status === "cancelled")
      .map((s) => ({
        tenant_id: s.tenant_id,
        from_plan: s.plan,
        to_plan: s.status === "cancelled" ? null : s.pending_plan,
        changed_at: new Date().toISOString(),
        type: s.status === "cancelled" ? "cancellation" : "plan_change",
      }));

    const geo = calculateGeoStats(stats.governorates90, stats.uncodedPlaces90);

    return NextResponse.json({
      kpis: calculateKpis(stats, income, tenants),
      platformStats: calculatePlatformOrderStats(stats.orders),
      pipeline: calculatePlatformPipeline(stats.statuses90),
      topMerchants: calculateTopMerchants(stats.shops, tenants),
      geoStats: geo,
      peakHours: calculatePeakHours(stats.hours90),
      funnel: calculateFulfillmentFunnel(stats.statuses90),
      growth: calculateGrowthMetrics(stats, tenants),
      walletHealth: calculateWalletHealth(tenants, income.topups.daily7),
      activityHeatmap: calculateActivityHeatmap(usage),
      revenueBreakdown: calculateRevenueBreakdown(income.byPlan90, geo, stats.sources90),
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
