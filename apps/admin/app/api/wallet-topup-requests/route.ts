import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { receiptKind, topupQueueSchema } from "@/lib/topup-queue";

/** How long a receipt link stays valid once the page has loaded it. */
const RECEIPT_URL_SECONDS = 15 * 60;

/**
 * GET /api/wallet-topup-requests — shops that paid us by Qi or Zain Cash
 * transfer and uploaded the receipt, waiting for our team (Fermi B3). Oldest
 * first, each with what staff need to decide it (the shop's plan, what it
 * owes, its wallet, any repeat receipt; counted in the database, one answer)
 * and a short-lived link to the receipt in the private wallet-receipts bucket.
 * Read by every active admin; deciding needs `check_payments`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("admin_topup_queue");
    if (error) throw error;
    const rows = topupQueueSchema.parse(data).requests;
    if (rows.length === 0) return NextResponse.json({ requests: [] });

    const { data: signed, error: signError } = await supabase.storage
      .from("wallet-receipts")
      .createSignedUrls(rows.map((r) => r.receipt_path), RECEIPT_URL_SECONDS);
    if (signError) throw signError;
    const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

    return NextResponse.json({
      requests: rows.map(({ receipt_path, ...r }) => ({
        ...r,
        receipt_url: urlByPath.get(receipt_path) ?? null,
        receipt_kind: receiptKind(receipt_path),
      })),
    });
  } catch (error) {
    console.error("Wallet top-up requests API error:", error);
    return NextResponse.json({ error: "Failed to load top-up requests" }, { status: 500 });
  }
}
