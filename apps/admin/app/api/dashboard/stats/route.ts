import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

function startOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function groupBy<T>(
  items: T[],
  key: (item: T) => string | null | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item) ?? "unknown";
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const monthStart = startOfMonth();

    const [tenantsResult, walletsResult, transactionsResult, activityResult] =
      await Promise.all([
        supabase.from("tenants").select("id, status, plan, city"),
        supabase.from("wallet").select("balance_iqd"),
        supabase
          .from("wallet_transactions")
          .select("type, amount_iqd, created_at")
          .gte("created_at", monthStart),
        supabase
          .from("admin_activity_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    if (tenantsResult.error) throw tenantsResult.error;
    if (walletsResult.error) throw walletsResult.error;
    if (transactionsResult.error) throw transactionsResult.error;
    if (activityResult.error) throw activityResult.error;

    const tenants = tenantsResult.data ?? [];
    const wallets = walletsResult.data ?? [];
    const transactions = transactionsResult.data ?? [];

    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t) => t.status === "active").length;
    const trialTenants = tenants.filter((t) => t.status === "trial").length;
    const suspendedTenants = tenants.filter((t) => t.status === "suspended").length;
    const tenantsByCity = groupBy(tenants, (t) => t.city);
    const tenantsByPlan = groupBy(tenants, (t) => t.plan);

    const totalWalletBalance = wallets.reduce(
      (sum, w) => sum + (Number(w.balance_iqd) || 0),
      0
    );

    const totalToppedUpThisMonth = transactions
      .filter((tx) => tx.type === "topup")
      .reduce((sum, tx) => sum + (Number(tx.amount_iqd) || 0), 0);

    const totalChargedThisMonth = transactions
      .filter((tx) => tx.type === "charge")
      .reduce((sum, tx) => sum + (Number(tx.amount_iqd) || 0), 0);

    const recentActivity = activityResult.data ?? [];

    // Also return raw transactions for the chart (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: chartTransactions } = await supabase
      .from("wallet_transactions")
      .select("type, amount_iqd, created_at")
      .gte("created_at", thirtyDaysAgo.toISOString());

    return NextResponse.json({
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      totalWalletBalance,
      totalToppedUpThisMonth,
      totalChargedThisMonth,
      recentActivity,
      tenantsByCity,
      tenantsByPlan,
      chartTransactions: chartTransactions ?? [],
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
