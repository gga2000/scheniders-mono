import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

/** How long a receipt link stays valid once the bell has loaded it. */
const RECEIPT_URL_SECONDS = 15 * 60;

/**
 * GET /api/wallet-topup-requests — shops that sent money by Zain Cash or Qi and
 * uploaded a receipt, waiting for our team to check it. Oldest first, each
 * with a short-lived link to its receipt in the private wallet-receipts bucket.
 * Read by every active admin; approving or refusing needs `top_up_wallet`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("wallet_topup_requests")
      .select("id, tenant_id, amount_iqd, method, receipt_path, created_at, tenants(business_name, slug)")
      .is("decided_at", null)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return NextResponse.json({ requests: [] });

    const { data: signed, error: signError } = await supabase.storage
      .from("wallet-receipts")
      .createSignedUrls(rows.map((r) => r.receipt_path), RECEIPT_URL_SECONDS);
    if (signError) throw signError;
    const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

    return NextResponse.json({
      requests: rows.map(({ receipt_path, ...r }) => ({ ...r, receipt_url: urlByPath.get(receipt_path) ?? null })),
    });
  } catch (error) {
    console.error("Wallet top-up requests API error:", error);
    return NextResponse.json({ error: "Failed to load top-up requests" }, { status: 500 });
  }
}
