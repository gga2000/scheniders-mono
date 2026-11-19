import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { checkBilling, type MissedBilling } from "@/lib/billing-check";
import { requireCronAuth } from "@/lib/cron-auth";
import { checkHourlyJobs } from "@/lib/hourly-check";
import type { JobProblem } from "@/lib/hourly-jobs";

/** What Sentry's issue says, by problem. */
const PROBLEM_WORDS: Record<JobProblem["problem"], string> = {
  failed: "failed",
  stopped: "has not run within the hour",
  not_scheduled: "is not scheduled",
};

/**
 * GET /api/cron/hourly-jobs: for Vercel's scheduler, once an hour after the
 * database's hourly jobs have run (:21 and :27). Every problem the staff bell
 * would show goes to Sentry, one issue per job and problem, one event per
 * hour while it lasts: a failed run with what it said, a job that stopped or
 * was never scheduled, paused shops the lift missed, and trials and months
 * the daily renewal job missed (lib/billing-check.ts; round 20: the renewal
 * runs on the platform and its Sentry monitor has never checked in, so a
 * missed run reached no one). Round 15: the bell sends only failed runs, and
 * only while someone has a console open.
 * Not scheduled yet: Vercel calls it once CRON_SECRET is set and vercel.json
 * has its `crons` entry. Until then only the bell's send reaches Sentry, under
 * the same fingerprint as a failed run here, so both land on one issue.
 */
export async function GET(request: Request) {
  const refused = requireCronAuth(request);
  if (refused) {
    await Sentry.flush(2000);
    return refused;
  }

  try {
    const supabase = createAdminClient();
    const nowMs = Date.now();
    const [{ pausesNotLifted, jobs }, { trialsNotBilled, renewalsMissed }] = await Promise.all([
      checkHourlyJobs(supabase, nowMs),
      checkBilling(supabase, nowMs),
    ]);
    for (const { job, problem, last_run, message } of jobs) {
      Sentry.captureException(new Error(`Hourly job ${job} ${PROBLEM_WORDS[problem]}`), {
        fingerprint: ["hourly-job", problem, job],
        extra: { last_run, message },
      });
    }
    if (pausesNotLifted.length > 0) {
      Sentry.captureException(new Error("Paused shops past their end were not lifted"), {
        fingerprint: ["hourly-pause-not-lifted"],
        extra: { shops: pausesNotLifted.length, tenant_ids: pausesNotLifted.map((shop) => shop.tenant_id) },
      });
    }
    sendMissed("Trials past their end were never billed", "trial", trialsNotBilled);
    sendMissed("Months past their end were not renewed", "month", renewalsMissed);
    // The function may stop once it answers: send the events first.
    await Sentry.flush(2000);
    return NextResponse.json({
      jobs: jobs.length,
      pausesNotLifted: pausesNotLifted.length,
      trialsNotBilled: trialsNotBilled.length,
      renewalsMissed: renewalsMissed.length,
    });
  } catch (error) {
    console.error("Scheduled hourly jobs check failed:", error);
    await Sentry.flush(2000);
    return NextResponse.json({ error: "Failed to check the hourly jobs" }, { status: 500 });
  }
}

/** One issue per kind while shops are missed, by id only, with the oldest end. */
function sendMissed(title: string, kind: "trial" | "month", shops: MissedBilling[]) {
  if (shops.length === 0) return;
  Sentry.captureException(new Error(title), {
    fingerprint: ["daily-renewal-missed", kind],
    extra: { shops: shops.length, tenant_ids: shops.map((shop) => shop.tenant_id), oldest_end: shops.map((shop) => shop.due).sort()[0] },
  });
}
