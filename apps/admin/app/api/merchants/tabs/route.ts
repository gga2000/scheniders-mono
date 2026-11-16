import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { MERCHANT_TABS, tabFilters, type MerchantTab } from "@/lib/merchant-list";

/**
 * How many shops each tab of the Merchants list holds (board s2), so the count
 * is there before the tap. Counted by the database with the list's own filters.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const counted = await Promise.all(
      MERCHANT_TABS.map(async (tab) => {
        let query = supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_demo", false);
        for (const [column, operator, value] of tabFilters(tab)) query = query.filter(column, operator, value);
        const { count, error } = await query;
        if (error) throw error;
        return [tab, count ?? 0] as const;
      }),
    );
    const counts = Object.fromEntries(counted) as Record<MerchantTab, number>;
    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Merchant tab counts error:", error);
    return NextResponse.json({ error: "Could not count the shops." }, { status: 500 });
  }
}
