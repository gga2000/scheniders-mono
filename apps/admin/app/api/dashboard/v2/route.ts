import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
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
} from "@/lib/dashboard-calculations";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all data in parallel
    const [
      ordersResult,
      tenantsResult,
      walletsResult,
      transactionsResult,
      yearOrdersResult,
      subscriptionChangesResult,
      activityResult,
      tenantMembersResult,
    ] = await Promise.all([
      // Orders (last 90 days for most widgets)
      supabase
        .from("orders")
        .select("id, tenant_id, status, price, delivery_fee, city, governorate_code, source, created_at, delivered_at")
        .gte("created_at", ninetyDaysAgo.toISOString())
        .order("created_at", { ascending: false }),

      // Tenants with wallet + subscription joins
      supabase
        .from("tenants")
        .select(`
          id, business_name, slug, plan, status, city, created_at, branding, contact_email,
          settings, trial_ends_at,
          wallet(balance_iqd, total_charged_iqd, total_topped_up_iqd),
          subscriptions(plan, status, pending_plan),
          usage_tracking(orders_count, team_members_count)
        `),

      // Wallet balances (separate for cleaner aggregation)
      supabase.from("wallet").select("tenant_id, balance_iqd"),

      // Wallet transactions (last 90 days)
      supabase
        .from("wallet_transactions")
        .select("type, amount_iqd, created_at, tenant_id")
        .gte("created_at", ninetyDaysAgo.toISOString()),

      // Full year of orders for activity heatmap (just date + count)
      supabase
        .from("orders")
        .select("created_at")
        .gte("created_at", oneYearAgo.toISOString()),

      // Subscription changes — using subscriptions with pending_plan
      supabase
        .from("subscriptions")
        .select("tenant_id, plan, status, pending_plan"),

      // Recent activity for feed
      supabase
        .from("admin_activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),

      // Tenant members for onboarding
      supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("status", "active"),
    ]);

    // Log non-critical errors but don't fail the entire endpoint
    const criticalErrors = [ordersResult.error, tenantsResult.error].filter(Boolean);
    if (criticalErrors.length > 0) {
      console.error("Dashboard V2 critical query errors:", criticalErrors);
      return NextResponse.json(
        { error: "Failed to fetch dashboard data", details: criticalErrors.map((e) => e?.message) },
        { status: 500 },
      );
    }

    // Non-critical errors — log and continue with empty data
    const nonCritical = [
      walletsResult.error,
      transactionsResult.error,
      yearOrdersResult.error,
      subscriptionChangesResult.error,
      activityResult.error,
      tenantMembersResult.error,
    ].filter(Boolean);
    if (nonCritical.length > 0) {
      console.warn("Dashboard V2 non-critical query errors:", nonCritical.map((e) => e?.message));
    }

    const orders = (ordersResult.data ?? []).map((o) => ({
      ...o,
      price: Number(o.price) || 0,
      delivery_fee: Number(o.delivery_fee) || 0,
    }));

    const transactions = (transactionsResult.data ?? []).map((t) => ({
      ...t,
      amount_iqd: Number(t.amount_iqd) || 0,
    }));

    // Build enriched tenant data
    const memberCountByTenant: Record<string, number> = {};
    for (const m of tenantMembersResult.data ?? []) {
      memberCountByTenant[m.tenant_id] = (memberCountByTenant[m.tenant_id] || 0) + 1;
    }

    const tenants = (tenantsResult.data ?? []).map((t) => {
      const wallet = Array.isArray(t.wallet) ? t.wallet[0] : t.wallet;
      const usage = Array.isArray(t.usage_tracking) ? t.usage_tracking[0] : t.usage_tracking;
      const branding = t.branding as { logo_url?: string; primary_color?: string } | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storeConfig = ((t as any).store_config as Record<string, unknown>) ?? {};

      return {
        id: t.id,
        business_name: t.business_name,
        plan: t.plan,
        status: t.status,
        city: t.city,
        created_at: t.created_at,
        branding: { primary_color: branding?.primary_color || "#1E1E1E" },
        wallet_balance: Number(wallet?.balance_iqd) || 0,
        total_charged: Number(wallet?.total_charged_iqd) || 0,
        total_topped_up: Number(wallet?.total_topped_up_iqd) || 0,
        orders_count: Number(usage?.orders_count) || 0,
        team_members_count: memberCountByTenant[t.id] || 0,
        has_branding: !!(branding?.logo_url || (branding?.primary_color && branding.primary_color !== "#1E1E1E")),
        has_storefront: !!(storeConfig as Record<string, unknown>)?.store_enabled,
        wallet_funded: (Number(wallet?.total_topped_up_iqd) || 0) > 0,
      };
    });

    // Build subscription changes for plan movements
    const subChanges = (subscriptionChangesResult.data ?? [])
      .filter((s) => s.pending_plan || s.status === "cancelled")
      .map((s) => ({
        tenant_id: s.tenant_id,
        from_plan: s.plan,
        to_plan: s.status === "cancelled" ? null : s.pending_plan,
        changed_at: new Date().toISOString(),
        type: s.status === "cancelled" ? "cancellation" : "plan_change",
      }));

    // Year orders for activity heatmap
    const yearOrders = (yearOrdersResult.data ?? []).map((o) => ({
      id: "",
      tenant_id: "",
      status: "",
      price: 0,
      delivery_fee: 0,
      city: null,
      governorate_code: null,
      source: null,
      created_at: o.created_at,
      delivered_at: null,
    }));

    // Run all calculations
    const kpis = calculateKpis(orders, tenants, transactions);
    const platformStats = calculatePlatformOrderStats(orders);
    const pipeline = calculatePlatformPipeline(orders);
    const topMerchants = calculateTopMerchants(orders, tenants);
    const geoStats = calculateGeoStats(orders);
    const peakHours = calculatePeakHours(orders);
    const funnel = calculateFulfillmentFunnel(orders);
    const growth = calculateGrowthMetrics(orders, tenants);
    const walletHealth = calculateWalletHealth(tenants, transactions);
    const activityHeatmap = calculateActivityHeatmap(yearOrders);
    const revenueBreakdown = calculateRevenueBreakdown(transactions, tenants, orders);
    const planMovements = calculatePlanMovements(subChanges);
    const topUpPatterns = calculateTopUpPatterns(transactions);
    const merchantLTV = calculateMerchantLTV(tenants, transactions);
    const timeToFirstOrder = calculateTimeToFirstOrder(tenants, orders);
    const onboarding = calculateOnboardingProgress(tenants, orders);

    return NextResponse.json({
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
      recentActivity: activityResult.data ?? [],
    });
  } catch (error) {
    console.error("Dashboard V2 error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard V2 data" },
      { status: 500 },
    );
  }
}
