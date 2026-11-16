import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { SCOREBOARD_DAYS, SupportScoreboardSchema } from "@/lib/support";

export const dynamic = "force-dynamic";

/**
 * GET /api/support/scoreboard?days=7|30 — how fast the team answers and
 * solves, what merchants said, and what they wrote about. Counted in the
 * database (support_scoreboard), one answer; the demo store never counts.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const requested = Number(new URL(request.url).searchParams.get("days") ?? "7");
  const days = SCOREBOARD_DAYS.find((d) => d === requested);
  if (days === undefined) {
    return NextResponse.json({ error: "Pick 7 or 30 days." }, { status: 400 });
  }

  try {
    const { data, error } = await createAdminClient().rpc("support_scoreboard", { p_days: days });
    if (error) throw error;
    return NextResponse.json(SupportScoreboardSchema.parse(data));
  } catch (error) {
    console.error("Support scoreboard API error:", error);
    return NextResponse.json({ error: "Failed to load the support scoreboard" }, { status: 500 });
  }
}
