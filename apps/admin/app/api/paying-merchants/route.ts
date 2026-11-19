import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { PAYER_GOALS, monthsParamSchema, payingMerchantsSchema } from "@/lib/paying-merchants";

export const dynamic = "force-dynamic";

/**
 * GET /api/paying-merchants?months=6: the shops paying now (plan, paid until,
 * the month's own end, first paid, source), the count at the end of each of
 * the last `months` Baghdad months, and the stop-rule goals. Counted in the
 * database, one answer.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const months = monthsParamSchema.safeParse(new URL(request.url).searchParams.get("months") ?? undefined);
  if (!months.success) {
    return NextResponse.json({ error: "months must be a whole number from 1 to 36" }, { status: 400 });
  }

  try {
    const { data, error } = await createAdminClient().rpc("admin_paying_merchants", { p_months: months.data });
    if (error) throw error;
    const report = payingMerchantsSchema.parse(data);
    return NextResponse.json({ ...report, count: report.shops.length, goals: PAYER_GOALS });
  } catch (error) {
    console.error("Paying merchants API error:", error);
    return NextResponse.json({ error: "Failed to load paying merchants" }, { status: 500 });
  }
}
