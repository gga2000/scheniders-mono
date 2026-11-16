import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { handledTodaySchema, isSupportWork, todayDeskSchema, todayNumbersSchema, type TodayResponse } from "@/lib/today";

export const dynamic = "force-dynamic";

/**
 * GET /api/today — the Today desk (board h1): the shops that need someone now,
 * each once, in the first group it fits, the numbers above the list, and what
 * staff dealt with since midnight (board h8). Each is read in the database in
 * one answer. Support questions and support steps are left out for a login
 * that does not handle support, as the Support page is.
 * A read that fails answers 500, never an empty desk that reads "nobody waits".
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const [desk, numbers, done] = await Promise.all([
      supabase.rpc("staff_today_desk"),
      supabase.rpc("staff_today_numbers"),
      supabase.rpc("staff_today_handled"),
    ]);
    if (desk.error) throw new Error(`staff_today_desk failed: ${desk.error.message}`);
    if (numbers.error) throw new Error(`staff_today_numbers failed: ${numbers.error.message}`);
    if (done.error) throw new Error(`staff_today_handled failed: ${done.error.message}`);

    const { shops } = todayDeskSchema.parse(desk.data);
    const { handled } = handledTodaySchema.parse(done.data);
    const handlesSupport = hasPermission(auth.role, "handle_support");
    const body: TodayResponse = {
      shops: handlesSupport ? shops : shops.filter((s) => s.group !== "support"),
      numbers: todayNumbersSchema.parse(numbers.data),
      handled: handlesSupport ? handled : handled.filter((row) => !isSupportWork(row)),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Today desk API error:", error);
    return NextResponse.json({ error: "Could not load who is waiting." }, { status: 500 });
  }
}
