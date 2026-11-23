import { z } from "zod";
import type { createAdminClient } from "@/lib/admin-supabase";
import { CUSTOMER_SHOP } from "@/lib/customer-shops";
import { everyRow } from "@/lib/every-row";
import { hourlyJobSchema, jobProblems, jobRunSchema, type JobProblem } from "@/lib/hourly-jobs";
import { pauseLiftOverdue } from "@/lib/tenant-pause";

/** A paused shop's end date, as lift_ended_pauses reads it: a readable time, or no end. */
const pauseEnd = z.object({ paused_until: z.string().refine((value) => !Number.isNaN(Date.parse(value))) });

export type PauseNotLifted = { tenant_id: string; business_name: string; paused_until: string };

/**
 * What the console's hourly jobs left undone. The jobs run in the database
 * (pg_cron), where a failure was written only to the database log:
 *   - pausesNotLifted: paused customer shops whose pause ended more than an
 *     hour ago, so the hourly lift failed for them (it tries again each hour);
 *   - jobs: a job whose newest run failed, that has not run within the hour,
 *     or that is not scheduled (staff_job_runs), with what a failed run said.
 * Empty lists mean the hourly jobs are running. The staff bell reads it
 * (/api/hourly-jobs). The scheduled check (/api/cron/hourly-jobs) sends it to
 * Sentry each hour: Vercel calls it at minute 40 (vercel.json `crons`). A
 * failed read throws.
 */
export async function checkHourlyJobs(
  supabase: ReturnType<typeof createAdminClient>,
  nowMs: number,
): Promise<{ pausesNotLifted: PauseNotLifted[]; jobs: JobProblem[] }> {
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

  const pausesNotLifted = paused.flatMap((shop) => {
    const end = pauseEnd.safeParse(shop.restrictions);
    return end.success && pauseLiftOverdue(end.data.paused_until, nowMs)
      ? [{ tenant_id: shop.id, business_name: shop.business_name, paused_until: end.data.paused_until }]
      : [];
  });
  return { pausesNotLifted, jobs: jobProblems(z.array(jobRunSchema).parse(runs.data), nowMs) };
}
