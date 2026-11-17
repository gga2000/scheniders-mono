import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { CUSTOMER_SHOP } from "@/lib/customer-shops";
import { everyRow } from "@/lib/every-row";
import { freshFailures, hourlyJobSchema, jobProblems, jobRunSchema } from "@/lib/hourly-jobs";
import { pauseLiftOverdue } from "@/lib/tenant-pause";

/** A paused shop's end date, as lift_ended_pauses reads it: a readable time, or no end. */
const pauseEnd = z.object({ paused_until: z.string().refine((value) => !Number.isNaN(Date.parse(value))) });

/** The failed runs this server instance has sent to Sentry (lib/hourly-jobs `freshFailures`). */
const sentToSentry = new Map<string, number>();

/**
 * GET /api/hourly-jobs: what the console's hourly jobs left undone, for the
 * staff bell. The jobs run in the database (pg_cron), where a failure was
 * written only to the database log:
 *   - pausesNotLifted: paused customer shops whose pause ended more than an
 *     hour ago, so the hourly lift failed for them (it tries again each hour);
 *   - jobs: a job whose newest run failed, that has not run within the hour,
 *     or that is not scheduled (staff_job_runs). A failed run says why, so
 *     whoever sees the bell can pass the words on; it goes to Sentry once.
 * Empty lists mean the hourly jobs are running.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const [paused, runs] = await Promise.all([
      everyRow((from, to) =>
        supabase
          .from("tenants")
          .select("id, business_name, restrictions")
          .eq("status", "limited")
          .match(CUSTOMER_SHOP)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      supabase.rpc("staff_job_runs", { p_jobs: hourlyJobSchema.options }),
    ]);
    if (runs.error) throw runs.error;

    const nowMs = Date.now();
    const pausesNotLifted = paused.flatMap((shop) => {
      const end = pauseEnd.safeParse(shop.restrictions);
      return end.success && pauseLiftOverdue(end.data.paused_until, nowMs)
        ? [{ tenant_id: shop.id, business_name: shop.business_name, paused_until: end.data.paused_until }]
        : [];
    });

    const jobs = jobProblems(z.array(jobRunSchema).parse(runs.data), nowMs);
    for (const failed of freshFailures(jobs, sentToSentry, nowMs)) {
      Sentry.captureException(new Error(`Hourly job ${failed.job} failed`), {
        fingerprint: ["hourly-job-failed", failed.job],
        extra: { started: failed.last_run, message: failed.message },
      });
    }
    return NextResponse.json({ pausesNotLifted, jobs });
  } catch (error) {
    console.error("Hourly jobs check API error:", error);
    return NextResponse.json({ error: "Failed to check the hourly jobs" }, { status: 500 });
  }
}
