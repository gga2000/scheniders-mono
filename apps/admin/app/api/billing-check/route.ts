import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { checkBilling } from "@/lib/billing-check";

/**
 * GET /api/billing-check: shops the daily renewal job missed, for the staff
 * bell (lib/billing-check.ts). Empty lists mean billing is running.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await checkBilling(createAdminClient(), Date.now()));
  } catch (error) {
    console.error("Billing check API error:", error);
    return NextResponse.json({ error: "Failed to check billing" }, { status: 500 });
  }
}
