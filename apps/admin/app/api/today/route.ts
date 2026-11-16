import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { todayDeskSchema, todayNumbersSchema, type TodayResponse } from "@/lib/today";

export const dynamic = "force-dynamic";

/**
 * GET /api/today — the Today desk (board h1): the shops that need someone now,
 * each once, in the first group it fits, and the numbers above the list. Both
 * are counted in the database in one answer each. Support questions are left
 * out for a login that does not handle support, as the Support page is.
 * A read that fails answers 500, never an empty desk that reads "nobody waits".
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const [desk, numbers] = await Promise.all([
      supabase.rpc("staff_today_desk"),
      supabase.rpc("staff_today_numbers"),
    ]);
    if (desk.error) throw new Error(`staff_today_desk failed: ${desk.error.message}`);
    if (numbers.error) throw new Error(`staff_today_numbers failed: ${numbers.error.message}`);

    const { shops } = todayDeskSchema.parse(desk.data);
    const handlesSupport = hasPermission(auth.role, "handle_support");
    const body: TodayResponse = {
      shops: handlesSupport ? shops : shops.filter((s) => s.group !== "support"),
      numbers: todayNumbersSchema.parse(numbers.data),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Today desk API error:", error);
    return NextResponse.json({ error: "Could not load who is waiting." }, { status: 500 });
  }
}
