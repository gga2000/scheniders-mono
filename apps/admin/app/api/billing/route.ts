import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  // Billing data (wallet balances + transactions) is super_admin only —
  // financial visibility maps to the `adjust_balance` permission.
  const auth = await requireAdminPermission(request, "adjust_balance");
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    const [walletsResult, tenantsResult, transactionsResult] =
      await Promise.all([
        supabase
          .from("wallet")
          .select(
            "tenant_id, balance_iqd, threshold_iqd, total_charged_iqd, total_topped_up_iqd"
          ),
        supabase
          .from("tenants")
          .select("id, business_name, plan, status"),
        supabase
          .from("wallet_transactions")
          .select("*, tenants(business_name)")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

    if (walletsResult.error) throw walletsResult.error;
    if (tenantsResult.error) throw tenantsResult.error;
    if (transactionsResult.error) throw transactionsResult.error;

    const wallets = walletsResult.data ?? [];
    const tenants = tenantsResult.data ?? [];
    const recentTransactions = transactionsResult.data ?? [];

    // Build a lookup map from tenant id to tenant info
    const tenantMap = new Map(
      tenants.map((t) => [t.id, t])
    );

    // Join wallets with tenant info
    const enrichedWallets = wallets.map((w) => {
      const tenant = tenantMap.get(w.tenant_id);
      return {
        tenant_id: w.tenant_id,
        business_name: tenant?.business_name ?? "Unknown",
        plan: tenant?.plan ?? "unknown",
        status: tenant?.status ?? "unknown",
        balance_iqd: Number(w.balance_iqd) || 0,
        threshold_iqd: Number(w.threshold_iqd) || 0,
        total_charged_iqd: Number(w.total_charged_iqd) || 0,
        total_topped_up_iqd: Number(w.total_topped_up_iqd) || 0,
      };
    });

    // Compute summary
    const totalBalance = enrichedWallets.reduce(
      (sum, w) => sum + w.balance_iqd,
      0
    );
    const totalCharged = enrichedWallets.reduce(
      (sum, w) => sum + w.total_charged_iqd,
      0
    );
    const totalToppedUp = enrichedWallets.reduce(
      (sum, w) => sum + w.total_topped_up_iqd,
      0
    );
    const lowBalanceCount = enrichedWallets.filter(
      (w) => w.balance_iqd < w.threshold_iqd
    ).length;

    return NextResponse.json({
      wallets: enrichedWallets,
      recentTransactions,
      summary: {
        totalBalance,
        totalCharged,
        totalToppedUp,
        lowBalanceCount,
      },
    });
  } catch (error) {
    console.error("Billing API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch billing data" },
      { status: 500 }
    );
  }
}
