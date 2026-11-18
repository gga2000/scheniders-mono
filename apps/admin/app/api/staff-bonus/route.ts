import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { BONUS_BASE_IQD, BONUS_PER_PAYER_IQD, bonusMonths, monthsParamSchema, payingMerchantsSchema } from "@/lib/paying-merchants";

export const dynamic = "force-dynamic";

/**
 * GET /api/staff-bonus?months=6: each team member's pay per month,
 * 250,000 + 1,000 x shops paying at the month's end (handoff B12 item 4,
 * Q10), for the month still running and the last `months` months. The team
 * is every active support staff login; super admins are the owners and the
 * audit login. Read-only numbers for Ali to pay by hand, so only a login that
 * manages staff pay may read them.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, "manage_commissions");
  if (auth instanceof NextResponse) return auth;

  const months = monthsParamSchema.safeParse(new URL(request.url).searchParams.get("months") ?? undefined);
  if (!months.success) {
    return NextResponse.json({ error: "months must be a whole number from 1 to 36" }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const [paying, team] = await Promise.all([
      supabase.rpc("admin_paying_merchants", { p_months: months.data }).then(({ data, error }) => {
        if (error) throw error;
        return payingMerchantsSchema.parse(data);
      }),
      supabase
        .from("admin_users")
        .select("user_id, display_name")
        .eq("is_active", true)
        .eq("admin_role", "support_staff")
        .order("display_name", { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data;
        }),
    ]);
    const people = team.map((p) => ({ id: p.user_id, name: p.display_name }));
    return NextResponse.json({
      basePerPersonIqd: BONUS_BASE_IQD,
      perPayerIqd: BONUS_PER_PAYER_IQD,
      people,
      months: bonusMonths(paying, people.length),
    });
  } catch (error) {
    console.error("Staff bonus API error:", error);
    return NextResponse.json({ error: "Failed to load the staff bonus" }, { status: 500 });
  }
}
