import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { everyRow } from "@/lib/every-row";
import { CUSTOMER_SHOP, CUSTOMER_SHOP_EMBEDDED } from "@/lib/customer-shops";

export async function GET(request: NextRequest) {
  // Billing data (wallet balances + transactions) is super_admin only —
  // financial visibility maps to the `adjust_balance` permission.
  const auth = await requireAdminPermission(request, "adjust_balance");
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    // Every shop with its wallet, a page at a time: two unordered reads of at
    // most 1,000 rows each, joined here, dropped wallets and short totals once
    // there were more than 1,000 shops.
    const [shops, transactionsResult] = await Promise.all([
      everyRow((from, to) =>
        supabase
          .from("tenants")
          .select("id, business_name, plan, status, wallet(balance_iqd, threshold_iqd, total_charged_iqd, total_topped_up_iqd)")
          // The demo store and prospect stores (lib/customer-shops) hold no real money.
          .match(CUSTOMER_SHOP)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      supabase
        .from("wallet_transactions")
        .select("*, tenants!inner(business_name)")
        .match(CUSTOMER_SHOP_EMBEDDED)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100),
    ]);
    if (transactionsResult.error) throw transactionsResult.error;

    const recentTransactions = transactionsResult.data ?? [];

    // A shop with no wallet yet has no row here.
    const enrichedWallets = shops.flatMap((shop) => {
      const w = Array.isArray(shop.wallet) ? shop.wallet[0] : shop.wallet;
      if (!w) return [];
      return [
        {
          tenant_id: shop.id,
          business_name: shop.business_name,
          plan: shop.plan,
          status: shop.status,
          balance_iqd: Number(w.balance_iqd) || 0,
          threshold_iqd: Number(w.threshold_iqd) || 0,
          total_charged_iqd: Number(w.total_charged_iqd) || 0,
          total_topped_up_iqd: Number(w.total_topped_up_iqd) || 0,
        },
      ];
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
