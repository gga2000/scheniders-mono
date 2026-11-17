import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { checkHourlyJobs } from "@/lib/hourly-check";
import { freshFailures } from "@/lib/hourly-jobs";

/** The failed runs this server instance has sent to Sentry (lib/hourly-jobs `freshFailures`). */
const sentToSentry = new Map<string, number>();

/**
 * GET /api/hourly-jobs: what the console's hourly jobs left undone, for the
 * staff bell (lib/hourly-check.ts). A failed run says why, so whoever sees the
 * bell can pass the words on; it goes to Sentry once.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const nowMs = Date.now();
    const check = await checkHourlyJobs(createAdminClient(), nowMs);
    for (const failed of freshFailures(check.jobs, sentToSentry, nowMs)) {
      Sentry.captureException(new Error(`Hourly job ${failed.job} failed`), {
        fingerprint: ["hourly-job-failed", failed.job],
        extra: { started: failed.last_run, message: failed.message },
      });
    }
    return NextResponse.json(check);
  } catch (error) {
    console.error("Hourly jobs check API error:", error);
    return NextResponse.json({ error: "Failed to check the hourly jobs" }, { status: 500 });
  }
}
