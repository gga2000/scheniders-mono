import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { weekSummary, weeklyDashboardSchema, weeksParamSchema } from "@/lib/weekly-dashboard";

export const dynamic = "force-dynamic";

/**
 * GET /api/weekly-dashboard?weeks=8: one row per Baghdad work week, oldest
 * first and the running week last: new shops, trials started, first order
 * within 72 hours, shops that started paying (assisted or self-serve), paying
 * at the week's end, churn, and what trial WhatsApp cost Fermi. Any staff
 * member may read it. Counted in the database, one answer.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const weeks = weeksParamSchema.safeParse(new URL(request.url).searchParams.get("weeks") ?? undefined);
  if (!weeks.success) {
    return NextResponse.json({ error: "weeks must be a whole number from 1 to 52" }, { status: 400 });
  }

  try {
    const { data, error } = await createAdminClient().rpc("admin_weekly_dashboard", { p_weeks: weeks.data });
    if (error) throw error;
    return NextResponse.json({ weeks: weeklyDashboardSchema.parse(data).map(weekSummary) });
  } catch (error) {
    console.error("Weekly dashboard API error:", error);
    return NextResponse.json({ error: "Failed to load the weekly dashboard" }, { status: 500 });
  }
}
