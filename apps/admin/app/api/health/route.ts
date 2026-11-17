import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { monthOf, monthsEnding } from "@/lib/console-stats";
import { everyRow } from "@/lib/every-row";
import { CUSTOMER_SHOP } from "@/lib/customer-shops";

interface TenantRow {
  id: string;
  business_name: string;
  plan: string;
  status: string;
  city: string | null;
  created_at: string;
  /** The health score's parts; `orders` is 0 only for a shop with no real order in 30 days. */
  staff_health_parts: { orders: number };
}

interface WalletRow {
  tenant_id: string;
  balance_iqd: number;
  threshold_iqd: number;
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

    // Every list is read to its last row and a failed read throws: a short or
    // empty list here would say "no shops at risk" when the truth is unknown.
    const [tenants, wallets, ordersResult] = await Promise.all([
      everyRow<TenantRow>((from, to) =>
        supabase
          .from("tenants")
          .select("id, business_name, plan, status, city, created_at, staff_health_parts")
          // The demo store and prospect stores (lib/customer-shops) are never shops at risk.
          .match(CUSTOMER_SHOP)
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
      // Real orders only: admin_order_facts leaves out the demo store, whose
      // invented orders would keep this tile busy when every real shop is quiet,
      // and the deleted, draft, test and practice rows.
      supabase
        .from("admin_order_facts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", twentyFourHoursAgo),
    ]);

    if (ordersResult.error) throw ordersResult.error;
    const ordersLast24h = ordersResult.count ?? 0;

    // Build lookup maps
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    const walletMap = new Map(wallets.map((w) => [w.tenant_id, w]));

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
      // A cancelled shop has already left: it is no longer at risk of leaving.
      if (tenant.status === "cancelled") continue;
      let riskScore = 0;
      const reasons: string[] = [];

      const wallet = walletMap.get(tenant.id);

      // +3 if balance < threshold (low balance)
      if (wallet && wallet.balance_iqd < wallet.threshold_iqd) {
        riskScore += 3;
        reasons.push("Low balance");
      }

      // +2 if no real order in the 30 Baghdad days that end today: the orders
      // the health score counts, never the plan's usage counter, which misses
      // store checkout orders and keeps removed ones.
      if (tenant.staff_health_parts.orders === 0) {
        riskScore += 2;
        reasons.push("No orders in 30 days");
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

    // Only the wallets of shops still with us: the wallet list holds every
    // shop's, the demo store, prospect stores and cancelled shops too.
    const lowBalanceWallets = wallets
      .flatMap((w) => {
        const shop = tenantMap.get(w.tenant_id);
        return shop && shop.status !== "cancelled" && w.balance_iqd < w.threshold_iqd ? [{ w, shop }] : [];
      })
      .map(({ w, shop }) => ({
        tenant_id: w.tenant_id,
        business_name: shop.business_name,
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
