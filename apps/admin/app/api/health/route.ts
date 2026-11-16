import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { monthOf, monthsEnding } from "@/lib/console-stats";
import { everyRow } from "@/lib/every-row";

interface TenantRow {
  id: string;
  business_name: string;
  plan: string;
  status: string;
  city: string | null;
  created_at: string;
}

interface WalletRow {
  tenant_id: string;
  balance_iqd: number;
  threshold_iqd: number;
}

interface UsageRow {
  tenant_id: string;
  orders_count: number;
  team_members_count: number;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const supabase = createAdminClient();

    const now = new Date();
    const twentyFourHoursAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    ).toISOString();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Every list is read to its last row and a failed read throws: a short or
    // empty list here would say "no shops at risk" when the truth is unknown.
    const [tenants, wallets, ordersResult, usage] = await Promise.all([
      everyRow<TenantRow>((from, to) =>
        supabase
          .from("tenants")
          .select("id, business_name, plan, status, city, created_at")
          .order("id")
          .range(from, to)
      ),
      everyRow<WalletRow>((from, to) =>
        supabase
          .from("wallet")
          .select("tenant_id, balance_iqd, threshold_iqd")
          .order("tenant_id")
          .range(from, to)
      ),
      supabase
        .from("orders")
        .select("id, tenant_id, created_at", { count: "exact", head: true })
        .gte("created_at", twentyFourHoursAgo),
      everyRow<UsageRow>((from, to) =>
        supabase
          .from("usage_tracking")
          .select("tenant_id, orders_count, team_members_count")
          .eq("year", currentYear)
          .eq("month", currentMonth)
          .order("tenant_id")
          .range(from, to)
      ),
    ]);

    if (ordersResult.error) throw ordersResult.error;
    const ordersLast24h = ordersResult.count ?? 0;

    // Build lookup maps
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    const walletMap = new Map(wallets.map((w) => [w.tenant_id, w]));
    const usageMap = new Map(usage.map((u) => [u.tenant_id, u]));

    // ---------------------------------------------------------------------------
    // Platform Health
    // ---------------------------------------------------------------------------

    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t) => t.status === "active").length;
    const trialTenants = tenants.filter((t) => t.status === "trial").length;
    const suspendedTenants = tenants.filter(
      (t) => t.status === "suspended"
    ).length;

    // ---------------------------------------------------------------------------
    // Risk Scoring
    // ---------------------------------------------------------------------------

    const riskIndicators: {
      tenant_id: string;
      business_name: string;
      risk_score: number;
      reasons: string[];
      balance_iqd: number;
      plan: string;
    }[] = [];

    for (const tenant of tenants) {
      let riskScore = 0;
      const reasons: string[] = [];

      const wallet = walletMap.get(tenant.id);
      const tenantUsage = usageMap.get(tenant.id);

      // +3 if balance < threshold (low balance)
      if (wallet && wallet.balance_iqd < wallet.threshold_iqd) {
        riskScore += 3;
        reasons.push("Low balance");
      }

      // +2 if no orders this month
      if (!tenantUsage || tenantUsage.orders_count === 0) {
        riskScore += 2;
        reasons.push("No orders this month");
      }

      // +2 if suspended
      if (tenant.status === "suspended") {
        riskScore += 2;
        reasons.push("Suspended");
      }

      if (riskScore >= 3) {
        riskIndicators.push({
          tenant_id: tenant.id,
          business_name: tenant.business_name,
          risk_score: riskScore,
          reasons,
          balance_iqd: wallet?.balance_iqd ?? 0,
          plan: tenant.plan,
        });
      }
    }

    // Sort by risk score descending
    riskIndicators.sort((a, b) => b.risk_score - a.risk_score);

    // ---------------------------------------------------------------------------
    // Low Balance Wallets
    // ---------------------------------------------------------------------------

    const lowBalanceWallets = wallets
      .filter((w) => w.balance_iqd < w.threshold_iqd)
      .map((w) => ({
        tenant_id: w.tenant_id,
        business_name: tenantMap.get(w.tenant_id)?.business_name ?? "Unknown",
        balance_iqd: w.balance_iqd,
        threshold_iqd: w.threshold_iqd,
      }))
      .sort((a, b) => a.balance_iqd - b.balance_iqd);

    // ---------------------------------------------------------------------------
    // Tenant Growth
    // ---------------------------------------------------------------------------

    // Months are Baghdad months: a shop that signs up at 01:00 on the 1st in
    // Baghdad belongs to the new month, though it is still the old one in UTC.
    const [lastMonthKey, thisMonthKey] = monthsEnding(monthOf(now), 2);
    const thisMonth = tenants.filter((t) => monthOf(t.created_at) === thisMonthKey).length;
    const lastMonth = tenants.filter((t) => monthOf(t.created_at) === lastMonthKey).length;

    return NextResponse.json({
      platformHealth: {
        totalTenants,
        activeTenants,
        trialTenants,
        suspendedTenants,
        ordersLast24h,
      },
      riskIndicators,
      lowBalanceWallets,
      tenantGrowth: {
        thisMonth,
        lastMonth,
      },
    });
  } catch (error) {
    console.error("Health API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch health data" },
      { status: 500 }
    );
  }
}
