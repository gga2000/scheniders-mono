import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { CUSTOMER_SHOP } from "@/lib/customer-shops";
import { everyRow } from "@/lib/every-row";
import { hourlyJobSchema, jobProblems, jobRunSchema } from "@/lib/hourly-jobs";
import { pauseLiftOverdue } from "@/lib/tenant-pause";

/** A paused shop's end date, as lift_ended_pauses reads it: a readable time, or no end. */
const pauseEnd = z.object({ paused_until: z.string().refine((value) => !Number.isNaN(Date.parse(value))) });

/**
 * GET /api/hourly-jobs: what the console's hourly jobs left undone, for the
 * staff bell. The jobs run in the database (pg_cron), where a failure was
 * written only to the database log:
 *   - pausesNotLifted: paused customer shops whose pause ended more than an
 *     hour ago, so the hourly lift failed for them (it tries again each hour);
 *   - jobs: a job whose newest run failed, that has not run within the hour,
 *     or that is not scheduled (staff_job_runs).
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

    return NextResponse.json({ pausesNotLifted, jobs: jobProblems(z.array(jobRunSchema).parse(runs.data), nowMs) });
  } catch (error) {
    console.error("Hourly jobs check API error:", error);
    return NextResponse.json({ error: "Failed to check the hourly jobs" }, { status: 500 });
  }
}
