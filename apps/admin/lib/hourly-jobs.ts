import { z } from "zod";

/**
 * The console's hourly pg_cron jobs, by the name pg_cron runs them under.
 * Each runs once an hour (hourly-jobs.test.ts ties this to the schedules in
 * packages/supabase/migrations).
 */
export const hourlyJobSchema = z.enum(["lift-ended-pauses", "refresh-lead-scores"]);
export type HourlyJob = z.infer<typeof hourlyJobSchema>;

/** Each job as staff read it. */
export const HOURLY_JOBS: Record<HourlyJob, string> = {
  "lift-ended-pauses": "The pause lift",
  "refresh-lead-scores": "The lead score refresh",
};

/** An hour between runs, and five minutes of slack for the run itself. */
export const HOURLY_RUN_MS = 65 * 60 * 1000;

/** One row of staff_job_runs: a job's newest run. */
export const jobRunSchema = z.object({
  jobname: z.string(),
  last_start: z.string().nullable(),
  last_status: z.string().nullable(),
  last_message: z.string().nullable(),
});
export type JobRun = z.infer<typeof jobRunSchema>;

export const jobProblemSchema = z.object({
  job: hourlyJobSchema,
  /** failed: its newest run failed. stopped: no run within the hour. not_scheduled: pg_cron has no such job. */
  problem: z.enum(["failed", "stopped", "not_scheduled"]),
  /** When its newest run started; null when it never ran. */
  last_run: z.string().nullable(),
  /** What a failed run said (its first 300 characters); null otherwise. */
  message: z.string().nullable(),
});
export type JobProblem = z.infer<typeof jobProblemSchema>;

/**
 * What is wrong with each hourly job, from its newest run. A failed run
 * undoes all its work (the lead score refresh) or is tried again next hour;
 * either way staff hear of it here instead of only in the database log, with
 * what the run said.
 */
export function jobProblems(runs: readonly JobRun[], nowMs: number): JobProblem[] {
  return hourlyJobSchema.options.flatMap((job): JobProblem[] => {
    const run = runs.find((r) => r.jobname === job);
    if (!run) return [{ job, problem: "not_scheduled", last_run: null, message: null }];
    if (run.last_status === "failed") return [{ job, problem: "failed", last_run: run.last_start, message: run.last_message }];
    if (!run.last_start || nowMs - Date.parse(run.last_start) > HOURLY_RUN_MS) {
      return [{ job, problem: "stopped", last_run: run.last_start, message: null }];
    }
    return [];
  });
}

/**
 * The failed runs to send to Sentry now: runs that started within the hour
 * (HOURLY_RUN_MS, while no newer run has replaced them) that `seen` has not
 * had. The bell checks every 10 minutes while a console is open, so a failure
 * reaches Sentry by the first check after it; with no console open, not at all
 * until the scheduled check runs (lib/hourly-check.ts). `seen` maps each run sent (job
 * and start) to its start, and forgets runs past the hour.
 * shortcut: `seen` lives in one server instance, so another instance, or a
 * cold start, may send the same run again within its hour (one more event on
 * the same Sentry issue: the fingerprint is the job); past it, no instance
 * sends it.
 */
export function freshFailures(problems: readonly JobProblem[], seen: Map<string, number>, nowMs: number): JobProblem[] {
  for (const [key, startMs] of seen) if (nowMs - startMs > HOURLY_RUN_MS) seen.delete(key);
  return problems.filter((problem) => {
    if (problem.problem !== "failed" || !problem.last_run) return false;
    const startMs = Date.parse(problem.last_run);
    const key = `${problem.job}@${problem.last_run}`;
    if (nowMs - startMs > HOURLY_RUN_MS || seen.has(key)) return false;
    seen.set(key, startMs);
    return true;
  });
}
