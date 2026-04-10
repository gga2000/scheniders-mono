import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  try {
    // Parallel queries
    const [wallTxRes, tenantsRes, subsRes] = await Promise.all([
      // Wallet transactions (charges = revenue) last 12 months
      supabase
        .from("wallet_transactions")
        .select("id, tenant_id, type, amount_iqd, created_at")
        .in("type", ["charge", "topup"])
        .gte("created_at", new Date(Date.now() - 365 * 86400000).toISOString())
        .order("created_at", { ascending: true }),

      // Tenants with wallet & subscription
      supabase
        .from("tenants")
        .select("id, business_name, plan, status, created_at, wallet:wallets(balance_iqd, total_charged_iqd)"),

      // Subscription changes
      supabase
        .from("subscriptions")
        .select("id, tenant_id, plan, status, created_at, current_period_start, current_period_end")
        .order("created_at", { ascending: true }),
    ]);

    const transactions = wallTxRes.data || [];
    const tenants = tenantsRes.data || [];
    const subscriptions = subsRes.data || [];

    // --- MRR Waterfall (last 6 months) ---
    const now = new Date();
    const mrrWaterfall = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const monthLabel = monthStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

      const charges = transactions.filter((tx) => {
        const d = new Date(tx.created_at);
        return tx.type === "charge" && d >= monthStart && d <= monthEnd;
      });
      const totalRevenue = charges.reduce((s, tx) => s + tx.amount_iqd, 0);

      mrrWaterfall.push({ month: monthLabel, revenue: totalRevenue });
    }

    // --- Cohort Analysis (signup month → revenue per month) ---
    const cohortMap = new Map<string, { signupMonth: string; tenantIds: string[] }>();
    tenants.forEach((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!cohortMap.has(key)) cohortMap.set(key, { signupMonth: key, tenantIds: [] });
      cohortMap.get(key)!.tenantIds.push(t.id);
    });

    const cohorts = Array.from(cohortMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, { tenantIds }]) => {
        const months: number[] = [];
        for (let m = 0; m < 6; m++) {
          const [y, mo] = key.split("-").map(Number);
          const start = new Date(y, mo - 1 + m, 1);
          const end = new Date(y, mo + m, 0);
          const rev = transactions
            .filter((tx) => {
              const d = new Date(tx.created_at);
              return tx.type === "charge" && tenantIds.includes(tx.tenant_id) && d >= start && d <= end;
            })
            .reduce((s, tx) => s + tx.amount_iqd, 0);
          months.push(rev);
        }
        return { cohort: key, tenantCount: tenantIds.length, months };
      });

    // --- LTV Distribution ---
    const tenantRevenue = new Map<string, number>();
    transactions
      .filter((tx) => tx.type === "charge")
      .forEach((tx) => {
        tenantRevenue.set(tx.tenant_id, (tenantRevenue.get(tx.tenant_id) || 0) + tx.amount_iqd);
      });

    const ltvValues = Array.from(tenantRevenue.entries())
      .map(([id, rev]) => ({ id, revenue: rev, name: tenants.find((t) => t.id === id)?.business_name || "Unknown" }))
      .sort((a, b) => b.revenue - a.revenue);

    const ltvBuckets = [
      { label: "0-50K", min: 0, max: 50000 },
      { label: "50K-200K", min: 50000, max: 200000 },
      { label: "200K-500K", min: 200000, max: 500000 },
      { label: "500K-1M", min: 500000, max: 1000000 },
      { label: "1M+", min: 1000000, max: Infinity },
    ];

    const ltvDistribution = ltvBuckets.map((bucket) => ({
      label: bucket.label,
      count: ltvValues.filter((v) => v.revenue >= bucket.min && v.revenue < bucket.max).length,
    }));

    // --- Revenue by Plan ---
    const planRevenue: Record<string, number[]> = {};
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      transactions
        .filter((tx) => {
          const d = new Date(tx.created_at);
          return tx.type === "charge" && d >= monthStart && d <= monthEnd;
        })
        .forEach((tx) => {
          const tenant = tenants.find((t) => t.id === tx.tenant_id);
          const plan = tenant?.plan || "unknown";
          if (!planRevenue[plan]) planRevenue[plan] = new Array(6).fill(0);
          planRevenue[plan][5 - i] += tx.amount_iqd;
        });
    }

    const revenueByPlan = Object.entries(planRevenue).map(([plan, data]) => ({
      plan,
      data,
    }));

    const monthLabels = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    });

    return NextResponse.json({
      mrrWaterfall,
      cohorts,
      ltvDistribution,
      topLTV: ltvValues.slice(0, 10),
      avgLTV: ltvValues.length > 0 ? Math.round(ltvValues.reduce((s, v) => s + v.revenue, 0) / ltvValues.length) : 0,
      revenueByPlan,
      monthLabels,
    });
  } catch (error) {
    console.error("Revenue API error:", error);
    return NextResponse.json({ error: "Failed to fetch revenue data" }, { status: 500 });
  }
}
