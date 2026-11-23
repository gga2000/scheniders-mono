import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { checkHourlyJobs } from "@/lib/hourly-check";

/**
 * GET /api/hourly-jobs: what the console's hourly jobs left undone, for the
 * staff bell (lib/hourly-check.ts). A failed run says why, so whoever sees the
 * bell can pass the words on. Sentry hears of it from the scheduled check
 * (/api/cron/hourly-jobs) each hour, whether or not a console is open.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await checkHourlyJobs(createAdminClient(), Date.now()));
  } catch (error) {
    console.error("Hourly jobs check API error:", error);
    return NextResponse.json({ error: "Failed to check the hourly jobs" }, { status: 500 });
  }
}
